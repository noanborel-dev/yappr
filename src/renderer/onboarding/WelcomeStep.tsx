// Onboarding, screen one: the cold open.
//
// The screen this replaces opened with a paragraph — "Yappr listens while
// you hold your key, cleans up what you said, and types it where you were
// already typing" — above a single frozen frame of the indicator. That is
// a product description, and nobody reads a product description on the
// way to using the thing. Nothing on that screen taught the gesture.
//
// So the screen IS the demonstration. The real NotchMark runs the real
// pipeline states (idle → recording → processing → done) on a menu bar,
// words arrive raw while it listens and land polished when it finishes,
// and the three beats under the headline are the entire instruction set.
// Clicking a beat scrubs the demo to that state, so the lesson is
// something you poke rather than something you read.
//
// Everything here is a simulation, and has to be: the preload bridge
// exposes no dictation IPC, and microphone permission isn't granted until
// the next screen, so a real dictation on this screen would only ever
// fail. The one live value is the user's own push-to-talk key.

import { useEffect, useState } from 'react'
import { useAdvanceOnEnter } from './nav'
import { BrandLogo } from '../shared/ui/BrandLogo'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'
import { formatHotkey, type NotchState } from '../indicator/notch-states'

interface Beat {
  state: NotchState
  ms: number
}

// One dictation, at roughly the speed a real one runs: `recording` is
// long enough to read the words arriving, `processing` is about what a
// Groq cleanup call actually costs (~0.9s in the logs), and `done` holds
// long enough to read the result before the loop resets.
const CYCLE: Beat[] = [
  { state: 'idle', ms: 900 },
  { state: 'recording', ms: 2500 },
  { state: 'processing', ms: 950 },
  { state: 'done', ms: 2200 },
]

const IDLE_BEAT = 0
const RECORDING_BEAT = 1
const PROCESSING_BEAT = 2
const DONE_BEAT = 3

// The demo dictation. The pair has to be honest about what cleanup does:
// drop the filler, capitalise, punctuate. It must not invent or reword —
// most registers are faithful, and a demo that rewrites the sentence
// would teach an expectation the pipeline deliberately refuses to meet.
const RAW = ['um', 'can', 'you', 'send', 'me', 'the', 'deck', 'when', 'you', 'get', 'a', 'sec']
const CLEAN = 'Can you send me the deck when you get a sec?'

// 12 words across the 2500ms recording beat, with a little slack so the
// last word lands before the hotkey "releases" rather than on top of it.
const WORD_MS = 190

/** The three beats of the gesture, and the demo state each one scrubs to. */
const STEPS: { label: string; keycap: boolean; jumpTo: number }[] = [
  { label: 'hold', keycap: true, jumpTo: RECORDING_BEAT },
  { label: 'speak', keycap: false, jumpTo: RECORDING_BEAT },
  { label: 'release', keycap: false, jumpTo: PROCESSING_BEAT },
]

/** Which gesture beats have happened, given what the notch is doing. */
function phaseOf(state: NotchState): number {
  if (state === 'recording') return 1
  if (state === 'processing' || state === 'done') return 2
  return -1
}

const BLOOM: Record<string, number> = {
  idle: 0.16,
  recording: 1,
  processing: 0.62,
  done: 0.44,
}

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  // Nothing to wait for on the first screen — Enter is live immediately,
  // which is also where the user learns the cue exists.
  useAdvanceOnEnter(true)
  // Reduced motion parks the demo on its final frame rather than hiding
  // it: the story still resolves, it just doesn't move. Read once — this
  // never needs to change mid-screen.
  const [frozen] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const [beat, setBeat] = useState(frozen ? DONE_BEAT : IDLE_BEAT)
  // Bumped on every scrub so clicking the beat that is already playing
  // restarts it instead of doing nothing.
  const [scrub, setScrub] = useState(0)
  const [spoken, setSpoken] = useState(frozen ? RAW.length : 0)
  const [keyGlyph, setKeyGlyph] = useState('⌃')

  const state = CYCLE[beat].state
  const phase = phaseOf(state)

  useEffect(() => {
    if (frozen) return
    const id = window.setTimeout(
      () => setBeat((b) => (b + 1) % CYCLE.length),
      CYCLE[beat].ms,
    )
    return () => window.clearTimeout(id)
  }, [beat, scrub, frozen])

  useEffect(() => {
    if (state === 'idle') {
      setSpoken(0)
      return
    }
    // Reached by a scrub straight to the tail of the cycle, where the
    // transcript has to already exist for the polish to mean anything.
    if (state !== 'recording') {
      setSpoken(RAW.length)
      return
    }
    setSpoken(1)
    const id = window.setInterval(
      () => setSpoken((n) => (n >= RAW.length ? n : n + 1)),
      WORD_MS,
    )
    return () => window.clearInterval(id)
  }, [state, scrub])

  // Show the key they will actually hold. On a fresh install this is the
  // default, which is what the fallback glyph already draws.
  useEffect(() => {
    let alive = true
    window.yappr
      .getSettings()
      .then((s) => {
        if (alive) setKeyGlyph(formatHotkey(s.hotkeys.pushToTalk) ?? '⌃')
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  function scrubTo(next: number) {
    setBeat(next)
    setScrub((n) => n + 1)
  }

  return (
    <div className="max-w-[640px]">
      <style>{KEYFRAMES}</style>

      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        Lesson 01
      </div>
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-5">
        Watch it <em className="italic">work.</em>
      </h1>

      {/* The instruction, as three clickable beats instead of a sentence. */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const lit = phase >= i
          const current = phase === i
          return (
            <div key={s.label} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="w-4 h-px bg-line" />}
              <button
                type="button"
                onClick={() => scrubTo(s.jumpTo)}
                style={{
                  transform: current ? 'scale(1.04)' : 'scale(1)',
                  transition: 'transform 360ms cubic-bezier(0.34,1.56,0.64,1)',
                }}
                className={[
                  'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5',
                  'text-[11.5px] font-medium border',
                  'transition-[background-color,color,border-color] duration-300',
                  lit
                    ? 'bg-ink text-paper border-ink'
                    : 'text-ink-45 border-line-soft hover:text-ink hover:border-line',
                ].join(' ')}
              >
                {s.keycap && (
                  <span
                    className={[
                      'font-mono text-[10px] leading-none px-1.5 py-1 rounded-[5px] border',
                      lit ? 'border-paper/25 bg-paper/10' : 'border-line bg-ink/[0.04]',
                    ].join(' ')}
                  >
                    {keyGlyph}
                  </span>
                )}
                {s.label}
              </button>
            </div>
          )
        })}
      </div>

      {/* The desktop. Black because that is the notch shell's colour — the
          shape has to grow out of the bar, not sit on it as a box. */}
      <div className="relative rounded-hero overflow-hidden border border-ink-08 shadow-card bg-[#0A0B0F] mb-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            background:
              'radial-gradient(115% 85% at 50% -10%, rgba(90,143,232,0.22), transparent 62%)',
            opacity: BLOOM[state] ?? 0.16,
          }}
        />

        <MenuBar tone="dark" right={<BarFurniture />}>
          <NotchMark state={state} notchWidth={88} hotkey={keyGlyph} />
        </MenuBar>

        <div className="relative px-7 pt-9 pb-7">
          <div
            className="mx-auto max-w-[420px] rounded-card border border-white/10 bg-white/[0.06] backdrop-blur-xl px-4 py-3.5"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 40px -22px rgba(0,0,0,0.9)',
            }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <BrandLogo brand="imessage" size={14} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                Messages
              </span>
            </div>

            <div className="min-h-[42px] text-[13.5px] leading-[1.55]">
              {state === 'done' ? (
                <span key="clean" className="animate-stepIn text-white/90">
                  {CLEAN}
                </span>
              ) : (
                <span
                  className="text-white/55"
                  style={{
                    // Blur is the whole "polishing…" beat: the words are
                    // in flight, so they are visibly not final yet.
                    filter: state === 'processing' ? 'blur(1.3px)' : 'none',
                    opacity: state === 'processing' ? 0.5 : 1,
                    transition: 'filter 300ms ease, opacity 300ms ease',
                  }}
                >
                  {RAW.slice(0, spoken).map((w, i) => (
                    <span key={`${i}-${w}`} className="ws-word mr-[0.3em]">
                      {w}
                    </span>
                  ))}
                </span>
              )}
              <span
                aria-hidden
                className="ws-caret inline-block bg-white/70"
                style={{ width: 1.5, height: 15, verticalAlign: -2 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* No Start button. Enter opens the flow and carries every screen in
          it, and this is where the reader meets that keycap for the first
          time — putting a button beside it on screen one would teach the
          mouse before the keyboard had a chance. */}
    </div>
  )
}

/** Menu-bar furniture, so the strip reads as a desktop and not a header. */
function BarFurniture() {
  return (
    <div className="flex items-center gap-2.5 text-white/40">
      <svg width="13" height="12" viewBox="0 0 13 12" fill="none" aria-hidden>
        <path d="M1.2 4.6a7.6 7.6 0 0 1 10.6 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M3.5 7a4.4 4.4 0 0 1 6 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="6.5" cy="9.6" r="1" fill="currentColor" />
      </svg>
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden>
        <rect x="0.5" y="0.5" width="14" height="9" rx="2.6" stroke="currentColor" strokeWidth="1" />
        <rect x="2" y="2" width="9" height="6" rx="1.2" fill="currentColor" />
        <path d="M16.2 3.6v2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="font-mono text-[10px] tabular-nums">9:41</span>
    </div>
  )
}

// Local keyframes rather than tailwind utilities: a per-word entrance and
// a text caret are both too specific to earn a global animation, and
// NotchMark already establishes the pattern of a component owning its own.
const KEYFRAMES = `
  @keyframes wsWordIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  @keyframes wsCaret  { 0%, 45% { opacity: 1; } 55%, 100% { opacity: .12; } }
  .ws-word  { display: inline-block; animation: wsWordIn 220ms cubic-bezier(.22,1,.36,1) both; }
  .ws-caret { animation: wsCaret 1.1s steps(1, end) infinite; }
  @media (prefers-reduced-motion: reduce) {
    .ws-word, .ws-caret { animation: none; }
  }
`
