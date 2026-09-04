// Retiring a remembered rule when a newer one replaces it.
//
// addFact is `ON CONFLICT (scope, project_key, text) DO NOTHING`, which
// dedupes IDENTICAL text and files a contradiction happily alongside its
// opposite. On the live store that produced, in the same global bucket:
//
//   "I prefer red themes over blue."
//   "I like the landing page to use a blue color scheme."
//   "I like the notch UI to ... have red accents on its outer sides"
//   "I prefer the notch color to be blue rather than red."
//
// Every one of those is injected into every prompt. Asking for "our color
// scheme" hands the model red and blue at once. This was invisible while
// the context was hidden from the output; now that shaped prompts surface
// it, a contradiction becomes something the user reads.
//
// Runs at compaction, on the idle gate, because it is a judgement call
// and judgement here means an LLM. "I prefer red themes" and "the landing
// page uses blue" are NOT a contradiction — one is general, one is
// specific — and no regex tells those apart from a real reversal.
//
// THIS DELETES THINGS THE USER SAID. Every guard below exists because of
// that, and the caller logs each removal with its text so a wrong call is
// visible and re-addable rather than silent.

import type { StoredFact } from '../../shared/types'

export const SUPERSEDE_SYSTEM = `You are given remembered facts about one user or one project, NEWEST FIRST.

Some are contradicted by a newer one. Find ONLY those.

A fact is SUPERSEDED when a fact ABOVE it in the list states the opposite about the SAME subject.
Example: "I prefer the notch color to be blue rather than red" supersedes an older "the notch should have red accents".

NEVER mark these as superseded:
- Two facts about different subjects, however similar the wording.
- A general rule and a narrower one. "I prefer red themes" and "the landing page uses blue" can both be true at once.
- A fact that only adds detail to another.
- Anything you are not sure about. Leave it.

Output the NUMBERS of superseded facts, one per line, digits only.
If nothing is superseded, output nothing at all. No preamble, no explanation.`

/**
 * The numbered list handed to the model, newest first.
 *
 * Position carries the meaning — "a fact ABOVE it is newer" is the whole
 * rule — so the order is not cosmetic and callers must not re-sort.
 */
export function buildSupersedePrompt(facts: readonly StoredFact[]): string {
  const newestFirst = [...facts].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
  return newestFirst.map((f, i) => `${i + 1}. ${f.text}`).join('\n')
}

/**
 * Never retire more than this share of a bucket in one pass.
 *
 * A model that misreads the task could otherwise answer "1,2,3,4,5..." and
 * empty someone's context in a single idle tick. Half is generous for a
 * real reversal — contradictions come in pairs — and fatal for a runaway.
 */
export const MAX_SUPERSEDE_FRACTION = 0.5

/**
 * Fact ids the model marked superseded.
 *
 * Validated rather than trusted: positions outside the list are dropped,
 * duplicates collapse, and the cap applies. Returns [] on anything it
 * cannot parse, because doing nothing is always safe here and deleting
 * the wrong rule is not.
 */
export function parseSupersededIds(raw: string, facts: readonly StoredFact[]): number[] {
  const newestFirst = [...facts].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
  const seen = new Set<number>()
  const ids: number[] = []

  for (const line of (raw ?? '').split('\n')) {
    const m = line.trim().match(/^(\d+)\b/)
    if (!m) continue
    const pos = parseInt(m[1], 10)
    // 1-based positions only; anything else is the model answering a
    // different question than the one it was asked.
    if (!Number.isFinite(pos) || pos < 1 || pos > newestFirst.length) continue
    const fact = newestFirst[pos - 1]
    if (seen.has(fact.id)) continue
    seen.add(fact.id)
    ids.push(fact.id)
  }

  const cap = Math.floor(facts.length * MAX_SUPERSEDE_FRACTION)
  if (ids.length > cap) return []
  return ids
}
