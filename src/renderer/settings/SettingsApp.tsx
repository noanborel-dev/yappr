import { useState } from 'react'
import GeneralTab from './tabs/GeneralTab'
import HotkeysTab from './tabs/HotkeysTab'
import DictionaryTab from './tabs/DictionaryTab'
import PolishTab from './tabs/PolishTab'
import AITab from './tabs/AITab'
import HistoryTab from './tabs/HistoryTab'
import { Wordmark } from '../shared/ui/Wordmark'
import { NavIcon, type NavIconName } from './NavIcon'

const TABS = ['Dashboard', 'Hotkey', 'Polish', 'AI', 'Dictionary', 'Settings'] as const
type Tab = typeof TABS[number]

// Grouped rather than run together. The old flat list mixed "what Yappr
// does with your voice" (Polish, AI, Dictionary) with "how Yappr is wired
// up" (General, About) in one undifferentiated column, so nothing in it
// told you where to look for anything.
// About is gone — it was a page of links wrapped around two things that
// belong with the other preferences, so its license card and log-file
// row moved into Settings rather than being deleted with the tab.
//
// Settings sits alone at the bottom, away from the voice pages. It is
// the only entry you visit to configure the machine rather than the
// writing.
const ICONS: Record<Tab, NavIconName> = {
  Dashboard: 'dashboard',
  Hotkey: 'hotkey',
  Polish: 'polish',
  AI: 'ai',
  Dictionary: 'dictionary',
  Settings: 'settings',
}

const GROUPS: Array<{ label: string | null; tabs: Tab[] }> = [
  { label: null, tabs: ['Dashboard'] },
  { label: 'Voice', tabs: ['Hotkey', 'Polish', 'AI', 'Dictionary'] },
  { label: null, tabs: ['Settings'] },
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
                <div className="text-[11px] text-ink-45 px-2.5 pb-1.5">
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
                      // Heavier and darker than before. At 12.5px in
                      // ink-60 the inactive rows read as disabled next to
                      // a solid black active pill; medium weight at full
                      // ink makes the list look navigable rather than
                      // greyed out.
                      'text-left px-2.5 py-[7px] rounded-[9px] text-[13px] font-medium transition-colors duration-150',
                      on ? 'bg-ink text-paper' : 'text-ink hover:bg-ink/[0.05]',
                    ].join(' ')}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <span className={on ? 'text-paper' : 'text-ink-45'}>
                        <NavIcon name={ICONS[t]} />
                      </span>
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
      {/* `key={tab}` remounts on every switch, so the entrance replays
          rather than firing once on first paint. Switching tabs was
          instantaneous and therefore felt like nothing happened; 380ms of
          rise is enough to register as a change of place without being a
          wait. */}
      <main key={tab} className="flex-1 overflow-auto px-9 pt-11 pb-12 animate-stepIn">
        {tab === 'Dashboard' && <HistoryTab />}
        {tab === 'Hotkey' && <HotkeysTab />}
        {tab === 'Polish' && <PolishTab />}
        {tab === 'AI' && <AITab />}
        {tab === 'Dictionary' && <DictionaryTab />}
        {tab === 'Settings' && <GeneralTab />}
      </main>
    </div>
  )
}
