// Retry policy for recordings recovered from disk. Pure and unit-tested;
// the wiring that actually re-runs pipelines lives in index.ts.

// Backoff between automatic retries, indexed by how many attempts have
// already failed. Deliberately short at the front: the dominant failure is
// the whisper worker dying, and a respawned worker usually succeeds
// immediately, so the first retry should feel instant rather than
// considered. Running out of this list means we stop retrying on a timer —
// the audio stays on disk and gets one more shot at next launch.
export const RETRY_BACKOFF_MS = [2_000, 10_000, 30_000]

// How long after the original recording an automatic paste is still safe.
// Past this, the user has almost certainly moved on and pasting would
// dump text into the wrong app; we hand off to the paste-fallback popup
// instead, which is click-to-insert and cannot go anywhere unintended.
export const AUTO_PASTE_WINDOW_MS = 15_000

// Most orphans to replay automatically on launch. A crash can leave a
// backlog, and transcribing all of them at once would stall startup and
// fight over the whisper worker. The remainder stays on disk.
export const MAX_STARTUP_RECOVERIES = 3

// Delay before the next automatic retry, or null once the schedule is
// exhausted. `attempts` is the number of failures recorded so far.
export function retryDelayMs(attempts: number): number | null {
  if (attempts < 1) return RETRY_BACKOFF_MS[0]
  return RETRY_BACKOFF_MS[attempts - 1] ?? null
}

// May a recovered dictation be pasted straight into the focused app?
// Both conditions must hold: the user is still in the app they dictated
// into, and little enough time has passed that the insertion point is
// plausibly still where they left it.
export function shouldAutoPaste(
  savedBundleId: string,
  currentBundleId: string,
  elapsedMs: number,
): boolean {
  if (savedBundleId !== currentBundleId) return false
  if (elapsedMs > AUTO_PASTE_WINDOW_MS) return false
  return true
}
