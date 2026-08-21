import { describe, it, expect } from 'vitest'
import {
  menuBarHeight,
  hasNotch,
  notchWidthPt,
  readNotchGeometry,
  clampWings,
  shapeMetrics,
  NOTCH_WIDTH_MIN_PT,
  NOTCH_WIDTH_MAX_PT,
  NOTCHED_MENUBAR_MIN_PT,
} from './notch-geometry'

// Real metrics, points, at each machine's default scaled mode.
// MBP_16 is measured from an actual M5 Pro; the others assume the same
// menu bar height, which is what every notched model has reported so far.
const MBP_16 = { widthPt: 1728, boundsY: 0, workAreaY: 33 }
const MBP_14 = { widthPt: 1512, boundsY: 0, workAreaY: 33 }
const MBA_13 = { widthPt: 1470, boundsY: 0, workAreaY: 33 }
// Pre-notch machines and external displays sit around 25pt.
const MBP_15_2019 = { widthPt: 1440, boundsY: 0, workAreaY: 25 }
const EXTERNAL_4K = { widthPt: 2560, boundsY: -1440, workAreaY: -1415 }

describe('menuBarHeight', () => {
  it('is the gap between the display top and the work area top', () => {
    expect(menuBarHeight(MBP_16)).toBe(33)
  })

  it('handles displays positioned above the primary, where y is negative', () => {
    expect(menuBarHeight(EXTERNAL_4K)).toBe(25)
  })

  it('never goes negative on malformed metrics', () => {
    expect(menuBarHeight({ widthPt: 1440, boundsY: 100, workAreaY: 0 })).toBe(0)
  })
})

describe('hasNotch', () => {
  it('detects the notched MacBooks', () => {
    expect(hasNotch(MBP_16)).toBe(true)
    expect(hasNotch(MBP_14)).toBe(true)
    expect(hasNotch(MBA_13)).toBe(true)
  })

  it('rejects pre-notch laptops and external displays', () => {
    expect(hasNotch(MBP_15_2019)).toBe(false)
    expect(hasNotch(EXTERNAL_4K)).toBe(false)
  })

  it('keeps real headroom on both sides of the threshold', () => {
    expect(hasNotch({ widthPt: 1728, boundsY: 0, workAreaY: 28 })).toBe(false)
    expect(hasNotch({ widthPt: 1728, boundsY: 0, workAreaY: 29 })).toBe(true)
    // The margins that matter: the measured 33pt notched bar and the
    // 25pt non-notched one must each sit clear of the boundary, so a
    // point or two of drift in either can't flip detection.
    expect(33 - NOTCHED_MENUBAR_MIN_PT).toBeGreaterThanOrEqual(4)
    expect(NOTCHED_MENUBAR_MIN_PT - 25).toBeGreaterThanOrEqual(4)
  })
})

describe('notchWidthPt', () => {
  it('lands near 183pt on this machine’s 33pt bar', () => {
    // Corrected against the hardware: at 191 the band was visibly wider
    // than the cutout, so the wings started outside the housing.
    expect(notchWidthPt(33)).toBe(183)
  })

  it('stays well inside the plausible band for a real notch', () => {
    const w = notchWidthPt(33)
    expect(w).toBeGreaterThan(NOTCH_WIDTH_MIN_PT)
    expect(w).toBeLessThan(NOTCH_WIDTH_MAX_PT)
  })

  it('scales with the measured height, since the housing sets both', () => {
    expect(notchWidthPt(40)).toBeGreaterThan(notchWidthPt(33))
  })

  it('clamps implausible results rather than trusting them', () => {
    expect(notchWidthPt(5)).toBe(NOTCH_WIDTH_MIN_PT)
    expect(notchWidthPt(9999)).toBe(NOTCH_WIDTH_MAX_PT)
  })

  it('falls back to the reference width on nonsense input', () => {
    expect(notchWidthPt(0)).toBe(220)
    expect(notchWidthPt(-100)).toBe(220)
    expect(notchWidthPt(NaN)).toBe(220)
  })
})

describe('readNotchGeometry', () => {
  it('reports the notch height from the menu bar', () => {
    const g = readNotchGeometry(MBP_16)
    expect(g.hasNotch).toBe(true)
    expect(g.height).toBe(33)
  })

  it('prefers an explicit override over the estimate', () => {
    const g = readNotchGeometry(MBP_16, 201)
    expect(g.width).toBe(201)
    expect(g.widthIsOverride).toBe(true)
  })

  it('ignores a zero or negative override', () => {
    expect(readNotchGeometry(MBP_16, 0).widthIsOverride).toBe(false)
    expect(readNotchGeometry(MBP_16, -5).widthIsOverride).toBe(false)
    expect(readNotchGeometry(MBP_16, null).widthIsOverride).toBe(false)
  })
})

describe('clampWings', () => {
  const base = {
    notchWidth: 220,
    displayWidth: 1728,
    leftReserve: 180,
    rightReserve: 20,
    clearance: 8,
  }

  it('passes through widths that already fit', () => {
    const out = clampWings({ ...base, leftWing: 104, rightWing: 118 })
    expect(out).toEqual({ leftWing: 104, rightWing: 118 })
  })

  it('shortens a left wing that would reach the app name', () => {
    // center 864 - half 110 - clearance 8 - reserve 180 = 566
    const out = clampWings({ ...base, leftWing: 5000, rightWing: 0 })
    expect(out.leftWing).toBe(566)
  })

  it('shortens a right wing that would run off the display', () => {
    const out = clampWings({ ...base, leftWing: 0, rightWing: 5000 })
    expect(out.rightWing).toBe(726)
  })

  it('is the safety property: no configured width can overlap the reserve', () => {
    // The handoff's guarantee — raising a state-table width may shorten
    // it to fit, but can never silently overlap the menu bar.
    for (const wing of [0, 40, 150, 400, 1200, 99999]) {
      const out = clampWings({ ...base, leftWing: wing, rightWing: wing })
      const shapeLeft = base.displayWidth / 2 - base.notchWidth / 2 - out.leftWing
      const shapeRight = base.displayWidth / 2 + base.notchWidth / 2 + out.rightWing
      expect(shapeLeft).toBeGreaterThanOrEqual(base.leftReserve)
      expect(shapeRight).toBeLessThanOrEqual(base.displayWidth - base.rightReserve)
    }
  })

  it('floors negative inputs at zero', () => {
    const out = clampWings({ ...base, leftWing: -50, rightWing: -1 })
    expect(out).toEqual({ leftWing: 0, rightWing: 0 })
  })

  it('collapses rather than going negative when the display cannot fit the reserves', () => {
    // 320pt wide: the 180pt left reserve alone overruns the space left of
    // the notch, so the left wing has to disappear entirely. The right
    // reserve is only 20pt, so a sliver survives there.
    const out = clampWings({
      ...base,
      displayWidth: 320,
      leftWing: 100,
      rightWing: 100,
    })
    expect(out.leftWing).toBe(0)
    expect(out.rightWing).toBe(22)
    expect(out.rightWing).toBeLessThan(100)
  })
})

describe('shapeMetrics', () => {
  it('sums the notch and both wings', () => {
    expect(shapeMetrics(220, 104, 118).width).toBe(442)
  })

  it('offsets so the centre band lands exactly over the notch', () => {
    const { offsetFromCenter } = shapeMetrics(220, 104, 118)
    // Left edge of the shape, measured from display centre.
    expect(offsetFromCenter).toBe(-214)
    // The notch band therefore starts at -110 and ends at +110.
    expect(offsetFromCenter + 104).toBe(-110)
  })

  it('keeps the notch centred whatever the wings do', () => {
    for (const [lw, rw] of [[0, 0], [40, 96], [150, 214], [600, 20]]) {
      const { offsetFromCenter } = shapeMetrics(220, lw, rw)
      expect(offsetFromCenter + lw).toBe(-110)
    }
  })
})
