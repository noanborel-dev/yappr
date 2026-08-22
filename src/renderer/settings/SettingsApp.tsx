import { useState } from 'react'
import GeneralTab from './tabs/GeneralTab'
import HotkeysTab from './tabs/HotkeysTab'
import DictionaryTab from './tabs/DictionaryTab'
import PolishTab from './tabs/PolishTab'
import AITab from './tabs/AITab'
import HistoryTab from './tabs/HistoryTab'
import AboutTab from './tabs/AboutTab'
import { Wordmark } from '../shared/ui/Wordmark'

const TABS = ['Dashboard', 'Hotkey', 'Polish', 'AI', 'Dictionary', 'General', 'About'] as const
type Tab = typeof TABS[number]

// Grouped rather than run together. The old flat list mixed "what Yappr
// does with your voice" (Polish, AI, Dictionary) with "how Yappr is wired
// up" (General, About) in one undifferentiated column, so nothing in it
// told you where to look for anything.
const GROUPS: Array<{ label: string | null; tabs: Tab[] }> = [
  { label: null, tabs: ['Dashboard'] },
  { label: 'Voice', tabs: ['Hotkey', 'Polish', 'AI', 'Dictionary'] },
  { label: 'Setup', tabs: ['General', 'About'] },
]

export default function SettingsApp() {
  const [tab, setTab] = useState<Tab>('Dashboard')

  return (
    <div className="flex h-screen bg-paper text-ink select-none font-sans relative">
      {/* Drag strip — full window width, top 32px. Without an explicit
          -webkit-app-region drag area, hiddenInset windows can't be
          moved when focused (the renderer captures the click before the
          OS does). Buttons inside the sidebar sit BELOW this strip in
          z-order so they remain clickable. */}
      <div
        className="absolute top-0 left-0 right-0 h-8 z-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <aside className="w-[204px] bg-cream2 border-r border-line pt-9 px-3 flex flex-col shrink-0">
        <div className="flex items-center px-1 pb-4 mb-3 border-b border-line">
          <Wordmark size="inline" />
        </div>

        <nav className="flex flex-col gap-4">
          {GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {group.label && (
                <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-ink-45 px-2.5 pb-1.5">
                  {group.label}
                </div>
              )}
              {group.tabs.map((t) => {
                const on = tab === t
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    aria-current={on ? 'page' : undefined}
                    className={[
                      'text-left px-2.5 py-[7px] rounded-[9px] text-[12.5px] transition-colors duration-150',
                      on ? 'bg-ink text-paper' : 'text-ink-60 hover:text-ink hover:bg-ink/[0.05]',
                    ].join(' ')}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <span
                        className={`w-1 h-1 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-ink/20'}`}
                      />
                      {t}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* The sidebar used to end with an "on-device" status dot. It
            was not a control and never changed — a permanent label for a
            fact the user cannot act on, sitting in the corner drawing the
            eye on every visit. */}
      </aside>

      {/* Each tab owns its own SectionHead. The shell used to render an
          h1 + subtitle here AND every tab rendered a hero headline under
          it — two big serif lines back to back saying the same thing. */}
      <main className="flex-1 overflow-auto px-9 pt-11 pb-12">
        {tab === 'Dashboard' && <HistoryTab />}
        {tab === 'Hotkey' && <HotkeysTab />}
        {tab === 'Polish' && <PolishTab />}
        {tab === 'AI' && <AITab />}
        {tab === 'Dictionary' && <DictionaryTab />}
        {tab === 'General' && <GeneralTab />}
        {tab === 'About' && <AboutTab />}
      </main>
    </div>
  )
}
