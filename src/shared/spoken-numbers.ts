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
//
// THREE SHAPES, not one. The first version handled only cardinals and
// REFUSED everything else, on the reasoning that "nineteen eighty four"
// summing to 103 was worse than leaving it alone. Both halves of that
// were right and the conclusion was wrong: people dictating numbers are
// usually reading a year or a string of digits, so refusing meant the
// feature did nothing for the commonest cases. Observed live, all three
// unchanged in the output:
//
//   "Nineteen sixty four."                    → wanted 1964
//   "One two seven eight nine three four…"    → a code, wanted digits
//   "One, two, three, four…"                  → "One, 2, 3, 4"
//
// So a scale-free run is now grouped, and the groups decide:
//   every token a single digit  → a digit string   ("one two three" → 123)
//   two groups, first ≥ 10      → a year           ("nineteen sixty four" → 1964)
//   one group                   → a cardinal       ("twenty five" → 25)
// Anything else is still refused.

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
export function evaluateRun(words: string[]): string | null {
  if (words.length === 0) return null
  // The pronoun guard. Only a run of exactly one word can be the pronoun.
  // The caller lifts this when a counting sequence follows.
  if (words.length === 1 && words[0].toLowerCase() === 'one') return null

  const lower = words.map((w) => w.toLowerCase())
  const hasScale = lower.some((w) => w in SCALES)

  // Scale-free runs are the ambiguous ones — a year, a code, or a plain
  // cardinal, all spelled the same way. Group them and let the shape
  // decide. Anything with a scale word in it ("two thousand eight") is
  // unambiguously a cardinal and goes down the arithmetic path below.
  if (!hasScale) {
    const shaped = shapeWithoutScale(lower)
    if (shaped !== null) return shaped
    return null
  }

  let total = 0
  let current = 0
  let sawValue = false
  // What the previous token was, so an impossible sequence can be
  // rejected rather than summed. A run that reaches here has a scale word
  // in it, so it is a cardinal or it is nothing — the year and digit-string
  // readings above cannot apply, and 19 + 80 + 4 = 103 is the shape of
  // answer this guard exists to refuse.
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
  return sawValue ? String(total + current) : null
}

/**
 * Split a scale-free run into groups, each a cardinal under 100.
 *
 * A group extends only where English lets it: a tens word can take a
 * following unit ("twenty five"), and nothing else joins. So "nineteen
 * sixty four" is [19, 64] and "twenty five" is [25] — which is exactly
 * the distinction between a year and a number.
 */
function groupsWithoutScale(lower: string[]): number[] | null {
  const groups: number[] = []
  let open: number | null = null
  let openIsTens = false

  for (const w of lower) {
    if (w in TENS) {
      if (open !== null) groups.push(open)
      open = TENS[w]
      openIsTens = true
    } else if (w in UNITS) {
      const v = UNITS[w]
      // Only a tens word takes a unit after it, and only 1-9: "twenty
      // fifteen" is not a number.
      if (openIsTens && v <= 9) {
        open = (open ?? 0) + v
        openIsTens = false
      } else {
        if (open !== null) groups.push(open)
        open = v
        openIsTens = false
      }
    } else {
      return null
    }
  }
  if (open !== null) groups.push(open)
  return groups
}

/** Decide what a scale-free run means, or null to leave it alone. */
function shapeWithoutScale(lower: string[]): string | null {
  const groups = groupsWithoutScale(lower)
  if (groups === null || groups.length === 0) return null

  // A string of single digits — a phone number, a code, someone reading
  // out an id. Joined, because that is what was meant: "one two three"
  // is 123, not 1 2 3. Counting stays separate on its own, because the
  // transcriber puts commas in and commas end a run.
  if (lower.length >= 2 && groups.every((g) => g <= 9) && groups.length === lower.length) {
    return groups.join('')
  }

  // A year, read in pairs. Requires the first pair to be a real leading
  // pair (>= 10), which is what keeps "twenty five" a number and makes
  // "twenty twenty five" a year.
  if (groups.length === 2 && groups[0] >= 10 && groups[1] <= 99) {
    return String(groups[0] * 100 + groups[1])
  }

  if (groups.length === 1) return String(groups[0])

  // Three or more groups that are not all single digits — no reading of
  // this is safe. Left alone.
  return null
}

/**
 * Rewrite spoken numbers as digits.
 *
 * Runs after transcription on every dictation, including the ones that
 * skip cleanup.
 */
export function digitsForSpokenNumbers(text: string): string {
  if (!text) return text
  return text.replace(RUN_RE, (match, offset: number) => {
    const words = match.split(/[\s-]+/).filter(Boolean)
    const value = evaluateRun(words)
    if (value !== null) return value

    // The counting case. A lone "one" is normally left alone as a
    // pronoun, but "One, two, three, four" came out "One, 2, 3, 4" —
    // every other number converted and the first stayed a word, which
    // looks broken rather than careful.
    //
    // The tell is what comes next: a number immediately after, across at
    // most a comma. "one of them" has "of" there and stays a word.
    if (words.length === 1 && words[0].toLowerCase() === 'one') {
      const after = text.slice(offset + match.length)
      if (COUNTING_NEXT_RE.test(after)) return '1'
    }
    return match
  })
}

/**
 * A number right after the current one, across at most a comma.
 *
 * This is what separates counting from the pronoun: "one, two" is a
 * sequence, "one of them" is not.
 */
const COUNTING_NEXT_RE = new RegExp(
  `^\\s*,?\\s*(?:\\d|(?:${ALL_WORDS.join('|')})\\b)`,
  'i',
)
