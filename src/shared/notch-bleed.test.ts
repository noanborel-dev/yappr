import { describe, it, expect } from 'vitest'
import { blackSpan, wingGradient, NOTCH_BLACK_BLEED_PT } from './notch-geometry'

// 183pt is what notchWidthPt() returns on the machine this was reported
// from: a 33pt menu bar at NOTCH_ASPECT 5.55.
const BAND = 183

describe('blackSpan', () => {
  // The reported symptom: "you can still see the notch, the blue part is
  // touching it, even when you adjust the size."
  //
  // The old gradient put black at 32%-68% of the WHOLE shape. With no
  // wings the shape IS the band, so black covered 58.6pt-124.4pt of a
  // 0-183pt cutout and left ~59pt of charcoal on each side, hard against
  // the housing.
  it('covers the entire band when the wings are collapsed', () => {
    const { start, end } = blackSpan(0, BAND, 0)
    expect(start).toBe(0)
    expect(end).toBe(BAND)
  })

  it('extends past both band edges once there is wing to spend', () => {
    const { start, end } = blackSpan(120, BAND, 120)
    expect(start).toBe(120 - NOTCH_BLACK_BLEED_PT)
    expect(end).toBe(120 + BAND + NOTCH_BLACK_BLEED_PT)
  })

  it('never starts inside the band, at any wing width', () => {
    // The invariant the bug violated. Sweep the range the wings animate
    // across rather than trusting one sample.
    for (let wing = 0; wing <= 400; wing += 7) {
      const { start, end } = blackSpan(wing, BAND, wing)
      expect(start).toBeLessThanOrEqual(wing)
      expect(end).toBeGreaterThanOrEqual(wing + BAND)
    }
  })

  it('holds the invariant at every plausible override width', () => {
    // notchWidthOverride is user-editable, and the old percentage stops
    // failed identically at every value of it.
    for (const band of [140, 160, 183, 200, 240, 340]) {
      const { start, end } = blackSpan(60, band, 60)
      expect(start).toBeLessThanOrEqual(60)
      expect(end).toBeGreaterThanOrEqual(60 + band)
    }
  })

  it('clamps to the shape rather than running off it', () => {
    const { start, end, total } = blackSpan(2, BAND, 2)
    expect(start).toBe(0)
    expect(end).toBe(total)
  })

  it('survives a zero-width shape', () => {
    expect(blackSpan(0, 0, 0)).toEqual({ start: 0, end: 0, total: 0 })
  })
})

describe('wingGradient', () => {
  const colors = { charcoal: '#1B1E2A', abyss: '#0A0B0F' }

  it('emits absolute stops, never percentages', () => {
    // Percentages are the bug. If one reappears here, the notch seam is back.
    const css = wingGradient({ leftWing: 120, bandWidth: BAND, rightWing: 120, ...colors })
    expect(css).not.toMatch(/\d%/)
    expect(css).toContain('#000 106px')
    expect(css).toContain(`#000 ${120 + BAND + NOTCH_BLACK_BLEED_PT}px`)
  })

  it('keeps the brand colours at the outer edges', () => {
    const css = wingGradient({ leftWing: 200, bandWidth: BAND, rightWing: 200, ...colors })
    expect(css).toContain(`${colors.charcoal} 0px`)
    expect(css).toContain(colors.abyss)
  })

  it('degenerates to flat black rather than emitting broken CSS', () => {
    expect(wingGradient({ leftWing: 0, bandWidth: 0, rightWing: 0, ...colors })).toBe('#000')
  })
})
