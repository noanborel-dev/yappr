// The deterministic self-correction PASS — the regex safety net, not the
// prompt rules (those are asserted in self-correction.test.ts, which is a
// different file about a different mechanism).
//
// Extracted from pipeline.ts so it can be tested. It is pure string work that decides whether a user's words get
// silently rewritten, and it lived in a module that imports Electron and
// therefore cannot be loaded under vitest — so the one pass in the app
// that can DELETE half a sentence had no tests at all.
//
// Deterministic self-correction: drop the "wrong half" of a "<value>,
// <marker> <value>" pivot where both <value>s look like the same kind
// of thing (number, time, single name, short path/identifier).
//
// This is the safety net for two failure modes:
//   1. Local-only mode has no LLM — needs the regex to do it.
//   2. The 8B Groq cleanup model still keeps both halves of the
//      correction ~40% of the time despite the SELF_CORRECTION prompt.
//
// We're deliberately CONSERVATIVE here: we only fire when the
// pre-correction and post-correction spans are short and "shaped like"
// the same thing. This avoids rewriting hedging uses ("I mean, it's fast"
// — no comma+value+marker+value pattern) or rhetorical pivots ("I was
// going to say X, actually let me tell you Y" — too long).
//
// Each entry below matches: `<value>, <marker> <value>` and rewrites to
// just `<value>` (the second one). The leading comma is REQUIRED — it
// distinguishes mid-sentence pivots from sentence-opener hedges.

// Helper builders. Each "value" pattern is a small enumeration of
// shapes that real corrections take.
//
// IMPORTANT: the value regex is built WITHOUT the case-insensitive
// flag — only the marker words (i mean, actually, wait, sorry) are
// matched case-insensitively, via inline (?i:...) groups. This is
// because the NAME shape `[A-Z][a-z]+` only works as intended when
// case-sensitive; with /i, [A-Z] matches lowercase too, which means
// "at six" matches NAME and we end up eating the leading preposition.
const NUM = '\\d{1,5}(?::\\d{2})?\\s*(?:am|pm)?'  // 6, 7, 3:15, 4pm
const WORD_NUM_ANY = '(?:[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[Tt]en|[Ee]leven|[Tt]welve|[Tt]hirteen|[Ff]ourteen|[Ff]ifteen|[Ss]ixteen|[Ss]eventeen|[Ee]ighteen|[Nn]ineteen|[Tt]wenty|[Tt]hirty|[Ff]orty|[Ff]ifty)'
const NAME = '[A-Z][a-z]{1,15}(?:\\s+[A-Z][a-z]{1,15})?'  // "Bob", "Alice Smith"
const PATHY = '[\\w-]{1,15}[/.@][\\w/.@-]{1,30}'         // "/var/log", "jane@x.com", "src/main.ts"

// PRE side: must be a number, sentence-positioned word-number,
// capitalized name, or path-y string — NOT a bare lowercase word
// (so we don't gobble "at", "to", "in").
const PRE_VALUE = `(?:${NUM}|${WORD_NUM_ANY}|${NAME}|${PATHY})`
// POST side: same shapes.
const POST_VALUE = PRE_VALUE
// "actually" doubles as a contrastive/emphatic adverb ("I love Paris,
// actually Rome is better"), so the NAME-vs-NAME shape over-fires and
// deletes a real clause ("I love Rome is better"). Restrict the
// "actually" rule to numbers, times, and paths — where "actually"
// almost always signals a correction ("at 6, actually 7", "port 3000,
// actually 8080"). NAME corrections still get the unambiguous markers
// (I mean / sorry / wait / scratch that / never mind) and the LLM
// SELF_CORRECTION prompt.
const ACTUALLY_VALUE = `(?:${NUM}|${WORD_NUM_ANY}|${PATHY})`

/**
 * Words that must never be either half of a plain-word correction.
 *
 * Articles, prepositions, conjunctions and pronouns. Without this the
 * rule below eats "I mean it" — the hedging phrase the SELF_CORRECTION
 * prompt explicitly lists as NOT a correction — and grabs a preposition
 * as the wrong half, which is the exact failure that kept plain words out
 * of this pass in the first place.
 */
const FUNCTION_WORDS = [
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'as', 'at', 'to', 'in',
  'on', 'of', 'for', 'from', 'by', 'with', 'into', 'onto', 'it', 'its',
  'this', 'that', 'these', 'those', 'is', 'was', 'are', 'were', 'be', 'been',
  'do', 'does', 'did', 'not', 'no', 'yes', 'i', 'you', 'he', 'she', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'our', 'their',
  'really', 'very', 'just', 'like', 'well', 'okay',
]

/**
 * One ordinary lowercase word, three letters or more, that is not a
 * function word.
 *
 * Three letters because two-letter words are almost all function words,
 * and lowercase because a capitalised word is a NAME and already has its
 * own, tighter rule above.
 */
const PLAIN_WORD = `(?!(?:${FUNCTION_WORDS.join('|')})\\b)[a-z][a-z-]{2,19}`

// Helper: spell each letter as a [Aa] character class so the marker
// matches both cases without using the /i flag (which would break the
// case-sensitive NAME pattern).
function ci(s: string): string {
  return s.split('').map(c => {
    if (/[a-zA-Z]/.test(c)) return `[${c.toLowerCase()}${c.toUpperCase()}]`
    if (c === ' ') return '\\s+'
    return c
  }).join('')
}

const CORRECTION_REWRITES: Array<[RegExp, string]> = [
  // "<value>, I mean <value>"   → "<value2>"
  [new RegExp(`\\b(${PRE_VALUE})\\s*,\\s*${ci('i mean')}\\s+(${POST_VALUE})\\b`), '$2'],
  // "<value>, actually <value>" → "<value2>" — numbers/times/paths only
  // (NAME excluded; see ACTUALLY_VALUE note above).
  [new RegExp(`\\b(${ACTUALLY_VALUE})\\s*,\\s*${ci('actually')}\\s+(${ACTUALLY_VALUE})\\b`), '$2'],
  // "<value>, wait, <value>"    → "<value2>"
  [new RegExp(`\\b(${PRE_VALUE})\\s*,\\s*${ci('wait')}\\s*,\\s*(${POST_VALUE})\\b`), '$2'],
  // "<value>, sorry, <value>"   → "<value2>"
  [new RegExp(`\\b(${PRE_VALUE})\\s*,\\s*${ci('sorry')}\\s*,\\s*(${POST_VALUE})\\b`), '$2'],
  // "<value>, scratch that, <value>" → "<value2>"
  [new RegExp(`\\b(${PRE_VALUE})\\s*,\\s*${ci('scratch that')}\\s*,?\\s*(${POST_VALUE})\\b`), '$2'],
  // "<value>, never mind, <value>"   → "<value2>"
  [new RegExp(`\\b(${PRE_VALUE})\\s*,\\s*${ci('never mind')}\\s*,?\\s*(${POST_VALUE})\\b`), '$2'],

  // "<word>, I mean <word>" → "<word2>", for ORDINARY WORDS.
  //
  // Everything above needs a number, a capitalised name or a path, so
  // "make the landing page blue, I mean red" matched nothing and shipped
  // with both colours in it. Reported from real use: the correction is
  // the most common thing people say out loud and the pass could not see
  // the most common shape it takes.
  //
  // "I mean" only. The other markers are too easily emphatic in front of
  // a plain word ("slow, actually fine"), and this rule has no shape to
  // lean on — the other rules can trust that two numbers either side of a
  // comma are a correction, and "two adjectives" carries no such promise.
  //
  // Both sides must clear FUNCTION_WORDS. That is what stops it eating
  // "I mean it" and "go to the store, I mean the shop" — in the second,
  // the article is consumed with the word so the replacement cannot leave
  // a doubled "the".
  // Two rules, not one, and the order matters.
  //
  // A single rule with an optional article on each side got "put it in
  // the sidebar, I mean footer" wrong: it swallowed "the" with the word
  // being replaced and emitted "put it in footer". The article belongs to
  // whichever side actually has one.
  //
  // BOTH sides carry an article → replace the pair, article and all.
  [
    new RegExp(
      `\\b(?:the|a|an)\\s+${PLAIN_WORD}\\s*,\\s*${ci('i mean')}\\s+((?:the|a|an)\\s+${PLAIN_WORD})\\b`,
    ),
    '$1',
  ],
  // Otherwise → replace the words only, leaving any article in front of
  // the first one exactly where it was.
  [
    new RegExp(`\\b(${PLAIN_WORD})\\s*,\\s*${ci('i mean')}\\s+(${PLAIN_WORD})\\b`),
    '$2',
  ],
]

export function applySelfCorrection(text: string): string {
  let out = text
  for (const [re, replacement] of CORRECTION_REWRITES) {
    out = out.replace(re, replacement)
  }
  return out
}
