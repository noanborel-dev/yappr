import { describe, it, expect } from 'vitest'
import {
  bandGeometry,
  clampPlaceholderWidth,
  NO_NOTCH_BAND_WIDTH,
  NO_NOTCH_MIN_HEIGHT,
  NO_NOTCH_PLACEHOLDER_DEFAULT_PT,
  PLACEHOLDER_MIN_PT,
  PLACEHOLDER_MAX_PT,
  NOTCH_SAFETY,
} from './notch-states'
import { hasNotch, readNotchGeometry } from '../../shared/notch-geometry'

// A real notched Mac: 16" MacBook Pro, 33pt menu bar.
const NOTCHED = { hasNotch: true, width: 183, height: 33 }
// Any display without a cutout — MacBook Air, external monitor, Windows.
const BARE = { hasNotch: false, width: 220, height: 24 }

describe('notched displays ignore the placeholder settings entirely', () => {
  it('keeps the cutout band plus safety margin', () => {
    const band = bandGeometry(NOTCHED, { enabled: true, width: 250 })
    expect(band.width).toBe(183 + 2 * NOTCH_SAFETY)
    expect(band.height).toBe(33)
  })

  it('is unchanged whether a placeholder is configured or not', () => {
    expect(bandGeometry(NOTCHED, { enabled: false, width: null }))
      .toEqual(bandGeometry(NOTCHED, { enabled: true, width: 200 }))
    expect(bandGeometry(NOTCHED)).toEqual(bandGeometry(NOTCHED, null))
  })
})

describe('displays with no notch', () => {
  // Existing behaviour, preserved: a thin separator between the wings.
  it('falls back to the separator band when no placeholder is wanted', () => {
    expect(bandGeometry(BARE, { enabled: false, width: null }).width).toBe(NO_NOTCH_BAND_WIDTH)
  })

  it('keeps the old behaviour when called with no placeholder argument', () => {
    // Guards the call sites that predate this feature.
    expect(bandGeometry(BARE).width).toBe(NO_NOTCH_BAND_WIDTH)
  })

  it('widens to the placeholder when the user opted in', () => {
    expect(bandGeometry(BARE, { enabled: true, width: null }).width)
      .toBe(NO_NOTCH_PLACEHOLDER_DEFAULT_PT)
    expect(bandGeometry(BARE, { enabled: true, width: 180 }).width).toBe(180)
  })

  // A 24pt menu bar is tight for the label, so the row has a floor.
  it('applies the height floor either way', () => {
    expect(bandGeometry(BARE, { enabled: true, width: 180 }).height).toBe(NO_NOTCH_MIN_HEIGHT)
    expect(bandGeometry(BARE, { enabled: false, width: null }).height).toBe(NO_NOTCH_MIN_HEIGHT)
  })

  it('does not shrink a menu bar already taller than the floor', () => {
    expect(bandGeometry({ ...BARE, height: 40 }, { enabled: true, width: 120 }).height).toBe(40)
  })
})

describe('clampPlaceholderWidth', () => {
  it('keeps a value inside the slider range', () => {
    expect(clampPlaceholderWidth(150)).toBe(150)
  })

  it('clamps rather than trusting an out-of-range value', () => {
    expect(clampPlaceholderWidth(10)).toBe(PLACEHOLDER_MIN_PT)
    expect(clampPlaceholderWidth(9999)).toBe(PLACEHOLDER_MAX_PT)
  })

  // Null is the stored "never set one" value, not an error.
  it('falls back to the default for unset or nonsense input', () => {
    expect(clampPlaceholderWidth(null)).toBe(NO_NOTCH_PLACEHOLDER_DEFAULT_PT)
    expect(clampPlaceholderWidth(undefined)).toBe(NO_NOTCH_PLACEHOLDER_DEFAULT_PT)
    expect(clampPlaceholderWidth(0)).toBe(NO_NOTCH_PLACEHOLDER_DEFAULT_PT)
    expect(clampPlaceholderWidth(-40)).toBe(NO_NOTCH_PLACEHOLDER_DEFAULT_PT)
    expect(clampPlaceholderWidth(Number.NaN)).toBe(NO_NOTCH_PLACEHOLDER_DEFAULT_PT)
  })

  it('rounds to whole points', () => {
    expect(clampPlaceholderWidth(137.6)).toBe(138)
  })
})

describe('notch detection off macOS', () => {
  // The reason this flag exists. A Windows taskbar docked to the TOP of
  // the screen occupies the same gap the macOS menu bar does, and at
  // ~40px it clears the 29pt threshold — so without the platform gate
  // Yappr would draw a notch shape on a machine that has none.
  const WINDOWS_TASKBAR_ON_TOP = { widthPt: 1920, boundsY: 0, workAreaY: 40 }

  it('reports a notch for those metrics on macOS', () => {
    expect(hasNotch({ ...WINDOWS_TASKBAR_ON_TOP, isMac: true })).toBe(true)
  })

  it('never reports a notch off macOS', () => {
    expect(hasNotch({ ...WINDOWS_TASKBAR_ON_TOP, isMac: false })).toBe(false)
  })

  it('reports no notch for a normal bottom-docked Windows taskbar', () => {
    expect(hasNotch({ widthPt: 1920, boundsY: 0, workAreaY: 0, isMac: false })).toBe(false)
  })

  // Existing macOS callers omit the flag and must be unaffected.
  it('defaults to the macOS reading when the flag is omitted', () => {
    expect(hasNotch({ widthPt: 1728, boundsY: 0, workAreaY: 33 })).toBe(true)
    expect(hasNotch({ widthPt: 1440, boundsY: 0, workAreaY: 24 })).toBe(false)
  })

  it('carries through readNotchGeometry', () => {
    const win = readNotchGeometry({ ...WINDOWS_TASKBAR_ON_TOP, isMac: false })
    expect(win.hasNotch).toBe(false)
  })
})
