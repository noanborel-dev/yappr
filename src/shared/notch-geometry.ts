// Notch geometry — pure math, no Electron imports, so it can be unit
// tested and reused from both the main process and the renderer.
//
// The design handoff says to read the notch from
// NSScreen.safeAreaInsets / auxiliaryTopLeftArea. Electron exposes
// neither (electron#31478 is still open), so we derive what we can from
// the Display metrics we DO get and make the rest overridable:
//
//   • Notch HEIGHT is read, not guessed: workArea.y - bounds.y. It can
//     run ~1pt under the true notch height, which is the safe direction
//     — a shape slightly shorter than the housing hides inside it, while
//     a taller one would show a lip below the hardware.
//   • Notch PRESENCE is reliable. See NOTCHED_MENUBAR_MIN_PT.
//   • Notch WIDTH is estimated. It's the one value we cannot read. See
//     notchWidthPt() for the calibration and its limits.
//
// A ~40-line Swift helper reading auxiliaryTopLeftArea/auxiliaryTopRightArea
// would make the width exact; until then the estimate is overridable via
// settings so a wrong guess is never load-bearing.

/** The subset of an Electron Display this module needs. Points, not pixels. */
export interface DisplayMetrics {
  /** Full display bounds width. */
  widthPt: number
  /** bounds.y — top of the display in the global coordinate space. */
  boundsY: number
  /** workArea.y — top of the usable area, i.e. immediately below the menu bar. */
  workAreaY: number
  /**
   * Whether this is macOS. Only Apple ships a notch, so everywhere else
   * the answer is no regardless of what the metrics say.
   *
   * This is not defensive tidiness. The height test below reads the gap
   * between the display top and the usable area, which on macOS is the
   * menu bar. On Windows that same gap is the TASKBAR — and a taskbar
   * docked to the top of the screen is ~40px, comfortably over the 29pt
   * threshold. Without this flag, moving the Windows taskbar to the top
   * makes Yappr draw a notch shape on hardware that has no notch.
   *
   * Defaults to true when omitted so existing macOS callers are
   * unaffected.
   */
  isMac?: boolean
}

export interface NotchGeometry {
  hasNotch: boolean
  /** Notch height in points. Equal to the menu bar height on notched Macs. */
  height: number
  /** Estimated notch width in points. */
  width: number
  /** True when `width` came from an explicit override rather than the estimate. */
  widthIsOverride: boolean
}

/**
 * Menu bar height in points. On a notched Mac this is also the notch
 * height, because macOS sizes the menu bar to clear the camera housing.
 */
export function menuBarHeight(m: DisplayMetrics): number {
  return Math.max(0, m.workAreaY - m.boundsY)
}

/**
 * Menu bars at or above this height mean a notch.
 *
 * Measured, not assumed: a 16" MacBook Pro (M5 Pro, 1728pt wide) reports
 * 33pt. Pre-notch laptops and external displays sit at 24-25pt. 29 splits
 * that gap with ~4pt of headroom on both sides.
 *
 * An earlier 32 was picked from a secondhand "notched Macs are 37-38pt"
 * figure and left only 1pt of margin against the real measurement — close
 * enough that a macOS update or an unusual scaling mode could have flipped
 * detection off entirely.
 */
export const NOTCHED_MENUBAR_MIN_PT = 29

export function hasNotch(m: DisplayMetrics): boolean {
  if (m.isMac === false) return false
  return menuBarHeight(m) >= NOTCHED_MENUBAR_MIN_PT
}

/**
 * Width-to-height ratio of the notch housing.
 *
 * Started at 220/38 ≈ 5.79 from a widely-cited measurement, which put the
 * band at 191pt on a 33pt bar. On the actual hardware that was visibly
 * wider than the cutout: the wings began outside the housing, leaving the
 * content floating away from it with a gap no amount of padding could
 * close. 5.35 pulled it to 177pt, which overshot slightly — the band read
 * a touch narrow. 5.55 puts it at 183pt on the same 33pt bar.
 *
 * Corrected against what's on screen, not measured — the difference
 * matters, so `notchWidthOverride` stays the authority. tools to measure
 * it exactly need the desktop visible behind a translucent menu bar; the
 * cutout is the one pure-black run in that row.
 */
export const NOTCH_ASPECT = 5.55

/** Used only when the height is unreadable. */
export const NOTCH_REFERENCE_WIDTH_PT = 220

/** Estimates outside this band are certainly wrong; clamp rather than trust. */
export const NOTCH_WIDTH_MIN_PT = 140
export const NOTCH_WIDTH_MAX_PT = 340

/**
 * Estimate the notch width from its measured height.
 *
 * Height is the one notch dimension we can actually read (it IS the menu
 * bar height), and it is physically coupled to the width — the same camera
 * housing produces both. So scaling the reference aspect by our measured
 * height beats scaling the reference width by display width, which assumed
 * that point size is identical across models.
 *
 * That earlier assumption was visibly wrong: this machine reports a 33pt
 * bar against the reference's 38, meaning its notch is ~13% smaller than
 * the reference in every dimension. Scaling by display width missed that
 * entirely and rendered a shape wider than the hardware.
 *
 * Still one calibration point, so still an estimate — hence the override.
 */
export function notchWidthPt(notchHeightPt: number): number {
  if (!(notchHeightPt > 0)) return NOTCH_REFERENCE_WIDTH_PT
  const scaled = Math.round(notchHeightPt * NOTCH_ASPECT)
  return Math.min(NOTCH_WIDTH_MAX_PT, Math.max(NOTCH_WIDTH_MIN_PT, scaled))
}

/**
 * Full geometry for a display. `widthOverride` short-circuits the
 * estimate — it's what a settings value or a future native probe feeds in.
 */
export function readNotchGeometry(
  m: DisplayMetrics,
  widthOverride?: number | null,
): NotchGeometry {
  const height = menuBarHeight(m)
  const override =
    typeof widthOverride === 'number' && widthOverride > 0 ? Math.round(widthOverride) : null
  return {
    hasNotch: hasNotch(m),
    height,
    width: override ?? notchWidthPt(height),
    widthIsOverride: override !== null,
  }
}

// ---------------------------------------------------------------------------
// Wing clamping
// ---------------------------------------------------------------------------

export interface WingClampInput {
  /** Notch width in points. */
  notchWidth: number
  /** Full display width in points. */
  displayWidth: number
  leftWing: number
  rightWing: number
  /**
   * Points reserved at the left edge for the  menu and the app name,
   * which must never be covered.
   */
  leftReserve: number
  /** Points reserved at the right edge before the shape may extend. */
  rightReserve: number
  /** Breathing room between the shape's edge and whatever it must clear. */
  clearance: number
}

/**
 * Clamp configured wing widths so the shape can never reach the app name
 * on the left or run off the display on the right.
 *
 * The handoff makes this the safety property that lets the state table be
 * edited freely: raising a wing width can shorten it to fit, but can never
 * silently overlap the menu bar.
 *
 * The real menu bar can't be measured from Electron the way the prototype
 * measured its mock one, so both sides use a caller-supplied reserve
 * instead of a measured item edge. The right reserve is deliberately small
 * — macOS already hides its own status items when space runs out, and the
 * wide states (peek, clipboard, expanded) need the room.
 */
export function clampWings(input: WingClampInput): { leftWing: number; rightWing: number } {
  const { notchWidth, displayWidth, leftReserve, rightReserve, clearance } = input
  const center = displayWidth / 2
  const half = notchWidth / 2

  const maxLeft = Math.max(0, center - half - clearance - leftReserve)
  const maxRight = Math.max(0, center - half - clearance - rightReserve)

  return {
    leftWing: Math.round(Math.min(Math.max(0, input.leftWing), maxLeft)),
    rightWing: Math.round(Math.min(Math.max(0, input.rightWing), maxRight)),
  }
}

/**
 * Total width of the shape and its left offset from display centre.
 * The centre `notchWidth` band must always land exactly over the notch,
 * so the offset is measured from centre rather than from the left wing.
 */
export function shapeMetrics(notchWidth: number, leftWing: number, rightWing: number): {
  width: number
  offsetFromCenter: number
} {
  return {
    width: notchWidth + leftWing + rightWing,
    offsetFromCenter: -(notchWidth / 2 + leftWing),
  }
}

// ---------------------------------------------------------------------------
// Black bleed — keeping colour off the housing
// ---------------------------------------------------------------------------

/**
 * How far true black extends past each edge of the notch band, in points.
 *
 * Sized against the width estimate's own error bar. notchWidthPt() is one
 * calibration point, and the aspect constant above has already been walked
 * 5.79 -> 5.35 -> 5.55, which at a 33pt bar spans 191 -> 177 -> 183pt. So
 * the estimate is good to roughly +-8pt, and 14 clears that with room.
 *
 * It is a floor, not a guess: black wider than the housing is invisible
 * (black on black), while black narrower than it is a bright seam along
 * the cutout. The asymmetry means erring wide is free.
 */
export const NOTCH_BLACK_BLEED_PT = 14

/**
 * The run of true black across the shape, in points from its left edge.
 *
 * The bug this exists to kill: the wing gradient used PERCENTAGE stops
 * (`#000 32%` to `#000 68%`) while the notch is a fixed absolute width in
 * the middle. The wings animate per state, so 32% slid around in real
 * pixels while the hardware did not. At narrow wings it landed inside the
 * cutout and charcoal showed against the housing.
 *
 * Resizing could never fix it either: notchWidthOverride scales bandWidth,
 * and the percentages scaled with it, so the un-blacked fraction of the
 * notch stayed constant at every override value.
 *
 * Anchoring to the band in points makes the black cover the notch plus
 * `bleed` on each side at every wing width and every override.
 */
export function blackSpan(
  leftWing: number,
  bandWidth: number,
  rightWing: number,
  bleed: number = NOTCH_BLACK_BLEED_PT,
): { start: number; end: number; total: number } {
  const total = Math.max(0, leftWing + bandWidth + rightWing)
  return {
    start: Math.max(0, leftWing - bleed),
    end: Math.min(total, leftWing + bandWidth + bleed),
    total,
  }
}

/**
 * The wing gradient as a CSS value, with absolute stops.
 *
 * Ramp proportions are carried over from the percentage version it
 * replaces (abyss sat 0.44 of the way out on the left, 0.56 on the right),
 * so the shape reads the same — only its anchoring changed.
 */
export function wingGradient(opts: {
  leftWing: number
  bandWidth: number
  rightWing: number
  charcoal: string
  abyss: string
  bleed?: number
}): string {
  const { start, end, total } = blackSpan(
    opts.leftWing, opts.bandWidth, opts.rightWing, opts.bleed,
  )
  if (total <= 0) return '#000'
  const leadIn = Math.round(start * 0.44)
  const leadOut = Math.round(end + (total - end) * 0.56)
  return `linear-gradient(90deg, ${opts.charcoal} 0px, ${opts.abyss} ${leadIn}px, `
    + `#000 ${Math.round(start)}px, #000 ${Math.round(end)}px, `
    + `${opts.abyss} ${leadOut}px, ${opts.charcoal} ${Math.round(total)}px)`
}
