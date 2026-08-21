interface Props {
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  title?: string
  label?: string
}

export function Toggle({ on, onChange, disabled, title, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={[
        'relative w-[36px] h-[21px] rounded-pill shrink-0 transition-colors duration-200',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        on ? 'bg-ink' : 'bg-ink/15',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2.5px] w-4 h-4 rounded-full bg-card transition-all duration-200',
          'shadow-[0_1px_2px_rgba(0,0,0,0.25)]',
          on ? 'left-[17px]' : 'left-[2.5px]',
        ].join(' ')}
      />
    </button>
  )
}
