// Correcting a word the transcriber got NEARLY right.
//
// The user dictionary was exact-match only: each term became a
// case-insensitive whole-word regex, so it could fix "yappr" to "Yappr"
// and nothing else. That is a casing pass, not a correction pass, and it
// has never once helped with the thing people actually add words for.
//
// A user with "Noan" in their dictionary said their own name and got
// "Noen" pasted, repeatedly, and reported that it should be able to tell.
// It should. "Noen" is not a word; it is one vowel away from a term they
// explicitly told us about.
//
// THE RULE, and why it is this one. Edit distance alone is far too loose:
// "Daniel" is two edits from "denial", and silently rewriting someone's
// email is worse than leaving a mishearing in. A phonetic key alone is
// too loose in the other direction: Soundex maps "Daniel" and "denial" to
// the same code. Requiring BOTH — the same phonetic key AND at most one
// edit — separates them cleanly:
//
//   Noen  -> Noan    same key (N500), distance 1   corrected
//   Noah  -> Noan    distance 1, but N000 vs N500  left alone
//   denial-> Daniel  same key (D540), distance 2   left alone
//
// The first is the case this exists for. The second and third are the
// cases that would make it a liability.
//
// Pure and separately tested, because it changes words the user did not
// ask to be changed.

/**
 * Soundex, the 1918 one.
 *
 * Chosen over anything cleverer precisely because it is coarse and
 * predictable: it is the second half of a two-part test, and a subtle
 * phonetic algorithm would be harder to reason about when it fires
 * wrongly. Keeps the first letter, codes the rest by articulation, drops
 * vowels, collapses repeats, pads to four.
 */
export function soundex(word: string): string {
  const w = word.toUpperCase().replace(/[^A-Z]/g, '')
  if (w.length === 0) return ''

  const code = (c: string): string => {
    if ('BFPV'.includes(c)) return '1'
    if ('CGJKQSXZ'.includes(c)) return '2'
    if ('DT'.includes(c)) return '3'
    if (c === 'L') return '4'
    if ('MN'.includes(c)) return '5'
    if (c === 'R') return '6'
    return ''
  }

  let out = w[0]
  let prev = code(w[0])
  for (let i = 1; i < w.length; i++) {
    const c = w[i]
    const digit = code(c)
    if (digit !== '' && digit !== prev) out += digit
    // H and W are transparent: they do not separate two letters that
    // would otherwise collapse. Vowels do.
    if (c !== 'H' && c !== 'W') prev = digit
    if (out.length === 4) break
  }
  return (out + '000').slice(0, 4)
}

/** Damerau-Levenshtein, capped — we only ever care whether it exceeds 1. */
export function editDistance(a: string, b: string, cap = 2): number {
  const s = a.toLowerCase()
  const t = b.toLowerCase()
  if (s === t) return 0
  // A length gap bigger than the cap cannot be closed by edits.
  if (Math.abs(s.length - t.length) > cap) return cap + 1

  const prev2: number[] = []
  let prev: number[] = []
  let cur: number[] = []
  for (let j = 0; j <= t.length; j++) prev[j] = j

  for (let i = 1; i <= s.length; i++) {
    cur = [i]
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      let v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
      // Transposition: "Noan" vs "Nona". A swap is one slip of the ear or
      // the model, not two.
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      cur[j] = v
    }
    prev2.length = 0
    prev2.push(...prev)
    prev = cur
  }
  return prev[t.length]
}

/**
 * The shortest term worth doing this for.
 *
 * Under four letters almost everything is one edit from everything else,
 * and the phonetic key stops discriminating.
 */
export const MIN_TERM_LENGTH = 4

/** Would `heard` be corrected to `term`? */
export function isNearMiss(heard: string, term: string): boolean {
  if (term.length < MIN_TERM_LENGTH) return false
  if (heard.toLowerCase() === term.toLowerCase()) return false
  if (soundex(heard) !== soundex(term)) return false
  return editDistance(heard, term, 1) === 1
}

/**
 * Replace near misses of the user's own dictionary terms.
 *
 * Runs AFTER the exact-match pass, so anything already correct is already
 * correct and never reaches here. Single words only: a multi-word term
 * would need alignment across token boundaries, and none of the failures
 * this addresses are multi-word.
 */
export function applyNearMissTerms(text: string, terms: string[]): string {
  const candidates = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TERM_LENGTH && !/\s/.test(t))
  if (candidates.length === 0) return text

  return text.replace(/\b[A-Za-z][A-Za-z'’-]*\b/g, (word) => {
    for (const term of candidates) {
      if (isNearMiss(word, term)) return term
    }
    return word
  })
}
