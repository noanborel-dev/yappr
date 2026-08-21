import { CSSProperties, ReactNode, MouseEvent } from 'react'

// Button variants map to MASTER.md § Buttons: a dark pill for primary, a
// bordered cream pill for secondary, a transparent hairline for tertiary
// on dark surfaces. Everything is a pill — 999px radius, no exceptions.
type Variant = 'primary' | 'secondary' | 'ghost' | 'line' | 'ok' | 'danger'

interface Props {
  children: ReactNode
  variant?: Variant
  size?: 'sm' | 'md'
  onClick?: (e: MouseEvent) => void
  className?: string
  style?: CSSProperties
  disabled?: boolean
  title?: string
  label?: string
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:opacity-90',
  secondary: 'bg-card text-ink border border-line hover:bg-paper',
  ghost: 'text-ink-60 hover:text-ink hover:bg-ink/[0.05]',
  line: 'text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10',
  ok: 'bg-ok/12 text-ok border border-ok/30',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15',
}

const SIZE = {
  sm: 'px-3 py-1.5 text-[11.5px]',
  md: 'px-4 py-2 text-[12.5px]',
}

export function Pill({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  className = '',
  style,
  disabled,
  title,
  label,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={title}
      aria-label={label}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-pill font-medium shrink-0',
        'transition-[transform,background,opacity,color] duration-150 hover:-translate-y-px',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0',
        SIZE[size],
        VARIANT[variant],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
