import { describe, it, expect } from 'vitest'
import {
  STATES,
  resolve,
  transitionFor,
  fromPipelineState,
  recorderActionFor,
  formatHotkey,

  RADIUS,
  WING_PADDING,
  PANEL_FALLBACK_HEIGHT,
  PANEL_MIN_WIDTH,
  PASTE_PANEL_MIN_WIDTH,
  FALLBACK_PANEL_MIN_WIDTH,
  GROW_TRANSITION,
  SHRINK_TRANSITION,
  type NotchState,
  type PipelineState,
} from './notch-states'

const ALL: NotchState[] = [
  'idle',
  'peek',
  'recording',
  'processing',
  'done',
  'clipboard',
  'copied',
  'error',
  'expanded',
  'pasting',
]

/**
 * States that hang a drawer below the notch instead of only widening.
 * Derived from the table rather than listed, so adding a drawer state
 * can't silently break the height rules below.
 */
const DRAWERS: NotchState[] = ALL.filter(
  (s) => STATES[s].panel || STATES[s].pastePanel || STATES[s].fallbackPanel,
)

// A 16" MacBook Pro: 1728pt wide, 220pt notch, 33pt menu bar.
const base = {
  notchWidth: 220,
  notchHeight: 33,
  displayWidth: 1728,
  leftReserve: 180,
  rightReserve: 20,
  clearance: 8,
  panelHeight: 0,
  prevWidth: 220,
  contentWidth: null as { left: number; right: number } | null,
}

const at = (state: NotchState, over: Partial<typeof base> = {}) =>
  resolve({ ...base, ...over, state })

describe('STATES', () => {
  it('defines every state the indicator can be in', () => {
    expect(Object.keys(STATES).sort()).toEqual([...ALL].sort())
  })

  it('keeps the left wing for input and the right wing for outcome', () => {
    // Input signals never appear on the right, outcome never on the left.
    for (const state of ALL) {
      const s = STATES[state]
      if (s.spinner || s.check || s.errorDot || s.recent) expect(s.rw).toBeGreaterThan(0)
      if (s.recordDot || s.waveform) expect(s.lw).toBeGreaterThan(0)
    }
  })

  it('never says "copied" without showing the double-tap gesture', () => {
    // "copied" means the text is on the clipboard and NOT in the app, so
    // it always has to come with the way to get it in. Saying it after a
    // successful insert made the two outcomes look identical — you
    // couldn't tell whether anything had landed.
    for (const state of ALL) {
      const s = STATES[state]
      if (s.label?.includes('copied')) {
        expect(s.gesture, `${state} says "copied" but shows no gesture`).toBe(true)
      }
    }
  })

  it('does not offer the gesture once the text is already in the app', () => {
    // Nothing to insert — it's there.
    expect(STATES.done.gesture).toBeUndefined()
    expect(STATES.done.label).not.toContain('copied')
  })

  it('keeps the two outcomes distinguishable', () => {
    // The whole point: landed-in-app and only-on-clipboard must not read
    // the same at a glance.
    expect(STATES.done.label).not.toBe(STATES.clipboard.label)
  })

  it('puts the hotkey hint in the left wing so the right is free for the transcript', () => {
    expect(STATES.peek.hotkeyHint).toBe(true)
    expect(STATES.peek.recent).toBe(true)
  })
})

describe('resolve — geometry', () => {
  it('leaves the notch band exactly centred in every state', () => {
    for (const state of ALL) {
      const v = at(state)
      // Left edge of the centre band, measured from display centre.
      expect(v.offsetFromCenter + v.leftWing).toBe(-110)
    }
  })

  it('makes idle exactly the size of the bare notch', () => {
    const v = at('idle')
    expect(v.width).toBe(220)
    expect(v.height).toBe(33)
    expect(v.isIdle).toBe(true)
    expect(v.fillet).toBe(0)
    expect(v.radius).toBe(RADIUS.idle)
  })

  it('opens each wing to its own side of the table', () => {
    // Sides are independent: the wing that grows is the one with
    // something to show, which is what makes the asymmetry legible
    // rather than lopsided.
    const v = at('done')
    expect(v.leftWing).toBe(STATES.done.lw)
    expect(v.rightWing).toBe(STATES.done.rw)
  })

  it('leaves a side closed when its table entry is zero', () => {
    const v = at('idle')
    expect(v.leftWing).toBe(0)
    expect(v.rightWing).toBe(0)
  })

  it('sizes each wing to its own measured content', () => {
    // A wing narrower than its content clips it, and the clipped edge is
    // the one against the notch — so it reads as content vanishing into
    // the housing.
    const v = at('recording', { contentWidth: { left: 200, right: 40 } })
    expect(v.leftWing).toBeGreaterThanOrEqual(200)
  })

  it('does not let a wide side drag the other one open', () => {
    // This is the whole point of dropping symmetry: `done` should not
    // carry a 180pt left wing just because its right side is busy.
    const v = at('done', { contentWidth: { left: 30, right: 180 } })
    expect(v.rightWing).toBeGreaterThanOrEqual(180)
    expect(v.leftWing).toBeLessThan(80)
  })

  it('falls back to the table on each side before the first measurement', () => {
    const v = at('done', { contentWidth: null })
    expect(v.leftWing).toBe(STATES.done.lw)
    expect(v.rightWing).toBe(STATES.done.rw)
  })

  it('keeps idle collapsed even with a stale measurement', () => {
    // One frame of last state's content width must not pop idle open.
    const v = at('idle', { contentWidth: { left: 300, right: 300 } })
    expect(v.leftWing).toBe(0)
    expect(v.rightWing).toBe(0)
    expect(v.isIdle).toBe(true)
  })

  it('never grows taller than the notch, whatever the wings do', () => {
    // The notch is a fixed physical object — only its sides can move.
    // The drawer states are the deliberate exception: they hang BELOW
    // the notch rather than stretching it.
    for (const state of ALL.filter((s) => !DRAWERS.includes(s))) {
      expect(at(state).height).toBe(33)
      expect(at(state).rowHeight).toBe(33)
    }
  })

  it('tracks the real notch height rather than a fixed row', () => {
    for (const h of [30, 33, 38]) {
      expect(at('recording', { notchHeight: h }).height).toBe(h)
      expect(at('recording', { notchHeight: h }).rowHeight).toBe(h)
    }
  })

  it('adds the measured panel height when expanded — the one exception', () => {
    expect(at('expanded', { panelHeight: 120 }).height).toBe(33 + 120)
    expect(at('expanded').height).toBe(33 + PANEL_FALLBACK_HEIGHT)
    expect(at('expanded').radius).toBe(RADIUS.panel)
  })

  it('gives the wings state its own radius', () => {
    for (const state of ALL.filter((s) => s !== 'idle' && !DRAWERS.includes(s))) {
      expect(at(state).radius).toBe(RADIUS.wings)
    }
  })

  it('measures rather than sums — a taller panel simply makes a taller shape', () => {
    const a = at('expanded', { panelHeight: 113 })
    const b = at('expanded', { panelHeight: 160 })
    expect(b.height - a.height).toBe(47)
  })

  it('drops a drawer while pasting, so the double-tap has a visible result', () => {
    const v = at('pasting', { panelHeight: 60 })
    expect(v.height).toBe(33 + 60)
    expect(v.radius).toBe(RADIUS.panel)
    expect(v.isIdle).toBe(false)
  })

  it('drops a drawer when text lands on the clipboard instead of the app', () => {
    // The one state where the user has to act, so it gets the room the
    // old bottom-right popup had rather than a chip in the menu bar.
    const v = at('clipboard', { panelHeight: 70 })
    expect(v.height).toBe(33 + 70)
    expect(v.width).toBeGreaterThanOrEqual(FALLBACK_PANEL_MIN_WIDTH)
  })

  it('gives the fallback drawer more room than the paste drawer', () => {
    // It carries the text AND a full-size gesture beside it.
    expect(at('clipboard').width).toBeGreaterThan(at('pasting').width)
  })

  it('gives the paste drawer room to read as a sentence', () => {
    // Narrower than the full panel, but wide enough that a normal
    // dictation doesn't wrap into a block.
    const v = at('pasting')
    expect(v.width).toBeGreaterThanOrEqual(PASTE_PANEL_MIN_WIDTH)
    expect(v.width).toBeLessThan(PANEL_MIN_WIDTH)
  })

  it('opens wide enough for the panel to lay out, not just the row', () => {
    // The row in `expanded` holds a wordmark and a checkmark. Sizing to
    // that left the transcript column a sliver, so it wrapped into a
    // column taller than the window and got clipped — which read as the
    // panel's bottom being cut off rather than as a width problem.
    expect(at('expanded').width).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH)
  })

  it('sizes expanded off the panel even when the row content is tiny', () => {
    const tinyRow = { contentWidth: { left: 20, right: 24 } }
    expect(at('expanded', tinyRow).width).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH)
    // A non-panel state with the same tiny row stays tight.
    expect(at('done', tinyRow).width).toBeLessThan(PANEL_MIN_WIDTH)
  })

  it('keeps the expanded shape inside a sane height', () => {
    // Transcript is clamped to TRANSCRIPT_MAX_LINES, so the panel cannot
    // grow without bound and push the shape past its window.
    expect(at('expanded', { panelHeight: 81 }).height).toBeLessThan(160)
  })

  it('keeps the notch band centred even when the wings differ', () => {
    // The band must sit over the cutout whatever the wings do, so the
    // offset is measured from centre rather than from the left edge.
    const v = at('expanded', { displayWidth: 700 })
    expect(v.offsetFromCenter + v.leftWing).toBe(-110)
    const lopsided = at('done', { contentWidth: { left: 20, right: 240 } })
    expect(lopsided.offsetFromCenter + lopsided.leftWing).toBe(-110)
  })
})

describe('resolve — wing padding', () => {
  it('collapses padding with the wing so the notch stays centred at idle', () => {
    const v = at('idle')
    expect(v.leftPadding).toBe(0)
    expect(v.rightPadding).toBe(0)
  })

  it('pads a wing that has width', () => {
    const v = at('recording')
    expect(v.leftPadding).toBe(WING_PADDING)
    expect(v.rightPadding).toBe(WING_PADDING)
  })

  it('pads only the side that is open', () => {
    // peek and every non-idle state open both, so exercise the rule directly
    // through a state whose left wing is zero.
    const v = resolve({ ...base, state: 'idle' })
    expect(v.leftPadding).toBe(0)
  })
})

describe('resolve — glow and fillets', () => {
  it('raises the fillets whenever either wing has width', () => {
    for (const state of ALL.filter((s) => s !== 'idle')) {
      expect(at(state).fillet).toBe(1)
    }
  })

  it('glows only in the states that specify one', () => {
    expect(at('recording').glowOpacity).toBe(1)
    expect(at('processing').glowOpacity).toBe(1)
    expect(at('error').glowOpacity).toBe(1)
    expect(at('expanded').glowOpacity).toBe(1)
    expect(at('done').glowOpacity).toBe(0)
    expect(at('idle').glowOpacity).toBe(0)
    expect(at('peek').glowOpacity).toBe(0)
  })

  it('turns the glow red on error and cobalt elsewhere', () => {
    expect(at('error').glowColor).toContain('232,74,58')
    expect(at('recording').glowColor).toContain('90,143,232')
  })
})

describe('resolve — clamping', () => {
  it('shortens wings on a narrow display instead of overlapping the menu bar', () => {
    const v = at('expanded', { displayWidth: 700 })
    const shapeLeft = 350 - 110 - v.leftWing
    expect(shapeLeft).toBeGreaterThanOrEqual(180)
    expect(v.leftWing).toBeLessThan(STATES.expanded.lw)
  })

  it('keeps the centre band over the notch even after clamping', () => {
    const v = at('peek', { displayWidth: 700 })
    expect(v.offsetFromCenter + v.leftWing).toBe(-110)
  })
})

describe('transitionFor', () => {
  it('overshoots when growing', () => {
    expect(transitionFor(220, 442)).toBe(GROW_TRANSITION)
  })

  it('decelerates without bounce when shrinking', () => {
    expect(transitionFor(442, 220)).toBe(SHRINK_TRANSITION)
  })

  it('treats an unchanged width as growing, so idle→idle never bounces', () => {
    expect(transitionFor(220, 220)).toBe(GROW_TRANSITION)
  })

  it('is wired into resolve', () => {
    expect(at('recording', { prevWidth: 220 }).transition).toBe(GROW_TRANSITION)
    expect(at('idle', { prevWidth: 442 }).transition).toBe(SHRINK_TRANSITION)
  })
})

describe('formatHotkey', () => {
  it('renders the modifier the user actually bound', () => {
    expect(formatHotkey('CTRL')).toBe('⌃')
    expect(formatHotkey('ALT')).toBe('⌥')
    expect(formatHotkey('CMD')).toBe('⌘')
    expect(formatHotkey('SHIFT')).toBe('⇧')
  })

  it('drops the side prefix — the keycap reads the same either way', () => {
    expect(formatHotkey('LEFT CTRL')).toBe('⌃')
    expect(formatHotkey('RIGHT ALT')).toBe('⌥')
  })

  it('is case and whitespace insensitive', () => {
    expect(formatHotkey('  ctrl ')).toBe('⌃')
  })

  it('shows an unmapped key rather than hiding it', () => {
    // Better to print F13 than to leave the user with no hint at all.
    expect(formatHotkey('F13')).toBe('F13')
  })

  it('returns null when nothing is bound', () => {
    expect(formatHotkey(null)).toBeNull()
    expect(formatHotkey(undefined)).toBeNull()
    expect(formatHotkey('')).toBeNull()
    expect(formatHotkey('   ')).toBeNull()
  })
})

describe('recorderActionFor', () => {
  it('starts on recording and stops on stopping', () => {
    expect(recorderActionFor('recording')).toBe('start')
    expect(recorderActionFor('stopping')).toBe('stop')
  })

  it('does nothing for states that are not about capturing audio', () => {
    for (const s of ['idle', 'processing', 'done', 'clipboard', 'error'] as PipelineState[]) {
      expect(recorderActionFor(s)).toBeNull()
    }
  })

  it('never agrees with the paint mapping on stopping', () => {
    // The regression this guards: 'stopping' PAINTS as 'recording' but
    // must STOP the recorder. Deriving the recorder action from the
    // painted state restarted it instead, so nothing ever pasted.
    expect(fromPipelineState('stopping')).toBe('recording')
    expect(recorderActionFor('stopping')).toBe('stop')
    expect(recorderActionFor('stopping')).not.toBe(recorderActionFor('recording'))
  })
})

describe('fromPipelineState', () => {
  it('shows the recording treatment while the recorder flushes', () => {
    expect(fromPipelineState('stopping')).toBe('recording')
  })

  it('passes every other pipeline state through unchanged', () => {
    const rest: PipelineState[] = [
      'idle',
      'recording',
      'processing',
      'done',
      'clipboard',
      'error',
    ]
    for (const s of rest) expect(fromPipelineState(s)).toBe(s)
  })

  it('only ever produces states the table defines', () => {
    const all: PipelineState[] = [
      'idle',
      'recording',
      'stopping',
      'processing',
      'done',
      'clipboard',
      'error',
    ]
    for (const s of all) expect(STATES[fromPipelineState(s)]).toBeDefined()
  })
})
