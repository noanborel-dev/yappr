import { describe, it, expect } from 'vitest'
import { summarizeBucket, formatRelativeAge, bucketMetricLine } from './fact-metrics'
import type { StoredFact } from './types'

const NOW = 1_700_000_000_000
const at = (createdAt: number, id = 1): StoredFact => ({
  id, scope: 'project', projectKey: 'yappr', text: 'we use zod for validation', createdAt,
})
const minutes = (n: number) => NOW - n * 60_000
const days = (n: number) => NOW - n * 86_400_000

describe('summarizeBucket', () => {
  it('counts the facts and finds the newest', () => {
    expect(summarizeBucket([at(days(9), 1), at(days(2), 2), at(days(30), 3)]))
      .toEqual({ count: 3, lastUpdated: days(2) })
  })

  it('reports an empty bucket without inventing a timestamp', () => {
    expect(summarizeBucket([])).toEqual({ count: 0, lastUpdated: 0 })
  })
})

describe('formatRelativeAge', () => {
  it('reads coarsely across the ranges', () => {
    expect(formatRelativeAge(NOW, NOW)).toBe('just now')
    expect(formatRelativeAge(minutes(30), NOW)).toBe('30m ago')
    expect(formatRelativeAge(minutes(60 * 5), NOW)).toBe('5h ago')
    expect(formatRelativeAge(days(3), NOW)).toBe('3d ago')
    expect(formatRelativeAge(days(14), NOW)).toBe('2w ago')
    // The signal that actually matters: this bucket is stale.
    expect(formatRelativeAge(days(90), NOW)).toBe('3mo ago')
  })

  it('says nothing for a missing timestamp', () => {
    expect(formatRelativeAge(0, NOW)).toBe('')
  })

  // Clock skew shouldn't produce "-3m ago".
  it('never goes negative for a future timestamp', () => {
    expect(formatRelativeAge(NOW + 60_000, NOW)).toBe('just now')
  })
})

describe('bucketMetricLine', () => {
  it('pluralises', () => {
    expect(bucketMetricLine([at(minutes(5))], NOW)).toBe('1 fact · added 5m ago')
    expect(bucketMetricLine([at(minutes(5), 1), at(minutes(9), 2)], NOW)).toBe('2 facts · added 5m ago')
  })

  // Callers drop the line entirely rather than render "0 facts".
  it('is empty for an empty bucket', () => {
    expect(bucketMetricLine([], NOW)).toBe('')
  })
})
