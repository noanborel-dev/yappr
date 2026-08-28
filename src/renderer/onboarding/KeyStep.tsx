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

import { useCallback, useEffect, useState } from 'react'
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

// The step runs in three beats: pick the key, watch what it does, then do
// it yourself. It used to be one screen carrying all three at once, which
// meant the demo was playing while the user was still deciding which key
// to bind, and nothing ever asked them to try it.
type Phase = 'choose' | 'learn' | 'practice'

/**
 * What the user is asked to perform, in the order they will meet them.
 *
 * Tap first, because it is the one that needs no commitment: press and
 * let go, and the thing is listening. Hold last, because it is the one
 * you keep — but it only makes sense once you have seen the alternative.
 */
const DRILLS: Array<{ g: Gesture; label: string; hint: string }> = [
  { g: 'tap', label: 'Tap once', hint: 'starts recording — tap again to stop' },
  { g: 'double', label: 'Tap twice', hint: 'pastes your last dictation again' },
  { g: 'hold', label: 'Hold, then let go', hint: 'records while it is down' },
]

// The real thresholds, not demo ones. What is being practised has to be
// what the key actually does, or the muscle memory is for a different app.
// See HOTKEY_TIMING in shared/constants.ts and the machine in hotkeys.ts.
const HOLD_MS = 150
const DOUBLE_MS = 500

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

/**
 * Watch the real keyboard and report tap / double-tap / hold.
 *
 * Same thresholds as the shipped machine, so the drill teaches the key
 * rather than an easier version of it.
 *
 * THE fn PROBLEM. fn is the key this step recommends, and macOS handles it
 * below the window server — it never arrives in a renderer as a keydown at
 * all (see keyFromEvent). A drill that only accepted the bound key would
 * therefore be impossible to complete for exactly the users who took the
 * recommendation. So when the bound key cannot be seen from here, any key
 * counts: the gesture is the lesson, and its shape is identical whichever
 * key carries it. Enter is excluded — it is how you leave the screen.
 */
function useGesturePractice(
  hotkey: string,
  active: boolean,
  onGesture: (g: Gesture) => void,
): boolean {
  // Live press state, surfaced so the drill can show the key going down.
  const [down, setDown] = useState(false)

  useEffect(() => {
    if (!active) return
    const detectable = hotkey.toUpperCase() !== 'FN'
    let downAt = 0
    let lastTapAt = 0
    let pendingTap = 0

    const matches = (e: KeyboardEvent) => {
      if (e.key === 'Enter') return false
      return detectable ? keyFromEvent(e) === hotkey : true
    }

    function onDown(e: KeyboardEvent) {
      // Auto-repeat fires keydown forever while a key is held; only the
      // first one begins a press.
      if (e.repeat || downAt !== 0 || !matches(e)) return
      downAt = Date.now()
      setDown(true)
    }

    function onUp(e: KeyboardEvent) {
      if (downAt === 0 || !matches(e)) return
      const held = Date.now() - downAt
      downAt = 0
      setDown(false)

      if (held >= HOLD_MS) {
        // A hold cancels any tap waiting to resolve: press-hold-release is
        // one gesture, not a tap followed by something.
        window.clearTimeout(pendingTap)
        pendingTap = 0
        lastTapAt = 0
        onGesture('hold')
        return
      }

      const now = Date.now()
      if (lastTapAt !== 0 && now - lastTapAt <= DOUBLE_MS) {
        window.clearTimeout(pendingTap)
        pendingTap = 0
        lastTapAt = 0
        onGesture('double')
        return
      }
      // A single tap cannot be called until the double-tap window has
      // passed without a second press — the same reason the real machine
      // waits before acting on one.
      lastTapAt = now
      pendingTap = window.setTimeout(() => {
        pendingTap = 0
        lastTapAt = 0
        onGesture('tap')
      }, DOUBLE_MS)
    }

    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.clearTimeout(pendingTap)
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [active, hotkey, onGesture])

  return down
}

export function KeyStep({ onNext }: { onNext: () => void }) {
  const [hotkey, setHotkey] = useState('CTRL')
  const [listening, setListening] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('choose')
  const [cleared, setCleared] = useState<Gesture[]>([])

  const drillIndex = cleared.length
  const drill = DRILLS[drillIndex]
  const practiceDone = drillIndex >= DRILLS.length

  const onGesture = useCallback((g: Gesture) => {
    setCleared((prev) => {
      // Strictly in order. Accepting them out of sequence would let one
      // lucky double-tap tick two boxes and skip the gesture the screen is
      // currently asking for.
      const wanted = DRILLS[prev.length]
      if (!wanted || wanted.g !== g) return prev
      return [...prev, g]
    })
  }, [])

  const pressed = useGesturePractice(hotkey, phase === 'practice' && !listening, onGesture)

  // Enter walks the phases, then leaves the step.
  //
  // Not while capturing a rebind — Enter is itself bindable, so advancing
  // on it would both skip the screen and swallow the choice being made.
  // And not out of `practice` until the drills are cleared: this is the
  // one screen whose whole point is that you do the thing.
  const advancePhase = useCallback(
    () => setPhase((p) => (p === 'choose' ? 'learn' : 'practice')),
    [],
  )
  const ready = !listening && (phase !== 'practice' || practiceDone)
  useAdvanceOnEnter(ready, phase === 'practice' ? undefined : advancePhase)

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
          {phase === 'choose' ? (
            <>Pick your <em className="italic">key</em>.</>
          ) : phase === 'learn' ? (
            <>One key does <em className="italic">everything</em>.</>
          ) : (
            <>Now <em className="italic">you</em>.</>
          )}
        </h1>
      </div>

      {/* The keycap and its recommendation lead on `choose`, where the
          decision is, and shrink out of the way afterwards — the demo
          below is the subject once the key is bound. */}
      <div className={phase === 'choose' ? 'flex items-center gap-8 mb-8' : 'hidden'}>
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
      <div
        className={[
          'relative rounded-card overflow-hidden bg-[#0A0B0F] mb-3',
          phase === 'choose' ? 'hidden' : '',
        ].join(' ')}
      >
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

      <div className={phase === 'learn' ? 'grid grid-cols-3 gap-3 mb-8' : 'hidden'}>
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

      {/* THE DRILL. The screen stops describing and starts asking.
          One at a time, in order — three rows lit at once is a checklist,
          and a checklist gets skimmed. A single live instruction with the
          key drawn next to it is an instruction you follow. */}
      {phase === 'practice' && (
        <div className="mb-8">
          <div className="flex flex-col gap-2">
            {DRILLS.map((d, i) => {
              const done = i < drillIndex
              const live = i === drillIndex
              return (
                <div
                  key={d.g}
                  className={[
                    'rounded-card border px-4 py-3.5 flex items-center gap-4',
                    'transition-[background,border-color,opacity,transform] duration-300',
                    done
                      ? 'border-ok/30 bg-ok/[0.07]'
                      : live
                        ? 'border-accent/45 bg-accent-soft shadow-lift -translate-y-[1px]'
                        : 'border-line bg-card opacity-45',
                  ].join(' ')}
                >
                  <MiniCap glyph={glyph} pressed={live && pressed} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">{d.label}</div>
                    <div className="text-[11.5px] text-ink-45 mt-0.5 leading-snug">
                      {d.hint}
                    </div>
                  </div>
                  <span
                    className={[
                      'font-mono text-[11px] uppercase tracking-[0.14em] shrink-0',
                      done ? 'text-ok' : live ? 'text-accent' : 'text-ink-45',
                    ].join(' ')}
                  >
                    {done ? '✓' : live ? 'try it' : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {/* fn cannot be seen from a renderer — macOS handles it below
              the window server — so the drill takes any key when that is
              what is bound. Saying so is better than letting someone
              wonder why their fn press did nothing. */}
          {!practiceDone && hotkey.toUpperCase() === 'FN' && (
            <p className="text-[11.5px] text-ink-45 mt-3 leading-relaxed m-0">
              macOS keeps <span className="font-mono">fn</span> to itself in here,
              so any key will do for the practice. It really is{' '}
              <span className="font-mono">fn</span> once you are out.
            </p>
          )}
        </div>
      )}

      {/* No buttons. Enter walks the three phases and then leaves, and the
          keycap at the bottom of the window has been saying so since
          screen one — on the step that is specifically about using keys,
          a mouse target would be the wrong lesson twice over.
          What remains is the one thing Enter cannot say: that the drill is
          still waiting on a gesture. */}
      {phase === 'practice' && !practiceDone && (
        <p className="text-[12.5px] text-ink-45 m-0">
          {drill?.label} to carry on.
        </p>
      )}
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
