// Dictation latency instrumentation.
//
// The streaming work is measured against the wall-clock a user actually
// feels: hotkey RELEASE → text in the target app. Everything before
// release is free (it overlaps with the user still talking), which is
// the entire premise of chunked streaming — so release, not pipeline
// entry, is t0.
//
// One record is emitted per dictation as a single `latency` log line.
// scripts/latency-report.mjs parses those lines out of yappr.log and
// prints p50/p95 per word-count bucket. Pure module: no Electron, no
// I/O — the caller does the logging.

export interface DictationMetric {
  // Wall-clock ms of held audio (hotkey press → release). Proxy for
  // audio duration; the recorder starts warm so the delta is small.
  audioMs: number
  words: number
  // t0 = hotkey release. First = when the first character reaches the
  // app, final = when the complete text does. They are equal today
  // (one paste at the end); they diverge only if progressive insertion
  // is ever built.
  releaseToFirstMs: number
  releaseToFinalMs: number
  // Time inside the transcription provider. Once streaming lands this
  // is the TAIL only — the chunks transcribed during the hold are not
  // counted, because the user never waited for them.
  transcribeMs: number
  // Time inside the cleanup LLM call (network + inference; the Groq
  // SDK does not separate them).
  cleanupMs: number
  cleanupSkipped: boolean
  // Why the LLM was skipped, when it was: 'code-verbatim',
  // 'short-utterance', 'user-paused', or 'none' when it ran. Lets the
  // report show whether the short-utterance cutoff is actually firing
  // and at what rate, rather than just that some calls were skipped.
  skipReason: string
  // Local-provider-only breakdown, when available.
  decodeMs?: number
  inferMs?: number
  category: string
  provider: string
}

// Word-count buckets matching the stated targets:
//   short  — skips straight through; must not regress
//   medium — roughly two sentences
//   long   — four or more sentences; the streaming win lives here
export type Bucket = 'short' | 'medium' | 'long'

export function bucketFor(words: number): Bucket {
  if (words < 5) return 'short'
  if (words <= 20) return 'medium'
  return 'long'
}

export function countWords(text: string): number {
  const t = text.trim()
  if (t.length === 0) return 0
  return t.split(/\s+/).length
}

// Nearest-rank percentile. p is 0-100. Returns 0 for an empty sample.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  const idx = Math.min(Math.max(rank - 1, 0), sorted.length - 1)
  return sorted[idx]
}

export interface BucketSummary {
  bucket: Bucket
  count: number
  releaseToFinalP50: number
  releaseToFinalP95: number
  transcribeP50: number
  cleanupP50: number
  cleanupSkippedPct: number
}

export function summarize(metrics: DictationMetric[]): BucketSummary[] {
  const buckets: Bucket[] = ['short', 'medium', 'long']
  return buckets.map(bucket => {
    const rows = metrics.filter(m => bucketFor(m.words) === bucket)
    const finals = rows.map(m => m.releaseToFinalMs)
    return {
      bucket,
      count: rows.length,
      releaseToFinalP50: percentile(finals, 50),
      releaseToFinalP95: percentile(finals, 95),
      transcribeP50: percentile(rows.map(m => m.transcribeMs), 50),
      cleanupP50: percentile(rows.map(m => m.cleanupMs), 50),
      cleanupSkippedPct: rows.length === 0
        ? 0
        : Math.round((rows.filter(m => m.cleanupSkipped).length / rows.length) * 100),
    }
  })
}

// Targets from the streaming brief. `null` = "must not regress",
// which needs a before/after comparison rather than a fixed ceiling.
export const TARGETS: Record<Bucket, { p50: number | null; p95: number | null }> = {
  short: { p50: null, p95: null },
  medium: { p50: 1000, p95: 1500 },
  long: { p50: 1000, p95: 1500 },
}

export function formatReport(summaries: BucketSummary[]): string {
  const lines: string[] = []
  lines.push('bucket   n     final p50   final p95   transcribe p50   cleanup p50   skipped')
  lines.push('------   ---   ---------   ---------   --------------   -----------   -------')
  for (const s of summaries) {
    const target = TARGETS[s.bucket]
    const flag = target.p50 !== null && s.count > 0 && s.releaseToFinalP50 > target.p50 ? '  ⚠' : ''
    lines.push(
      [
        s.bucket.padEnd(6),
        String(s.count).padStart(3),
        `${s.releaseToFinalP50}ms`.padStart(9),
        `${s.releaseToFinalP95}ms`.padStart(9),
        `${s.transcribeP50}ms`.padStart(14),
        `${s.cleanupP50}ms`.padStart(11),
        `${s.cleanupSkippedPct}%`.padStart(7),
      ].join('   ') + flag
    )
  }
  return lines.join('\n')
}
