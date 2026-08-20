// Should a context compaction run right now?
//
// Pure decision, split out of compactor.ts because that file imports
// Electron's powerMonitor and cannot be loaded under vitest — and this
// gate is exactly where the bug was.
//
// THE BUG THIS EXISTS TO PREVENT
//
// notifyDictationCompleted() stamped lastDictationActivityAt = now and
// then scheduled the check with setTimeout(..., 0). Roughly zero
// milliseconds later the gate asked "has it been quiet for 60s?", found
// that it had been quiet for ~0ms, and returned busy. Every single time.
// The only automatic trigger fired at precisely the moment the gate was
// guaranteed to reject it, so across 316 dictations compaction never ran
// once and the overview silently went stale.
//
// The fix is not to loosen the gate — waiting for the machine to be idle
// is correct, because compaction is a multi-second LLM call we do not
// want competing with a dictation. The fix is to keep RE-ASKING until
// the answer is yes, which is what the retry scheduler in compactor.ts
// now does.

export interface GateInput {
  /** Dictations recorded since the last successful compaction. */
  count: number
  threshold: number
  /** A compaction is already running. */
  compacting: boolean
  /** Whether a cleanup API key is configured. */
  hasApiKey: boolean
  /** Milliseconds since the user last dictated. */
  msSinceDictation: number
  /** Seconds the OS reports the user has been idle. */
  osIdleSeconds: number
  idleMs: number
  osIdleSeconds_threshold: number
}

export type GateReason =
  | 'ok'
  | 'in-progress'
  | 'no-key'
  | 'below-threshold'
  | 'recent-dictation'
  | 'user-active'

export function compactionGate(input: GateInput): { run: boolean; reason: GateReason } {
  if (input.compacting) return { run: false, reason: 'in-progress' }
  if (!input.hasApiKey) return { run: false, reason: 'no-key' }
  if (input.count < input.threshold) return { run: false, reason: 'below-threshold' }
  // Don't compact while the user is mid-flow: a multi-second LLM call
  // competing with a dictation is exactly the latency we spent this
  // whole effort removing.
  if (input.msSinceDictation <= input.idleMs) return { run: false, reason: 'recent-dictation' }
  if (input.osIdleSeconds <= input.osIdleSeconds_threshold) return { run: false, reason: 'user-active' }
  return { run: true, reason: 'ok' }
}

// Whether it is worth continuing to poll. Once the backlog drops below
// the threshold (i.e. a compaction succeeded) there is nothing to wait
// for, and a missing API key will not fix itself on a timer.
export function shouldKeepRetrying(input: GateInput): boolean {
  if (input.count < input.threshold) return false
  if (!input.hasApiKey) return false
  return true
}
