import { describe, it, expect } from 'vitest'
import { cleanupMaxTokens, REASONING_HEADROOM_TOKENS } from './token-budget'

const OSS = 'openai/gpt-oss-20b'
const base = {
  mode: 'cleanup' as const,
  appCategory: 'email' as const,
  expandsOutput: false,
  model: OSS,
}

// The two real failures, reproduced as numbers. Both came back with
// finish_reason "length": the reply was cut off, which is why one email
// lost its recipient and the other stopped mid-word.
describe('the observed truncations', () => {
  it('gives a 65-char compose request room to answer', () => {
    // Was 106 tokens, of which ~102 went on reasoning -> 0 chars of email.
    const got = cleanupMaxTokens({ ...base, inputChars: 65, expandsOutput: true })
    expect(got).toBeGreaterThan(600)
  })

  it('gives a 47-char compose request room for a whole email', () => {
    // Was 98 tokens -> 64 characters, cut mid-sentence.
    const got = cleanupMaxTokens({ ...base, inputChars: 47, expandsOutput: true })
    expect(got).toBeGreaterThan(600)
  })
})

describe('reasoning headroom', () => {
  it('is added for reasoning models', () => {
    const oss = cleanupMaxTokens({ ...base, inputChars: 100 })
    const other = cleanupMaxTokens({ ...base, inputChars: 100, model: 'llama-3.3-70b-versatile' })
    expect(oss - other).toBe(REASONING_HEADROOM_TOKENS)
  })

  it('covers the measured 75-100 tokens of reasoning with margin', () => {
    expect(REASONING_HEADROOM_TOKENS).toBeGreaterThanOrEqual(150)
  })

  // The floor is what a SHORT dictation gets, and short dictations were
  // where reasoning ate the entire budget.
  it('leaves usable room at the smallest possible input', () => {
    const got = cleanupMaxTokens({ ...base, inputChars: 1 })
    expect(got - REASONING_HEADROOM_TOKENS).toBeGreaterThanOrEqual(80)
  })
})

describe('compose vs clean', () => {
  it('budgets a composed email far above a cleaned one', () => {
    const clean = cleanupMaxTokens({ ...base, inputChars: 60 })
    const compose = cleanupMaxTokens({ ...base, inputChars: 60, expandsOutput: true })
    expect(compose).toBeGreaterThan(clean * 2)
  })

  it('scales with the brief rather than being a flat number', () => {
    const small = cleanupMaxTokens({ ...base, inputChars: 50, expandsOutput: true })
    const large = cleanupMaxTokens({ ...base, inputChars: 800, expandsOutput: true })
    expect(large).toBeGreaterThan(small)
  })
})

// Edge cases: the cap has to hold at both ends or a huge dictation either
// gets truncated or bills for thousands of unused tokens.
describe('edges', () => {
  it('is bounded for a very large input', () => {
    const huge = cleanupMaxTokens({ ...base, inputChars: 100_000, expandsOutput: true })
    expect(huge).toBeLessThanOrEqual(1536 + REASONING_HEADROOM_TOKENS)
  })

  it('never returns zero or negative for empty input', () => {
    for (const expandsOutput of [true, false]) {
      expect(cleanupMaxTokens({ ...base, inputChars: 0, expandsOutput })).toBeGreaterThan(0)
    }
  })

  // Rewrite and compose expand for different reasons, so neither is
  // uniformly larger. Compose multiplies harder (6x vs 3x) because it
  // writes an email out of a one-line brief; rewrite has the higher
  // CEILING because its input can be a long selection that must survive
  // intact. Asserting the ceilings, not a blanket ordering.
  it('gives rewrite the higher ceiling for large selections', () => {
    const rewrite = cleanupMaxTokens({ ...base, inputChars: 100_000, mode: 'rewrite' })
    const compose = cleanupMaxTokens({ ...base, inputChars: 100_000, expandsOutput: true })
    expect(rewrite).toBeGreaterThan(compose)
  })

  it('grows compose faster per token of brief', () => {
    const rewrite = cleanupMaxTokens({ ...base, inputChars: 500, mode: 'rewrite' })
    const compose = cleanupMaxTokens({ ...base, inputChars: 500, expandsOutput: true })
    expect(compose).toBeGreaterThan(rewrite)
  })

  it('caps ai_prompt shaping at its own ceiling', () => {
    const shaped = cleanupMaxTokens({ ...base, inputChars: 100_000, appCategory: 'ai_prompt' })
    expect(shaped).toBeLessThanOrEqual(2048 + REASONING_HEADROOM_TOKENS)
  })
})
