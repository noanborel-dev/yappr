// The two shapes every Settings tab was rebuilding by hand: a hairline
// card, and a labelled row inside it with its control on the right.
//
// Before this, each tab wrote its own
//   grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-line-soft
// which drifted — 13px vs 13.5px titles, py-3.5 vs py-4, some rows with a
// trailing border and some without. One primitive, one rhythm.

import type { ReactNode } from 'react'

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`bg-card border border-line-soft rounded-card overflow-hidden shadow-card ${className}`}>
      {children}
    </div>
  )
}

interface RowProps {
  title: ReactNode
  /** One line. Long enough to need two is a sign the control is wrong. */
  desc?: ReactNode
  /** Icon or logo tile, shown left of the title. */
  icon?: ReactNode
  /** The control itself — toggle, select, button. */
  children?: ReactNode
  /** Suppresses the divider. Applied automatically to the last row. */
  last?: boolean
  /** Recessed treatment for rows that are informational, not adjustable. */
  muted?: boolean
  onMouseEnter?: () => void
}

export function SettingRow({
  title,
  desc,
  icon,
  children,
  last,
  muted,
  onMouseEnter,
}: RowProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      className={[
        'grid items-center gap-4 px-5 py-4 transition-colors',
        icon ? 'grid-cols-[36px_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
        last ? '' : 'border-b border-line-soft',
        muted ? 'bg-paper/40' : '',
      ].join(' ')}
    >
      {icon && (
        <div className="w-9 h-9 rounded-[10px] bg-ink/[0.03] flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div
          className={`text-[13px] font-semibold leading-tight ${muted ? 'text-ink-60' : 'text-ink'}`}
        >
          {title}
        </div>
        {desc && <div className="text-[11px] text-ink-45 mt-1 leading-snug">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * A row whose body is a block of its own (textarea, list, chart) rather
 * than a right-hand control.
 */
export function StackRow({
  title,
  desc,
  aside,
  children,
  last,
}: {
  title: ReactNode
  desc?: ReactNode
  aside?: ReactNode
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={['px-5 py-4', last ? '' : 'border-b border-line-soft'].join(' ')}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight">{title}</div>
          {desc && <div className="text-[11px] text-ink-45 mt-1 leading-snug max-w-[62ch]">{desc}</div>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  )
}
