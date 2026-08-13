import { useCallback, useEffect, useRef, useState } from 'react'
import { ClaudeCodeShell, type PromptLine } from './ClaudeCodeShell'
import { MenuBar, NotchMark } from './NotchMark'
import type { NotchState } from '../../indicator/notch-states'

// The site's Section 01, running inside Settings.
//
// It plays like a short demo video rather than sitting there as a
// before/after:
//   listening  — the ramble streams in word by word, the way you'd say it
//   polishing  — filler strikes through and drops out
//   writing    — the structured prompt types itself, line by line, and as
//                each line lands the phrase it came FROM lights up above
//   hold       — full result, then loop
//
// That last beat is the point of the whole thing: it shows nothing was
// summarised away, it was just filed somewhere.
//
// One addition the site can't make: the notch above the transcript is
// driven by the SAME phase clock, so you watch the real indicator move
// through listening → polishing → copied while the text does. On the site
// that would be a drawing; here it's the component the app actually ships.

type Phase = 'idle' | 'listening' | 'polishing' | 'writing' | 'hold'

const SAID: Array<{ id: string; text: string; drop?: boolean }> = [
  { id: 'a', text: 'onboarding is broken for google signups,' },
  { id: 'x1', text: 'um,', drop: true },
  { id: 'b', text: 'they hit the dashboard before the workspace exists so it 404s,' },
  { id: 'x2', text: 'can you', drop: true },
  { id: 'c', text: 'fix it and add a test,' },
  { id: 'd', text: "don't touch email signup" },
]

// Flattened to words so the transcript arrives at speaking pace.
const WORDS = SAID.flatMap((chunk) =>
  chunk.text.split(' ').map((w) => ({ w, id: chunk.id, drop: chunk.drop })),
)

// `src` tags which spoken phrase each line came from, for the highlight.
type OutLine = PromptLine & { src?: string }

const OUT: OutLine[] = [
  { kind: 'heading', text: '## Goal' },
  { kind: 'text', text: 'Fix the onboarding redirect for Google sign-ups.', src: 'a' },
  { kind: 'blank' },
  { kind: 'heading', text: '## Context' },
  { kind: 'text', text: 'Users reach the dashboard before their workspace exists, so it 404s.', src: 'b' },
  { kind: 'blank' },
  { kind: 'heading', text: '## Tasks' },
  { kind: 'item', text: 'Fix the race in the callback handler.', src: 'c' },
  { kind: 'item', text: 'Add a test for a fresh Google signup.', src: 'c' },
  { kind: 'blank' },
  { kind: 'heading', text: '## Constraints' },
  { kind: 'bullet', text: "Don't touch the email signup path.", src: 'd' },
]

const WORD_MS = 72
const LINE_MS = 300

const NOTCH_FOR: Record<Phase, NotchState> = {
  idle: 'idle',
  listening: 'recording',
  polishing: 'processing',
  writing: 'processing',
  hold: 'done',
}

export function PromptShapingStage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [spoken, setSpoken] = useState(0)
  const [written, setWritten] = useState(0)
  const [active, setActive] = useState<string | null>(null)

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
    setPhase('idle')
    setSpoken(0)
    setWritten(0)
    setActive(null)

    at(() => setPhase('listening'), 350)

    WORDS.forEach((_, i) => {
      at(() => setSpoken(i + 1), 550 + i * WORD_MS)
    })

    const spokeFor = 550 + WORDS.length * WORD_MS
    at(() => setPhase('polishing'), spokeFor + 400)

    const writeAt = spokeFor + 1250
    at(() => setPhase('writing'), writeAt)
    OUT.forEach((line, i) => {
      at(() => {
        setWritten(i + 1)
        setActive(line.src ?? null)
      }, writeAt + i * LINE_MS)
    })

    const done = writeAt + OUT.length * LINE_MS
    at(() => {
      setPhase('hold')
      setActive(null)
    }, done)
    at(play, done + 3400)
  }, [clear, at])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('hold')
      setSpoken(WORDS.length)
      setWritten(OUT.length)
      return
    }
    play()
    return clear
  }, [play, clear])

  const dropping = phase === 'polishing' || phase === 'writing' || phase === 'hold'

  return (
    <div className="stage-bleed bg-cream2/60 border-y border-line px-9 pt-0 pb-7 mb-7">
      {/* The indicator hangs from a menu bar, as it must — and moves
          through the same states the text below is moving through.

          The strip needs a desktop behind it. Over cream, a translucent
          white bar is invisible, and the shape read as floating in the
          middle of the pane — which is the one thing the notch may never
          appear to do. */}
      <div className="-mx-9 mb-6 bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)]">
        <MenuBar>
          <NotchMark state={NOTCH_FOR[phase]} notchWidth={92} />
        </MenuBar>
      </div>

      <div className="ps-stage">
        <div className={`ps-said ${phase === 'idle' ? 'dim' : ''}`}>
          <span className="ps-said-label">you said</span>
          <p>
            {WORDS.slice(0, spoken).map((w, i) => (
              <span
                key={i}
                className={[
                  'ps-w',
                  w.drop && dropping ? 'gone' : '',
                  active && w.id === active ? 'lit' : '',
                ].filter(Boolean).join(' ')}
              >
                {w.w}{' '}
              </span>
            ))}
            {phase === 'listening' && <span className="ps-cursor" />}
          </p>
        </div>

        <div className="ps-mid" aria-hidden="true">
          <span className={`ps-link ${phase === 'writing' || phase === 'hold' ? 'on' : ''}`} />
        </div>

        <div className="ps-out">
          <ClaudeCodeShell
            lines={OUT.slice(0, written)}
            caret={written === 0}
            stagger={false}
          />
        </div>
      </div>
    </div>
  )
}
