// Which resident whisper model to evict, if any.
//
// Split out of whisper-worker.ts purely so it can be tested — the worker
// itself imports the native whisper binding and can't be loaded under
// vitest. Getting this wrong is expensive in a way that is hard to see:
// evicting a context that is mid-transcribe, or one whose load hasn't
// settled, hands the awaiting caller a released pointer.

export interface ResidentModel {
  path: string
  // True while initWhisper() is still in flight for this entry.
  loading: boolean
  // Monotonic "last touched" stamp; smallest = least recently used.
  lastUsed: number
}

export interface EvictionContext {
  // The model being loaded right now — never evict it.
  keepPath: string
  // The model `transcribe` will use — never evict it.
  activePath: string | null
  // The model with a transcribeData() call in flight — never evict it.
  inFlightPath: string | null
  maxResident: number
}

// Returns the path to release, or null when nothing may safely be
// evicted. Callers should treat null as "run over budget this once"
// rather than as an error: exceeding the cap costs RAM, whereas
// releasing a live context corrupts an in-flight transcription.
export function chooseEvictionVictim(
  residents: ResidentModel[],
  ctx: EvictionContext,
): string | null {
  if (residents.length < ctx.maxResident) return null

  let victim: string | null = null
  let victimUsed = Infinity
  for (const m of residents) {
    if (m.path === ctx.keepPath) continue
    if (m.path === ctx.activePath) continue
    if (m.path === ctx.inFlightPath) continue
    // An unsettled load has an awaiting caller; releasing under it
    // would resolve that caller with a dead context.
    if (m.loading) continue
    if (m.lastUsed < victimUsed) {
      victimUsed = m.lastUsed
      victim = m.path
    }
  }
  return victim
}
