import { describe, it, expect } from 'vitest'
import { buildSupersedePrompt, parseSupersededIds, MAX_SUPERSEDE_FRACTION } from './supersede'
import type { StoredFact } from '../../shared/types'

function fact(id: number, text: string, createdAt = id): StoredFact {
  return { id, scope: 'global', projectKey: '', text, createdAt }
}

// The live contradiction this exists for, from the user's own store —
// both facts in the same global bucket, both injected into every prompt.
const NOTCH = [
  fact(1, 'I like the notch UI to have red accents on its outer sides.', 100),
  fact(2, 'I prefer the notch color to be blue rather than red.', 200),
]

describe('buildSupersedePrompt', () => {
  it('lists newest first, because position IS the rule', () => {
    // "a fact ABOVE it is newer" is the entire instruction. Sorting the
    // other way would invert every judgement the model makes.
    const prompt = buildSupersedePrompt(NOTCH)
    expect(prompt.split('\n')[0]).toContain('blue rather than red')
    expect(prompt.split('\n')[1]).toContain('red accents')
  })

  it('numbers from one', () => {
    expect(buildSupersedePrompt(NOTCH)).toMatch(/^1\. /)
  })

  it('does not mutate the caller list', () => {
    const input = [...NOTCH]
    buildSupersedePrompt(input)
    expect(input.map(f => f.id)).toEqual([1, 2])
  })
})

describe('parseSupersededIds', () => {
  it('maps a position back to the right fact id', () => {
    // Position 2 is the OLDER red-accents fact, superseded by the blue one.
    expect(parseSupersededIds('2', NOTCH)).toEqual([1])
  })

  it('returns nothing when the model found nothing', () => {
    expect(parseSupersededIds('', NOTCH)).toEqual([])
    expect(parseSupersededIds('\n  \n', NOTCH)).toEqual([])
  })

  it('ignores positions that do not exist', () => {
    // A model answering a different question than it was asked.
    expect(parseSupersededIds('99\n0\n-1', NOTCH)).toEqual([])
  })

  it('collapses a repeated position', () => {
    expect(parseSupersededIds('2\n2\n2', NOTCH)).toEqual([1])
  })

  it('tolerates the model adding commentary after the number', () => {
    expect(parseSupersededIds('2. superseded by the blue rule', NOTCH)).toEqual([1])
  })

  it('ignores prose it cannot parse', () => {
    expect(parseSupersededIds('Nothing is superseded here.', NOTCH)).toEqual([])
  })
})

describe('the runaway guard', () => {
  const ten = Array.from({ length: 10 }, (_, i) => fact(i + 1, `rule ${i + 1}`))

  it('refuses a pass that would gut the bucket', () => {
    // A model that misreads the task answers "1,2,3,4,5,6..." and empties
    // someone's context in one idle tick. Refusing the WHOLE pass is
    // deliberate: a partial apply would still delete real rules, and there
    // is no way to know which of its answers were the wrong ones.
    const everything = ten.map((_, i) => String(i + 1)).join('\n')
    expect(parseSupersededIds(everything, ten)).toEqual([])
  })

  it('allows a pass right at the cap', () => {
    const half = ten.slice(0, ten.length * MAX_SUPERSEDE_FRACTION)
      .map((_, i) => String(i + 1)).join('\n')
    expect(parseSupersededIds(half, ten)).toHaveLength(5)
  })

  it('never retires the only fact in a bucket', () => {
    // floor(1 * 0.5) is 0, so a single-fact bucket can lose nothing.
    expect(parseSupersededIds('1', [fact(1, 'the only rule')])).toEqual([])
  })

  it('handles an empty bucket', () => {
    expect(parseSupersededIds('1', [])).toEqual([])
  })
})
