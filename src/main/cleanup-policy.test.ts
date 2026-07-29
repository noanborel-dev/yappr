import { describe, it, expect } from 'vitest'
import {
  cleanupSkipReason,
  canSkipCleanup,
  SHORT_UTTERANCE_MAX_WORDS,
} from './cleanup-policy'

describe('short-utterance bypass', () => {
  it('skips the LLM below the word threshold', () => {
    expect(cleanupSkipReason('on my way', 'messaging')).toBe('short-utterance')
    expect(cleanupSkipReason('sounds good to me', 'messaging')).toBe('short-utterance')
  })

  it('applies to every non-code category, not just messaging', () => {
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
    const seven = 'one two three four five six seven'
    expect(cleanupSkipReason(seven, 'messaging')).toBe('short-utterance')
  })

  it('runs the LLM well above the threshold', () => {
    const long = 'hey I wanted to check whether you had a chance to look at the document I sent over yesterday'
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
    const long = 'git rebase onto main then force push with lease and open the pull request for review please'
    expect(cleanupSkipReason(long, 'code')).toBe('code-verbatim')
  })

  it('runs the LLM on code dictation with a disfluency', () => {
    expect(cleanupSkipReason('um git rebase onto main', 'code')).toBe('none')
  })
})

describe('empty and whitespace input', () => {
  it('treats empty input as skippable rather than crashing', () => {
    expect(canSkipCleanup('', 'messaging')).toBe(true)
    expect(canSkipCleanup('   ', 'messaging')).toBe(true)
  })
})
