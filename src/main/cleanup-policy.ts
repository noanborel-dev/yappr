// Should the LLM cleanup pass run at all?
//
// Pure policy: no Electron, no I/O, type-only imports — so the rules
// below are covered by tests rather than discovered in production.
// Skipping cleanup removes an entire network round-trip from the
// post-release wall-clock, which is the single biggest latency lever
// short of changing the whisper model tier.
//
// Note what "skip" does NOT mean: the deterministic passes in
// pipeline.ts (brand names, user dictionary, self-correction,
// spelled-name collapse, question marks) ALWAYS run afterwards.
// Skipping costs the user restructuring and register-matching, not
// correctness.

import type { AppCategory } from '../shared/types'

const FILLER_RE = /\b(um+|uh+|er+|erm+|hmm*|uhh+|umm+)\b/i
const STUTTER_RE = /\b(\w+)[, ]+\1\b/i  // "the the", "I, I"
// "I mean" is contextual: as a sentence-opener / clause-opener ("I mean,
// it's fast") it's a hedging softener, NOT a correction. As a mid-sentence
// pivot after a comma ("at 6, I mean 7", "send to Alice, I mean Bob") it
// IS a correction. We require the leading comma / pause to disambiguate.
const CORRECTION_RE = /\b(actually|wait|scratch that|nevermind|never mind)\b|,\s*i mean\s+\w/i

// Short-utterance bypass. Below this many words a dictation goes
// straight through with no LLM pass — "on my way", "double check",
// "pushed it to main". There is nothing to restructure at this length,
// and measured against the app log the cleanup call is ~700ms of the
// ~1.6s a short dictation takes today. It is also the entire reason
// short dictations were hitting Groq's 6000 TPM limit: every one of
// them was sending a ~3400-token prompt to say "double check".
//
// Accepted tradeoff: sub-threshold dictations are NOT formatted,
// register-matched, or (in ai_prompt) turned into a structured prompt.
//
// This is NOT a re-introduction of the regex-only Light path. That rule
// is about STRICTNESS — Light must never mean "skip the LLM" for
// messaging or anything else. This is an orthogonal LENGTH floor: every
// category still runs the LLM at every strictness for anything longer
// than a handful of words.
export const SHORT_UTTERANCE_MAX_WORDS = 10

export type SkipReason = 'none' | 'code-verbatim' | 'short-utterance'

export function countWords(text: string): number {
  const t = text.trim()
  if (t.length === 0) return 0
  return t.split(/\s+/).length
}

// Markers that mean the raw transcript is NOT clean enough to paste
// as-is, regardless of how short it is. "um can you send it" is six
// words but must still reach the LLM — shipping the "um" would be a
// worse regression than the latency saved.
function hasDisfluency(transcript: string): boolean {
  return FILLER_RE.test(transcript)
    || STUTTER_RE.test(transcript)
    || CORRECTION_RE.test(transcript)
}

export function cleanupSkipReason(transcript: string, category: AppCategory): SkipReason {
  // A stumble needs the LLM regardless of length or category — pasting
  // the "um" is worse than the round-trip saved.
  if (hasDisfluency(transcript)) return 'none'

  // Short-utterance bypass FIRST, before any category rule.
  //
  // Order matters and is load-bearing. Checking `category === 'code'`
  // first labels a six-word phrase 'code-verbatim', which the pipeline
  // then lets `runFaithfulAi` override — so dictating "let's see how
  // quick this is" into an editor with an AI CLI running went to the
  // LLM after all, 429'd, and took 6.5s. Length wins over category:
  // there is nothing for any cleanup register to do at this size.
  if (countWords(transcript) < SHORT_UTTERANCE_MAX_WORDS) {
    return 'short-utterance'
  }

  // Longer code dictation = verbatim; the deterministic passes cover
  // jargon and casing. This one DOES yield to runFaithfulAi, because a
  // substantial prompt aimed at an AI benefits from the faithful pass.
  if (category === 'code') return 'code-verbatim'

  // Everything else runs the LLM. Strictness controls HOW it cleans,
  // never WHETHER it runs — a deliberate product decision: "the light
  // setting should never skip the LLM for personal messaging."
  return 'none'
}

export function canSkipCleanup(transcript: string, category: AppCategory): boolean {
  return cleanupSkipReason(transcript, category) !== 'none'
}

// --- Groq rate-limit handling -------------------------------------------
//
// On a 429 the Groq error embeds "Please try again in Ns". Retrying
// before that window elapses is guaranteed to fail, so the only question
// is whether we can afford to wait it out.
//
// The old behaviour capped the wait at 5s and retried anyway. Against a
// 28s hint that burns ~5.5s of the user's time to arrive at the same
// raw-transcript fallback it would have reached instantly — the logs
// show short dictations taking 6.7s for exactly this reason.
export const CLEANUP_RETRY_CAP_MS = 5000

export function parseRateLimitDelayMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const m = err.message.match(/Please try again in ([\d.]+)\s*s/i)
  if (!m) return null
  const seconds = parseFloat(m[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.ceil(seconds * 1000)
}

export interface RetryDecision {
  retry: boolean
  waitMs: number
  reason: 'not-rate-limited' | 'wait-and-retry' | 'window-too-long'
}

// Decide what to do after a failed cleanup attempt.
export function cleanupRetryDecision(err: unknown): RetryDecision {
  const hinted = parseRateLimitDelayMs(err)
  // Not a rate limit (network blip, timeout) — fast retry, as before.
  if (hinted === null) return { retry: true, waitMs: 250, reason: 'not-rate-limited' }
  // Rate limited, and the window clears soon enough to be worth waiting.
  if (hinted <= CLEANUP_RETRY_CAP_MS) {
    return { retry: true, waitMs: hinted, reason: 'wait-and-retry' }
  }
  // Rate limited for longer than we're willing to make the user wait.
  // Retrying cannot succeed; fall back to the raw transcript now.
  return { retry: false, waitMs: 0, reason: 'window-too-long' }
}
