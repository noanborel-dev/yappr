// Onboarding: the same sentence, in three places you actually type.
//
// The register setting is impossible to explain and trivial to show, so
// this step shows it: one dictation, and the app it lands in rewrites in
// front of you as you move the level. The control sits inside the mock —
// where that app's own send button would be — because a level list in a
// separate panel makes you read one column and map it onto another by
// name, which is exactly how the previous version of this step failed.
//
// Three rounds rather than three cards side by side: at 640px, three
// convincing app UIs shrink into three generic boxes, and the whole point
// is that they should look like the real thing.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAdvanceOnEnter } from './nav'
import type { CategoryStrictness, Strictness } from '../../shared/types'
import { BrandLogo, type BrandSlug } from '../shared/ui/BrandLogo'

type LaneId = keyof CategoryStrictness

// One utterance for all three lanes. Changing it per lane would let the
// user read the difference as "different sentence" instead of "different
// register", which is the only thing this step has to teach.
const RAW = 'hey yeah friday works — actually could we do 2 instead of 12? I have a lunch then'

const LEVELS: Strictness[] = [1, 2, 3]
const LEVEL_NAME: Record<Strictness, string> = { 1: 'Light', 2: 'Balanced', 3: 'Strict' }

interface Lane {
  id: LaneId
  tab: string
  /** The apps this register covers — shown as marks, not as a sentence. */
  apps: BrandSlug[]
  question: ReactNode
  out: Record<Strictness, string>
}

// Light is deliberately near-identical across all three lanes: that IS
// the setting. The registers only diverge as the level climbs, and
// seeing them converge at Light teaches that faster than any caption.
const LANES: Lane[] = [
  {
    id: 'personal',
    tab: 'Personal',
    apps: ['imessage'],
    question: <>How should friends <em className="italic">hear</em> you?</>,
    out: {
      1: 'hey yeah friday works — actually could we do 2 instead of 12? i have a lunch then',
      2: 'yeah friday works! could we do 2 instead of 12? i have a lunch then',
      3: 'Friday works. Could we do 2 instead of 12? I have a lunch then.',
    },
  },
  {
    id: 'work',
    tab: 'Work',
    apps: ['gmail', 'slack'],
    question: <>How should work <em className="italic">read</em> you?</>,
    out: {
      1: 'hey yeah friday works — actually could we do 2 instead of 12? i have a lunch then',
      2: 'Friday works — could we do 2 instead of 12? I have a lunch then.\n\nThanks,\nNoan',
      3: 'Hi Maya,\n\nFriday works for me. Could we move it to 2pm instead of 12? I have a lunch conflict at noon.\n\nThanks,\nNoan',
    },
  },
  {
    id: 'writing',
    tab: 'Writing',
    apps: ['claude', 'chatgpt', 'notion'],
    question: <>How should your <em className="italic">writing</em> land?</>,
    out: {
      1: 'hey yeah friday works — actually could we do 2 instead of 12? i have a lunch then',
      2: 'Friday works — could we do 2 instead of 12? I have a lunch then.',
      3: 'Friday works. Could we move the meeting to 2pm instead of 12pm? I have a lunch conflict at noon.',
    },
  },
]

export function PolishStep({ onNext }: { onNext: () => void }) {
  // Seeded with the shipped defaults so the mock renders text on the
  // first frame — a spinner here would hide the only thing on screen.
  const [strictness, setStrictness] = useState<CategoryStrictness>({
    personal: 2,
    work: 2,
    writing: 2,
  })
  const [laneId, setLaneId] = useState<LaneId>('personal')
  const [seen, setSeen] = useState<LaneId[]>(['personal'])

  // A level the screen is SHOWING, not one the user has chosen.
  //
  // The step opened parked on whichever level was already saved, so the
  // thing it exists to demonstrate — that the same sentence comes out
  // three different ways — only happened if you thought to drag the
  // control. Now it walks Light, Balanced, Strict on arrival and on every
  // lane change, then hands the display back to the saved value.
  //
  // Deliberately NOT written to settings: this is a demo, and a screen
  // that silently changes a preference while you watch it is a screen you
  // cannot trust. null means "showing the real setting".
  const [preview, setPreview] = useState<Strictness | null>(null)

  useEffect(() => {
    let alive = true
    window.yappr
      .getSettings()
      .then((s) => { if (alive) setStrictness(s.strictness) })
      .catch(() => {
        // Defaults are already on screen and every pick writes back, so a
        // failed read costs nothing worth interrupting onboarding for.
      })
    return () => { alive = false }
  }, [])

  // The cycle. One timeout chain per lane, cleared on lane change so two
  // lanes can never drive the display at once.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setPreview(1)
    const t = [
      window.setTimeout(() => setPreview(2), 1150),
      window.setTimeout(() => setPreview(3), 2300),
      // Back to whatever is actually saved, so the screen ends up telling
      // the truth about the setting rather than leaving Strict on screen.
      window.setTimeout(() => setPreview(null), 3500),
    ]
    return () => t.forEach(window.clearTimeout)
  }, [laneId])

  // Persist per click rather than on Continue: the user can close the
  // window from the traffic lights at any point. Every onboarding step
  // writes its own answer at the moment it is given (NotchStep does the
  // same on drag) — the shell no longer batches a save at the end.
  function setLevel(id: LaneId, level: Strictness) {
    // Touching the control ends the demo. Otherwise the next scheduled
    // tick would overwrite the choice a second after it was made, which
    // reads as the app arguing with you.
    setPreview(null)
    const next: CategoryStrictness = { ...strictness }
    next[id] = level
    setStrictness(next)
    void window.yappr.setSettings({ strictness: next })
  }

  function show(id: LaneId) {
    setLaneId(id)
    setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const lane = LANES.find((l) => l.id === laneId) ?? LANES[0]
  const level = preview ?? strictness[lane.id]
  const text = lane.out[level]
  const unseen = LANES.find((l) => !seen.includes(l.id))
  const remaining = LANES.filter((l) => !seen.includes(l.id)).length

  // Enter walks the three registers, then leaves. Same key, same cue, and
  // it does what the button beside it does — the button already worked
  // this way and the keyboard had no equivalent, so Enter used to skip
  // two thirds of the screen.
  //
  // Never gated: every option here ships with a default, so there is
  // nothing to wait for. Passing undefined once they are all seen hands
  // Enter back to the shell, which moves to the next step.
  const unseenId = unseen?.id
  const goNextLane = useCallback(
    () => { if (unseenId) show(unseenId) },
    // `show` is stable enough in practice (it only closes over setState),
    // and depending on it would rebuild this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unseenId],
  )
  useAdvanceOnEnter(true, unseenId ? goNextLane : undefined)

  return (
    <div className="max-w-[640px]">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-2.5">
        Polish
      </div>

      <h1
        key={lane.id}
        className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-4 animate-stepIn"
      >
        {lane.question}
      </h1>

      <Heard />

      {/* Reserved so the Continue button does not walk up and down the
          page as the mocks swap — they are three different heights. */}
      <div className="min-h-[248px] mb-5">
        <div key={lane.id} className="animate-stepIn">
          {lane.id === 'personal' && (
            <MessagesMock text={text} level={level} onLevel={(v) => setLevel('personal', v)} />
          )}
          {lane.id === 'work' && (
            <GmailMock text={text} level={level} onLevel={(v) => setLevel('work', v)} />
          )}
          {lane.id === 'writing' && (
            <ClaudeMock text={text} level={level} onLevel={(v) => setLevel('writing', v)} />
          )}
        </div>
      </div>

      {/* THE THREE REGISTERS, at the bottom and as cards.
          They were a pill-tab row above the demo, at 11.5px with 18px
          logos — sized like a filter control for a table. They are not a
          filter; they are the three things this screen is about, and each
          one is a separate setting the user is being asked to form an
          opinion on. So they sit under the proof, at a size that says
          "pick one", rather than over it at a size that says "sort by". */}
      <div className="grid grid-cols-3 gap-2.5 mb-6">
        {LANES.map((l) => {
          const on = l.id === lane.id
          return (
            <button
              key={l.id}
              onClick={() => show(l.id)}
              className={[
                'rounded-card border px-4 py-3.5 flex flex-col items-center gap-2',
                'transition-[background,border-color,box-shadow,transform] duration-200',
                on
                  ? 'border-accent/45 bg-accent-soft shadow-lift -translate-y-[1px]'
                  : 'border-line bg-card hover:border-ink-08 hover:-translate-y-[1px]',
              ].join(' ')}
            >
              <span className="flex items-center -space-x-2">
                {l.apps.map((brand) => (
                  <span
                    key={brand}
                    className="w-[30px] h-[30px] rounded-full bg-white ring-1 ring-ink-08 flex items-center justify-center overflow-hidden"
                  >
                    <BrandLogo brand={brand} size={19} />
                  </span>
                ))}
              </span>
              <span className={`text-[13.5px] font-semibold ${on ? 'text-ink' : 'text-ink-60'}`}>
                {l.tab}
              </span>
            </button>
          )
        })}
      </div>

      {/* No button. Enter drives the three rounds and then leaves, which
          is what the button did — and the cards above are still the way
          to jump straight to one. */}
      {remaining > 0 && (
        <p className="text-[12.5px] text-ink-45 m-0">
          {remaining} more {remaining === 1 ? 'register' : 'registers'} to see.
        </p>
      )}
    </div>
  )
}

// ─── What was said ──────────────────────────────────────────────────

function Heard() {
  return (
    <div className="flex items-start gap-3 mb-3">
      <span className="flex items-end gap-[2px] h-[13px] mt-[7px] shrink-0" aria-hidden="true">
        {[5, 9, 13, 8, 4].map((h, i) => (
          <span key={i} className="w-[2px] rounded-[1px] bg-cobalt" style={{ height: h }} />
        ))}
      </span>
      <p className="font-display italic text-[19px] leading-[1.3] text-ink select-text">
        &ldquo;{RAW}&rdquo;
      </p>
    </div>
  )
}

// ─── The control, worn as each app's own ────────────────────────────

interface LevelProps {
  level: Strictness
  onLevel: (v: Strictness) => void
  className?: string
}

function Levels({ level, onLevel, className = '' }: LevelProps) {
  return (
    <div className={`flex items-center gap-0.5 bg-ink/[0.06] rounded-pill p-0.5 ${className}`}>
      {LEVELS.map((lvl) => {
        const on = level === lvl
        return (
          <button
            key={lvl}
            onClick={() => onLevel(lvl)}
            className={[
              'flex-1 px-2.5 py-1 rounded-pill text-[11px] font-medium transition-colors duration-150',
              on ? 'bg-ink text-paper animate-springScale' : 'text-ink-60 hover:text-ink',
            ].join(' ')}
          >
            {LEVEL_NAME[lvl]}
          </button>
        )
      })}
    </div>
  )
}

function SendArrow({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M5 9V1.5M5 1.5 1.6 4.9M5 1.5l3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrafficLights() {
  return (
    <span className="flex items-center gap-[6px]" aria-hidden="true">
      <span className="w-[9px] h-[9px] rounded-full bg-[#FF5F57]" />
      <span className="w-[9px] h-[9px] rounded-full bg-[#FEBC2E]" />
      <span className="w-[9px] h-[9px] rounded-full bg-[#28C840]" />
    </span>
  )
}

interface MockProps {
  text: string
  level: Strictness
  onLevel: (v: Strictness) => void
}

// ─── Personal → Messages ────────────────────────────────────────────

function MessagesMock({ text, level, onLevel }: MockProps) {
  return (
    <div className="rounded-card border border-line bg-card overflow-hidden shadow-card">
      <div className="relative flex items-center px-3 py-2 bg-white/70 border-b border-line-soft">
        <TrafficLights />
        <div className="absolute inset-x-0 flex items-center justify-center gap-2 pointer-events-none">
          <span className="w-[18px] h-[18px] rounded-full bg-[#B8B2A2] text-white text-[9px] font-semibold flex items-center justify-center">
            M
          </span>
          <span className="text-[11.5px] font-semibold">Maya</span>
        </div>
      </div>

      <div className="px-4 pt-3 pb-3">
        <div className="text-center text-[9.5px] text-ink-45 mb-2.5">
          <span className="font-semibold text-ink-60">Today</span> 11:04
        </div>

        <div className="flex justify-start mb-1.5">
          <span className="max-w-[74%] bg-cream2 border border-line-soft text-ink text-[12.5px] leading-[1.4] px-3 py-2 rounded-[16px] rounded-bl-[5px]">
            friday still good? 12?
          </span>
        </div>

        <div className="flex justify-end">
          {/* Keyed on the level so the bubble re-pops when the text is
              rewritten — the rewrite is the lesson, and a silent swap
              reads as a static screenshot. */}
          <span
            key={level}
            className="max-w-[80%] bg-[#34C759] text-white text-[12.5px] leading-[1.4] px-3 py-2 rounded-[16px] rounded-br-[5px] shadow-[0_1px_2px_rgba(0,0,0,0.10)] animate-springScale"
          >
            {text}
          </span>
        </div>
        <div className="text-right text-[9.5px] text-ink-45 mt-1 pr-1">Delivered</div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 bg-white/70 border-t border-line-soft">
        <Levels level={level} onLevel={onLevel} className="flex-1" />
        <span className="w-[23px] h-[23px] rounded-full bg-[#34C759] text-white flex items-center justify-center shrink-0">
          <SendArrow />
        </span>
      </div>
    </div>
  )
}

// ─── Work → Gmail compose ───────────────────────────────────────────

function GmailMock({ text, level, onLevel }: MockProps) {
  return (
    <div className="rounded-card border border-line bg-white overflow-hidden shadow-card">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#404040]">
        <span className="text-[11px] font-medium text-white/90">New Message</span>
        <span className="flex items-center gap-3 text-white/55 text-[11px] leading-none" aria-hidden="true">
          <span>—</span>
          <span>⤢</span>
          <span>✕</span>
        </span>
      </div>

      <div className="flex items-baseline gap-2 px-3.5 py-2 border-b border-[#ECEAE4] text-[11.5px]">
        <span className="text-ink-45">To</span>
        <span className="text-ink">maya@northwind.co</span>
      </div>

      <div className="px-3.5 py-3 min-h-[118px]">
        <p key={level} className="text-[12.5px] leading-[1.55] text-ink whitespace-pre-wrap animate-stepIn">
          {text}
        </p>
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5 border-t border-[#ECEAE4]">
        <span className="px-4 py-1.5 rounded-pill bg-[#0B57D0] text-white text-[11.5px] font-medium shrink-0">
          Send
        </span>
        <Levels level={level} onLevel={onLevel} className="flex-1" />
      </div>
    </div>
  )
}

// ─── Writing → an AI prompt surface ─────────────────────────────────

function ClaudeMock({ text, level, onLevel }: MockProps) {
  return (
    <div className="rounded-card border border-line bg-paper overflow-hidden shadow-card">
      <div className="flex items-center justify-center gap-2.5 pt-5 pb-3">
        <BrandLogo brand="claude" size={19} />
        <span className="font-display italic text-[21px] leading-none text-ink">
          Good afternoon, Noan
        </span>
      </div>

      <div className="mx-3.5 mb-3.5 rounded-[14px] border border-line bg-white px-3.5 pt-3 pb-2.5 shadow-card">
        <p
          key={level}
          className="text-[12.5px] leading-[1.55] text-ink whitespace-pre-wrap min-h-[58px] animate-stepIn"
        >
          {text}
          {/* Shared blinking caret from index.css — the composer reads as
              live rather than as a screenshot. */}
          <span className="ps-cursor ml-[3px]" />
        </p>

        <div className="flex items-center gap-2 mt-2">
          <span className="px-2.5 py-1 rounded-pill border border-line-soft text-[10.5px] text-ink-60 shrink-0">
            Claude Sonnet
          </span>
          <Levels level={level} onLevel={onLevel} className="flex-1" />
          <span className="w-[24px] h-[24px] rounded-full bg-accent text-white flex items-center justify-center shrink-0">
            <SendArrow size={11} />
          </span>
        </div>
      </div>
    </div>
  )
}
