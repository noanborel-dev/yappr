// Should the LLM cleanup pass run at all?
//
// Pure policy: no Electron, no I/O, type-only imports — so the rules
// below are covered by tests rather than discovered in production.
// Skipping cleanup removes an entire network round-trip from the
// post-release wall-clock, so this is the single biggest latency lever
// outside of streaming itself.
//
// Note what "skip" does NOT mean: the deterministic passes in
// text-passes.ts (brand names, user dictionary, self-correction,
// spelled-name collapse, question marks) ALWAYS run afterwards. Skipping
// costs the user restructuring and register-matching, not correctness.

import type { AppCategory } from '../shared/types'
import { countWords } from './metrics'

const FILLER_RE = /\b(um+|uh+|er+|erm+|hmm*|uhh+|umm+)\b/i
const STUTTER_RE = /\b(\w+)[, ]+\1\b/i  // "the the", "I, I"
// "I mean" is contextual: as a sentence-opener / clause-opener ("I mean,
// it's fast") it's a hedging softener, NOT a correction. As a mid-sentence
// pivot after a comma ("at 6, I mean 7", "send to Alice, I mean Bob") it
// IS a correction. We require the leading comma / pause to disambiguate.
const CORRECTION_RE = /\b(actually|wait|scratch that|nevermind|never mind)\b|,\s*i mean\s+\w/i

// Short-utterance bypass. Below this many words a dictation goes
// straight through with no LLM pass — "on my way", "sounds good to me",
// "pushed it to main". There is nothing to restructure at this length,
// and the LLM round-trip is the entire post-release latency for these.
//
// The tradeoff the user accepted: sub-threshold dictations are NOT
// formatted, register-matched, or (in ai_prompt) turned into a
// structured prompt. They get the deterministic passes and nothing more.
export const SHORT_UTTERANCE_MAX_WORDS = 8

export type SkipReason = 'none' | 'code-verbatim' | 'short-utterance'

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
  // Code dictation = verbatim. Nothing to clean unless the user
  // stumbled, in which case the LLM earns its round-trip.
  if (category === 'code') {
    return hasDisfluency(transcript) ? 'none' : 'code-verbatim'
  }

  // Short-utterance bypass, all remaining categories. Same disfluency
  // guard: length alone is not sufficient.
  if (countWords(transcript) < SHORT_UTTERANCE_MAX_WORDS && !hasDisfluency(transcript)) {
    return 'short-utterance'
  }

  // Everything else runs the LLM. Strictness controls HOW it cleans,
  // never WHETHER it runs — a deliberate product decision: "the light
  // setting should never skip the LLM for personal messaging."
  return 'none'
}

export function canSkipCleanup(transcript: string, category: AppCategory): boolean {
  return cleanupSkipReason(transcript, category) !== 'none'
}
