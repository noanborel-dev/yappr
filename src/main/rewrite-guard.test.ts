import { describe, it, expect } from 'vitest'
import {
  selectionLikelyStale,
  GUARD_MIN_TRANSCRIPT_CHARS,
  GUARD_LENGTH_RATIO,
} from './rewrite-guard'

describe('the incident this guard exists for', () => {
  // 2026-08-28. A 16-character selection was live when the key went down;
  // the user then spoke for 121.68 seconds. Two minutes of speech is
  // roughly 300 words, so ~1500 characters. It was treated as an
  // instruction to edit those sixteen characters and the words were lost.
  it('catches 121 seconds of speech aimed at a 16-character selection', () => {
    expect(selectionLikelyStale({ transcriptChars: 1500, selectionChars: 16 }))
      .toBe(true)
  })

  // The same shape, even at a third of the length: half a minute of talking
  // is still not a description of an edit to one short line.
  it('catches it well before it gets that far', () => {
    expect(selectionLikelyStale({ transcriptChars: 500, selectionChars: 16 }))
      .toBe(true)
  })
})

describe('real rewrites are left alone', () => {
  it('allows a short instruction on a short selection', () => {
    expect(selectionLikelyStale({ transcriptChars: 17, selectionChars: 16 }))
      .toBe(false)
  })

  // The case the absolute floor exists for: an instruction genuinely
  // longer than the line it edits, which is exactly what the feature is
  // for and would trip a ratio-only rule at 2.75x.
  it('allows an instruction longer than the line it edits', () => {
    expect(selectionLikelyStale({ transcriptChars: 55, selectionChars: 20 }))
      .toBe(false)
  })

  it('allows a long restructuring request on a real paragraph', () => {
    expect(selectionLikelyStale({ transcriptChars: 500, selectionChars: 800 }))
      .toBe(false)
  })

  // "Turn this into an email and explain more about my internship" against
  // a paragraph — wordy, but proportionate.
  it('allows a wordy instruction on a paragraph', () => {
    expect(selectionLikelyStale({ transcriptChars: 420, selectionChars: 600 }))
      .toBe(false)
  })
})

describe('thresholds', () => {
  it('does not fire below the absolute floor, however lopsided', () => {
    expect(selectionLikelyStale({
      transcriptChars: GUARD_MIN_TRANSCRIPT_CHARS - 1,
      selectionChars: 1,
    })).toBe(false)
  })

  it('fires at the floor once the ratio is exceeded', () => {
    const chars = GUARD_MIN_TRANSCRIPT_CHARS
    expect(selectionLikelyStale({
      transcriptChars: chars,
      selectionChars: Math.floor(chars / GUARD_LENGTH_RATIO) - 1,
    })).toBe(true)
  })

  // Exactly at the ratio is not over it. The boundary belongs on the side
  // that keeps the rewrite, because a rewrite doing nothing is a non-event
  // and a wrongly-guarded rewrite pastes over nothing.
  it('does not fire exactly at the ratio', () => {
    expect(selectionLikelyStale({
      transcriptChars: 800,
      selectionChars: 200,
    })).toBe(false)
  })

  it('treats a vanished selection as stale rather than dividing by zero', () => {
    expect(selectionLikelyStale({ transcriptChars: 500, selectionChars: 0 }))
      .toBe(true)
  })
})
