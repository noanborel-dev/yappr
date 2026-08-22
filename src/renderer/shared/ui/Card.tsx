import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-card border border-line-soft rounded-card overflow-hidden shadow-card ${className}`}>
      {children}
    </div>
  )
}

export function Row({ children, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0 ${className}`}>
      {children}
    </div>
  )
}
