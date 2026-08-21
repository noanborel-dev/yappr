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
  app: string
  logo: BrandSlug
  /** Output per strictness level, in this destination's register. */
  out: Record<Strictness, string>
}

const LANES: Lane[] = [
  {
    id: 'personal',
    app: 'iMessage',
    logo: 'imessage',
    out: {
      1: 'hey yeah friday works could we do 2 instead of 12 i have a lunch then',
      2: 'yeah friday works — could we do 2 instead of 12? have a lunch then',
      3: 'Friday works. Could we do 2 instead of 12? I have a lunch then.',
    },
  },
  {
    id: 'work',
    app: 'Slack',
    logo: 'slack',
    out: {
      1: 'hey yeah friday works could we do 2 instead of 12, i have a lunch then',
      2: 'Hey — Friday works, could we do 2 instead of 12? I have a lunch then.',
      3: 'Friday works for me. Could we move it to 2 rather than 12? I have a lunch conflict at noon.',
    },
  },
  {
    id: 'writing',
    app: 'Gmail',
    logo: 'gmail',
    out: {
      1: 'friday works — could we do 2 instead of 12? i have a lunch then',
      2: 'Hi —\n\nFriday works. Could we do 2 instead of 12? I have a lunch then.\n\nThanks,\nNoan',
      3: 'Hi —\n\nFriday works for me. Could we shift to 2pm instead of 12? I have a lunch conflict at noon.\n\nThanks,\nNoan',
    },
  },
]

export function PolishFanout({
  strictness,
  onPick,
  active,
}: {
  strictness: CategoryStrictness
  /** Clicking a card focuses that context's row below. */
  onPick?: (id: keyof CategoryStrictness) => void
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
                  borderColor: active === lane.id ? 'var(--ink)' : undefined,
                }}
              >
                <div className="pap-card-head">
                  <span className="pap-card-logo">
                    <BrandLogo brand={lane.logo} size={16} />
                  </span>
                  <span className="pap-card-app">{lane.app}</span>
                  <span className="ml-auto text-[9px] font-mono uppercase tracking-[0.14em] text-ink-45">
                    {LEVEL_NAME[level]}
                  </span>
                </div>

                <div className={`pap-card-body pap-card-body--${lane.id}`}>
                  {lane.id === 'writing' ? (
                    <pre className="pap-prose">{lane.out[level]}</pre>
                  ) : (
                    <span className={`pap-bubble pap-bubble--${lane.id}`}>{lane.out[level]}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const LEVEL_NAME: Record<Strictness, string> = { 1: 'Light', 2: 'Balanced', 3: 'Strict' }
