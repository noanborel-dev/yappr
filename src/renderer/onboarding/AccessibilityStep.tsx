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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdvanceOnEnter } from './nav'
import { Pill } from '../shared/ui/Pill'
import { Toggle } from '../shared/ui/Toggle'
import { BrandLogo } from '../shared/ui/BrandLogo'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'
import type { NotchState } from '../indicator/notch-states'

type Phase = 'quiet' | 'listening' | 'polishing' | 'landing' | 'settled'

// Long enough to read as a message someone would actually dictate, short
// enough that typing it out fits inside one loop.
const LANDED = 'Deploy is green — I will cut the release after standup.'

const CHAR_MS = 22
const LISTEN_AT = 320
const POLISH_AT = 1500
const LAND_AT = 2200
const HOLD_MS = 2200

export function AccessibilityStep({ onNext }: { onNext: () => void }) {
  const [trusted, setTrusted] = useState(false)
  const [phase, setPhase] = useState<Phase>('quiet')
  const [typed, setTyped] = useState(0)
  // Always live. The step already offers "Later" — the permission can be
  // granted after onboarding, and trapping someone behind a System
  // Settings toggle they may not be able to reach is worse than letting
  // them through.
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

    at(() => setPhase('listening'), LISTEN_AT)
    at(() => setPhase('polishing'), POLISH_AT)
    at(() => setPhase('landing'), LAND_AT)

    if (trusted) {
      for (let i = 1; i <= LANDED.length; i++) {
        at(() => setTyped(i), LAND_AT + i * CHAR_MS)
      }
      // Granted plays exactly once. Looping would empty a field the user
      // just watched fill, which reads as the text being taken away again.
      at(() => setPhase('settled'), LAND_AT + LANDED.length * CHAR_MS + 200)
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

  return (
    <div className="max-w-[640px]">
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

        <div className="px-8 pt-7 pb-7 bg-[linear-gradient(180deg,#0A0B0F_0%,#161B25_48%,#1E2534_100%)]">
          <div className="mx-auto w-[392px] rounded-[12px] overflow-hidden bg-card border border-black/20 shadow-[0_22px_48px_-18px_rgba(0,0,0,0.7)]">
            <div className="flex items-center gap-2 h-[26px] px-3 bg-cream2 border-b border-line">
              <span className="flex items-center gap-[5px]" aria-hidden>
                <Dot color="#FF5F57" /><Dot color="#FEBC2E" /><Dot color="#28C840" />
              </span>
              <span className="ml-1 flex items-center gap-1.5">
                <BrandLogo brand="slack" size={11} />
                <span className="text-[10px] font-medium text-ink-60">#launch</span>
              </span>
            </div>

            <div className="relative px-3.5 pt-3 pb-3.5">
              <div className="flex items-center gap-2 mb-2.5 opacity-40">
                <span className="w-[15px] h-[15px] rounded-[4px] bg-ink/20 shrink-0" aria-hidden />
                <span className="text-[10.5px] text-ink-60">any word on the release?</span>
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

              <div
                className={[
                  'flex items-center gap-2 rounded-[9px] border border-cobalt bg-paper px-2.5 min-h-[36px]',
                  'transition-shadow duration-300',
                  phase === 'listening' || phase === 'polishing'
                    ? 'shadow-[0_0_0_3px_rgba(90,143,232,0.22)]'
                    : 'shadow-none',
                ].join(' ')}
              >
                <p className="flex-1 min-w-0 text-[11.5px] leading-[1.5] py-2 text-ink">
                  {typed > 0
                    ? LANDED.slice(0, typed)
                    : <span className="text-ink-45">Message #launch</span>}
                  <span className="ps-cursor ml-[1px]" aria-hidden />
                </p>
                {typed > 0 && (
                  <span
                    aria-hidden
                    className="shrink-0 w-[20px] h-[20px] rounded-full bg-cobalt text-white flex items-center justify-center text-[10px] animate-checkPop"
                  >
                    ↑
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {trusted ? (
        <div className="flex items-center gap-3 rounded-card bg-card border border-line px-4 py-3 mb-6 animate-springScale">
          <span
            aria-hidden
            className="w-[18px] h-[18px] rounded-full bg-ok text-paper flex items-center justify-center text-[10px] shrink-0"
          >
            ✓
          </span>
          <span className="text-[12.5px] font-semibold flex-1">Yappr can type for you.</span>
          <Toggle on onChange={openSettings} label="Open Accessibility in System Settings" title="System Settings" />
        </div>
      ) : (
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

      <div className="flex items-center gap-3">
        {trusted ? (
          <Pill variant="primary" onClick={onNext}>Continue →</Pill>
        ) : (
          <>
            <Pill variant="primary" onClick={openSettings}>Open System Settings →</Pill>
            <Pill variant="ghost" onClick={onNext}>Later</Pill>
          </>
        )}
      </div>
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
