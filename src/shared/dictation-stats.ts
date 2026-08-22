// All-time dictation statistics.
//
// Deliberately separate from the transcript history. That history is
// capped at HISTORY_PERSIST_LIMIT because keeping every word a user has
// ever spoken in userData/ is a privacy surface nobody asked for — the
// comment on that cap says so outright, and raising it to "forever"
// would quietly reverse the decision.
//
// A stat record carries no text. Timestamp, word count, speaking
// duration, app name: enough for every metric on the dashboard, and
// close to worthless to anyone who gets hold of the file. That split is
// what lets the dashboard cover all time while the searchable transcript
// list stays short.
//
// Pure — no electron, no store. stats-store.ts owns persistence.

/**
 * One dictation, reduced to what a metric needs.
 *
 * Keys are single letters on purpose: this file gains one record per
 * dictation and is never pruned, so the field names would otherwise
 * outweigh the data.
 */
export interface StatRecord {
  /** Unix ms. */
  t: number
  /** Words in the final pasted text. */
  w: number
  /** Speaking duration in ms; 0 when unknown. */
  ms: number
  /** App the text landed in. */
  a: string
}

// The recorder runs at a fixed 64 kbps (see useIndicatorAudio), so audio
// length follows from byte length. Opus at a set rate is near enough to
// constant for a speaking-rate figure, and container overhead is a
// fraction of a percent at these clip sizes.
//
// Derived rather than measured because it has to work for BOTH paths:
// the local engine decodes real sample counts, but the cloud provider
// never sees a decoded buffer. A rate that silently counted only local
// dictations would be worse than one honest approximation.
export const RECORDER_BITS_PER_SECOND = 64_000

export function speakingMsFromAudioBytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0
  return Math.round((bytes * 8 * 1000) / RECORDER_BITS_PER_SECOND)
}

export function wordCount(text: string): number {
  return (text ?? '').trim().split(/\s+/).filter(Boolean).length
}

export interface AppShare {
  name: string
  count: number
  /** 0–1 share of all dictations. */
  share: number
}

export interface DayCount {
  label: string
  date: Date
  count: number
}

/**
 * Typing speed the time-saved figure is measured against.
 *
 * 40 wpm is the common figure for sustained prose typing on a full
 * keyboard. It is an ASSUMPTION, not a measurement, which is why the UI
 * states it next to the number — a headline figure derived from an
 * unstated baseline is just a marketing claim.
 */
export const TYPING_WPM = 40

export interface DictationStats {
  total: number
  words: number
  /** Speaking rate over records that have a duration. Null when none do. */
  wordsPerMinute: number | null
  today: number
  thisWeek: number
  apps: AppShare[]
  days: DayCount[]
  /** Timestamp of the earliest record, 0 when there are none. */
  since: number
  /**
   * Minutes saved this month against TYPING_WPM: how long those words
   * would have taken to type, minus how long they took to say.
   *
   * Only records WITH a duration count, for the same reason the rate
   * excludes them — an unmeasured dictation would otherwise look
   * instantaneous and inflate the figure. Null when nothing is timed.
   */
  minutesSavedThisMonth: number | null
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * Aggregate every record. `now` is injected so day boundaries are
 * testable without freezing the clock.
 */
export function aggregate(
  records: readonly StatRecord[],
  now: number,
  dayWindow = 14,
): DictationStats {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000

  const byApp = new Map<string, number>()
  const buckets = new Map<string, number>()
  let words = 0
  let today = 0
  let thisWeek = 0
  let since = 0
  // Only records WITH a duration feed the rate. Records written before
  // durations were captured would otherwise drag it toward zero.
  let timedWords = 0
  let timedMs = 0
  const startOfMonth = new Date(now)
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  let monthWords = 0
  let monthMs = 0

  for (const r of records) {
    words += r.w
    if (r.t >= startOfToday.getTime()) today++
    if (r.t >= weekAgo) thisWeek++
    if (since === 0 || r.t < since) since = r.t
    if (r.a) byApp.set(r.a, (byApp.get(r.a) ?? 0) + 1)
    if (r.ms > 0) {
      timedWords += r.w
      timedMs += r.ms
      if (r.t >= startOfMonth.getTime()) {
        monthWords += r.w
        monthMs += r.ms
      }
    }
    const d = new Date(r.t)
    buckets.set(dayKey(d), (buckets.get(dayKey(d)) ?? 0) + 1)
  }

  const days: DayCount[] = []
  for (let back = dayWindow - 1; back >= 0; back--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - back)
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      date: d,
      count: buckets.get(dayKey(d)) ?? 0,
    })
  }

  const total = records.length
  const apps: AppShare[] = [...byApp.entries()]
    .map(([name, count]) => ({ name, count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return {
    total,
    words,
    wordsPerMinute: timedMs > 0 ? Math.round(timedWords / (timedMs / 60_000)) : null,
    today,
    thisWeek,
    apps,
    days,
    since,
    minutesSavedThisMonth: monthMs > 0
      // Clamped at zero: someone who speaks slower than they type has not
      // "lost" time in any sense worth showing them a negative number for.
      ? Math.max(0, Math.round(monthWords / TYPING_WPM - monthMs / 60_000))
      : null,
  }
}

/** Compact display for large counts: 1200 → "1.2k". */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs < 1000) return String(Math.round(n))
  if (abs < 1_000_000) {
    const k = n / 1000
    return `${abs / 1000 >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`
  }
  const m = n / 1_000_000
  return `${abs / 1_000_000 >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}m`
}
