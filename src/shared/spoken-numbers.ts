// "make it twenty pixels" → "make it 20 pixels".
//
// Spoken numbers arrive as words, and words are almost never what the
// user wants on screen. A dictated "set the timeout to thirty seconds"
// that pastes "thirty" has to be hand-edited, which is the thing this
// product exists to avoid.
//
// There is a prompt rule for this too, but it cannot be the only one:
// dictations under eight words skip the LLM entirely (cleanup-policy.ts),
// and "make it twenty pixels" is four. The short ones are exactly where
// bare quantities live.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//
//   - Ordinals. "first" stays "first"; "1st" is a different register and
//     nobody dictating prose wants it.
//   - A lone "one". It is a pronoun far more often than a quantity —
//     "one of them", "no one", "the only one", "one-off" — and turning
//     those into "1" is a visible error in a way that leaving a rare
//     "one item" is not. Inside a longer number it converts normally
//     ("twenty one" → 21, "one hundred" → 100).
//   - British "and". "one hundred and twenty" comes out "100 and 20",
//     because the alternative is mangling "five and six" into 11. Two
//     separate numbers joined by "and" is much commoner in speech than
//     the British hundreds form, so the trade goes this way. Tested.

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
}

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

/** Multipliers, smallest first — `hundred` scales the running part only. */
const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
}

const ALL_WORDS = [
  ...Object.keys(SCALES),
  ...Object.keys(TENS),
  // Longest first so "seventeen" is not eaten as "seven".
  ...Object.keys(UNITS).sort((a, b) => b.length - a.length),
]

// A run of number words joined by spaces or hyphens. No "and" — see the
// header note.
const RUN_RE = new RegExp(
  `\\b(?:${ALL_WORDS.join('|')})(?:[\\s-]+(?:${ALL_WORDS.join('|')}))*\\b`,
  'gi',
)

/**
 * Evaluate one run of number words, or null when it is not a number worth
 * writing as digits.
 */
export function evaluateRun(words: string[]): number | null {
  if (words.length === 0) return null
  // The pronoun guard. Only a run of exactly one word can be the pronoun.
  if (words.length === 1 && words[0].toLowerCase() === 'one') return null

  let total = 0
  let current = 0
  let sawValue = false
  // What the previous token was, so an impossible sequence can be
  // rejected rather than summed.
  //
  // "nineteen eighty four" is the case that forced this: as arithmetic it
  // is 19 + 80 + 4 = 103, which is not what anybody said. It is a YEAR,
  // read in pairs, and this parser does not read years. Emitting 103 is
  // worse than leaving the words alone, so a teen followed by a tens word
  // — which no cardinal number can contain — aborts the whole run.
  let prev: 'unit' | 'tens' | 'hundred' | 'bigscale' | null = null

  for (const raw of words) {
    const w = raw.toLowerCase()
    if (w in UNITS) {
      // A unit can only follow a tens word ("twenty five") or a scale
      // ("hundred four"), and after a tens word it must be 1-9 — "twenty
      // fifteen" is not a number.
      if (prev === 'unit') return null
      if (prev === 'tens' && UNITS[w] > 9) return null
      current += UNITS[w]
      prev = 'unit'
      sawValue = true
    } else if (w in TENS) {
      // Nothing legally precedes a tens word except a scale.
      if (prev === 'unit' || prev === 'tens') return null
      current += TENS[w]
      prev = 'tens'
      sawValue = true
    } else if (w in SCALES) {
      prev = SCALES[w] === 100 ? 'hundred' : 'bigscale'
      const scale = SCALES[w]
      if (scale === 100) {
        // "hundred" multiplies what is in hand: three hundred → 300.
        current = (current === 0 ? 1 : current) * 100
      } else {
        // thousand and up close the current group off.
        total += (current === 0 ? 1 : current) * scale
        current = 0
      }
      sawValue = true
    } else {
      return null
    }
  }
  return sawValue ? total + current : null
}

/**
 * Rewrite spoken numbers as digits.
 *
 * Runs after transcription on every dictation, including the ones that
 * skip cleanup.
 */
export function digitsForSpokenNumbers(text: string): string {
  if (!text) return text
  return text.replace(RUN_RE, (match) => {
    const words = match.split(/[\s-]+/).filter(Boolean)
    const value = evaluateRun(words)
    return value === null ? match : String(value)
  })
}
