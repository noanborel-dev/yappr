import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-white/55 backdrop-blur-xl backdrop-saturate-150 rounded-card overflow-hidden shadow-glass ${className}`}>
      {children}
    </div>
  )
}

export function Row({ children, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/60 last:border-b-0 ${className}`}>
      {children}
    </div>
  )
}
