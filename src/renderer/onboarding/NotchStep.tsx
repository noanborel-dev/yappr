// Onboarding: where the indicator sits, decided by looking at it.
//
// The step this replaced spent three paragraphs explaining that macOS
// won't report the notch width. The user never needed that fact — they
// need a shape on a menu bar and something to drag. So the whole
// step is one live mock: the slider writes settings on every frame, the
// mock repaints, and the real indicator up on the menu bar repaints with
// it (SETTINGS_SET fires onNotchGeometryChanged, see src/main/ipc.ts).
//
// Two branches, same control:
//   notched     → calibrate the centre band against the physical housing
//   not notched → choose whether anything is drawn at all, then size it
//
// The no-notch branch is a real question, not a preference dump: the
// indicator is the only signal that recording is live, so defaulting to
// "hidden" is only defensible because we ask here.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useAdvanceOnEnter } from './nav'
import type { NotchGeometry } from '../global'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'
import {
  clampPlaceholderWidth,
  PLACEHOLDER_MIN_PT,
  PLACEHOLDER_MAX_PT,
} from '../indicator/notch-states'
import { NOTCH_WIDTH_MIN_PT, NOTCH_WIDTH_MAX_PT } from '../../shared/notch-geometry'

type Mode = 'hidden' | 'placeholder'

/**
 * Points → mock pixels.
 *
 * Not the true display ratio: a 1728pt screen would put the band at 59px
 * next to a NotchMark whose label and waveform are fixed at spec size, so
 * a faithful miniature reads as a toy. 0.42 is the factor already shipping
 * in Settings → General, where it renders the same shape at a size the
 * wings look right against. The mock is a crop of the menu bar, not the
 * whole screen.
 */
const PT_TO_PX = 0.42

/** The desktop the indicator is always mocked against, app-wide. */
const WALLPAPER = '#0A0B0F'

export function NotchStep({ onNext }: { onNext: () => void }) {
  // Calibration is a preference with a working default, not a gate.
  useAdvanceOnEnter(true)
  const [geometry, setGeometry] = useState<NotchGeometry | null>(null)
  const [override, setOverride] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('hidden')
  const [placeholder, setPlaceholder] = useState<number | null>(null)

  // Hold the REAL indicator visible for as long as this step is open.
  //
  // The slider always wrote real settings, and the real shape always
  // moved — but only while it happened to be on screen, and it is fully
  // transparent at idle. So the only thing visibly responding was the
  // mock drawn in this window, and the user was calibrating a picture of
  // the notch against nothing.
  //
  // Now the thing being adjusted is the thing on the hardware. The mock
  // below is demoted to a diagram of what to look for.
  useEffect(() => {
    void window.yappr.setIndicatorPreview(true)
    return () => { void window.yappr.setIndicatorPreview(false) }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([window.yappr.getNotchGeometry(), window.yappr.getSettings()])
      .then(([g, s]) => {
        if (!alive) return
        setGeometry(g)
        setOverride(s.notchWidthOverride)
        setMode(s.noNotchIndicator)
        setPlaceholder(s.placeholderWidth)
      })
      .catch(() => {
        // Never strand the user on a spinner. The no-notch branch offers a
        // real choice and a way forward; a loading state offers neither and
        // would wedge onboarding on a probe failure.
        if (!alive) return
        setGeometry({ hasNotch: false, width: 0, height: 0, displayWidth: 0 })
      })
    return () => {
      alive = false
    }
  }, [])

  // Writing on every drag frame is deliberate: setSettings is an in-process
  // invoke and the live indicator repaints from the broadcast, which is what
  // makes the menu bar itself the preview rather than this mock alone.
  function commitNotchWidth(next: number) {
    setOverride(next)
    void window.yappr.setSettings({ notchWidthOverride: next })
  }

  function commitMode(next: Mode) {
    setMode(next)
    void window.yappr.setSettings({ noNotchIndicator: next })
  }

  function commitPlaceholder(next: number) {
    setPlaceholder(next)
    void window.yappr.setSettings({ placeholderWidth: next })
  }

  if (!geometry) {
    // Skeleton at the stage's height so the headline doesn't jump when the
    // probe lands.
    return (
      <div className="max-w-[640px]">
        <Head eyebrow="Display" title={<>Line up the <em className="italic">edges</em>.</>} />
        <div className="h-[132px] rounded-card border border-line bg-ink/[0.03]" />
      </div>
    )
  }

  if (geometry.hasNotch) {
    const width = clampNotchWidth(override ?? geometry.width)
    return (
      <div className="max-w-[640px]">
        <SliderStyles />
        {/* No lede, and no grey note under the diagram. This screen had
            two sentences of explanation ("Yappr is on your notch right
            now…", "For reference — the one to watch is at the top of your
            screen") for an interaction that is one slider changing one
            width. The band moves as you drag; that is the entire lesson,
            and a paragraph about it only gave the eye somewhere else to
            go. What is left is the shape, the slider, and an arrow. */}
        <Head eyebrow="Display" title={<>Look <em className="italic">up</em>.</>} />

        {/* The headline says look up; this points there. The thing being
            calibrated is on the hardware ABOVE this window, and every
            other visual on the screen is inside it — without an arrow out
            of the frame, "up" reads as "up the page" and the user
            calibrates the diagram instead of the notch. Which is exactly
            what happened before the live preview was added. */}
        <LookUpCue />

        {/* Full opacity now. It was dimmed to 60% to demote it below the
            live indicator on the hardware, but a half-faded diagram
            directly above the control that drives it reads as disabled. */}
        <div className="animate-slideUp" style={{ animationDelay: '60ms' }}>
          <Stage bandPx={Math.round(width * PT_TO_PX)} readout={`${width} pt`} />
        </div>

        <div className="mt-7 animate-slideUp" style={{ animationDelay: '140ms' }}>
          <AdjustCue />
          <WidthSlider
            value={width}
            min={NOTCH_WIDTH_MIN_PT}
            max={NOTCH_WIDTH_MAX_PT}
            label="Notch width in points"
            onChange={commitNotchWidth}
          />
        </div>

      </div>
    )
  }

  const showing = mode === 'placeholder'
  const barWidth = clampPlaceholderWidth(placeholder)

  return (
    <div className="max-w-[640px]">
      <SliderStyles />
      <Head eyebrow="Display" title={<>Anything at the <em className="italic">top</em>?</>} />

      <div className="grid grid-cols-2 gap-4 animate-slideUp" style={{ animationDelay: '60ms' }}>
        <OptionCard label="Nothing" selected={!showing} onSelect={() => commitMode('hidden')} />
        <OptionCard
          label="A small bar"
          selected={showing}
          onSelect={() => commitMode('placeholder')}
        >
          <NotchMark state="recording" notchWidth={Math.round(barWidth * 0.26)} scale={0.66} />
        </OptionCard>
      </div>

      {showing && (
        <div className="mt-5 animate-slideUp">
          <Stage bandPx={Math.round(barWidth * PT_TO_PX)} readout={`${barWidth} pt`} />
          <div className="mt-7">
            {/* Same cue on the machine with no cutout. The slider is just
                as quiet here, and this is the branch where the user has
                never seen the shape before. */}
            <AdjustCue />
            <WidthSlider
              value={barWidth}
              min={PLACEHOLDER_MIN_PT}
              max={PLACEHOLDER_MAX_PT}
              label="Bar width in points"
              onChange={commitPlaceholder}
            />
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Stage ──────────────────────────────────────────────────────────
//
// A crop of the menu bar with the shape hanging from it, plus a caliper
// spanning the centre band. The caliper is the lesson: it gives the number
// under the slider two edges, so "line up" is something you can see.

function Stage({ bandPx, readout }: { bandPx: number; readout: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-card border border-line shadow-card"
      style={{ background: WALLPAPER }}
    >
      <MenuBar right={<BarGlyphs />}>
        <NotchMark state="recording" notchWidth={bandPx} />
      </MenuBar>

      {/* pt-[46px] clears the 30px shape hanging off the bar. */}
      <div className="pt-[46px] pb-6">
        <div className="mx-auto" style={{ width: bandPx }}>
          <div className="relative h-[9px]">
            <span className="absolute left-0 top-0 w-px h-[9px] bg-white/50" />
            <span className="absolute right-0 top-0 w-px h-[9px] bg-white/50" />
            <span className="absolute left-0 right-0 top-1/2 h-px bg-white/35" />
          </div>
        </div>
        {/* Outside the caliper: at the low end of either range the band is
            narrower than the label, and a wrapped "60 pt" reads as a bug. */}
        <div className="mt-1.5 text-center whitespace-nowrap text-[11px] font-mono tabular-nums text-white/75">
          {readout}
        </div>
      </div>
    </div>
  )
}

// Real menu-bar furniture, so the mock reads as a screen rather than a
// grey strip. 9:41 for the same reason Apple uses it.
function BarGlyphs() {
  return (
    <div className="flex items-center gap-2.5 text-white/70">
      <svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden>
        <path
          d="M1 3.4a8 8 0 0 1 11 0M3.2 5.7a5 5 0 0 1 6.6 0"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <circle cx="6.5" cy="8.2" r="1" fill="currentColor" />
      </svg>
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden>
        <rect
          x=".6"
          y=".6"
          width="14"
          height="8.8"
          rx="2.4"
          stroke="currentColor"
          strokeWidth="1"
          opacity=".65"
        />
        <rect x="2.2" y="2.2" width="8" height="5.6" rx="1.4" fill="currentColor" />
        <path
          d="M16.4 3.6v2.8"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity=".65"
        />
      </svg>
      <span className="text-[10px] font-medium tracking-tight tabular-nums">9:41</span>
    </div>
  )
}

// ─── Controls ───────────────────────────────────────────────────────

/**
 * The arrow that says "off the top of this window".
 *
 * Points straight up, out of the frame, at the physical notch — which is
 * the only thing on this screen that is not on this screen. It rises
 * rather than bobbing down like the slider cue, so the two arrows on the
 * page read as opposite instructions rather than the same one twice.
 */
function LookUpCue() {
  return (
    <div className="flex items-center gap-2.5 mb-4" aria-hidden>
      <svg
        viewBox="0 0 18 22"
        className="w-[18px] h-[22px] text-accent animate-lookUp shrink-0"
        fill="none"
        stroke="currentColor"
      >
        <path d="M9 20 V 7" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M3.5 12 L 9 6 L 14.5 12"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-accent">
        it’s on your real notch, up there
      </span>
    </div>
  )
}

/**
 * The arrow that says "this one".
 *
 * The slider is the only thing to do on this screen and it still needed
 * pointing at, because a track and a thumb are quiet objects — they look
 * like a readout until something tells you they are a control. An arrow
 * has a direction, and the bob is what makes the eye go to it; a static
 * one becomes furniture within a second.
 *
 * The four words under it are the cue's own label, not the explanatory
 * copy this screen just lost. They say what to do, not how it works.
 */
function AdjustCue() {
  return (
    <div className="flex flex-col items-center gap-1 mb-2" aria-hidden>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-accent">
        adjust it to your liking
      </span>
      <svg
        viewBox="0 0 18 22"
        className="w-[18px] h-[22px] text-accent animate-notchArrow"
        fill="none"
        stroke="currentColor"
      >
        <path d="M9 2 V 15" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M3.5 10 L 9 16 L 14.5 10"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function WidthSlider({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: number
  min: number
  max: number
  label: string
  onChange: (next: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const nudge = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)))

  return (
    <div className="flex items-center gap-3">
      <Nudge dir="-" onClick={() => nudge(-1)} disabled={value <= min} />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ns-range flex-1"
        style={{ '--fill': `${pct}%` } as CSSProperties}
      />
      <Nudge dir="+" onClick={() => nudge(1)} disabled={value >= max} />
    </div>
  )
}

function Nudge({
  dir,
  onClick,
  disabled,
}: {
  dir: '-' | '+'
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === '-' ? 'Narrower' : 'Wider'}
      className="shrink-0 w-7 h-7 rounded-full border border-line bg-card text-ink-60 hover:text-ink hover:bg-paper disabled:opacity-30 disabled:hover:bg-card transition-colors flex items-center justify-center"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        {dir === '+' && (
          <path d="M5 1v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        )}
      </svg>
    </button>
  )
}

function OptionCard({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'text-left rounded-card overflow-hidden border transition-[border-color,box-shadow,transform] duration-150',
        selected
          ? 'border-accent shadow-card -translate-y-px'
          : 'border-line hover:border-line-soft hover:-translate-y-px',
      ].join(' ')}
    >
      <div style={{ background: WALLPAPER }}>
        <MenuBar>{children}</MenuBar>
        <div className="h-[38px]" />
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-card">
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span
          className={[
            'shrink-0 w-[17px] h-[17px] rounded-full border flex items-center justify-center',
            selected ? 'bg-accent border-accent animate-checkPop' : 'border-ink-08',
          ].join(' ')}
        >
          {selected && (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
              <path
                d="M1.6 4.6 3.6 6.6 7.4 2.6"
                stroke="#FBF9F1"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </div>
    </button>
  )
}

// ─── Furniture ──────────────────────────────────────────────────────

function Head({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: ReactNode
  lede?: string
}) {
  return (
    <div className="mb-6">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        {eyebrow}
      </div>
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em]">{title}</h1>
      {lede && (
        <p className="mt-3 text-[13.5px] text-ink-60 leading-relaxed max-w-[52ch]">{lede}</p>
      )}
    </div>
  )
}

/**
 * Range styling has to be a stylesheet: the track and thumb are shadow-DOM
 * pseudo-elements no utility class can reach. Colours are the palette's
 * literals — accent #C8553D, card #FBF9F1, ink #15161A.
 */
function SliderStyles() {
  return (
    <style>{`
      /* Sized up from a 4px track and an 18px thumb. This is the only
         control on the screen and it read as a readout — a hairline with
         a dot on it. At 8px and 30px it reads as a handle, which is the
         one thing the screen needs the eye to find. */
      .ns-range { -webkit-appearance: none; appearance: none; height: 34px; background: transparent; cursor: pointer; }
      .ns-range:focus { outline: none; }
      .ns-range::-webkit-slider-runnable-track {
        height: 8px; border-radius: 999px;
        background: linear-gradient(to right,
          #C8553D 0%, #C8553D var(--fill),
          rgba(21,22,26,.10) var(--fill), rgba(21,22,26,.10) 100%);
      }
      .ns-range::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 30px; height: 30px; border-radius: 999px;
        background: #FBF9F1; border: 2px solid #C8553D;
        box-shadow: 0 2px 6px rgba(21,22,26,.24);
        margin-top: -11px; /* centres a 30px thumb on an 8px track */
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .ns-range:hover::-webkit-slider-thumb { transform: scale(1.06); }
      .ns-range:active::-webkit-slider-thumb { transform: scale(1.14); }
      .ns-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 5px rgba(200,85,61,.22); }

      /* Nudges toward the slider and back. Rests for most of the cycle —
         a cue that never stops moving stops being a cue. */
      @keyframes ns-arrow {
        0%, 55%, 100% { transform: translateY(0); }
        75%           { transform: translateY(5px); }
      }
      .animate-notchArrow { animation: ns-arrow 1.7s ease-in-out infinite; }

      /* Rises, where the slider cue dips. Two arrows on one page have to
         mean two different things or neither means anything. */
      @keyframes ns-lookup {
        0%, 55%, 100% { transform: translateY(0); }
        75%           { transform: translateY(-5px); }
      }
      .animate-lookUp { animation: ns-lookup 1.7s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .animate-notchArrow, .animate-lookUp { animation: none; }
      }
    `}</style>
  )
}

/** Estimates land inside this band by construction; a stale override may not. */
function clampNotchWidth(width: number): number {
  return Math.round(Math.min(NOTCH_WIDTH_MAX_PT, Math.max(NOTCH_WIDTH_MIN_PT, width)))
}
