// "think really hard" → `ultrathink`.
//
// Claude Code budgets extra reasoning on a magic word, and the word is
// `ultrathink`. What users actually SAY is "think really hard about
// this" — which is not a keyword and does nothing. The user gets no
// signal that the thing they asked for did not happen. This maps the
// spoken form onto the keyword.
//
// Two rules from the spec, both restrictive on purpose:
//
//   1. Claude Code only. The word is meaningless everywhere else and
//      would just be noise in the prompt.
//   2. Explicit intent only — never inferred from prompt length or the
//      number of requirements. Auto-firing would spend the user's tokens
//      on reasoning they did not ask for, on a judgement call we are not
//      well placed to make.
//
// Pure — no electron. The caller owns app detection and passes `enabled`.

/**
 * Why ultrathink fired.
 *   'explicit'  — the user asked for it in words.
 *   'reasoning' — the task itself demands extended reasoning.
 */
export type UltrathinkTrigger = 'explicit' | 'reasoning' | null

export interface UltrathinkResult {
  /** The dictation, with the keyword substituted or prepended. */
  text: string
  /** True when the mapping fired — the UI surfaces this in one word. */
  applied: boolean
  trigger: UltrathinkTrigger
}

// The spoken forms. Note "think" alone is deliberately absent: "I think
// we should..." is one of the most common things anyone says, and
// mapping it would fire constantly on ordinary speech.
//
// Ordered longest-first within each alternative so "think really hard"
// is consumed whole rather than leaving a stray "really".
const TRIGGER_RE = new RegExp(
  [
    // "really think (hard) about this"
    /really\s+think\s+(?:hard\s+)?(?=about\b|\b)/.source,
    // "think really/very/super hard", "think hard", "think harder",
    // "think carefully", "think deeply"
    /think\s+(?:really\s+|very\s+|super\s+|extra\s+|much\s+)?(?:hard(?:er)?|carefully|deeply)/.source,
    // "think this through", "think it through"
    /think\s+(?:this|it)\s+through/.source,
  ].join('|'),
  'i',
)

// A declarative statement about thinking is not a request to think.
// "I think carefully about naming" describes a habit; "don't think too
// hard about it" asks for the opposite of what the keyword does.
const DECLARATIVE_BEFORE_RE = /\b(?:i|you|we|they|he|she|it)\s+$/i
const NEGATED_BEFORE_RE = /\b(?:don'?t|do not|didn'?t|did not|never|without)\s+(?:\w+\s+)?$/i

/** The keyword Claude Code actually recognises. */
export const ULTRATHINK_KEYWORD = 'ultrathink'

/**
 * Whether the ultrathink mapping applies to the current surface.
 * `cli` is the AI CLI detected in the terminal or editor terminal —
 * proc-tree normalises claude-code to 'claude'.
 */
export function isUltrathinkSurface(cli: string | null | undefined): boolean {
  return (cli ?? '').toLowerCase() === 'claude'
}

// ---------------------------------------------------------------------
// Reasoning depth
// ---------------------------------------------------------------------
//
// Firing only on the spoken phrase misses the case that matters most:
// the user hands Claude Code something genuinely hard — "plan the
// migration off this stack" — and gets default-effort reasoning because
// they did not happen to say a magic phrase.
//
// The signal is what the task DEMANDS, never how big it is. A long
// dictation listing ten small edits needs no extra reasoning; a short
// one asking for an architecture does. Length and requirement count are
// deliberately not inputs here — spending the user's tokens because they
// talked for a while would be exactly the wrong trade.
//
// Two tiers, because the vocabulary is uneven. Some words imply depth on
// their own; others are ordinary until they are pointed at something
// broad.

// Inherently deep — these do not describe small work.
const DEEP_SIGNALS: RegExp[] = [
  // Diagnosis that cannot be answered by reading one function.
  /\broot cause\b/i,
  /\brace condition\b|\bdeadlock\b|\bmemory leak\b|\bintermittent(?:ly)?\b|\bflaky\b/i,
  /\bwhy (?:is|does|do|are|did)\b[^.?!]{0,80}\b(?:fail|failing|break|breaking|crash|crashing|hang|hanging|leak|leaking|slow)\b/i,
  // Weighing options rather than executing one.
  /\btrade[- ]?offs?\b|\bpros and cons\b|\bwhich approach\b|\bdecide between\b|\bcompare\b[^.?!]{0,40}\bapproach/i,
  // Architecture and data modelling.
  /\bsystem design\b|\barchitecture\b|\barchitect\b|\bdata model\b|\bschema design\b/i,
  // Explicit planning artefacts.
  /\b(?:draft|come up with|write|make|lay out|map out|put together)\b[^.?!]{0,20}\ba (?:plan|roadmap|strategy|spec)\b/i,
  /\bplan out\b|\bbreak (?:this|it|that) down into\b|\bstep by step plan\b/i,
  /\bthink through\b|\bfigure out how (?:to|we)\b|\bwork out how (?:to|we)\b/i,
  // The user's own example: reasoning across a whole stack.
  /\b(?:tech|technology) stack\b|\bfull stack\b/i,
]

// Ordinary verbs that only imply depth when aimed at something broad.
const SCOPED_VERB_RE =
  /\b(?:design|redesign|refactor|restructure|rearchitect|migrate|port|rewrite|overhaul|consolidate|unify)\b/i

const BROAD_SCOPE_RE =
  /\b(?:whole|entire|all of|across|every|codebase|code base|repo|repository|system|stack|end[- ]to[- ]end|from scratch|multiple (?:files|services|modules|packages))\b/i

/**
 * Does this task warrant extended reasoning on its own merits?
 *
 * Conservative by design: extra reasoning costs the user latency and
 * tokens, so a false positive is a real cost, not a harmless extra.
 */
export function warrantsDeepReasoning(text: string): boolean {
  const input = text ?? ''
  if (!input.trim()) return false
  if (DEEP_SIGNALS.some(re => re.test(input))) return true
  return SCOPED_VERB_RE.test(input) && BROAD_SCOPE_RE.test(input)
}

function explicitMatch(input: string): RegExpExecArray | null {
  const match = TRIGGER_RE.exec(input)
  if (!match) return null
  const before = input.slice(0, match.index)
  if (DECLARATIVE_BEFORE_RE.test(before)) return null
  if (NEGATED_BEFORE_RE.test(before)) return null
  return match
}

/**
 * Apply the keyword. Two routes:
 *
 *   explicit  — the spoken phrase is REPLACED in place, so "think really
 *               hard about this" reads as "ultrathink about this".
 *   reasoning — there is no phrase to replace, so the keyword is
 *               prepended on its own line. Claude Code matches the token
 *               anywhere; putting it first keeps the user's own wording
 *               untouched below it.
 */
export function applyUltrathink(text: string, opts: { enabled: boolean }): UltrathinkResult {
  if (!opts.enabled) return { text, applied: false, trigger: null }
  const input = text ?? ''

  const match = explicitMatch(input)
  if (match) {
    // Emit the keyword in lowercase even at the start of a sentence: it
    // is a magic token, not a word, and an exact match is worth more
    // than correct-looking capitalisation.
    const replaced =
      input.slice(0, match.index) + ULTRATHINK_KEYWORD + input.slice(match.index + match[0].length)
    // Collapse the double space left when the phrase was mid-sentence.
    return { text: replaced.replace(/\s{2,}/g, ' ').trim(), applied: true, trigger: 'explicit' }
  }

  if (warrantsDeepReasoning(input)) {
    // Already there — do not stack a second copy.
    if (new RegExp(`\\b${ULTRATHINK_KEYWORD}\\b`, 'i').test(input)) {
      return { text: input, applied: false, trigger: null }
    }
    return { text: `${ULTRATHINK_KEYWORD}\n\n${input.trim()}`, applied: true, trigger: 'reasoning' }
  }

  return { text: input, applied: false, trigger: null }
}
