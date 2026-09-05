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

// Regression, found 2026-09-05 in ~/Library/Application Support/yappr/yappr.log.
//
// The parser only ever understood a bare-seconds hint. Groq formats the
// wait with Go's time.Duration.String(), which drops to compound units
// the moment it exceeds a minute — and the DAILY token limit (TPD),
// which is what actually bites this key, always reports minutes or
// hours. All four of these shapes appear verbatim in the log:
//
//   "Please try again in 38.016s"           264 occurrences  parsed
//   "Please try again in 18m38.016s"        296 occurrences  NOT parsed
//   "Please try again in 1h12m10.367999999s" 42 occurrences  NOT parsed
//   "Please try again in 229.999999ms"       22 occurrences  NOT parsed
//
// 360 of 624 hints (58%) fell through to null, which cleanupRetryDecision
// reads as "not a rate limit" and answers with a 250ms fast retry. The
// log shows the consequence 62 times: an 18-minute window, "attempt 1 —
// retrying", then "attempt 2 — giving up" 298ms later. That retry cannot
// succeed; it is exactly the pure user-visible delay the wait cap exists
// to prevent (see the note above CLEANUP_RETRY_CAP_MS).
describe('compound rate-limit windows (Go duration format)', () => {
  // The caller supplies the whole duration token including its unit, so
  // compound Go durations ("18m38.016s") can be expressed.
  const rateLimitRaw = (d: string) =>
    new Error(`429 {"error":{"message":"Rate limit reached ... Please try again in ${d}. Need more tokens?","code":"rate_limit_exceeded"}}`)

  // Verbatim from the log, 2026-09-05T17:12:13.569Z — a TPD limit.
  const TPD_18M = new Error(
    '429 {"error":{"message":"Rate limit reached for model `openai/gpt-oss-20b` in organization `org_01kpxttpexfdtrqn5y4hrnykj6` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 198701, Requested 3887. Please try again in 18m38.016s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}',
  )

  it('parses minutes and seconds', () => {
    expect(parseRateLimitDelayMs(TPD_18M)).toBe(18 * 60_000 + 38_016)
  })

  it('parses hours, minutes and seconds', () => {
    // 3_600_000 + 720_000 + 10_368
    expect(parseRateLimitDelayMs(rateLimitRaw('1h12m10.367999999s'))).toBe(4_330_368)
  })

  it('parses a sub-second window given in milliseconds', () => {
    // "229.999999ms" must not be read as 229 seconds.
    expect(parseRateLimitDelayMs(rateLimitRaw('229.999999ms'))).toBe(230)
    expect(parseRateLimitDelayMs(rateLimitRaw('150ms'))).toBe(150)
  })

  it('still parses the bare-seconds form', () => {
    expect(parseRateLimitDelayMs(rateLimitRaw('38.016s'))).toBe(38_016)
  })

  // The bug, stated as behaviour: an 18-minute window must not produce a
  // 250ms retry.
  it('does not retry an 18-minute window', () => {
    const d = cleanupRetryDecision(TPD_18M)
    expect(d.retry).toBe(false)
    expect(d.reason).toBe('window-too-long')
    expect(d.waitMs).toBe(0)
  })

  it('does not retry an hour-long window', () => {
    expect(cleanupRetryDecision(rateLimitRaw('1h12m9.504s')).reason).toBe('window-too-long')
  })

  // A genuine sub-second window is worth waiting out, and should be
  // reported as the rate limit it is rather than as a network blip.
  it('waits out a millisecond window and names it correctly', () => {
    const d = cleanupRetryDecision(rateLimitRaw('750ms'))
    expect(d.retry).toBe(true)
    expect(d.reason).toBe('wait-and-retry')
    expect(d.waitMs).toBe(750)
  })

  it('is unaffected by the other numbers in the message', () => {
    // Limit/Used/Requested all precede the hint and must not be picked up.
    expect(parseRateLimitDelayMs(TPD_18M)).not.toBe(200_000)
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

// A compose REQUEST is a brief, not the output. Every other skip is safe
// because the transcript IS what the user meant to send and cleanup only
// polishes it; compose is the one register where skipping pastes the
// instruction instead of the result.
describe('email composition outranks the length bypass', () => {
  // The reported bug, in shape: five words, so the length rule skipped it
  // and the compose window received the request itself.
  it('does not skip a short compose request', () => {
    expect(cleanupSkipReason("email Sam I'm running late", 'email')).toBe('none')
    expect(cleanupSkipReason('write an email to Jeff', 'email')).toBe('none')
    expect(cleanupSkipReason('draft an email about Friday', 'email')).toBe('none')
  })

  // The ask is what matters, not where it is said.
  it('holds regardless of category', () => {
    expect(cleanupSkipReason('send an email to Sam', 'other')).toBe('none')
    expect(cleanupSkipReason('reply to his email now', 'code')).toBe('none')
  })

  // A carve-out, not a removal.
  it('still skips short dictations that are not compose requests', () => {
    expect(cleanupSkipReason('sounds good to me', 'email')).toBe('short-utterance')
    expect(cleanupSkipReason('yes Thursday works', 'email')).toBe('short-utterance')
    expect(cleanupSkipReason('git commit that', 'code')).toBe('short-utterance')
  })

  // The compose regex requires a verb of composition, and that has to keep
  // holding here or every passing mention of email takes the LLM path.
  it('is not fooled by the word email alone', () => {
    expect(cleanupSkipReason('the email bounced', 'email')).toBe('short-utterance')
    expect(cleanupSkipReason('check my email', 'email')).toBe('short-utterance')
  })
})
