import { useEffect, useState } from 'react'
import type { CategoryStrictness, Strictness } from '../../../shared/types'
import { BrandLogo, type BrandSlug } from './BrandLogo'

// The site's Section 04 — one dictation, three destinations — running in
// Settings against YOUR settings.
//
// On the landing page the three outputs are fixed copy, because there are
// no settings to read. Here each card renders at the level that context is
// actually set to, and re-renders when you change it. Same visual, but it
// stops being an advert and becomes the preview for the control below it.

const RAW = 'hey yeah friday works — actually could we do 2 instead of 12? I have a lunch then'

type Lane = {
  id: keyof CategoryStrictness
  /** What this register IS — the row is the setting now, not a demo app. */
  title: string
  /** The apps it covers. Was implied by the app name alone, which meant
   *  "Slack" had to stand in for every work surface. */
  apps: string
  logo: BrandSlug
  /** Output per strictness level, in this destination's register. */
  out: Record<Strictness, string>
}

// Three registers, and each card IS its setting — no separate list of
// rows underneath repeating the same three names with the same three
// controls.
//
// Slack lost its own lane. It and Gmail were two cards for one register:
// both are work, both read from `strictness.work`, so changing either
// moved the same value and the pair implied a distinction that does not
// exist. Work is one lane now and names the apps it covers; the third is
// writing and AI, which had no card at all despite being the register
// that shapes prompts.
const LANES: Lane[] = [
  {
    id: 'personal',
    title: 'Personal messaging',
    apps: 'iMessage · WhatsApp · Telegram',
    logo: 'imessage',
    out: {
      1: 'hey yeah friday works could we do 2 instead of 12 i have a lunch then',
      2: 'yeah friday works — could we do 2 instead of 12? have a lunch then',
      3: 'Friday works. Could we do 2 instead of 12? I have a lunch then.',
    },
  },
  {
    id: 'work',
    title: 'Work messaging',
    apps: 'Gmail · Slack · Outlook · Teams',
    logo: 'gmail',
    out: {
      1: 'friday works — could we do 2 instead of 12? i have a lunch then',
      2: 'Hi —\n\nFriday works. Could we do 2 instead of 12? I have a lunch then.\n\nThanks,\nNoan',
      3: 'Hi —\n\nFriday works for me. Could we shift to 2pm instead of 12? I have a lunch conflict at noon.\n\nThanks,\nNoan',
    },
  },
  {
    id: 'writing',
    title: 'Writing & AI',
    apps: 'Claude · ChatGPT · Notion · Docs',
    logo: 'claude',
    out: {
      1: 'friday works, could we do 2 instead of 12? i have a lunch then',
      2: 'Friday works — could we do 2 instead of 12? I have a lunch then.',
      3: 'Friday works. Could we move the meeting to 2pm rather than 12pm? I have a lunch conflict at noon.',
    },
  },
]

export function PolishFanout({
  strictness,
  onPick,
  onLevel,
  active,
}: {
  strictness: CategoryStrictness
  /** Clicking a card focuses that context's row below. */
  onPick?: (id: keyof CategoryStrictness) => void
  /** Set a register's level from its own card. When omitted the cards
   *  are read-only, which is how the landing page uses this. */
  onLevel?: (id: keyof CategoryStrictness, level: Strictness) => void
  active?: keyof CategoryStrictness | 'code' | null
}) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 250)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="stage-bleed bg-cream2/60 border-y border-line px-9 py-7 mb-7">
      <div className="pap-stage">
        <div className={`pap-raw ${revealed ? 'in' : ''}`}>
          <span className="pap-raw-label">heard</span>
          <p className="pap-raw-text">&ldquo;{RAW}&rdquo;</p>
          <span className="pap-raw-fanout" aria-hidden="true">
            <span /><span /><span />
          </span>
        </div>

        <div className="pap-grid">
          {LANES.map((lane, i) => {
            const level = strictness[lane.id]
            return (
              <div
                key={lane.id}
                onClick={() => onPick?.(lane.id)}
                className={`pap-card pap-card--delay-${i} ${revealed ? 'in' : ''}`}
                style={{
                  cursor: onPick ? 'pointer' : undefined,
                  // Selection used to be `var(--ink)` — a near-black 1px
                  // rule around one card while its neighbours sat on a
                  // warm hairline. It read as an outlined box rather than
                  // a chosen one, and it was the hardest edge on the page.
                  // Accent plus a lift says the same thing without drawing
                  // a line the eye has to get past.
                  borderColor: active === lane.id ? 'var(--accent)' : undefined,
                  boxShadow: active === lane.id
                    ? '0 2px 10px rgba(21,22,26,0.07), 0 1px 2px rgba(21,22,26,0.04)'
                    : undefined,
                }}
              >
                <div className="pap-card-head">
                  <span className="pap-card-logo">
                    <BrandLogo brand={lane.logo} size={16} />
                  </span>
                  <span className="pap-card-app">{lane.title}</span>
                </div>
                <div className="text-[11px] text-ink-45 px-1 -mt-0.5 mb-2">{lane.apps}</div>

                <div className={`pap-card-body pap-card-body--${lane.id}`}>
                  {lane.id === 'work' ? (
                    <pre className="pap-prose">{lane.out[level]}</pre>
                  ) : (
                    <span className={`pap-bubble pap-bubble--${lane.id}`}>{lane.out[level]}</span>
                  )}
                </div>

                {/* The control lives WITH its preview. It used to sit in a
                    separate panel below, so choosing a level meant reading
                    one list, moving to another, and mapping the two by
                    name — the demo showed the result of a setting you
                    could not reach from it. */}
                {onLevel && (
                  <div
                    className="flex items-center gap-0.5 bg-ink/[0.05] rounded-pill p-0.5 mt-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {([1, 2, 3] as Strictness[]).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => onLevel(lane.id, lvl)}
                        className={[
                          'flex-1 px-2 py-1 rounded-pill text-[11px] font-medium transition-all duration-150',
                          level === lvl ? 'bg-ink text-paper' : 'text-ink-60 hover:text-ink',
                        ].join(' ')}
                      >
                        {LEVEL_NAME[lvl]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const LEVEL_NAME: Record<Strictness, string> = { 1: 'Light', 2: 'Balanced', 3: 'Strict' }
