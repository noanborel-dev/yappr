// Onboarding: the permission that decides WHERE the text goes.
//
// Accessibility is the whole difference between Yappr typing into the
// box you were already typing in and Yappr leaving the sentence on your
// clipboard for you to paste yourself. That difference is one frame of
// animation, so this step plays it instead of describing it: the same
// dictation loops into a mock composer, and what happens at the end of
// the loop is decided by the live permission state. Grant it and the
// sentence walks into the field; do not, and it stops at a ⌘V chip.
//
// macOS fires no event when that switch flips — the user leaves this
// window to flip it — so trust is polled, and the poll drives the whole
// screen: the stage, the strip, and which button is primary.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAdvanceOnEnter } from './nav'
import { Pill } from '../shared/ui/Pill'
import { Toggle } from '../shared/ui/Toggle'
import { BrandLogo } from '../shared/ui/BrandLogo'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'
import { formatHotkey, type NotchState } from '../indicator/notch-states'

// 'clicking' is new, and it is the beat the step was missing. The demo
// used to open with the composer already focused, which quietly assumed
// the thing it is trying to teach: that the text goes into whatever field
// YOU put your cursor in. Now a pointer crosses the mock, clicks the
// field, and the stage leans in on that click — so by the time the
// sentence arrives you have already been shown where "here" is.
type Phase = 'quiet' | 'clicking' | 'listening' | 'polishing' | 'landing' | 'settled'

// Long enough to read as a message someone would actually dictate, short
// enough that typing it out fits inside one loop.
const LANDED = 'Deploy is green — I will cut the release after standup.'

const CHAR_MS = 22
// The pointer travels, then lands. Everything after it is pushed back by
// the click, because the click is now the first thing that happens.
const CLICK_AT = 620
const LISTEN_AT = 1500
const POLISH_AT = 2700
const LAND_AT = 3400
const HOLD_MS = 2200
// How many times the granted version repeats before it settles on the
// filled field. Three is enough to stop guessing and start following;
// endless would compete with the permission decision on the same screen.
const RUNS = 3
// How long the stage stays leaned in on the field after the click. Long
// enough to register as "that one", short enough not to feel like a
// transition that got stuck.
const ZOOM_MS = 1100

export function AccessibilityStep({ onNext }: { onNext: () => void }) {
  const [trusted, setTrusted] = useState(false)
  // The user's real key, so move 2 shows the cap they will actually press
  // rather than a stand-in they have to translate.
  const [hotkey, setHotkey] = useState('⌃')
  const [phase, setPhase] = useState<Phase>('quiet')
  const [typed, setTyped] = useState(0)
  // Whether the stage is leaned in on the composer. Separate from `phase`
  // because it starts a frame after the click and ends on its own clock —
  // tying it to a phase would mean inventing a phase per camera move.
  const [zoomed, setZoomed] = useState(false)
  // Always live, granted or not. The permission can be given after
  // onboarding, and trapping someone behind a System Settings switch they
  // may not be able to reach — a managed Mac, a borrowed one — is worse
  // than letting them through without it.
  useAdvanceOnEnter(true)

  // Polling continues after the grant on purpose: the user is in System
  // Settings with the switch under their cursor, and a screen that still
  // says "on" after they toggle it back off is worse than one IPC/1.5s.
  useEffect(() => {
    let cancelled = false
    function tick() {
      window.yappr
        .isAccessibilityTrusted()
        .then((ok) => { if (!cancelled) setTrusted(ok) })
        .catch(() => { /* transient IPC failure — the next tick re-asks */ })
    }
    tick()
    const id = window.setInterval(tick, 1500)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  // Passes completed. A ref, not state: it must not re-render the screen,
  // and `play` reschedules itself from inside its own timeout chain.
  const runsRef = useRef(0)
  useEffect(() => {
    let alive = true
    window.yappr
      .getSettings()
      .then((s) => {
        if (alive) setHotkey(formatHotkey(s.hotkeys?.pushToTalk) ?? '⌃')
      })
      .catch(() => { /* the default glyph is already on screen */ })
    return () => { alive = false }
  }, [])

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  const at = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])

  const play = useCallback(() => {
    clear()
    setPhase('quiet')
    setTyped(0)
    setZoomed(false)

    at(() => setPhase('clicking'), CLICK_AT)
    at(() => setZoomed(true), CLICK_AT + 40)
    at(() => setZoomed(false), CLICK_AT + 40 + ZOOM_MS)
    at(() => setPhase('listening'), LISTEN_AT)
    at(() => setPhase('polishing'), POLISH_AT)
    at(() => setPhase('landing'), LAND_AT)

    if (trusted) {
      for (let i = 1; i <= LANDED.length; i++) {
        at(() => setTyped(i), LAND_AT + i * CHAR_MS)
      }
      const doneAt = LAND_AT + LANDED.length * CHAR_MS + 200
      at(() => setPhase('settled'), doneAt)
      // It used to stop dead after one pass, on the reasoning that
      // clearing a field the user had just watched fill would read as the
      // text being taken away. True — but one pass of a four-beat sequence
      // is not enough to work out what you watched, and the sequence is
      // the entire content of the screen.
      //
      // So it repeats, a bounded number of times, and then stops on the
      // filled field. Bounded rather than endless because this screen also
      // has a permission to grant, and a demo still cycling underneath a
      // decision competes with it.
      runsRef.current += 1
      if (runsRef.current < RUNS) at(play, doneAt + HOLD_MS)
      return
    }

    at(() => setPhase('settled'), LAND_AT + 700)
    at(play, LAND_AT + 700 + HOLD_MS)
  }, [clear, at, trusted])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('settled')
      setTyped(trusted ? LANDED.length : 0)
      return
    }
    // Reset the pass count when the permission flips. Granting it mid-way
    // changes what the last beat shows, and that is the version the user
    // has not seen yet — starting it already spent would play it once.
    runsRef.current = 0
    play()
    return clear
  }, [play, clear, trusted])

  const landed = phase === 'landing' || phase === 'settled'
  const notch: NotchState =
    phase === 'listening' ? 'recording'
      : phase === 'polishing' ? 'processing'
        : landed ? (trusted ? (phase === 'landing' ? 'pasting' : 'done') : 'clipboard')
          : 'idle'

  const openSettings = () => { void window.yappr.openAccessibilitySettings() }

  // The three moves, drawn, with the current one lit.
  //
  // The screen was a silent film: a pointer, a waveform, some text
  // appearing. Each is legible alone, and the SEQUENCE is the argument —
  // you clicked there, so it went there — which nothing on screen stated.
  //
  // Numbered because it genuinely is an order: the click has to come
  // first or there is nowhere for the text to go, and that is the fact
  // this whole step exists to teach. Each move carries its own picture —
  // a pointer, the user's real key, the field — so it can be followed
  // without reading, and the key on move 2 physically goes down while
  // Yappr is listening.
  const move = phase === 'quiet' ? -1
    : phase === 'clicking' ? 0
      : phase === 'listening' || phase === 'polishing' ? 1
        : 2

  const clicked = phase !== 'quiet'

  return (
    // Wider than the other steps on purpose. This one is carried entirely
    // by a picture — where the text goes — and at 640px the composer it
    // has to point at was 11px type inside a 392px window.
    <div className="max-w-[780px]">
      <style>{`
        /* The lean-in. transform-origin sits on the composer rather than
           the middle of the stage, so the field grows toward the viewer
           instead of the whole scene drifting. */
        .ax-stage-inner {
          transition: transform 520ms cubic-bezier(.22,1,.36,1);
          transform-origin: 50% 78%;
        }
        .ax-stage-inner.is-zoomed { transform: scale(1.16); }

        /* The nudge when the sentence lands. Two small knocks, not a
           wobble: this is the field being written into, not an error. */
        @keyframes ax-nudge {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-2.5px); }
          45%      { transform: translateX(2px); }
          70%      { transform: translateX(-1px); }
        }
        .ax-nudge { animation: ax-nudge 300ms ease-out; }

        /* The pointer crossing the window and pressing. */
        @keyframes ax-pointer {
          0%   { transform: translate(38px, 46px) scale(1); opacity: 0; }
          18%  { opacity: 1; }
          70%  { transform: translate(0, 0) scale(1); opacity: 1; }
          80%  { transform: translate(0, 0) scale(0.82); opacity: 1; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        .ax-pointer { animation: ax-pointer 620ms cubic-bezier(.3,0,.2,1) both; }

        /* The ring left behind by the press. */
        @keyframes ax-ripple {
          0%   { transform: scale(0.4); opacity: 0.55; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .ax-ripple { animation: ax-ripple 520ms ease-out both; }

        @media (prefers-reduced-motion: reduce) {
          .ax-stage-inner { transition: none; }
          .ax-stage-inner.is-zoomed { transform: none; }
          .ax-nudge, .ax-pointer, .ax-ripple { animation: none; }
        }
      `}</style>
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent">
          Accessibility
        </div>
        <StatusChip on={trusted} />
      </div>

      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-5">
        Lands where your <em className="italic">cursor is</em>.
      </h1>

      {/* The stage. Near-black under the menu bar because the indicator has
          to grow out of the bar rather than sit on it — the same call
          PromptShapingStage makes, and the reason the wallpaper here is a
          dark one instead of the slate-blue used elsewhere. */}
      <div className="rounded-hero overflow-hidden border border-line shadow-card mb-6 bg-[#0A0B0F]">
        <MenuBar>
          <NotchMark state={notch} notchWidth={92} />
        </MenuBar>

        <div className="px-10 pt-9 pb-10 overflow-hidden bg-[linear-gradient(180deg,#0A0B0F_0%,#161B25_48%,#1E2534_100%)]">
          <div
            className={`ax-stage-inner mx-auto w-[540px] rounded-[14px] overflow-hidden bg-card border border-black/20 shadow-[0_22px_48px_-18px_rgba(0,0,0,0.7)] ${zoomed ? 'is-zoomed' : ''}`}
          >
            <div className="flex items-center gap-2 h-[32px] px-3.5 bg-cream2 border-b border-line">
              <span className="flex items-center gap-[6px]" aria-hidden>
                <Dot color="#FF5F57" /><Dot color="#FEBC2E" /><Dot color="#28C840" />
              </span>
              <span className="ml-1 flex items-center gap-2">
                <BrandLogo brand="slack" size={14} />
                <span className="text-[12px] font-medium text-ink-60">#launch</span>
              </span>
            </div>

            <div className="relative px-5 pt-4 pb-5">
              <div className="flex items-center gap-2.5 mb-3.5 opacity-40">
                <span className="w-[19px] h-[19px] rounded-[5px] bg-ink/20 shrink-0" aria-hidden />
                <span className="text-[13px] text-ink-60">any word on the release?</span>
              </div>

              {/* Not granted: the sentence stops here, on the clipboard,
                  next to the keystroke the user has to press themselves. */}
              {landed && !trusted && (
                <div className="absolute right-3.5 bottom-[52px] z-10 animate-springScale">
                  <div className="flex items-center gap-2 rounded-pill bg-card border border-line shadow-lift pl-2.5 pr-1.5 py-1.5">
                    <ClipboardIcon />
                    <span className="text-[10.5px] text-ink-60 max-w-[168px] truncate">{LANDED}</span>
                    <span className="font-mono text-[9.5px] text-ink-60 rounded-[5px] border border-line bg-cream2 px-1.5 py-[3px]">
                      ⌘V
                    </span>
                  </div>
                </div>
              )}

              <div className="relative">
                <div
                  // Keyed on `typed > 0` so the nudge replays the moment
                  // the first character arrives, and only then.
                  key={typed > 0 ? 'filled' : 'empty'}
                  className={[
                    'flex items-center gap-2.5 rounded-[11px] bg-paper px-3.5 min-h-[52px]',
                    'transition-[box-shadow,border-color] duration-300',
                    // Unfocused until the pointer clicks it. The border is
                    // the difference between "a field" and "the field your
                    // cursor is in", which is the entire subject here.
                    clicked ? 'border-2 border-cobalt' : 'border border-line',
                    phase === 'listening' || phase === 'polishing'
                      ? 'shadow-[0_0_0_4px_rgba(90,143,232,0.22)]'
                      : 'shadow-none',
                    typed > 0 ? 'ax-nudge' : '',
                  ].join(' ')}
                >
                  <p className="flex-1 min-w-0 text-[14px] leading-[1.5] py-2.5 text-ink">
                    {typed > 0
                      ? LANDED.slice(0, typed)
                      : <span className="text-ink-45">Message #launch</span>}
                    {clicked && <span className="ps-cursor ml-[1px]" aria-hidden />}
                  </p>
                  {typed > 0 && (
                    <span
                      aria-hidden
                      className="shrink-0 w-[26px] h-[26px] rounded-full bg-cobalt text-white flex items-center justify-center text-[12px] animate-checkPop"
                    >
                      ↑
                    </span>
                  )}
                </div>

                {/* The pointer, and the ring it leaves. Rendered only for
                    the one beat it exists — a cursor parked on screen for
                    the rest of the loop reads as a stuck mouse. */}
                {phase === 'clicking' && (
                  <>
                    <span
                      aria-hidden
                      className="ax-ripple absolute left-[26px] top-1/2 -mt-[13px] w-[26px] h-[26px] rounded-full bg-cobalt/40 pointer-events-none"
                    />
                    <span
                      aria-hidden
                      className="ax-pointer absolute left-[30px] top-1/2 -mt-[4px] pointer-events-none"
                    >
                      <CursorIcon />
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* THE THREE MOVES. Replaces a strip that read "Yappr can type for
          you." with a toggle beside it — a status the chip at the top of
          the screen already reports, and a switch that only opened System
          Settings, which the step below it also does. Neither told anyone
          what to DO. */}
      <ol className="grid grid-cols-3 gap-2.5 mb-6">
        <Move n={1} on={move === 0} done={move > 0} label="Click where you want it">
          <span className="scale-[1.35] inline-block"><CursorIcon /></span>
        </Move>
        <Move n={2} on={move === 1} done={move > 1} label="Hold your key and talk">
          <KeyCap glyph={hotkey} pressed={move === 1} />
        </Move>
        <Move
          n={3}
          on={move === 2}
          done={false}
          label={trusted ? 'It types right there' : 'It reaches your clipboard'}
        >
          <FieldIcon filled={move === 2} />
        </Move>
      </ol>

      {!trusted && (
        <ol className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-1.5 mb-6">
          <Stop n="01" delay={0} label="System Settings" icon={<GearIcon />} />
          <Chevron />
          <Stop n="02" delay={70} label="Privacy &amp; Security" icon={<ShieldIcon />} />
          <Chevron />
          <Stop n="03" delay={140} label="Accessibility" icon={<AxIcon />} />
          <Chevron />
          {/* The switch is live: clicking the picture of it opens the pane
              that holds the real one, so the diagram is also the shortcut. */}
          <Stop
            n="04"
            delay={210}
            label="Yappr"
            icon={
              <Toggle
                on={false}
                onChange={openSettings}
                label="Open Accessibility in System Settings"
                title="System Settings"
              />
            }
          />
        </ol>
      )}

      {/* No Continue and no Later. Enter moves on from every screen in
          this flow and the keycap at the bottom says so, so a button
          repeating it was a second way to do one thing — and "Later" was
          a third, since Enter has never waited for this permission. What
          is left is the only action that is not navigation. */}
      {!trusted && (
        <div className="flex items-center gap-3">
          <Pill variant="primary" onClick={openSettings}>Open System Settings →</Pill>
        </div>
      )}
    </div>
  )
}

// ─── Parts ──────────────────────────────────────────────────────────

function StatusChip({ on }: { on: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1',
        'font-mono text-[9.5px] uppercase tracking-[0.16em]',
        on ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line bg-card text-ink-45',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={`w-[6px] h-[6px] rounded-full ${on ? 'bg-ok' : 'bg-danger'}`}
      />
      {on ? 'on' : 'off'}
    </span>
  )
}

/**
 * One of the three moves. Picture on top, number and words under it.
 *
 * `done` dims rather than ticks: the sequence loops, so a row of green
 * checks would be claiming the user had done something they only watched,
 * three times over.
 */
function Move({
  n,
  on,
  done,
  label,
  children,
}: {
  n: number
  on: boolean
  done: boolean
  label: string
  children: ReactNode
}) {
  return (
    <li
      className={[
        'rounded-card border px-3 py-3.5 flex flex-col items-center gap-2.5 text-center',
        'transition-[background,border-color,opacity,transform] duration-300',
        on
          ? 'border-cobalt/45 bg-cobalt/[0.07] -translate-y-[1px] shadow-lift'
          : done
            ? 'border-line bg-card opacity-55'
            : 'border-line bg-card opacity-80',
      ].join(' ')}
    >
      <span className="h-[34px] flex items-center justify-center">{children}</span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={`font-mono text-[10px] tabular-nums ${on ? 'text-cobalt' : 'text-ink-45'}`}
        >
          {n}
        </span>
        <span className={`text-[12px] leading-snug ${on ? 'text-ink font-medium' : 'text-ink-60'}`}>
          {label}
        </span>
      </span>
    </li>
  )
}

/** The user's real key, going down while Yappr is listening. */
function KeyCap({ glyph, pressed }: { glyph: string; pressed: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center font-mono text-ink"
      style={{
        minWidth: glyph.length > 2 ? 46 : 34,
        height: 30,
        padding: '0 8px',
        fontSize: glyph.length > 2 ? 11 : 15,
        borderRadius: 7,
        background: 'linear-gradient(180deg,#FDFBF3 0%,#EDE6D2 100%)',
        border: '1px solid #C5BDA0',
        transform: pressed ? 'translateY(3px)' : 'translateY(0)',
        boxShadow: pressed
          ? '0 1px 0 #B8AF90, inset 0 1px 0 rgba(255,255,255,0.6)'
          : '0 4px 0 #B8AF90, 0 5px 10px rgba(21,22,26,0.10), inset 0 1px 0 rgba(255,255,255,0.85)',
        transition: 'transform 110ms ease-out, box-shadow 110ms ease-out',
      }}
    >
      {glyph}
    </span>
  )
}

/** A text field, with a line of type in it once the words have landed. */
function FieldIcon({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center rounded-[6px] px-2 transition-colors duration-300 ${
        filled ? 'border-2 border-cobalt bg-paper' : 'border border-line bg-card'
      }`}
      style={{ width: 52, height: 28 }}
    >
      <span
        className={`block h-[3px] rounded-full transition-all duration-500 ${
          filled ? 'bg-cobalt w-[30px]' : 'bg-ink/15 w-[12px]'
        }`}
      />
    </span>
  )
}

/**
 * The macOS arrow pointer, drawn rather than emoji'd.
 *
 * White fill with a dark outline so it stays visible over both the cream
 * composer and the field's blue focus ring, which is the whole path it
 * travels.
 */
function CursorIcon() {
  return (
    <svg viewBox="0 0 16 20" className="w-[16px] h-[20px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
      <path
        d="M1 1 L1 15.2 L4.9 11.7 L7.4 17.6 L9.9 16.5 L7.5 10.8 L12.6 10.4 Z"
        fill="#FFFFFF"
        stroke="#15161A"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />
}

function Stop({
  n,
  label,
  icon,
  delay,
}: {
  n: string
  label: string
  icon: React.ReactNode
  delay: number
}) {
  return (
    <li
      className="flex flex-col items-center justify-between gap-2 text-center rounded-card bg-card border border-line px-2 py-3 animate-slideUp"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="font-mono text-[9px] tracking-[0.14em] text-accent">{n}</span>
      <span className="text-ink-60 flex items-center justify-center h-[21px]">{icon}</span>
      <span className="text-[10.5px] leading-tight text-ink-60">{label}</span>
    </li>
  )
}

function Chevron() {
  return (
    <li aria-hidden className="self-center text-ink-45 text-[11px] px-0.5">
      →
    </li>
  )
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden {...STROKE}>
      <circle cx="8" cy="8" r="2.3" />
      <path d="M8 1.7v1.7M8 12.6v1.7M14.3 8h-1.7M3.4 8H1.7M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2M12.4 12.4l-1.2-1.2M4.8 4.8L3.6 3.6" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden {...STROKE}>
      <path d="M8 1.9l4.5 1.7v4c0 3-2 5.1-4.5 6.4-2.5-1.3-4.5-3.4-4.5-6.4v-4L8 1.9z" />
      <path d="M6.2 7.9l1.3 1.3 2.4-2.5" />
    </svg>
  )
}

function AxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden {...STROKE}>
      <circle cx="8" cy="3" r="1.5" />
      <path d="M3.2 6.3h9.6M8 6.3v3.3M8 9.6l-2.3 3.6M8 9.6l2.3 3.6" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="text-ink-45 shrink-0" {...STROKE}>
      <rect x="3.6" y="3" width="8.8" height="10.6" rx="1.8" />
      <rect x="5.9" y="1.7" width="4.2" height="2.6" rx="1.1" />
    </svg>
  )
}
