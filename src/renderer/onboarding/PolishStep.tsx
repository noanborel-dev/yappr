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

import { useEffect, useState, type ReactNode } from 'react'
import type { CategoryStrictness, Strictness } from '../../shared/types'
import { BrandLogo, type BrandSlug } from '../shared/ui/BrandLogo'
import { Pill } from '../shared/ui/Pill'

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

  // Persist per click rather than on Continue: the user can close the
  // window from the traffic lights at any point. Every onboarding step
  // writes its own answer at the moment it is given (NotchStep does the
  // same on drag) — the shell no longer batches a save at the end.
  function setLevel(id: LaneId, level: Strictness) {
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
  const level = strictness[lane.id]
  const text = lane.out[level]
  const unseen = LANES.find((l) => !seen.includes(l.id))

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

      <div className="inline-flex items-center gap-0.5 bg-ink/[0.05] rounded-pill p-0.5 mb-4">
        {LANES.map((l) => {
          const on = l.id === lane.id
          return (
            <button
              key={l.id}
              onClick={() => show(l.id)}
              className={[
                'flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-pill text-[11.5px] font-medium',
                'transition-colors duration-150',
                on ? 'bg-ink text-paper' : 'text-ink-60 hover:text-ink',
              ].join(' ')}
            >
              <span className="flex items-center -space-x-1.5">
                {l.apps.map((brand) => (
                  <span
                    key={brand}
                    className="w-[18px] h-[18px] rounded-full bg-white ring-1 ring-ink-08 flex items-center justify-center overflow-hidden"
                  >
                    <BrandLogo brand={brand} size={12} />
                  </span>
                ))}
              </span>
              {l.tab}
            </button>
          )
        })}
      </div>

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

      {/* One button drives the three rounds and then leaves — a separate
          "next register" control would compete with Continue for the same
          click. Jumping via the tabs is still honoured: it advances to
          whatever is left rather than to the next in order. */}
      <Pill variant="primary" onClick={() => (unseen ? show(unseen.id) : onNext())}>
        {unseen ? 'Next →' : 'Continue →'}
      </Pill>
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
