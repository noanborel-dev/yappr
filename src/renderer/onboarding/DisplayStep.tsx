// Onboarding: where the indicator lives on THIS machine.
//
// Yappr's indicator is built around the notch — it hides inside the
// camera housing, which is what makes it feel like part of the hardware
// rather than a floating widget. On a MacBook Air, an external monitor,
// or any Windows machine there is no housing, and the same shape is just
// a bar stuck to the top of the screen.
//
// So this step exists to ask, once, rather than pick for the user.
//
// It matters more than a cosmetic setting because the indicator is the
// only signal that recording is live. Defaulting to hidden without
// asking would mean people dictate blind and never learn why. Asking
// here is what makes "hidden by default" defensible.
//
// On a notched Mac there is nothing to decide, so the step says what it
// found and moves on.

import { useEffect, useState } from 'react'
import type { NotchGeometry } from '../global'
import {
  clampPlaceholderWidth,
  PLACEHOLDER_MIN_PT,
  PLACEHOLDER_MAX_PT,
} from '../indicator/notch-states'

type Mode = 'hidden' | 'placeholder'

export function DisplayStep({ onNext }: { onNext: () => void }) {
  const [geometry, setGeometry] = useState<NotchGeometry | null>(null)
  const [mode, setMode] = useState<Mode>('hidden')
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([window.yappr.getNotchGeometry(), window.yappr.getSettings()]).then(
      ([g, s]) => {
        if (!alive) return
        setGeometry(g)
        setMode(s.noNotchIndicator)
        setWidth(s.placeholderWidth)
      },
    )
    return () => { alive = false }
  }, [])

  function commitMode(next: Mode) {
    setMode(next)
    void window.yappr.setSettings({ noNotchIndicator: next })
  }

  function commitWidth(next: number | null) {
    setWidth(next)
    void window.yappr.setSettings({ placeholderWidth: next })
  }

  if (!geometry) {
    return (
      <div className="max-w-[640px]">
        <StepShell
          eyebrow="Display"
          title={<>Reading your <em className="italic">screen</em>…</>}
        />
      </div>
    )
  }

  // Notched Mac: nothing to choose. Say what was found and move on —
  // a question with one answer is just a speed bump.
  if (geometry.hasNotch) {
    return (
      <div className="max-w-[640px]">
        <StepShell
          eyebrow="Display"
          title={<>Found your <em className="italic">notch</em>.</>}
          lede="Yappr tucks the indicator into the camera housing, so it's there while you're talking and invisible when you're not."
        />
        <div className="bg-card border border-line rounded-card px-5 py-4 mb-6">
          <Detected label="This display" value={`${geometry.displayWidth}pt wide · ${geometry.height}pt menu bar`} />
          <Detected label="Notch" value={`about ${geometry.width}pt across`} last />
        </div>
        <p className="text-[11.5px] text-ink-45 mb-6 max-w-[52ch]">
          macOS doesn&rsquo;t tell apps how wide the notch is, so that figure is an
          estimate. If the indicator&rsquo;s edges don&rsquo;t meet the black, there&rsquo;s a
          slider in Settings → General.
        </p>
        <Continue onNext={onNext} />
      </div>
    )
  }

  const showing = mode === 'placeholder'
  const w = clampPlaceholderWidth(width)

  return (
    <div className="max-w-[640px]">
      <StepShell
        eyebrow="Display"
        title={<>No notch on <em className="italic">this one</em>.</>}
        lede="Nothing to hide behind here, so Yappr stays out of the way unless you'd rather see something while you dictate."
      />

      <div className="bg-card border border-line rounded-card overflow-hidden mb-5">
        <button
          onClick={() => commitMode('hidden')}
          className={[
            'w-full text-left px-5 py-4 border-b border-line-soft transition-colors',
            !showing ? 'bg-ink/[0.04]' : 'hover:bg-ink/[0.02]',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold">Nothing at all</div>
              <div className="text-[11px] text-ink-45 mt-0.5">
                Dictation works the same — you just won&rsquo;t see it happening.
              </div>
            </div>
            <Check on={!showing} />
          </div>
        </button>

        <button
          onClick={() => commitMode('placeholder')}
          className={[
            'w-full text-left px-5 py-4 transition-colors',
            showing ? 'bg-ink/[0.04]' : 'hover:bg-ink/[0.02]',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold">A small bar at the top</div>
              <div className="text-[11px] text-ink-45 mt-0.5">
                Hangs from the top edge. Smaller than the notch version.
              </div>
            </div>
            <Check on={showing} />
          </div>
        </button>
      </div>

      {showing && (
        <div className="bg-card border border-line rounded-card px-5 py-4 mb-5">
          <div className="text-[12px] font-semibold mb-1">How wide?</div>
          <div className="text-[11px] text-ink-45 mb-4">
            There&rsquo;s no cutout to match on this screen, so this is purely what
            looks right to you.
          </div>

          {/* Proportional preview. Not to scale with the real screen —
              a 1728pt display can't be shown at 1:1 in a 640px column —
              so it shows the shape's proportions, not its true size. */}
          <div className="rounded-[10px] overflow-hidden border border-line mb-4 bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)] pt-3 pb-10">
            <div
              className="mx-auto rounded-b-[8px] bg-ink/85"
              style={{ width: `${(w / PLACEHOLDER_MAX_PT) * 60}%`, height: 14 }}
            />
          </div>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min={PLACEHOLDER_MIN_PT}
              max={PLACEHOLDER_MAX_PT}
              step={1}
              value={w}
              onChange={(e) => commitWidth(Number(e.target.value))}
              aria-label="Placeholder width in points"
              className="flex-1 accent-ink h-1 cursor-pointer"
            />
            <span className="text-[12px] font-mono text-ink w-[58px] text-right tabular-nums">
              {w} pt
            </span>
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-ink-45 mb-6 max-w-[52ch]">
        You can change this later in Settings → General.
      </p>
      <Continue onNext={onNext} />
    </div>
  )
}

// Local copies of the step furniture so this file does not have to
// export internals back out of OnboardingApp.
function StepShell({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: React.ReactNode
  lede?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        {eyebrow}
      </div>
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-3">
        {title}
      </h1>
      {lede && <p className="text-[13.5px] text-ink-60 leading-relaxed max-w-[52ch]">{lede}</p>}
    </div>
  )
}

function Detected({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-baseline justify-between gap-4 py-1.5',
        last ? '' : 'border-b border-line-soft mb-1.5',
      ].join(' ')}
    >
      <span className="text-[11px] text-ink-45">{label}</span>
      <span className="text-[11.5px] font-mono tabular-nums">{value}</span>
    </div>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        'shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[10px]',
        on ? 'bg-ink border-ink text-paper' : 'border-ink-20 text-transparent',
      ].join(' ')}
    >
      ✓
    </span>
  )
}

function Continue({ onNext }: { onNext: () => void }) {
  return (
    <button
      onClick={onNext}
      className="px-5 py-2.5 rounded-pill bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity"
    >
      Continue
    </button>
  )
}
