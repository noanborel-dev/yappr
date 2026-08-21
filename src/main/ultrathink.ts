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

export interface UltrathinkResult {
  /** The dictation, with the spoken phrase swapped for the keyword. */
  text: string
  /** True when the mapping fired — the UI surfaces this in one word. */
  applied: boolean
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

/**
 * Swap the spoken phrase for the keyword. Returns the text untouched and
 * `applied: false` when the surface is wrong or no explicit request was
 * made — the common case.
 */
export function applyUltrathink(text: string, opts: { enabled: boolean }): UltrathinkResult {
  if (!opts.enabled) return { text, applied: false }
  const input = text ?? ''
  const match = TRIGGER_RE.exec(input)
  if (!match) return { text: input, applied: false }

  const before = input.slice(0, match.index)
  if (DECLARATIVE_BEFORE_RE.test(before)) return { text: input, applied: false }
  if (NEGATED_BEFORE_RE.test(before)) return { text: input, applied: false }

  // Emit the keyword in lowercase even at the start of a sentence: it is
  // a magic token, not a word, and an exact match is worth more than
  // correct-looking capitalisation.
  const replaced = input.slice(0, match.index) + ULTRATHINK_KEYWORD + input.slice(match.index + match[0].length)
  // Collapse the double space left when the phrase was mid-sentence.
  return { text: replaced.replace(/\s{2,}/g, ' ').trim(), applied: true }
}
