import { describe, it, expect } from 'vitest'
import {
  aggregate,
  TYPING_WPM,
  wordCount,
  compactNumber,
  speakingMsFromAudioBytes,
  RECORDER_BITS_PER_SECOND,
  type StatRecord,
} from './dictation-stats'

// A fixed "now" so day boundaries are deterministic. Local noon, so
// today/yesterday cannot straddle a timezone edge.
const NOW = new Date(2026, 7, 22, 12, 0, 0).getTime()
const hoursAgo = (h: number) => NOW - h * 3600_000
const daysAgo = (d: number) => NOW - d * 86_400_000

const rec = (over: Partial<StatRecord> = {}): StatRecord => ({
  t: NOW, w: 10, ms: 60_000, a: 'Code', ...over,
})

describe('speakingMsFromAudioBytes', () => {
  // 64 kbps = 8000 bytes per second.
  it('converts byte length to duration at the recorder bitrate', () => {
    expect(speakingMsFromAudioBytes(8000)).toBe(1000)
    expect(speakingMsFromAudioBytes(RECORDER_BITS_PER_SECOND / 8)).toBe(1000)
    expect(speakingMsFromAudioBytes(80_000)).toBe(10_000)
  })

  // 0 means "unknown", and aggregate() excludes it from the rate rather
  // than treating it as an instantaneous dictation.
  it('returns 0 for missing or nonsense input', () => {
    expect(speakingMsFromAudioBytes(0)).toBe(0)
    expect(speakingMsFromAudioBytes(-5)).toBe(0)
    expect(speakingMsFromAudioBytes(Number.NaN)).toBe(0)
  })
})

describe('wordCount', () => {
  it('counts words, not whitespace', () => {
    expect(wordCount('hello there  world')).toBe(3)
    expect(wordCount('  padded  ')).toBe(1)
    expect(wordCount('')).toBe(0)
  })
})

describe('aggregate', () => {
  it('totals dictations and words across all time', () => {
    const s = aggregate([rec({ w: 5 }), rec({ w: 7, t: daysAgo(400) })], NOW)
    expect(s.total).toBe(2)
    expect(s.words).toBe(12)
  })

  // The headline rate. 20 words spoken over 30s is 40 wpm.
  it('computes words per minute from speaking time', () => {
    const s = aggregate([rec({ w: 20, ms: 30_000 })], NOW)
    expect(s.wordsPerMinute).toBe(40)
  })

  // Records predating duration capture must not drag the rate down.
  it('excludes records with no duration from the rate', () => {
    const s = aggregate([rec({ w: 20, ms: 30_000 }), rec({ w: 999, ms: 0 })], NOW)
    expect(s.wordsPerMinute).toBe(40)
  })

  it('reports no rate at all when nothing is timed', () => {
    expect(aggregate([rec({ ms: 0 })], NOW).wordsPerMinute).toBeNull()
  })

  // Calendar day, not a rolling 24h window — a dictation at 11pm belongs
  // to that day, which is how people actually think about it.
  it('counts today by calendar day', () => {
    const s = aggregate([
      rec({ t: hoursAgo(1) }),
      rec({ t: hoursAgo(11) }),
      rec({ t: daysAgo(1) }),
    ], NOW)
    expect(s.today).toBe(2)
  })

  it('counts the last seven days', () => {
    const s = aggregate([rec({ t: daysAgo(1) }), rec({ t: daysAgo(6) }), rec({ t: daysAgo(9) })], NOW)
    expect(s.thisWeek).toBe(2)
  })

  it('ranks apps by use and reports each share', () => {
    const s = aggregate([
      rec({ a: 'Claude Code' }), rec({ a: 'Claude Code' }), rec({ a: 'Claude Code' }),
      rec({ a: 'Gmail' }),
    ], NOW)
    expect(s.apps[0]).toEqual({ name: 'Claude Code', count: 3, share: 0.75 })
    expect(s.apps[1]).toEqual({ name: 'Gmail', count: 1, share: 0.25 })
  })

  it('reports when the record keeping started', () => {
    expect(aggregate([rec({ t: daysAgo(30) }), rec()], NOW).since).toBe(daysAgo(30))
  })

  it('builds a day series of the requested length, oldest first', () => {
    const s = aggregate([rec()], NOW, 7)
    expect(s.days).toHaveLength(7)
    expect(s.days[6].count).toBe(1)
    expect(s.days[0].count).toBe(0)
    expect(s.days[0].date.getTime()).toBeLessThan(s.days[6].date.getTime())
  })

  // An empty store is the first-run state, not an error.
  it('handles no records without dividing by zero', () => {
    const s = aggregate([], NOW)
    expect(s).toMatchObject({ total: 0, words: 0, wordsPerMinute: null, today: 0, thisWeek: 0, since: 0 })
    expect(s.apps).toEqual([])
    expect(s.days).toHaveLength(14)
  })
})

describe('compactNumber', () => {
  it('leaves small numbers alone', () => {
    expect(compactNumber(0)).toBe('0')
    expect(compactNumber(999)).toBe('999')
  })

  it('abbreviates thousands and millions', () => {
    expect(compactNumber(1200)).toBe('1.2k')
    expect(compactNumber(12_000)).toBe('12k')
    expect(compactNumber(1_000)).toBe('1k')
    expect(compactNumber(2_400_000)).toBe('2.4m')
  })
})


describe('minutesSavedThisMonth', () => {
  // 400 words at 40wpm is 10 minutes to type. Said in 2 minutes → 8 saved.
  it('is typing time minus speaking time', () => {
    const s = aggregate([rec({ w: 400, ms: 120_000 })], NOW)
    expect(s.minutesSavedThisMonth).toBe(400 / TYPING_WPM - 2)
    expect(s.minutesSavedThisMonth).toBe(8)
  })

  it('counts only the current calendar month', () => {
    const lastMonth = new Date(2026, 6, 15, 12).getTime()
    const s = aggregate([rec({ w: 400, ms: 120_000 }), rec({ w: 4000, ms: 60_000, t: lastMonth })], NOW)
    expect(s.minutesSavedThisMonth).toBe(8)
  })

  // An untimed record would otherwise look instantaneous and inflate it.
  it('ignores records with no duration', () => {
    const s = aggregate([rec({ w: 400, ms: 120_000 }), rec({ w: 9999, ms: 0 })], NOW)
    expect(s.minutesSavedThisMonth).toBe(8)
  })

  // Speaking slower than typing is not a loss worth showing as one.
  it('never goes negative', () => {
    expect(aggregate([rec({ w: 5, ms: 600_000 })], NOW).minutesSavedThisMonth).toBe(0)
  })

  it('is null when nothing is timed', () => {
    expect(aggregate([rec({ ms: 0 })], NOW).minutesSavedThisMonth).toBeNull()
  })
})
