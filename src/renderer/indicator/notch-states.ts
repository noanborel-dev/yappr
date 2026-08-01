// The notch indicator's state table and every value derived from it.
//
// Kept separate from the component and free of React so the geometry can
// be tested without a DOM. The component's job is to paint what resolve()
// returns; all the arithmetic lives here.
//
// Organizing rule from the design handoff: the shape is asymmetric with
// fixed meaning. The LEFT wing is always input (what Yappr is hearing),
// the RIGHT wing is always outcome (what Yappr did). The centre band is
// the notch itself and never moves.

import { clampWings, shapeMetrics } from '../../shared/notch-geometry'

export type NotchState =
  | 'idle'
  | 'peek'
  | 'recording'
  | 'processing'
  | 'done'
  | 'clipboard'
  | 'copied'
  | 'error'
  | 'expanded'
  | 'pasting'

/** The pipeline states the main process broadcasts over IPC. */
export type PipelineState =
  | 'idle'
  | 'recording'
  | 'stopping'
  | 'processing'
  | 'done'
  | 'clipboard'
  | 'error'
  | 'pasting'

export interface StateSpec {
  /** Left wing width in points, before clamping. */
  lw: number
  /** Right wing width in points, before clamping. */
  rw: number
  recordDot?: boolean
  waveform?: boolean
  mic?: boolean
  hotkeyHint?: boolean
  spinner?: boolean
  check?: boolean
  errorDot?: boolean
  /** The clickable most-recent-transcript target. */
  recent?: boolean
  /**
   * Show the double-tap gesture on the user's own hotkey.
   *
   * Used wherever text has landed on the clipboard but not in the app.
   * A button would be a second way to do something the hotkey already
   * does; showing the gesture teaches the mechanism instead, and it keeps
   * working once the notch is gone.
   */
  gesture?: boolean
  /**
   * The compact drawer shown while a double-tap paste is in flight. Same
   * downward movement as the full panel, but it carries only the text
   * going in — the point is to show WHAT is being pasted, not to offer
   * actions on it.
   */
  pastePanel?: boolean
  /**
   * The drawer shown when text reached the clipboard but not the app.
   *
   * This is the case that needs room: the old bottom-right popup got a
   * whole 360×240 panel to show the text and offer a way in, and
   * shrinking that to a chip in the menu bar lost the one moment where
   * the user genuinely has to act. So the notch drops a drawer and the
   * double-tap is drawn large enough to read as an instruction.
   */
  fallbackPanel?: boolean
  panel?: boolean
  label?: string
  labelColor?: string
  glow?: string
}

export const ACCENT = '#5A8FE8'
export const DANGER = '#E84A3A'

/**
 * Wing widths are absolute, not relative to the notch: each one is sized
 * to the content it holds — a 13.5px italic label, a 9-bar waveform — and
 * that content does not grow with the camera housing. Only the centre
 * band tracks the real notch width.
 *
 * Sized tight on purpose. Both wings open to the wider of the two, so
 * every point here costs two on screen; the shape should read as a small
 * extension of the housing, not as a bar across the menu bar.
 */
export const STATES: Record<NotchState, StateSpec> = {
  idle: { lw: 0, rw: 0 },
  peek: { lw: 82, rw: 140, mic: true, hotkeyHint: true, recent: true },
  recording: {
    lw: 62,
    rw: 64,
    recordDot: true,
    waveform: true,
    label: 'listening',
    glow: 'rgba(90,143,232,.5)',
  },
  processing: {
    lw: 34,
    rw: 82,
    mic: true,
    spinner: true,
    label: 'polishing…',
    glow: 'rgba(90,143,232,.35)',
  },
  // Landed in the app. This must NOT read "copied": that word means the
  // text is only on the clipboard, and pairing it with a successful
  // insert made the two outcomes indistinguishable — the user couldn't
  // tell whether anything had actually gone in.
  done: { lw: 28, rw: 68, mic: true, check: true, label: 'inserted', labelColor: ACCENT },
  // The text reached the clipboard but not the app. This state replaced
  // the old bottom-right popup; instead of that popup's Insert button it
  // shows the double-tap gesture, which is the same action the user's own
  // hotkey already performs.
  clipboard: {
    lw: 28,
    rw: 70,
    mic: true,
    check: true,
    label: 'copied',
    labelColor: ACCENT,
    gesture: true,
    fallbackPanel: true,
  },
  copied: {
    lw: 28,
    rw: 98,
    mic: true,
    check: true,
    label: 'copied',
    labelColor: ACCENT,
    gesture: true,
    glow: 'rgba(90,143,232,.35)',
  },
  error: {
    lw: 28,
    rw: 114,
    mic: true,
    errorDot: true,
    label: 'didn’t catch that',
    glow: 'rgba(232,74,58,.42)',
  },
  // Double-tap paste-last. The notch drops its drawer to show the text
  // going in, then collapses — so the gesture has a visible result rather
  // than a "pasted" label that flashes past before you can read it.
  pasting: {
    lw: 28,
    rw: 84,
    mic: true,
    check: true,
    label: 'inserting',
    labelColor: ACCENT,
    pastePanel: true,
    glow: 'rgba(90,143,232,.35)',
  },
  // Browsing the last dictation, not reporting an outcome — so no label
  // and no checkmark. The drawer below states where the text went; a row
  // label here would be a second, weaker answer to the same question.
  expanded: {
    lw: 98,
    rw: 152,
    mic: true,
    panel: true,
    glow: 'rgba(90,143,232,.3)',
  },
}

/** Font size of the italic serif state label. */
export const LABEL_SIZE = 13.5

/** Max width of the transcript preview in `peek`, before it ellipsizes. */
export const PREVIEW_MAX_WIDTH = 104

/**
 * The wing row is always exactly the notch's height — there is no
 * separate row height.
 *
 * The prototype used a fixed 36px row inside a 30px idle shape, so
 * opening the wings grew the shape downward as well as sideways. On real
 * hardware that reads as the notch getting taller, which it cannot do:
 * the housing is a fixed object. Only the sides move. The one exception
 * is the expanded panel, which is explicitly a drawer below the notch.
 */

/** Bottom-corner radius by shape mode. */
export const RADIUS = { idle: 15, wings: 19, panel: 24 } as const

/**
 * Gap between the notch and the wing's content, in points.
 *
 * This lands on each wing's INNER edge — the left wing is flex-end and
 * the right is flex-start, so both push content toward the notch and this
 * holds it off. That makes it the seam between the housing and the
 * content, where anything more than a hairline reads as the content
 * floating away from the machine rather than growing out of it.
 *
 * Collapses to 0 with the wing so the notch stays centred at idle.
 */
export const WING_PADDING = 3

/**
 * Breathing room at the wing's OUTER edge, so content doesn't run into
 * the shape's rounded corner. Only used when sizing a wing to its
 * measured content.
 */
export const WING_OUTER_PADDING = 12

/**
 * Used for the first frame of `expanded`, before the panel has been
 * measured. The real height replaces it on the next update — the handoff
 * is explicit that hand-summing the panel's children was wrong twice.
 */
export const PANEL_FALLBACK_HEIGHT = 76

/**
 * Total shape width the expanded panel needs to lay out properly.
 *
 * Its fixed furniture — the 112px session column, two hairlines, the
 * Copy/Paste pair, the gaps and padding — comes to ~288px on its own. The
 * remainder is the transcript's measure: give it too little and the text
 * wraps into a column tall enough to overflow the window, which reads as
 * the panel being cut off rather than as a width problem.
 */
export const PANEL_MIN_WIDTH = 508

/**
 * Total shape width for the paste drawer. Narrower than the full panel —
 * it holds one line of text and a caption, with none of the panel's
 * columns — but still wide enough that a normal dictation reads as a
 * sentence rather than wrapping into a block.
 */
export const PASTE_PANEL_MIN_WIDTH = 400

/**
 * Total shape width for the clipboard-fallback drawer. Wider than the
 * paste drawer because it carries the text AND a full-size double-tap
 * gesture beside it — this is the one state where the user has to do
 * something, so the instruction gets room to be read at a glance.
 */
export const FALLBACK_PANEL_MIN_WIDTH = 520

/**
 * Lines of transcript the panel shows before ellipsizing. The panel is a
 * preview, not a document viewer, and an unbounded transcript is exactly
 * how the shape grows past the window it lives in.
 */
export const TRANSCRIPT_MAX_LINES = 3

export const GROW_TRANSITION = '560ms cubic-bezier(.22,1.08,.3,1)'
export const SHRINK_TRANSITION = '440ms cubic-bezier(.36,0,.18,1)'

/**
 * Opening should feel eager, closing should not bounce. One curve drives
 * the shape, both wings and their padding — using different durations for
 * container and content makes the content visibly lag.
 */
export function transitionFor(prevWidth: number, nextWidth: number): string {
  return nextWidth >= prevWidth ? GROW_TRANSITION : SHRINK_TRANSITION
}

/**
 * Map a pipeline state to a notch state. `stopping` is the brief window
 * between the hotkey release and the recorder flushing; it keeps showing
 * the recording treatment rather than flickering through an extra state.
 *
 * PAINTING ONLY. See recorderActionFor for the recorder side — the two
 * must never be derived from each other.
 */
export function fromPipelineState(s: PipelineState): NotchState {
  return s === 'stopping' ? 'recording' : s
}

/**
 * What the recorder should do for a pipeline state.
 *
 * Deliberately separate from fromPipelineState. 'recording' and
 * 'stopping' paint identically but mean opposite things to the recorder,
 * so deciding this from the mapped notch state starts a second recorder
 * on stop — the audio never flushes and nothing ever pastes.
 */
/**
 * States whose UI paints the most recent dictation's text.
 *
 * These need the transcript fetched at the moment they're entered. It
 * used to be fetched only on the return to idle, which is fine for the
 * hover states — idle has already happened by then — but wrong for the
 * ones the pipeline pushes mid-run: the clipboard drawer and the paste
 * drawer both rendered the PREVIOUS dictation, so the text you were told
 * to insert was not the text you had just spoken.
 */
export function paintsTranscript(s: NotchState): boolean {
  return s === 'clipboard' || s === 'pasting' || s === 'expanded' || s === 'peek'
}

export function recorderActionFor(s: PipelineState): 'start' | 'stop' | null {
  if (s === 'recording') return 'start'
  if (s === 'stopping') return 'stop'
  return null
}

const KEY_SYMBOLS: Record<string, string> = {
  CTRL: '⌃',
  CONTROL: '⌃',
  ALT: '⌥',
  OPTION: '⌥',
  CMD: '⌘',
  COMMAND: '⌘',
  META: '⌘',
  SHIFT: '⇧',
  SPACE: '␣',
  TAB: '⇥',
  RETURN: '↩',
  ENTER: '↩',
  ESCAPE: '⎋',
  FN: 'fn',
}

/**
 * Render a push-to-talk key for display.
 *
 * Keys arrive as node-global-key-listener names — "CTRL", "LEFT CTRL",
 * "RIGHT ALT" — so the side prefix is dropped before lookup: the user
 * pressed Control either way, and "⌃" is what's printed on the keycap.
 * Anything unrecognised is shown as-is rather than hidden, so a binding
 * we have no symbol for still tells the user which key to press.
 */
export function formatHotkey(key: string | null | undefined): string | null {
  if (!key) return null
  const bare = key.trim().toUpperCase().replace(/^(LEFT|RIGHT)\s+/, '')
  if (!bare) return null
  return KEY_SYMBOLS[bare] ?? bare
}

export interface ResolveInput {
  state: NotchState
  /** Real notch width in points. */
  notchWidth: number
  /** Real notch height in points. The idle shape is exactly this tall. */
  notchHeight: number
  displayWidth: number
  leftReserve: number
  rightReserve: number
  clearance: number
  /** Measured panel height; falls back until the first measurement lands. */
  panelHeight: number
  /** Total shape width on the previous frame, for easing direction. */
  prevWidth: number
  /**
   * Natural width of each wing's content, measured from the DOM. When
   * present it wins over the table: a wing must fit what it holds, and a
   * hardcoded number is guaranteed to be wrong for someone's hotkey
   * symbol, locale, or transcript. The table is the first-paint fallback.
   */
  contentWidth?: { left: number; right: number } | null
}

export interface NotchVisual extends StateSpec {
  leftWing: number
  rightWing: number
  width: number
  height: number
  rowHeight: number
  offsetFromCenter: number
  radius: number
  transition: string
  /** 1 whenever either wing has width, else 0. */
  fillet: number
  glowColor: string
  glowOpacity: number
  leftPadding: number
  rightPadding: number
  labelColor: string
  /** True when the shape is visually indistinguishable from the bare notch. */
  isIdle: boolean
}

export function resolve(input: ResolveInput): NotchVisual {
  const spec = STATES[input.state] ?? STATES.idle

  // Each wing opens to its OWN content. Forcing both to the wider of the
  // two made every state as wide as its widest side — `done` carried a
  // 70pt left wing to hold a wordmark that needed 34 — and the empty half
  // read as padding rather than as structure. Sized independently, the
  // asymmetry becomes legible: the side that grew is the side with
  // something to say.
  //
  // Measured rather than tabulated. A wing narrower than its content
  // clips, and the clipped edge is the one against the notch, so it reads
  // as content disappearing into the housing.
  const pad = WING_PADDING + WING_OUTER_PADDING
  const has = (n: number | undefined) => (n ?? 0) > 0
  const measuredLeft = has(input.contentWidth?.left) ? input.contentWidth!.left + pad : 0
  const measuredRight = has(input.contentWidth?.right) ? input.contentWidth!.right + pad : 0

  // The table decides WHETHER a side has a wing; measurement decides only
  // how wide. Without this, a measurement left over from the previous
  // state for one frame would pop the idle shape open.
  let desiredLeft = spec.lw > 0 ? measuredLeft || spec.lw : 0
  let desiredRight = spec.rw > 0 ? measuredRight || spec.rw : 0

  // When the panel is open the ROW's content is the wrong thing to size
  // against — the row holds a wordmark and a checkmark, while the drawer
  // below it holds three columns. Sizing to the row left the transcript
  // column a sliver wide, so it wrapped into a tower tall enough to be
  // clipped by the indicator window, which looked like the panel's bottom
  // being cut off. The panel needs a total, so any shortfall is split
  // between the two wings rather than imposed on one.
  const drawerMinWidth = spec.panel
    ? PANEL_MIN_WIDTH
    : spec.fallbackPanel
      ? FALLBACK_PANEL_MIN_WIDTH
      : spec.pastePanel
        ? PASTE_PANEL_MIN_WIDTH
        : 0
  if (drawerMinWidth) {
    const needed = Math.max(0, drawerMinWidth - input.notchWidth)
    const deficit = needed - (desiredLeft + desiredRight)
    if (deficit > 0) {
      desiredLeft += Math.ceil(deficit / 2)
      desiredRight += Math.floor(deficit / 2)
    }
  }

  // Clamped per side, and each keeps its own result now: the left has to
  // clear the app name, the right only has to stay on the display, and
  // there is no reason for the tighter side to shorten the other.
  const { leftWing, rightWing } = clampWings({
    notchWidth: input.notchWidth,
    displayWidth: input.displayWidth,
    leftWing: desiredLeft,
    rightWing: desiredRight,
    leftReserve: input.leftReserve,
    rightReserve: input.rightReserve,
    clearance: input.clearance,
  })

  const { width, offsetFromCenter } = shapeMetrics(input.notchWidth, leftWing, rightWing)
  const hasWings = leftWing > 0 || rightWing > 0

  // Height never changes with the wings — only a drawer adds to it, and a
  // drawer hangs below the notch rather than the notch growing.
  // The drawer's own height is measured, never summed.
  const hasDrawer = Boolean(spec.panel || spec.pastePanel || spec.fallbackPanel)
  const height = hasDrawer
    ? input.notchHeight + (input.panelHeight || PANEL_FALLBACK_HEIGHT)
    : input.notchHeight

  return {
    ...spec,
    leftWing,
    rightWing,
    width,
    height,
    rowHeight: input.notchHeight,
    offsetFromCenter,
    radius: hasDrawer ? RADIUS.panel : hasWings ? RADIUS.wings : RADIUS.idle,
    transition: transitionFor(input.prevWidth, width),
    fillet: hasWings ? 1 : 0,
    glowColor: spec.glow ?? 'transparent',
    glowOpacity: spec.glow ? 1 : 0,
    leftPadding: leftWing > 0 ? WING_PADDING : 0,
    rightPadding: rightWing > 0 ? WING_PADDING : 0,
    labelColor: spec.labelColor ?? 'rgba(255,255,255,.95)',
    isIdle: !hasWings && !hasDrawer,
  }
}
