// Per-card summary line for the project cards.
//
// The cards already list every fact verbatim, which is what makes the
// store inspectable. What they lacked was the at-a-glance read: how much
// is in here, and is it stale? That matters most for the card the user
// is most likely to want to delete — a project they stopped working on
// months ago, still quietly feeding facts into prompts.
//
// Pure, and `now` is injected rather than read from the clock, so the
// relative formatting is testable without freezing time.

import type { StoredFact } from './types'

export interface BucketSummary {
  count: number
  /** Timestamp of the most recent fact, or 0 when the bucket is empty. */
  lastUpdated: number
}

export function summarizeBucket(facts: readonly StoredFact[]): BucketSummary {
  let lastUpdated = 0
  for (const fact of facts) {
    if (fact.createdAt > lastUpdated) lastUpdated = fact.createdAt
  }
  return { count: facts.length, lastUpdated }
}

/**
 * Coarse relative age. Deliberately vague at the top end — "3mo ago" is
 * the useful signal (this is stale, consider deleting it), and a precise
 * date would be noise on a card whose job is a glance.
 */
export function formatRelativeAge(timestamp: number, now: number): string {
  if (!timestamp) return ''
  const sec = Math.max(0, (now - timestamp) / 1000)
  if (sec < 60) return 'just now'
  const min = sec / 60
  if (min < 60) return `${Math.round(min)}m ago`
  const hr = min / 60
  if (hr < 24) return `${Math.round(hr)}h ago`
  const day = hr / 24
  if (day < 7) return `${Math.round(day)}d ago`
  const wk = day / 7
  if (wk < 5) return `${Math.round(wk)}w ago`
  return `${Math.round(day / 30)}mo ago`
}

/**
 * The one-line metric shown under a card's title, e.g.
 * "4 facts · added 2h ago". Returns '' for an empty bucket so the caller
 * can drop the line entirely rather than print "0 facts".
 */
export function bucketMetricLine(facts: readonly StoredFact[], now: number): string {
  const { count, lastUpdated } = summarizeBucket(facts)
  if (count === 0) return ''
  const noun = count === 1 ? 'fact' : 'facts'
  const age = formatRelativeAge(lastUpdated, now)
  return age ? `${count} ${noun} · added ${age}` : `${count} ${noun}`
}
