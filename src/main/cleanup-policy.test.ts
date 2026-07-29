import { describe, it, expect } from 'vitest'
import {
  cleanupSkipReason,
  canSkipCleanup,
  cleanupRetryDecision,
  parseRateLimitDelayMs,
  SHORT_UTTERANCE_MAX_WORDS,
} from './cleanup-policy'

describe('short-utterance bypass', () => {
  it('skips the LLM below the word threshold', () => {
    expect(cleanupSkipReason('on my way', 'messaging')).toBe('short-utterance')
    expect(cleanupSkipReason('double check', 'other')).toBe('short-utterance')
  })

  it('applies to every non-code category', () => {
    expect(canSkipCleanup('sounds good to me', 'email')).toBe(true)
    expect(canSkipCleanup('sounds good to me', 'docs')).toBe(true)
    expect(canSkipCleanup('sounds good to me', 'other')).toBe(true)
    // Nothing to restructure into a prompt at this length either.
    expect(canSkipCleanup('add a test for this', 'ai_prompt')).toBe(true)
  })

  it('runs the LLM at exactly the threshold', () => {
    const eight = 'one two three four five six seven eight'
    expect(eight.split(' ')).toHaveLength(SHORT_UTTERANCE_MAX_WORDS)
    expect(cleanupSkipReason(eight, 'messaging')).toBe('none')
  })

  it('skips one word below the threshold', () => {
    expect(cleanupSkipReason('one two three four five six seven', 'messaging'))
      .toBe('short-utterance')
  })

  it('runs the LLM well above the threshold', () => {
    const long = 'hey I wanted to check whether you had a chance to look at the document I sent over to you yesterday'
    expect(cleanupSkipReason(long, 'messaging')).toBe('none')
  })
})

// Length alone is not sufficient. A short dictation the user stumbled
// through still needs the LLM — pasting "um can you send it" would be a
// worse regression than the round-trip saved.
describe('disfluency guard on the short path', () => {
  it('does not skip a short dictation containing a filler', () => {
    expect(cleanupSkipReason('um can you send it', 'messaging')).toBe('none')
  })

  it('does not skip a short dictation containing a stutter', () => {
    expect(cleanupSkipReason('can can you send it', 'messaging')).toBe('none')
  })

  it('does not skip a short dictation containing a self-correction', () => {
    expect(cleanupSkipReason('meet at 6, actually 7', 'messaging')).toBe('none')
  })

  it('still skips a clean short dictation with punctuation', () => {
    expect(cleanupSkipReason("I'll be there soon.", 'messaging')).toBe('short-utterance')
  })
})

describe('code category', () => {
  it('skips clean code dictation of any length', () => {
    const long = 'git rebase onto main then force push with lease and open the pull request for review'
    expect(cleanupSkipReason(long, 'code')).toBe('code-verbatim')
  })

  it('runs the LLM on code dictation with a disfluency', () => {
    expect(cleanupSkipReason('um git rebase onto main', 'code')).toBe('none')
  })
})

describe('empty input', () => {
  it('is skippable rather than crashing', () => {
    expect(canSkipCleanup('', 'messaging')).toBe(true)
    expect(canSkipCleanup('   ', 'messaging')).toBe(true)
  })
})

// The observed production failure: Groq replies 429 with "try again in
// 28.18s", the old code waited its 5s cap, retried, failed identically,
// and only then fell back — turning a 1.6s dictation into 6.7s.
describe('rate-limit retry decision', () => {
  const rateLimit = (s: string) =>
    new Error(`429 {"error":{"message":"Rate limit reached ... Please try again in ${s}s","code":"rate_limit_exceeded"}}`)

  it('parses the hinted delay out of a Groq 429', () => {
    expect(parseRateLimitDelayMs(rateLimit('28.18'))).toBe(28180)
    expect(parseRateLimitDelayMs(rateLimit('1.13'))).toBe(1130)
  })

  it('returns null when the error is not a rate limit', () => {
    expect(parseRateLimitDelayMs(new Error('socket hang up'))).toBeNull()
    expect(parseRateLimitDelayMs('not an error')).toBeNull()
  })

  it('does NOT retry when the window is longer than the wait cap', () => {
    const d = cleanupRetryDecision(rateLimit('28.18'))
    expect(d.retry).toBe(false)
    expect(d.reason).toBe('window-too-long')
    expect(d.waitMs).toBe(0)
  })

  it('waits and retries when the window clears quickly', () => {
    const d = cleanupRetryDecision(rateLimit('1.13'))
    expect(d.retry).toBe(true)
    expect(d.reason).toBe('wait-and-retry')
    expect(d.waitMs).toBe(1130)
  })

  it('fast-retries a non-rate-limit failure, as before', () => {
    const d = cleanupRetryDecision(new Error('socket hang up'))
    expect(d.retry).toBe(true)
    expect(d.reason).toBe('not-rate-limited')
    expect(d.waitMs).toBe(250)
  })

  it('treats a delay exactly at the cap as worth waiting', () => {
    const d = cleanupRetryDecision(rateLimit('5'))
    expect(d.retry).toBe(true)
    expect(d.waitMs).toBe(5000)
  })
})

// Regression: these five transcripts are lifted verbatim from a real
// session log where each one routed to faithful_ai (an AI CLI was
// running in the editor), forced the LLM on, hit Groq's TPM limit and
// took 6.2-6.5s to paste a six-word phrase.
//
// The category is 'code' — which is exactly the trap: an earlier
// ordering checked category first, labelled these 'code-verbatim', and
// let runFaithfulAi override the skip. Length must win over category.
describe('short code dictation with an AI CLI running (real log regression)', () => {
  const observed = [
    "Let's just see how quick this is",      // 7 words
    "Let's see how fast this is.",           // 6
    "Let's see how quick this is.",          // 6
    'Why does this thing take so long?',     // 7
  ]

  for (const transcript of observed) {
    it(`skips the LLM for "${transcript}"`, () => {
      expect(cleanupSkipReason(transcript, 'code')).toBe('short-utterance')
    })
  }

  // NOTE: the threshold is "fewer than 8 words", so an 8-word dictation
  // still reaches the LLM. This one is from the same log and still costs
  // a Groq round-trip. Flip the comparison to <= if that is unwanted.
  it('runs the LLM at exactly 8 words, even in code', () => {
    const eightWords = 'Why does this thing always take so long?'
    expect(eightWords.trim().split(/\s+/)).toHaveLength(8)
    expect(cleanupSkipReason(eightWords, 'code')).toBe('code-verbatim')
  })

  it('reports short-utterance, NOT code-verbatim, so it beats runFaithfulAi', () => {
    // code-verbatim yields to runFaithfulAi in pipeline.ts; short-utterance
    // deliberately does not. Getting this label wrong is the whole bug.
    expect(cleanupSkipReason('Why does this thing take so long?', 'code'))
      .not.toBe('code-verbatim')
  })

  it('still yields to the LLM for a substantial code dictation', () => {
    const long = 'refactor the transcription provider so the worker cache is injected instead of module state'
    expect(cleanupSkipReason(long, 'code')).toBe('code-verbatim')
  })

  it('still runs the LLM on a short but disfluent code dictation', () => {
    expect(cleanupSkipReason('um why does this take so long', 'code')).toBe('none')
  })
})
