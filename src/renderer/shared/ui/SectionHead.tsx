// The landing page's section-header pattern, brought into Settings.
//
// MASTER.md § Section header pattern: numbered mono eyebrow + serif
// headline on the left, the single line of body copy hung on the right and
// baseline-aligned. Explicitly NOT the lede stacked under the headline —
// that strands the right third of the measure.
//
// Replaces SectionHero, which wrapped every tab's title in a bordered card
// with two radial gradients and a 300×200 illustration. Eight of those in
// a row read as eight ads, and the gradient card fought the cream page it
// sat on. The proof belongs in the body of the tab, next to the control it
// explains — not in a display case above it.

import type { ReactNode } from 'react'

interface Props {
  /** Two-digit section ordinal, e.g. "03". */
  ord?: string
  /** Eyebrow text — uppercased by CSS. */
  label: string
  /** Serif headline. Wrap the emphasized noun in <em>. */
  headline: ReactNode
  /** One sentence. If it needs two, the section is doing too much. */
  body: ReactNode
  /** Optional right-aligned status chip, sitting above the body copy. */
  meta?: ReactNode
}

export function SectionHead({ ord, label, headline, body, meta }: Props) {
  return (
    <header className="mb-6">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        {ord && <span className="text-ink-45">{ord} · </span>}
        {label}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,320px)] gap-8 items-end">
        <h2 className="font-display text-[38px] leading-[1.02] tracking-[-0.02em] text-ink">
          {headline}
        </h2>
        <div className="pb-1.5">
          {meta && <div className="mb-2">{meta}</div>}
          <p className="text-[12.5px] text-ink-60 leading-relaxed">{body}</p>
        </div>
      </div>
      <div className="h-px bg-line mt-5" />
    </header>
  )
}

/**
 * A sub-heading inside a tab. Same mono eyebrow, no headline — used to
 * separate groups of controls without another serif line competing with
 * the section head.
 */
export function GroupLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-45 mb-2.5 ${className}`}
    >
      {children}
    </div>
  )
}
