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
  /**
   * Ordinal and eyebrow label, both now IGNORED.
   *
   * Every tab used to open with "01 · HOTKEY" in uppercase mono above a
   * serif headline. Numbering implies a sequence to work through, and
   * Settings has none — you land on the tab you came for. The eyebrow
   * then repeated in words what the sidebar already said and what the
   * headline said again, in the third typeface on the screen.
   *
   * Kept in the signature so the call sites can drop them one at a time
   * rather than in one sweeping edit.
   */
  ord?: string
  /** Eyebrow text — uppercased by CSS. */
  label?: string
  /** Serif headline. Wrap the emphasized noun in <em>. */
  headline: ReactNode
  /** One sentence. If it needs two, the section is doing too much. */
  body?: ReactNode
  /** Optional right-aligned status chip, sitting above the body copy. */
  meta?: ReactNode
}

export function SectionHead({ label, headline, body, meta }: Props) {
  void label
  return (
    <header className="mb-8">
      <div className="flex items-end justify-between gap-8">
        <h2 className="font-display text-[44px] leading-[1.0] tracking-[-0.02em] text-ink max-w-[16ch]">
          {headline}
        </h2>
        {meta && <div className="pb-2 shrink-0">{meta}</div>}
      </div>
      {body && (
        <p className="text-[13px] text-ink-60 leading-relaxed max-w-[54ch] mt-3">{body}</p>
      )}
    </header>
  )
}

/**
 * A sub-heading inside a tab.
 *
 * Was uppercase mono with wide letter-spacing — the same treatment as the
 * section eyebrow, the stat captions and the metadata rows, so a label
 * that exists only to group two switches carried the same visual weight
 * as the page title. Now it is quiet sentence-case: present when you look
 * for it, silent when you are not.
 */
export function GroupLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-[12px] text-ink-45 mb-2.5 ${className}`}
    >
      {children}
    </div>
  )
}
