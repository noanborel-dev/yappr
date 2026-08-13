import { describe, it, expect } from 'vitest'
import { readNotchGeometry, type DisplayMetrics } from './notch-geometry'

// Every display the indicator can land on, in one place.
//
// The indicator is the only part of the app whose correctness depends on
// hardware it will mostly never run on, so the machines it has to handle
// are enumerated rather than reasoned about case by case. The menu bar
// height is the ONLY signal available, since Electron exposes neither
// NSScreen.safeAreaInsets nor auxiliaryTopLeftArea.
//
// PROVENANCE: only the 16" at default scaling (33pt) is measured, from
// the machine this was built on. Every other figure is derived — notched
// models are assumed to share that bar height, non-notched ones the
// long-standing ~24-25pt, and the scaled modes are extrapolated from the
// fact that a fixed physical bar spans more points as points get smaller.
// So these lock in BEHAVIOUR, not hardware truth: they will catch a
// change that breaks the notched/non-notched split, and will not catch a
// model whose real bar height differs from the assumption. Replace an
// entry with a measured value whenever one turns up.

interface MacProfile {
  name: string
  metrics: DisplayMetrics
  notched: boolean
}

const MACS: MacProfile[] = [
  // Notched. The menu bar is drawn to the full height of the camera
  // housing, so the bar height IS the notch height.
  { name: 'MBP 16" — default scaled', metrics: { widthPt: 1728, boundsY: 0, workAreaY: 33 }, notched: true },
  { name: 'MBP 16" — More Space', metrics: { widthPt: 1920, boundsY: 0, workAreaY: 37 }, notched: true },
  { name: 'MBP 16" — Larger Text', metrics: { widthPt: 1508, boundsY: 0, workAreaY: 29 }, notched: true },
  { name: 'MBP 14" — default scaled', metrics: { widthPt: 1512, boundsY: 0, workAreaY: 33 }, notched: true },
  { name: 'MBA 13" M2/M3', metrics: { widthPt: 1470, boundsY: 0, workAreaY: 33 }, notched: true },
  { name: 'MBA 15" M2/M3', metrics: { widthPt: 1710, boundsY: 0, workAreaY: 33 }, notched: true },

  // Not notched. Pre-2021 laptops, desktops, and every external panel.
  { name: 'MBP 15" 2019', metrics: { widthPt: 1440, boundsY: 0, workAreaY: 25 }, notched: false },
  { name: 'MBA 2019', metrics: { widthPt: 1440, boundsY: 0, workAreaY: 25 }, notched: false },
  { name: 'iMac 24"', metrics: { widthPt: 2240, boundsY: 0, workAreaY: 25 }, notched: false },
  { name: 'Studio Display', metrics: { widthPt: 2560, boundsY: 0, workAreaY: 25 }, notched: false },
  { name: 'External 4K', metrics: { widthPt: 1920, boundsY: 0, workAreaY: 25 }, notched: false },
  { name: 'External 1080p', metrics: { widthPt: 1920, boundsY: 0, workAreaY: 24 }, notched: false },
  { name: 'Small external', metrics: { widthPt: 1280, boundsY: 0, workAreaY: 24 }, notched: false },
  // Secondary display placed ABOVE the primary, so its origin is negative.
  { name: 'External, stacked above', metrics: { widthPt: 2560, boundsY: -1440, workAreaY: -1415 }, notched: false },
]

describe('notch detection across every Mac the indicator can run on', () => {
  for (const { name, metrics, notched } of MACS) {
    it(`${notched ? 'detects' : 'rejects'} — ${name}`, () => {
      expect(readNotchGeometry(metrics).hasNotch).toBe(notched)
    })
  }

  it('separates the two populations with room to spare', () => {
    // The detection threshold has to sit in open space between the
    // clusters, not next to either — a point of drift in a macOS update
    // must not flip anything.
    const bars = (want: boolean) =>
      MACS.filter((m) => m.notched === want).map((m) => m.metrics.workAreaY - m.metrics.boundsY)
    expect(Math.min(...bars(true))).toBeGreaterThan(Math.max(...bars(false)) + 3)
  })
})

describe('notch width estimate stays plausible on every notched Mac', () => {
  for (const { name, metrics } of MACS.filter((m) => m.notched)) {
    it(`${name}`, () => {
      const { width, height } = readNotchGeometry(metrics)
      // The housing is a fixed physical object: its width is always a
      // few times its height, and it never approaches a third of the
      // display. Anything outside that is an estimate gone wrong.
      expect(width / height).toBeGreaterThan(4)
      expect(width / height).toBeLessThan(7)
      expect(width).toBeLessThan(metrics.widthPt / 3)
    })
  }

  it('tracks the scaling mode on one machine', () => {
    // Same hardware, three scaled modes. Smaller points mean a
    // physically-fixed notch spans more of them, so width must rise with
    // the reported bar height — a width pinned to the display's point
    // width would get this backwards.
    const [larger, dflt, more] = [1508, 1728, 1920].map((w, i) =>
      readNotchGeometry({ widthPt: w, boundsY: 0, workAreaY: [29, 33, 37][i] }),
    )
    expect(larger.width).toBeLessThan(dflt.width)
    expect(dflt.width).toBeLessThan(more.width)
  })
})

describe('non-notched displays', () => {
  it('never reports a notch, whatever the display width', () => {
    for (const { metrics } of MACS.filter((m) => !m.notched)) {
      expect(readNotchGeometry(metrics).hasNotch).toBe(false)
    }
  })

  it('still reports the menu bar height, which the shape hangs from', () => {
    const g = readNotchGeometry({ widthPt: 2560, boundsY: -1440, workAreaY: -1415 })
    expect(g.height).toBe(25)
  })
})
