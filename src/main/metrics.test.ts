import { describe, it, expect } from 'vitest'
import {
  percentile,
  countWords,
  bucketFor,
  summarize,
  type DictationMetric,
} from './metrics'

function metric(over: Partial<DictationMetric> = {}): DictationMetric {
  return {
    audioMs: 3000,
    words: 10,
    releaseToFirstMs: 800,
    releaseToFinalMs: 800,
    transcribeMs: 500,
    cleanupMs: 250,
    cleanupSkipped: false,
    category: 'messaging',
    provider: 'groq',
    ...over,
  }
}

describe('percentile', () => {
  it('returns 0 for an empty sample rather than NaN', () => {
    expect(percentile([], 50)).toBe(0)
  })

  it('computes the nearest-rank median', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
  })

  it('returns the max at p100', () => {
    expect(percentile([10, 200, 30], 100)).toBe(200)
  })

  it('does not mutate the caller array', () => {
    const input = [3, 1, 2]
    percentile(input, 50)
    expect(input).toEqual([3, 1, 2])
  })

  it('handles a single sample', () => {
    expect(percentile([42], 95)).toBe(42)
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('hey can you send that over')).toBe(6)
  })

  it('returns 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n ')).toBe(0)
  })

  it('collapses runs of whitespace', () => {
    expect(countWords('one   two\n\nthree')).toBe(3)
  })
})

describe('bucketFor', () => {
  it('classifies the short path that must not regress', () => {
    expect(bucketFor(1)).toBe('short')
    expect(bucketFor(4)).toBe('short')
  })

  it('classifies roughly two sentences as medium', () => {
    expect(bucketFor(5)).toBe('medium')
    expect(bucketFor(20)).toBe('medium')
  })

  it('classifies four or more sentences as long', () => {
    expect(bucketFor(21)).toBe('long')
    expect(bucketFor(200)).toBe('long')
  })
})

describe('summarize', () => {
  it('reports every bucket even when a bucket has no samples', () => {
    const out = summarize([metric({ words: 3 })])
    expect(out.map(s => s.bucket)).toEqual(['short', 'medium', 'long'])
    expect(out.find(s => s.bucket === 'long')?.count).toBe(0)
  })

  it('separates samples into the right buckets', () => {
    const out = summarize([
      metric({ words: 2, releaseToFinalMs: 150 }),
      metric({ words: 10, releaseToFinalMs: 700 }),
      metric({ words: 50, releaseToFinalMs: 1400 }),
    ])
    expect(out.find(s => s.bucket === 'short')?.releaseToFinalP50).toBe(150)
    expect(out.find(s => s.bucket === 'medium')?.releaseToFinalP50).toBe(700)
    expect(out.find(s => s.bucket === 'long')?.releaseToFinalP50).toBe(1400)
  })

  it('reports the share of dictations that skipped the LLM', () => {
    const out = summarize([
      metric({ words: 10, cleanupSkipped: true }),
      metric({ words: 10, cleanupSkipped: false }),
    ])
    expect(out.find(s => s.bucket === 'medium')?.cleanupSkippedPct).toBe(50)
  })

  it('does not divide by zero on an empty bucket', () => {
    const out = summarize([])
    expect(out.every(s => s.cleanupSkippedPct === 0)).toBe(true)
  })
})
