// Pure post-processing text passes.
//
// These run AFTER the LLM cleanup (and also on the fast path where the
// LLM is skipped entirely), in this order:
//   applyQuickFixes → applyDictionaryReplacements → applySelfCorrection
//   → applySpelledNameCollapse → applyQuestionMarks
//
// Everything here is a pure string → string transform with no Electron,
// no I/O and no provider dependencies, which is what makes it testable
// (see text-passes.test.ts). Extracted from pipeline.ts so the
// correctness fixes below are locked by regression tests rather than
// asserted by comment.

import { BUILTIN_DICTIONARY } from '../shared/constants'

// Deterministic regex pass for the most common Whisper mishearings of
// tech brand names. Applied to EVERY transcript (even fast-path skips)
// so brand names come out right regardless of whether the LLM cleanup
// runs. Context-aware: each replacement requires a tech-y neighbour
// to avoid clobbering legitimate uses ("cloud computing" stays).
const QUICK_FIXES: Array<[RegExp, string]> = [
  // "cloud" → "Claude" only when followed by Claude-y context
  [/\bcloud(?=\s+(?:code|opus|sonnet|haiku|api|agent|sdk|desktop|model|terminal|3\.\d|4\.\d))/gi, 'Claude'],
  // "Cloud Code" capitalization
  [/\bClaude\s+code\b/g, 'Claude Code'],
  // common bigrams
  [/\bchat\s*-?\s*gpt\b/gi, 'ChatGPT'],
  [/\bopen\s+ai\b/gi, 'OpenAI'],
  [/\bnext\s+js\b/gi, 'Next.js'],
  [/\btype\s+script\b/gi, 'TypeScript'],
  [/\bjava\s+script\b/gi, 'JavaScript'],
  [/\bgit\s+hub\b/gi, 'GitHub'],
  [/\bvs\s+code\b/gi, 'VS Code'],
  [/\bco\s*-?\s*pilot\b/gi, 'Copilot'],
  // GPT-N variants where Whisper hears "five" / "four" instead of the
  // digit. (Dropped "GPT for" → "GPT-4": it ate the preposition in
  // "use GPT for coding" → "use GPT-4 coding".)
  [/\bGPT\s+four\b/gi, 'GPT-4'],
  [/\bGPT\s+five\b/gi, 'GPT-5'],
  [/\bGPT\s+(\d+)\b/g, 'GPT-$1'],
  // tRPC — Whisper sometimes drops the "t" or adds a space
  [/\bt\s+RPC\b/g, 'tRPC'],
  [/\bT-?\s*RPC\b/g, 'tRPC'],
  // npm / npx / pnpm — Whisper hears them as words
  [/\bN\s*P\s*M\b/g, 'npm'],
  [/\bN\s*P\s*X\b/g, 'npx'],
  [/\bP\s*N\s*P\s*M\b/g, 'pnpm'],
  // Common framework / library names
  [/\bnode\s+js\b/gi, 'Node.js'],
  [/\breact\s+native\b/gi, 'React Native'],
  [/\bpost\s*gres\b/gi, 'Postgres'],
  [/\bgraph\s+QL\b/gi, 'GraphQL'],
]

export function applyQuickFixes(text: string): string {
  let out = text
  for (const [re, replacement] of QUICK_FIXES) {
    out = out.replace(re, replacement)
  }
  return out
}

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
]

export function applySelfCorrection(text: string): string {
  let out = text
  for (const [re, replacement] of CORRECTION_REWRITES) {
    out = out.replace(re, replacement)
  }
  return out
}

// QUESTION-MARK NORMALIZATION
// Sentences that linguistically pose a question get a "?" if they end
// in "." or have no terminal punctuation. The trigger is the SHAPE of
// the sentence's opening, not just an inverted verb:
//   - Wh-words: who/what/when/where/why/which/how
//   - Yes/no inversions: "do you...", "can you...", "are you...",
//     "is it...", "should we...", "would you...", "could you...",
//     "did you...", "does it...", "have you...", "has it...", "will you...",
//     "won't you...", "shouldn't we...", "isn't it...", "aren't you...",
//     "wasn't it...", "weren't you...", "haven't you..."
//   - Tag-question shape: "..., right?", "..., yeah?", "..., no?"
//
// We do NOT add "?" when:
//   - The sentence already ends with "?" or "!" — leave it alone.
//   - The "question word" is being used as a relative pronoun
//     ("I know what you mean", "the place where we met", "this is how
//     it works", "tell me when you arrive") — these start with a
//     non-question subject like "I/we/this/the/that/he/she".
//   - It's a polite directive disguised as a question ("can you pass
//     the salt") — these we DO want to mark as questions actually,
//     because a "?" is correct there. Leave the heuristic broad.
//
// Implementation: split on sentence boundaries, inspect first 1-3
// words of each clause, swap trailing "." for "?" if it matches.

const QUESTION_OPENERS = [
  // Wh-questions
  'who', 'what', 'when', 'where', 'why', 'which', 'how', 'whose', 'whom',
  // Modal + subject inversions (most common forms)
  'do you', 'do we', 'do they', 'do i',
  'does he', 'does she', 'does it', 'does that', 'does this',
  'did you', 'did we', 'did they', 'did he', 'did she', 'did it',
  'are you', 'are we', 'are they', "aren't you", "aren't we", "aren't they",
  'is he', 'is she', 'is it', 'is this', 'is that', 'is there',
  "isn't he", "isn't she", "isn't it", "isn't this", "isn't that", "isn't there",
  'was it', 'was he', 'was she', 'was that', 'was this', 'was there',
  "wasn't it", "wasn't he", "wasn't she", "wasn't that", "wasn't this",
  'were you', 'were we', 'were they', "weren't you", "weren't we", "weren't they",
  'have you', 'have we', 'have they', "haven't you", "haven't we", "haven't they",
  'has he', 'has she', 'has it', "hasn't he", "hasn't she", "hasn't it",
  'had you', 'had we', "hadn't you",
  'can you', 'can we', 'can they', 'can he', 'can she', 'can it', 'can i',
  "can't you", "can't we", "can't they",
  'could you', 'could we', 'could they', 'could he', 'could she', "couldn't you",
  'would you', 'would we', 'would they', 'would he', 'would she', "wouldn't you",
  'will you', 'will we', 'will they', 'will he', 'will she', 'will it',
  "won't you", "won't we", "won't they",
  'should you', 'should we', 'should they', 'should he', 'should she', 'should i', 'should it',
  "shouldn't you", "shouldn't we", "shouldn't they",
  'shall we', 'shall i',
  'may i', 'may we',
  'might you', 'might we',
  // Common spoken stems that are usually questions
  'any chance',
  'wanna',
  'gonna',
]

// Tag-question endings — the LAST 1-2 words of the sentence indicate
// it's a question regardless of opener. ", right" / ", yeah" / ", no"
// / ", okay" / ", correct".
const TAG_QUESTION_END_RE = /,\s*(right|yeah|yea|no|ok|okay|correct|huh)\s*[.!?]?\s*$/i

// Subjects that, when they OPEN the sentence, indicate the wh-word
// later is a relative pronoun, NOT a question opener. Used to suppress
// false positives like "I know what you mean."
const STATEMENT_OPENER_RE = /^(?:i|we|you|he|she|they|it|this|that|the|my|our|your|his|her|their|its|tell|let|show|please)\b/i

// Abbreviations whose trailing period is NOT a sentence boundary.
// Without this, "Dr. Who is coming" splits into "Dr" + "Who is coming",
// the second fragment looks wh-question-shaped, and we corrupt a
// statement into "Dr. Who is coming?". Same for "e.g. what we need".
//
// Deliberately restricted to TITLE/CONNECTOR abbreviations, which are
// essentially never sentence-final. Abbreviations that legitimately DO
// end a sentence ("etc.", "et al.") are excluded — suppressing there
// would swallow a real question. "no." is excluded for the same reason:
// it collides with the very common spoken word ("I said no. What do you
// want" must still get its "?").
const ABBREVIATION_END_RE = /(?:^|[\s(])(?:mr|mrs|ms|mx|dr|prof|sr|jr|st|vs|e\.g|i\.e|cf)$/i

// Leading interjection / vocative, comma-terminated: "hey,", "so,",
// "ok,", "hey Bob,". Dictation opens this way constantly, and it used to
// push the real question opener outside the 3-word window we inspect —
// so "hey, are you free tonight" silently kept its missing "?" despite
// being listed as a handled example. Stripped before BOTH the
// statement-opener guard and the opener match, so "hey, I know what you
// mean" still correctly stays a statement.
const LEADING_VOCATIVE_RE = /^(?:hey|hi|hello|yo|ok|okay|alright|so|well|um|uh|oh|hmm|sorry|excuse me|by the way|btw)\b[^,]{0,24},\s*/i

function isQuestionShape(sentence: string): boolean {
  const trimmed = sentence.trim()
  if (trimmed.length === 0) return false
  // Already explicitly punctuated as a question or exclamation — leave it.
  if (/[?!]\s*$/.test(trimmed)) return false
  // Tag-question — fires regardless of opener.
  if (TAG_QUESTION_END_RE.test(trimmed)) return true
  // Drop a leading vocative so the opener check sees the real clause.
  const body = trimmed.replace(LEADING_VOCATIVE_RE, '')
  // Statement-opener guard: "I know what you mean" should NOT be a question.
  if (STATEMENT_OPENER_RE.test(body)) return false
  // Lowercase first 1-3 words, strip punctuation, check against openers.
  const head = body.toLowerCase().replace(/^[^a-z']+/, '').split(/\s+/).slice(0, 3).join(' ')
  for (const opener of QUESTION_OPENERS) {
    if (head === opener || head.startsWith(opener + ' ') || head.startsWith(opener + ',')) {
      return true
    }
  }
  return false
}

export function applyQuestionMarks(text: string): string {
  // Split on sentence boundaries but keep the trailing punctuation +
  // following whitespace, so we can rebuild faithfully. We use a
  // boundary regex that matches the punctuation as its own capture.
  // Examples handled:
  //   "do you want to go. yes" → "do you want to go? yes"
  //   "lets go to the beach. do you wanna come" (no end punctuation on
  //    second clause) → "lets go to the beach. do you wanna come?"
  //   "hey, are you free tonight" → "hey, are you free tonight?"
  // A terminator only counts when it's followed by whitespace or end-of-
  // text. This guards intra-token periods — "app.tsx", "version 3.2",
  // "v1.1" — from being treated as sentence boundaries (which used to
  // corrupt them into "app?tsx" / "3?2" when the clause looked like a
  // question). Sentences jammed without a space ("go.yes") won't split,
  // which is rare and far safer than mangling code/decimals.
  const parts = text.split(/([.!?]+(?:\s+|$))/)
  // parts is interleaved: [sentence, terminator, sentence, terminator, ..., lastSentence?]
  // Walk pairs and rewrite the terminator when the preceding sentence is question-shaped.
  let out = ''
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? ''
    const terminator = parts[i + 1] ?? ''
    if (sentence.length === 0 && terminator.length === 0) continue
    // An abbreviation immediately before this fragment means the split
    // was spurious ("Dr." + "Who is coming") — the fragment is a
    // continuation, not a new sentence, so it can't be a question.
    const prevSentence = parts[i - 2]
    const prevTerminator = parts[i - 1]
    const afterAbbrev = prevTerminator !== undefined
      && /^\.\s+$/.test(prevTerminator)
      && ABBREVIATION_END_RE.test((prevSentence ?? '').trimEnd())
    if (!afterAbbrev && isQuestionShape(sentence)) {
      // Replace "." or "!" with "?" but keep the trailing whitespace.
      // If terminator is empty (sentence didn't have one — end of text),
      // append "?" + preserve nothing.
      if (terminator.length === 0) {
        out += sentence + '?'
      } else {
        const trailingWs = terminator.match(/\s*$/)?.[0] ?? ''
        out += sentence + '?' + trailingWs
      }
    } else {
      out += sentence + terminator
    }
  }
  return out
}

// SPELLED-OUT NAME / WORD COLLAPSE
// Whisper transcribes hyphen-separated spelled letters verbatim:
//   "J-U-L-I-A" / "j.u.l.i.a" / "J U L I A"
// Users spelling something out for clarity want the joined word in
// the output — NEVER the hyphenated letters. Two cases:
//
//   1. Preceded by a redundant name ("Julia, J-U-L-I-A") → drop the
//      spelled-out portion, keep the original name.
//   2. Standalone ("text me J-U-L-I-A") → collapse the letters into
//      a single word with appropriate casing (first letter caps if
//      the spelled sequence was uppercase, else lowercase).
//
// "Self-correction" intent (different letters from a preceding name)
// like "Julia, sorry, J-A-N-E" is handled by applySelfCorrection
// (which runs first) — and even if it doesn't fire, the spelled-out
// letters MUST still be collapsed into "Jane", not left as "J-A-N-E".
//
// Match shape: 2+ letter tokens separated by hyphens, dots, or
// whitespace, each letter token being a single A-Z (case-insensitive).
// Minimum 2 letters (so we don't match accidental "A-B" pairs in
// non-spelling contexts like "page A-B").

// CASE 1: preceded by a name (capitalized word) + connector. Drop the
// spelled-out portion entirely.
//
// Connector covers: ", " | " spelled " | " spelt " | ": " | " - " |
// " that's spelled " etc.
const SPELL_AFTER_NAME_RE = /\b([A-Z][a-z]{1,20})(\s*[,:]?\s+(?:spelled|spelt|that's|that is|which is|like)\s+|\s*,\s+|\s+)((?:[A-Za-z](?:[-.\s]+[A-Za-z]){1,19}))\b/g

// CASE 2: standalone hyphen/dot-separated letters anywhere. Collapse
// to a joined word. Requires 2+ separator-joined letters where every
// gap is exactly one of [-.\s] (so we don't accidentally match
// natural phrases like "I - you - me").
//
// To avoid false positives we ONLY fire when the separators are
// hyphens OR dots (NOT bare whitespace), since "A B C D" in dictation
// is almost never a spelled word — Whisper would have emitted that as
// a real word if the user said it as a word. The exception is when
// 3+ single letters appear in a row with only whitespace, which is
// also a clear spelling cadence.
// Note on trailing dot: "U.S.A." has a final period that isn't between
// letters. We allow an optional trailing `.` followed by a non-letter
// (or end of string) so we eat the abbrev-style terminal period too.
const SPELL_STANDALONE_HYPHEN_RE = /\b([A-Za-z](?:[-.]\s*[A-Za-z]){1,19})(\.?)(?=[^A-Za-z]|$)/g
const SPELL_STANDALONE_SPACED_RE = /\b([A-Za-z](?:\s+[A-Za-z]){2,19})\b/g

// Lowercase a string and strip non-letters, for dictionary lookup keys.
function letterKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '')
}

// Build a lookup once at module load: lowercased-letters-only → canonical
// form from BUILTIN_DICTIONARY. e.g. "github" → "GitHub", "nba" → "NBA"
// (if it's in the list), "vscode" → "VS Code" (multi-word entries get
// their internal spaces stripped from the key but preserved in the value).
const CANONICAL_BY_LETTERS: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const term of BUILTIN_DICTIONARY) {
    const key = letterKey(term)
    if (key.length >= 2 && !m.has(key)) m.set(key, term)
  }
  return m
})()

// A tiny set of frequent English words we definitely want to LOWERCASE
// when the user spells them out. The dictionary lookup handles brand
// names; this list handles common-noun spellings like "h.e.l.l.o" →
// "hello", not "Hello". We keep it small to avoid false positives —
// only add words that show up frequently in spoken speech and are
// unambiguous (not also a name).
const COMMON_WORD_LETTERS = new Set<string>([
  'hello', 'world', 'cool', 'nice', 'okay', 'yes', 'no', 'yeah', 'nope',
  'wait', 'stop', 'help', 'fine', 'good', 'bad', 'love', 'hate', 'sorry',
  'thanks', 'please', 'maybe', 'sure', 'true', 'false', 'left', 'right',
  'up', 'down', 'big', 'small', 'fast', 'slow', 'easy', 'hard',
])

// Pick the right casing for a spelled-out letter sequence based on
// context. Order of checks:
//   1. Built-in dictionary (brand names, acronyms with canonical case).
//      "n.b.a" → "NBA", "g.i.t.h.u.b" → "GitHub".
//   2. Common English word → all lowercase. "h.e.l.l.o" → "hello".
//   3. All-uppercase short sequence (≤5 letters) → keep all-caps
//      (acronym fallback). "a.b.c" → "ABC" only if the user said it
//      uppercase ("A.B.C." in transcript). Lowercase 3-letter
//      sequences pass through unchanged.
//   4. Otherwise → title case (name-shaped default). "j-u-l-i-a" →
//      "Julia", lowercase input still gets title-cased ONLY when it
//      doesn't match cases 1-3.
//
// Special rule for case 4: if the SPELLED input was lowercase (no
// uppercase letters at all), keep it lowercase. The user typed lower
// so we preserve their intent.
//   "hey j-u-l-i-a" → "hey julia" (lowercase preserved)
//   "hey J-U-L-I-A" → "hey Julia" (titlecase because uppercase input)
function joinSpelledLetters(s: string): string {
  const letters = s.replace(/[-.\s]+/g, '')
  if (letters.length === 0) return s
  const key = letterKey(letters)

  // 1. Canonical dictionary entry — use exactly as defined.
  const canonical = CANONICAL_BY_LETTERS.get(key)
  if (canonical) return canonical

  // 2. Common English word — lowercase.
  if (COMMON_WORD_LETTERS.has(key)) return key

  const upper = letters.replace(/[^A-Z]/g, '').length
  const total = letters.length
  const allUpper = upper === total
  const allLower = upper === 0

  // 3. Short all-uppercase (≤4 letters) → keep all-caps acronym.
  //    "A.B.C" → "ABC", "X-Y-Z" → "XYZ", "F.A.A.A" → "FAAA".
  //    5+ letters even all-uppercase prefer title-case ("J-U-L-I-A"
  //    → "Julia", not "JULIA") because real acronyms 5+ letters long
  //    are usually in the dictionary already (case 1 catches them).
  if (allUpper && total <= 4) return letters.toUpperCase()

  // 4. Title case for name-shaped sequences.
  //    But if the input was all-lowercase, preserve lowercase intent.
  if (allLower) return letters.toLowerCase()
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()
}

export function applySpelledNameCollapse(text: string): string {
  // CASE 1 first: when preceded by a name (whether or not the spelled
  // letters match), prefer dropping the spelled-out portion entirely
  // — the user said the name itself, the spelling was for clarity.
  let out = text.replace(SPELL_AFTER_NAME_RE, (full, name: string, gap: string, letters: string) => {
    const joined = letters.replace(/[-.\s]+/g, '').toLowerCase()
    if (joined === name.toLowerCase()) {
      // Letters match the name → drop the spelled portion, keep the name.
      return name
    }
    // Letters DIFFER from the name → user probably re-spelled to
    // override. Replace the whole "<Name> <connector> <L-L-L>" with
    // the joined spelled word. Trim trailing whitespace from gap so
    // we don't leave double spaces.
    void gap  // intentionally unused
    return joinSpelledLetters(letters)
  })

  // CASE 2: any remaining standalone hyphen/dot-separated letter
  // sequences. Always collapse to a joined word.
  out = out.replace(SPELL_STANDALONE_HYPHEN_RE, (match, core: string) => {
    // Only fire on 3+ letters — pairs like "A-B" are likely things
    // like a list label, not a spelled word.
    const letters = core.replace(/[-.\s]+/g, '')
    if (letters.length < 3) return match
    return joinSpelledLetters(core)
  })

  // CASE 3: 3+ single letters separated only by whitespace
  // ("J U L I A"). Conservative — requires 3+ letters because pairs
  // like "I am" or "a B" are common false positives.
  out = out.replace(SPELL_STANDALONE_SPACED_RE, (match) => {
    const letters = match.replace(/\s+/g, '')
    if (letters.length < 3) return match
    // Extra guard: require that AT LEAST 2 of the letters are
    // uppercase, otherwise "i am at" looks like a spelled-out word.
    const upper = letters.replace(/[^A-Z]/g, '').length
    if (upper < 2) return match
    return joinSpelledLetters(match)
  })

  return out
}

// Escape a literal string for use inside a RegExp.
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a case-insensitive regex that matches the canonical form OR
// the same letters with internal whitespace/hyphens — covering common
// Whisper mishearings like "Yappr" → "open flow", "kubectl" →
// "koob control", "TypeScript" → "type script".
//
// Rules:
// - Skip terms shorter than 3 chars (too prone to false positives).
// - Skip terms with spaces (already multi-word; user can use perAppRules
//   or a different mechanism for those edge cases).
// - Skip pure-letter ALL-CAPS acronyms shorter than 4 chars (e.g. "API"
//   shouldn't rewrite "API" → "API"; nothing to fix).
// - Word-boundary anchored so we don't clobber substrings.
function buildDictionaryReplacers(terms: string[]): Array<[RegExp, string]> {
  const out: Array<[RegExp, string]> = []
  for (const term of terms) {
    const t = term.trim()
    if (t.length < 3) continue
    if (/\s/.test(t)) continue
    // Split CamelCase / kebab / snake into letter groups so we can
    // accept either the joined form or a separator between groups.
    // "Yappr" → ["Open", "Flow"]; "type-script" → ["type", "script"];
    // "kubectl" → ["kubectl"] (no internal case boundary).
    const parts = t
      .split(/(?<=[a-z0-9])(?=[A-Z])|[-_]/)
      .filter(Boolean)
    if (parts.length >= 2) {
      // Multi-part term: allow optional whitespace/hyphen between parts.
      const pattern = parts.map(reEscape).join('[\\s-]*')
      out.push([new RegExp(`\\b${pattern}\\b`, 'gi'), t])
    } else {
      // Single token: just enforce case-insensitive whole-word match.
      // Skip if the term is already a short all-caps acronym (nothing
      // to normalize — Whisper would have produced the same letters).
      if (t.length < 4 && t === t.toUpperCase()) continue
      out.push([new RegExp(`\\b${reEscape(t)}\\b`, 'gi'), t])
    }
  }
  return out
}

export function applyDictionaryReplacements(text: string, terms: string[]): string {
  let out = text
  for (const [re, canonical] of buildDictionaryReplacers(terms)) {
    out = out.replace(re, canonical)
  }
  return out
}
