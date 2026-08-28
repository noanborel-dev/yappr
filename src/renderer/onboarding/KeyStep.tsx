// Onboarding: bind the one key, and watch what it does.
//
// The old version described the three gestures in a sentence and left the
// user to imagine them. They are motion — a hold is a long press, a tap is
// short, a double-tap is two short ones — and a sentence is the worst
// possible medium for motion.
//
// So there is one clock. It drives the notch indicator AND the three cards
// underneath, which is the whole trick: the keycap in a card goes down at
// the same instant the notch opens, so the gesture and its consequence are
// visibly the same event. Reading is optional.
//
// The gesture table itself is not invented here — see HotkeySettings in
// src/shared/types.ts and the state machine in src/main/hotkeys.ts:
//   tap => toggle on, next tap stops · hold => record while held ·
//   double-tap => paste the last transcription.

import { useEffect, useState } from 'react'
import { useAdvanceOnEnter } from './nav'
import { Pill } from '../shared/ui/Pill'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'
import { formatHotkey, type NotchState } from '../indicator/notch-states'

type Gesture = 'hold' | 'tap' | 'double'

interface Frame {
  g: Gesture
  /** Is the key physically down on this frame? */
  down: boolean
  /** Presses begun so far in this gesture — lights the beat track. */
  beat: 0 | 1 | 2
  notch: NotchState
  ms: number
}

/**
 * One loop through all three gestures, in the order a user meets them.
 *
 * Durations are performance, not spec: the real hold-vs-tap threshold is
 * 180ms (hotkeys.ts), which is far too fast to read as two different
 * gestures on screen. A 1.5s hold against a 130ms tap is legible, and the
 * ratio is what teaches the difference.
 */
const SCRIPT: Frame[] = [
  { g: 'hold', down: true, beat: 1, notch: 'recording', ms: 1500 },
  { g: 'hold', down: false, beat: 1, notch: 'processing', ms: 620 },
  { g: 'hold', down: false, beat: 1, notch: 'done', ms: 900 },
  { g: 'hold', down: false, beat: 0, notch: 'idle', ms: 340 },

  { g: 'tap', down: true, beat: 1, notch: 'idle', ms: 130 },
  { g: 'tap', down: false, beat: 1, notch: 'recording', ms: 1250 },
  { g: 'tap', down: true, beat: 2, notch: 'recording', ms: 130 },
  { g: 'tap', down: false, beat: 2, notch: 'processing', ms: 620 },
  { g: 'tap', down: false, beat: 2, notch: 'done', ms: 900 },
  { g: 'tap', down: false, beat: 0, notch: 'idle', ms: 340 },

  { g: 'double', down: true, beat: 1, notch: 'idle', ms: 105 },
  { g: 'double', down: false, beat: 1, notch: 'idle', ms: 95 },
  { g: 'double', down: true, beat: 2, notch: 'idle', ms: 105 },
  { g: 'double', down: false, beat: 2, notch: 'pasting', ms: 1150 },
  { g: 'double', down: false, beat: 2, notch: 'done', ms: 700 },
  { g: 'double', down: false, beat: 0, notch: 'idle', ms: 440 },
]

const CARDS: Array<{ g: Gesture; title: string; line: string }> = [
  { g: 'hold', title: 'Hold', line: 'talk while it’s down' },
  { g: 'tap', title: 'Tap', line: 'hands-free, tap to stop' },
  { g: 'double', title: 'Double-tap', line: 'the last one, again' },
]

/** Stored key name → the word printed on the physical key. */
const KEY_NAME: Record<string, string> = {
  CTRL: 'Control',
  ALT: 'Option',
  SHIFT: 'Shift',
  META: 'Command',
  FN: 'Function',
}

/**
 * A DOM keydown → the name the main process matches on.
 *
 * These are node-global-key-listener names; see keyMatches() in
 * src/main/hotkeys.ts. Sides are collapsed on purpose — the user pressed
 * Control, not "left Control", and either one should fire.
 *
 * `fn` is here for completeness only: macOS handles it below the window
 * server, so it never arrives as a keydown in a renderer. That is exactly
 * why the recommendation next to the keycap is a button and not a hint.
 */
function keyFromEvent(e: KeyboardEvent): string | null {
  const code = e.code
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL'
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT'
  if (code === 'MetaLeft' || code === 'MetaRight') return 'META'
  if (code === 'Fn' || e.key === 'Fn') return 'FN'
  if (e.key.length === 1) return e.key.toUpperCase()
  if (/^F\d{1,2}$/.test(e.key)) return e.key.toUpperCase()
  return null
}

export function KeyStep({ onNext }: { onNext: () => void }) {
  const [hotkey, setHotkey] = useState('CTRL')
  const [listening, setListening] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  // Not while capturing. During rebind every keystroke belongs to the
  // capture, and Enter is a bindable key — advancing on it would both
  // skip the step and swallow the choice being made.
  useAdvanceOnEnter(!listening)

  useEffect(() => {
    let alive = true
    window.yappr
      .getSettings()
      .then((s) => {
        if (alive && s.hotkeys.pushToTalk) setHotkey(s.hotkeys.pushToTalk)
      })
      .catch(() => {
        // A failed read just leaves the default showing. Blocking the step
        // on it would strand the user behind a spinner over a preference.
      })
    return () => {
      alive = false
    }
  }, [])

  // The clock. One timeout chained on the index rather than a fixed
  // interval, so each frame keeps its own duration — the whole point is
  // that a hold lasts longer than a tap.
  useEffect(() => {
    const frame = SCRIPT[frameIndex]
    const t = window.setTimeout(
      () => setFrameIndex((n) => (n + 1) % SCRIPT.length),
      frame.ms,
    )
    return () => window.clearTimeout(t)
  }, [frameIndex])

  function commit(key: string) {
    setHotkey(key)
    setListening(false)
    // Written straight through so a rebind survives stepping back and
    // forth. Deliberately NOT followed by reloadHotkeys(): re-registering
    // the global listener while this window has focus makes the very next
    // keystroke start a dictation. OnboardingApp reloads once at finish.
    void window.yappr.setSettings({ hotkeys: { pushToTalk: key } })
  }

  useEffect(() => {
    if (!listening) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      if (e.key === 'Escape') {
        setListening(false)
        return
      }
      const next = keyFromEvent(e)
      if (next) commit(next)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [listening])

  const frame = SCRIPT[frameIndex]
  const glyph = formatHotkey(hotkey) ?? hotkey
  const isFn = hotkey.toUpperCase() === 'FN'
  const lit = frame.notch !== 'idle'

  return (
    <div className="max-w-[640px]">
      <div className="mb-7">
        <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
          Key
        </div>
        <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em]">
          One key does <em className="italic">everything</em>.
        </h1>
      </div>

      <div className="flex items-center gap-8 mb-8">
        <div className="flex flex-col items-center gap-2.5 shrink-0">
          <button
            onClick={() => setListening((v) => !v)}
            aria-label="Rebind the dictation key"
            className={[
              'flex flex-col items-center justify-center gap-1.5',
              'transition-transform duration-150 hover:-translate-y-[2px] active:translate-y-[4px]',
            ].join(' ')}
            style={{
              width: 124,
              height: 124,
              borderRadius: 20,
              background: 'linear-gradient(180deg,#FDFBF3 0%,#EFE9D8 62%,#E5DDC3 100%)',
              border: listening ? '1.5px solid #C8553D' : '1px solid #C5BDA0',
              boxShadow: listening
                ? '0 0 0 5px rgba(200,85,61,0.14), 0 7px 0 #B8AF90, 0 16px 30px rgba(21,22,26,0.16), inset 0 2px 0 rgba(255,255,255,0.85)'
                : '0 7px 0 #B8AF90, 0 16px 30px rgba(21,22,26,0.16), inset 0 2px 0 rgba(255,255,255,0.85)',
            }}
          >
            {listening ? (
              <span className="font-mono text-accent text-[12px] uppercase tracking-[0.14em]">
                press
                <br />
                any key
              </span>
            ) : (
              <>
                {/* Remounted on rebind so the spring plays — the point of
                    the animation is to confirm the click landed. */}
                <span
                  key={hotkey}
                  className="font-mono text-ink leading-none animate-springScale"
                  style={{ fontSize: glyph.length > 2 ? 26 : 46, fontWeight: 500 }}
                >
                  {glyph}
                </span>
                <span className="font-mono text-ink-45 uppercase text-[8.5px] tracking-[0.12em]">
                  {KEY_NAME[hotkey] ?? hotkey}
                </span>
              </>
            )}
          </button>
          <span className="font-mono uppercase text-[10px] tracking-[0.14em] text-ink-45">
            {listening ? 'esc to cancel' : 'click to rebind'}
          </span>
        </div>

        <div className="min-w-0">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-2.5">
            Recommended
          </div>
          {/* A button, not a hint: fn is handled below the window server
              on macOS, so it never arrives as a keydown and cannot be
              captured by clicking the keycap and pressing it. */}
          <Pill size="sm" variant={isFn ? 'ok' : 'secondary'} onClick={() => commit('FN')}>
            <MiniCap glyph="fn" width={30} height={24} />
            {isFn ? '✓ bound' : 'use fn'}
          </Pill>
          <div className="text-[11.5px] text-ink-45 mt-2.5 max-w-[26ch] leading-relaxed">
            Nothing else on the Mac uses it.
          </div>
        </div>
      </div>

      {/* The notch hangs from a menu bar and may never float mid-panel —
          hence MenuBar, and hence the near-black shell behind it, which is
          the housing colour so the shape merges instead of sitting on top. */}
      <div className="relative rounded-card overflow-hidden bg-[#0A0B0F] mb-3">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            opacity: lit ? 1 : 0,
            background:
              'radial-gradient(120px 70px at 50% 0%, rgba(90,143,232,0.28), transparent 70%)',
          }}
        />
        <MenuBar
          tone="dark"
          right={
            <span className="font-mono text-[10.5px] text-white/45 tabular-nums">9:41</span>
          }
        >
          <NotchMark state={frame.notch} notchWidth={62} height={30} hotkey={glyph} />
        </MenuBar>
        <div className="h-[62px]" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {CARDS.map((card, i) => {
          const active = frame.g === card.g
          return (
            <div
              key={card.g}
              className={[
                'rounded-card border px-4 py-4 flex flex-col items-center text-center animate-slideUp',
                'transition-[background,border-color,box-shadow,transform] duration-300',
                active
                  ? 'border-accent/40 bg-accent-soft shadow-lift -translate-y-[2px]'
                  : 'border-line bg-card',
              ].join(' ')}
              style={{ animationDelay: `${80 * i}ms`, animationFillMode: 'backwards' }}
            >
              <MiniCap glyph={glyph} pressed={active && frame.down} />
              <Beats
                gesture={card.g}
                active={active}
                down={frame.down}
                beat={active ? frame.beat : 0}
              />
              <div className="text-[12.5px] font-semibold mt-3">{card.title}</div>
              <div className="text-[11px] text-ink-45 mt-1 leading-snug">{card.line}</div>
            </div>
          )
        })}
      </div>

      <Pill variant="primary" onClick={onNext}>
        Continue
      </Pill>
    </div>
  )
}

/** The physical-key treatment, small. Same light as the big cap. */
function MiniCap({
  glyph,
  pressed = false,
  width = 40,
  height = 34,
}: {
  glyph: string
  pressed?: boolean
  width?: number
  height?: number
}) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center font-mono text-ink shrink-0"
      style={{
        width,
        height,
        fontSize: glyph.length > 2 ? 10 : 14,
        borderRadius: 8,
        background: 'linear-gradient(180deg,#FDFBF3 0%,#EDE6D2 100%)',
        border: '1px solid #C5BDA0',
        transform: pressed ? 'translateY(3px)' : 'translateY(0)',
        boxShadow: pressed
          ? '0 1px 0 #B8AF90, inset 0 1px 0 rgba(255,255,255,0.6)'
          : '0 4px 0 #B8AF90, 0 5px 10px rgba(21,22,26,0.10), inset 0 1px 0 rgba(255,255,255,0.85)',
        transition: 'transform 90ms ease-out, box-shadow 90ms ease-out',
      }}
    >
      {glyph}
    </span>
  )
}

/**
 * The rhythm of the gesture, drawn.
 *
 * Tap and double-tap are both two presses, so the count alone can't tell
 * them apart — the spacing does. Wide dots with a rail between read as
 * "then, later"; touching dots read as "quick, quick", which is the only
 * difference the user has to feel.
 */
function Beats({
  gesture,
  active,
  down,
  beat,
}: {
  gesture: Gesture
  active: boolean
  down: boolean
  beat: 0 | 1 | 2
}) {
  if (gesture === 'hold') {
    const filling = active && down
    return (
      <span className="block w-[52px] h-[4px] rounded-pill bg-ink/[0.10] overflow-hidden mt-3">
        <span
          className="block h-full rounded-pill bg-accent"
          style={{
            width: filling ? '100%' : '0%',
            // Matches the hold frame's own duration, so the bar finishes
            // exactly as the key comes up.
            transition: filling ? 'width 1500ms linear' : 'width 200ms ease-out',
          }}
        />
      </span>
    )
  }

  const spaced = gesture === 'tap'
  return (
    <span
      className="flex items-center mt-3 h-[4px]"
      style={{ gap: spaced ? 0 : 3 }}
    >
      <Dot on={beat >= 1} />
      {spaced && <span className="block w-[30px] h-[1px] bg-ink/[0.10]" />}
      <Dot on={beat >= 2} />
    </span>
  )
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={[
        'block w-[6px] h-[6px] rounded-pill transition-colors duration-150',
        on ? 'bg-accent' : 'bg-ink/[0.12]',
      ].join(' ')}
    />
  )
}
