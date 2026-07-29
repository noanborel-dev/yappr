// Chunked transcription during the hotkey hold.
//
// WHY 30 SECONDS AND NOT 2
//
// Whisper's encoder always runs on a padded 30-second window. Measured on
// this machine: a 0.78s clip and a 27s clip both cost ~880ms on
// large-v3-turbo. Inference only grows once audio crosses a window
// boundary — 39s: 1502ms, 59s: 1965ms, 114s: 3347ms, i.e. roughly
// ceil(duration / 30) * 880ms.
//
// So chunking at 2s would run ~15x the encoder passes for the same audio
// and save nothing, because the final chunk still costs a full window.
// Chunking at ~30s runs the SAME number of passes as a single call —
// it just runs all but the last one while the user is still talking.
//
//   60s dictation, today:      2 windows after release  ~1965ms
//   60s dictation, streamed:   1 window  after release   ~880ms
//
// That is the entire win, and it only exists for dictations longer than
// one window. Below 30s this must degrade to exactly today's behaviour:
// one chunk, one call, nothing clever.

export const CUT_POLICY = {
  // Whisper's window. Never buffer past this — beyond it the next call
  // pays for a second window anyway, which is what we're avoiding.
  windowSec: 30,
  // Prefer to cut in silence at or after this much buffered audio. Cuts
  // land mid-word otherwise, and a mid-word cut is the main accuracy
  // risk in the whole design.
  preferCutAfterSec: 24,
  // A silence run this long is a safe cut point.
  silenceRunSec: 0.35,
  // Never emit a chunk shorter than this. A tiny chunk still costs a
  // full encoder pass, so cutting early is strictly wasteful.
  minChunkSec: 8,
} as const

// Decide whether to close the current chunk right now.
//
// bufferedSec  — audio accumulated since the last cut
// silenceRunSec— length of the silence run ending at "now" (0 if speaking)
export function shouldCut(bufferedSec: number, silenceRunSec: number): boolean {
  if (bufferedSec < CUT_POLICY.minChunkSec) return false
  // Hard boundary: at the window edge we cut regardless of what the
  // audio is doing. Going past it buys a second window for free.
  if (bufferedSec >= CUT_POLICY.windowSec) return true
  // Otherwise only cut in silence, and only once we're near the edge —
  // cutting at 9s would waste most of a window.
  return bufferedSec >= CUT_POLICY.preferCutAfterSec
    && silenceRunSec >= CUT_POLICY.silenceRunSec
}

// Whisper carries decoded text forward as prompt context between its own
// internal windows. Splitting into separate calls loses that, so we feed
// the tail of the previous chunk back in as the initial prompt. Keep it
// short: the prompt competes with the dictionary bias for the same
// limited prompt budget, and only the recent context matters.
export const PROMPT_CARRYOVER_CHARS = 200

export function buildChunkPrompt(previousText: string, dictionary: string[]): string | undefined {
  const tail = previousText.trim().slice(-PROMPT_CARRYOVER_CHARS)
  const dict = dictionary.length > 0 ? dictionary.join(', ') : ''
  const parts = [dict, tail].filter(p => p.length > 0)
  return parts.length > 0 ? parts.join('. ') : undefined
}

export interface PendingChunk {
  seq: number
  pcm: ArrayBuffer
  durationSec: number
}

// Transcribe one chunk. Injected so the session is testable without the
// whisper worker; `prompt` carries dictionary + previous-chunk context.
export type ChunkTranscriber = (
  chunk: PendingChunk,
  prompt: string | undefined,
) => Promise<string>

export interface SessionOptions {
  transcribe: ChunkTranscriber
  dictionary?: string[]
  // Called when a chunk fails after the session has already committed to
  // streaming. The session keeps going; the caller decides whether the
  // assembled result is still trustworthy.
  onChunkError?: (seq: number, err: unknown) => void
}

// Accumulates chunks during the hold and assembles them at release.
//
// Ordering guarantee: chunks are dispatched in sequence and their results
// are stored by seq, so assembly is order-independent even though the
// transcribe calls are queued elsewhere. The host's SerialQueue already
// guarantees one whisper call in flight; this class must not assume it.
export class StreamingSession {
  private readonly opts: SessionOptions
  private readonly results = new Map<number, string>()
  private readonly inFlight: Array<Promise<void>> = []
  private nextSeq = 0
  private failed = false
  // Text committed so far, used as prompt context for the next chunk.
  private assembledSoFar = ''

  constructor(opts: SessionOptions) {
    this.opts = opts
  }

  get chunkCount(): number {
    return this.nextSeq
  }

  get hadFailure(): boolean {
    return this.failed
  }

  // Hand a completed chunk to the session. Returns immediately; the
  // transcription proceeds in the background so the caller can keep
  // buffering audio while the user is still talking.
  push(pcm: ArrayBuffer, durationSec: number): void {
    const seq = this.nextSeq++
    const chunk: PendingChunk = { seq, pcm, durationSec }
    // Snapshot the prompt at dispatch time. Later chunks see more
    // context; a chunk never waits for its predecessor's text, because
    // that would serialize the whole point of streaming.
    const prompt = buildChunkPrompt(this.assembledSoFar, this.opts.dictionary ?? [])
    const task = this.opts.transcribe(chunk, prompt)
      .then((text) => {
        this.results.set(seq, text)
        // Only extend the running context when this chunk is the next
        // one in order, so the prompt never contains out-of-order text.
        if (seq === 0 || this.results.has(seq - 1)) {
          this.assembledSoFar = this.assemble()
        }
      })
      .catch((err) => {
        this.failed = true
        this.results.set(seq, '')
        this.opts.onChunkError?.(seq, err)
      })
    this.inFlight.push(task)
  }

  // Join every completed chunk in sequence order.
  private assemble(): string {
    const parts: string[] = []
    for (let i = 0; i < this.nextSeq; i++) {
      const text = this.results.get(i)
      if (text === undefined) break
      if (text.length > 0) parts.push(text.trim())
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  // Drain every outstanding chunk and return the assembled transcript.
  async finalize(): Promise<string> {
    await Promise.all(this.inFlight)
    const parts: string[] = []
    for (let i = 0; i < this.nextSeq; i++) {
      const text = this.results.get(i) ?? ''
      if (text.trim().length > 0) parts.push(text.trim())
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }
}
