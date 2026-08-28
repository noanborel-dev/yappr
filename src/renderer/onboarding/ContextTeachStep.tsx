// Onboarding: Yappr writing the profile, drawn instead of described.
//
// This step used to animate a copy-paste loop — a cursor carrying a
// prompt to ChatGPT and the answer back — because that was the flow.
// It no longer is: Yappr holds the key and the model, so it asks for one
// line about you and writes the rest itself. An animation teaching six
// manual steps that no longer exist would be worse than none.
//
// What it shows now is the actual shape of the new flow: a sentence goes
// in, and facts come out as chips. Three beats, looping, with a pause.

import { useEffect, useState } from 'react'
import { useAdvanceOnEnter } from './nav'
import { Pill } from '../shared/ui/Pill'
import { Wordmark } from '../shared/ui/Wordmark'

function Check({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 12.5l5.5 5.5L20 6" />
    </svg>
  )
}

// The line the animation "hears", and what it becomes. Deliberately the
// same shape the real generator produces: a couple of preferences and a
// project, never a paragraph.
const SPOKEN = "I'm building a Mac app in TypeScript."
const LEARNED = ['always TypeScript', 'functional components', 'project · yappr']

/** idle → speaking → thinking → learned → (pause) → idle */
type Beat = 'idle' | 'speaking' | 'thinking' | 'learned'
const NEXT: Record<Beat, [Beat, number]> = {
  idle: ['speaking', 400],
  speaking: ['thinking', 1500],
  thinking: ['learned', 900],
  learned: ['idle', 2600],
}

function BuildLoop({ busy, done }: { busy: boolean; done: boolean }) {
  const [beat, setBeat] = useState<Beat>('idle')

  useEffect(() => {
    // Real state outranks the demo: once it is actually working or has
    // actually finished, the loop stops competing with it.
    if (busy || done) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBeat('learned')
      return
    }
    const [next, ms] = NEXT[beat]
    const t = setTimeout(() => setBeat(next), ms)
    return () => clearTimeout(t)
  }, [beat, busy, done])

  const showing: Beat = busy ? 'thinking' : done ? 'learned' : beat
  const typed = showing === 'idle' ? 0 : SPOKEN.length

  return (
    <div className="rounded-card overflow-hidden shadow-glass bg-white/55 backdrop-blur-xl backdrop-saturate-150 px-6 py-6 mb-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Wordmark size="inline" />
      </div>

      {/* What you say */}
      <div className="min-h-[38px]">
        <p className="font-display italic text-[19px] leading-snug text-ink">
          {SPOKEN.slice(0, typed)}
          {showing === 'speaking' && (
            <span className="inline-block w-[2px] h-[17px] align-middle bg-accent ml-0.5 animate-voltPulse" />
          )}
        </p>
      </div>

      {/* What it becomes */}
      <div className="flex flex-wrap gap-2 mt-4 min-h-[30px]">
        {showing === 'thinking' && (
          <span className="text-[12px] text-ink-45">working it out…</span>
        )}
        {showing === 'learned' &&
          LEARNED.map((f, i) => (
            <span
              key={f}
              className="animate-springScale inline-flex items-center gap-1.5 text-[12px] text-ink bg-ink/[0.05] rounded-pill px-3 py-1"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <Check size={11} className="text-ok" />
              {f}
            </span>
          ))}
      </div>
    </div>
  )
}

// ─── The step ───────────────────────────────────────────────────────

export function ContextTeachStep({ onNext }: { onNext: () => void }) {
  // Optional by design — this step asks for something to remember, and
  // skipping it costs nothing but a colder first week.
  useAdvanceOnEnter(true)
  const [seed, setSeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [stored, setStored] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // No clipboard round-trip.
  //
  // This step used to hand over a prompt to carry to Claude or ChatGPT and
  // bring the answer back: copy, switch app, paste, wait, copy, switch
  // back, paste. Six steps of acting as a courier between two machines
  // that can talk to each other. Yappr holds the key and the model; the
  // only thing the other chat had was knowing the user, so it asks for
  // that in one line and writes the rest itself.
  async function generate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.yappr.generateContext(seed)
      if (!res.ok) {
        setError(res.error ?? 'Could not build it. Try again.')
        return
      }
      setStored(res.stored)
      setSeed('')
    } catch {
      setError('Could not build it. Try again.')
    } finally {
      // In a finally so a throw cannot strand the button disabled.
      setBusy(false)
    }
  }

  return (
    <div className="max-w-[640px]">
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-6">
        What are you <em className="italic">working on</em>?
      </h1>

      <BuildLoop busy={busy} done={stored !== null} />

      <textarea
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        rows={3}
        placeholder="I'm building a Mac app in TypeScript. I always use functional components."
        className="select-text w-full bg-card border border-line rounded-input px-3.5 py-3 text-[12.5px] leading-relaxed resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />

      <div className="flex items-center gap-3 mt-3">
        <Pill onClick={generate} disabled={busy}>
          {busy ? 'Writing…' : 'Build my profile'}
        </Pill>
        {stored !== null && (
          <span
            key={stored}
            className="animate-checkPop inline-flex items-center gap-1.5 text-[12px] text-ok tabular-nums"
          >
            <Check /> {stored} {stored === 1 ? 'thing' : 'things'} learned
          </span>
        )}
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </div>

      <div className="mt-7">
        <Pill variant={stored === null ? 'secondary' : 'primary'} onClick={onNext}>
          {stored === null ? 'Skip' : 'Continue'}
        </Pill>
      </div>
    </div>
  )
}
