// Sidebar glyphs.
//
// The nav used to mark each row with a 1px dot — accent when active,
// ink/20 otherwise. At that size a dot carries no meaning: it cannot say
// which row is which, so every entry depended entirely on reading its
// label. These are line icons at 15px on a 24px box, drawn on the same
// 24-unit grid with one stroke weight so they read as a set rather than
// as five borrowed glyphs.
//
// Inline SVG rather than an icon package — the constraint is no new
// dependencies, and five paths do not justify one.

import type { ReactNode } from 'react'

export type NavIconName = 'dashboard' | 'hotkey' | 'polish' | 'ai' | 'dictionary' | 'settings'

const PATHS: Record<NavIconName, ReactNode> = {
  // Bars, rising — the dashboard is a record of activity over time.
  dashboard: (
    <>
      <path d="M4 19V13" />
      <path d="M9.5 19V9" />
      <path d="M15 19V5" />
      <path d="M20.5 19V11" />
    </>
  ),
  // A keycap.
  hotkey: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
      <path d="M8.5 12h7" />
    </>
  ),
  // A wand — the cleanup pass.
  polish: (
    <>
      <path d="M5 19L15 9" />
      <path d="M13.5 5.5l1.2 2.4 2.4 1.2-2.4 1.2-1.2 2.4-1.2-2.4L9.9 9.1l2.4-1.2z" />
      <path d="M19 15.5l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7z" />
    </>
  ),
  // A spark — the model.
  ai: (
    <>
      <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" />
      <path d="M18.5 16.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
    </>
  ),
  // An open book.
  dictionary: (
    <>
      <path d="M12 6.5v13" />
      <path d="M12 6.5C10.5 5 8.5 4.5 4.5 4.5v13c4 0 6 .5 7.5 2 1.5-1.5 3.5-2 7.5-2v-13c-4 0-6 .5-7.5 2z" />
    </>
  ),
  // Sliders, not a gear: this pane is preferences, not machinery.
  settings: (
    <>
      <path d="M5 7h9" />
      <path d="M18 7h1.5" />
      <path d="M5 17h4" />
      <path d="M13 17h6.5" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="11" cy="17" r="2.2" />
    </>
  ),
}

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  )
}
