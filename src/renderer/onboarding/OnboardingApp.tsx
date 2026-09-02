import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Settings } from '../../shared/types'
// From main: ModelReadiness on the last screen needs it. CategoryStrictness
// and Strictness came with it and are dropped — the strictness UI this
// shell used to hold inline now lives in PolishStep.
import type { LocalModelProgress } from '../global'
import { Pill } from '../shared/ui/Pill'
import { Wordmark } from '../shared/ui/Wordmark'
import { formatHotkey } from '../indicator/notch-states'
import { WelcomeStep } from './WelcomeStep'
import { MicStep } from './MicStep'
import { AccessibilityStep } from './AccessibilityStep'
import { KeyStep } from './KeyStep'
import { NotchStep } from './NotchStep'
import { PolishStep } from './PolishStep'
import { PracticeStep } from './PracticeStep'
import { OnboardingNavProvider, useAdvanceOnEnter, useOnboardingNav } from './nav'
import { EnterCue } from './EnterCue'

// The shell, and only the shell: drag strip, wordmark, counter, back
// button, progress hairline, and one `animate-stepIn` container keyed by
// step. Every screen is its own file.
//
// It used to hold the screens too, inline — a welcome paragraph, a
// permissions checklist, a keycap, a strictness table. They explained the
// app instead of showing it, so they were replaced by steps that
// demonstrate: a running indicator, a live mic meter, a real Slack mock
// with text landing in it.
//
// The shell also owned two pieces of state it no longer should. It polled
// mic + Accessibility on the old combined step, and it captured keydowns
// for the hotkey. MicStep, AccessibilityStep and KeyStep each poll and
// capture for themselves now; a second capturer here would race them for
// the same keystroke.
//
// Consequently each step persists its own answer through `setSettings` the
// moment it is given, so `finish()` has nothing left to write but the
// first-run flag.

// 'Context' is gone. It was a textarea headed "What are you working on?"
// asking the user to type a paragraph about themselves — a form, in a
// flow whose whole method is that you learn this by doing it. Practice,
// two screens later, already has them hold the key and talk, and context
// memory fills itself from real dictations anyway.
const STEPS = [
  'Welcome',
  'Mic',
  'Accessibility',
  'Key',
  'Notch',
  'Polish',
  'Practice',
  'Done',
] as const

export default function OnboardingApp() {
  const [step, setStep] = useState(0)
  // Whether Enter advances right now. Owned here, declared by the step —
  // see nav.tsx. Reset on every step change so a new screen starts closed
  // rather than inheriting the last one's answer.
  const [ready, setReady] = useState(false)

  const next = useCallback(
    () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
    [],
  )
  const back = () => setStep((s) => Math.max(s - 1, 0))

  // A step can take Enter over for its own internal beats — see
  // setOnEnter in nav.tsx. Held in a ref so registering one does not
  // re-run the listener effect on every render of the step.
  const onEnterRef = useRef<(() => void) | null>(null)
  const setOnEnter = useCallback((fn: (() => void) | null) => {
    onEnterRef.current = fn
  }, [])

  // NO RESET HERE, and this is load-bearing.
  //
  // There used to be a `useEffect(() => { setReady(false) }, [step])` on
  // this component. React runs CHILD effects before PARENT effects, so the
  // order on mount and on every step change was:
  //
  //   1. the step's useAdvanceOnEnter fires   → setReady(true)
  //   2. this reset fires                     → setReady(false)
  //
  // The shell won every time. `ready` was permanently false, Enter never
  // fired, and the cue never appeared — and since the Continue buttons had
  // just been removed in favour of Enter, the flow was a dead end from the
  // first screen.
  //
  // The reset was redundant as well as harmful: useAdvanceOnEnter already
  // clears on unmount, and `<main key={step}>` guarantees the outgoing step
  // unmounts. React destroys the old tree's effects before creating the new
  // one's, so the sequence is already false-then-true without help.

  // ONE Enter listener for the whole flow, not one per step. Nine
  // listeners would each still be mounted during the outgoing step's exit
  // animation, so a single press could advance twice and skip a screen.
  //
  // Ignored while focus is in a text field: the practice steps have real
  // inputs, and Enter inside one is the user typing, not navigating.
  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) {
        return
      }
      e.preventDefault()
      const own = onEnterRef.current
      if (own) own()
      else next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, next])

  const nav = useMemo(() => ({ next, setReady, setOnEnter }), [next, setOnEnter])

  async function finish() {
    const partial: Partial<Settings> = { firstRun: false }
    await window.yappr.setSettings(partial)
    // One reload, here, for whatever KeyStep bound. KeyStep deliberately
    // does not call this itself: re-registering the global hotkey while
    // this window still has focus turns the next keystroke into a real
    // dictation.
    window.yappr.reloadHotkeys()
    window.close()
  }

  return (
    <div className="h-screen bg-paper text-ink font-sans flex flex-col overflow-hidden select-none">
      {/* OS drag strip. Without it a hiddenInset window can't be moved
          while focused — the renderer eats the click first. */}
      <div
        className="absolute top-0 left-0 right-0 h-8 z-50"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />

      <header className="pl-[88px] pr-7 pt-5 pb-2 flex items-center justify-between shrink-0">
        <div className="inline-flex items-center gap-3">
          <Wordmark size="inline" />
          <span className="font-mono text-[10px] text-ink-45 tabular-nums tracking-[0.14em]">
            {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
          </span>
        </div>
        {step > 0 && step < STEPS.length - 1 && (
          <button
            onClick={back}
            className="text-[11.5px] text-ink-45 hover:text-ink transition-colors"
          >
            ← back
          </button>
        )}
      </header>

      {/* Progress hairline — the whole chrome the old flow spent a header
          row on, in 2px. */}
      <div className="h-[2px] bg-line-soft mx-7 shrink-0 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <OnboardingNavProvider value={nav}>
        {/* pb-24 leaves the keycap a lane of its own. Without it the last
            control on a tall step sits under the cue, and the thing
            telling you how to move on covers the thing you are doing. */}
        <main key={step} className="flex-1 min-h-0 overflow-auto px-14 pt-8 pb-24 animate-stepIn">
          {step === 0 && <WelcomeStep onNext={next} />}
          {step === 1 && <MicStep onNext={next} />}
          {step === 2 && <AccessibilityStep onNext={next} />}
          {step === 3 && <KeyStep onNext={next} />}
          {step === 4 && <NotchStep onNext={next} />}
          {step === 5 && <PolishStep onNext={next} />}
          {step === 6 && <PracticeStep onNext={next} />}
          {step === 7 && <Done onFinish={finish} />}
        </main>
        <EnterCue visible={ready} />
      </OnboardingNavProvider>
    </div>
  )
}

// ─── Done ───────────────────────────────────────────────────────────

function Done({ onFinish }: { onFinish: () => void }) {
  // Read the key back rather than threading it down from KeyStep: KeyStep
  // writes it on every rebind, so settings is the one copy that cannot be
  // stale.
  const [glyph, setGlyph] = useState('⌃')

  // The last screen keeps the promise the other eight made: Enter moves
  // you on. Here "on" means out — `next()` clamps at the final step, so
  // without this the cue would be showing a key that does nothing.
  useAdvanceOnEnter(true)
  const { setReady } = useOnboardingNav()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      // Close the gate first: finish() closes the window, and a second
      // Enter arriving during the IPC round-trip would run it twice.
      setReady(false)
      onFinish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFinish, setReady])

  useEffect(() => {
    let cancelled = false
    window.yappr
      .getSettings()
      .then((s) => {
        if (cancelled) return
        setGlyph(formatHotkey(s.hotkeys?.pushToTalk) ?? '⌃')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="max-w-[640px]">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        Ready
      </div>
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-8">
        That&rsquo;s it. <em className="italic">Go talk.</em>
      </h1>

      {/* The key, once, at the size of the thing under your finger — the
          only fact this screen has left to carry.
          Spelled out underneath, because "Go talk" does not say WITH WHAT.
          This is the last frame before the window closes and the flow
          stops being able to tell them anything. */}
      <div
        className="inline-flex items-center justify-center mb-9 animate-springScale"
        style={{
          width: 84,
          height: 84,
          borderRadius: 18,
          background: 'linear-gradient(180deg, #fdfbf3 0%, #e9e1c8 100%)',
          border: '1px solid #c5bda0',
          boxShadow:
            '0 6px 0 #b8af90, 0 12px 22px rgba(0,0,0,0.12), inset 0 2px 0 rgba(255,255,255,0.7)',
        }}
      >
        <span
          className="font-mono text-ink leading-none"
          style={{ fontSize: glyph.length > 2 ? 17 : 32, fontWeight: 500 }}
        >
          {glyph}
        </span>
      </div>

      <p className="text-[17px] text-ink-2 leading-relaxed max-w-[42ch] mb-8 -mt-4">
        Anywhere on your Mac, hold <strong className="text-ink font-semibold">{glyph}</strong>{' '}
        and talk. Let go, and it lands where your cursor is.
      </p>

      {/* Both sides of the merge earn their place. The line above says
          what to press; this says the model is still arriving. Neither
          replaces the other — one is the instruction, the other is why
          dictation might not answer for the next few minutes. */}
      <ModelReadiness />

      {/* The one button left in the flow, and it is not navigation — it
          closes onboarding and hands the Mac back. Enter does the same,
          which is why the keycap is still at the bottom of the window;
          this is here because the very last screen should not be the one
          place a stuck Enter leaves someone with no way out. */}
      <div>
        <Pill variant="primary" onClick={onFinish}>
          Start yapping
        </Pill>
      </div>

      <p className="text-[11px] text-ink-45 mt-4">
        Everything here lives in Settings, from the menu bar icon.
      </p>
    </div>
  )
}

// The voice model arriving.
//
// Nothing asks the user about this: main fetches the model at startup
// because no other surface can any more. But a first launch on a slow
// connection is a few minutes where dictation would fail for a reason the
// user has no way to see, so the last screen of setup says so — a
// statement of what's happening, not a question and not a gate. Leaving
// now is fine; the download continues without this window.
function ModelReadiness() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<LocalModelProgress | null>(null)

  useEffect(() => {
    let alive = true
    let active: string | null = null

    const refresh = () =>
      window.yappr.getLocalModelStatus().then((s) => {
        if (!alive) return
        active = s.active
        setReady(Boolean(s.downloaded[s.active]))
        setProgress(s.progress.find((p) => p.modelId === s.active) ?? null)
      })

    refresh()
    const off = window.yappr.onLocalModelProgress((p) => {
      if (!alive || (active && p.modelId !== active)) return
      setProgress(p)
      if (p.status === 'done') refresh()
    })
    // Backstop: the fetch may have finished before this screen mounted, in
    // which case no progress event is coming.
    const poll = window.setInterval(refresh, 2000)

    return () => { alive = false; off(); window.clearInterval(poll) }
  }, [])

  // Say nothing until we know — a flash of "downloading" on a machine
  // that already has the model is worse than a beat of silence.
  if (ready === null) return null

  const failed = progress?.status === 'error'
  const downloading = !ready && !failed
  const pct = progress && progress.totalBytes > 0
    ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100)
    : 0

  return (
    <div className="bg-card border border-line rounded-card px-5 py-4 mb-6">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div className="text-[12.5px] font-semibold">
          {ready ? 'Voice model ready' : failed ? 'Voice model didn\u2019t download' : 'Getting the voice model'}
        </div>
        <div className="text-[10.5px] font-mono text-ink-45 tabular-nums">
          {ready ? 'on this Mac' : failed ? 'retries on next launch' : `${pct.toFixed(0)}%`}
        </div>
      </div>

      {downloading && (
        <div className="h-1 bg-ink/[0.06] rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-cobalt rounded-full transition-[width] duration-300"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      )}

      <p className="text-[11px] text-ink-60 leading-relaxed">
        {ready
          ? 'Transcription runs on this Mac. Your audio never leaves it.'
          : failed
            ? 'You can still finish setup — Yappr tries again the next time it starts.'
            : 'A one-time download so transcription can run on this Mac. You can finish setup now; it keeps going in the background.'}
      </p>
    </div>
  )
}
