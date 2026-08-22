// Lifted out of the About tab, which no longer exists.
//
// About was a page of links wrapped around two things people actually
// need — the license and the log file — so deleting the tab meant moving
// those rather than losing them. Activation in particular is not
// something to strand behind a removed nav entry on a paid product.

import { useEffect, useState } from 'react'
import type { Settings } from '../../shared/types'
import { Pill } from '../shared/ui/Pill'
import { Panel, SettingRow } from '../shared/ui/Panel'

export function LicenseCard({
  settings,
  onChange,
}: {
  settings: Settings | null
  onChange: (s: Settings) => void
}) {
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(settings?.licenseKey ?? '')
  }, [settings?.licenseKey])

  if (!settings) return null

  const stored = settings.licenseKey ?? ''
  const dirty = draft.trim() !== stored.trim()

  async function save() {
    if (!settings) return
    const key = draft.trim()
    await window.yappr.setSettings({ licenseKey: key })
    onChange({ ...settings, licenseKey: key })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <Panel>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[13px] font-semibold">Lifetime license</div>
          <span className="px-2 py-0.5 rounded-pill bg-ink/[0.06] text-ink-60 text-[9.5px] font-mono uppercase tracking-[0.14em]">
            not live yet
          </span>
        </div>
        <p className="text-[11.5px] text-ink-60 leading-relaxed mb-3 max-w-[62ch]">
          Everything in Yappr today is free. When Lifetime launches you&rsquo;ll get a
          one-time key by email — paste it here and it activates.
        </p>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your license key…"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-paper border border-line rounded-input px-3 py-2 text-[12px] font-mono placeholder:text-ink-45 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <Pill
            variant={saved ? 'ok' : 'primary'}
            size="sm"
            onClick={save}
            disabled={!dirty || draft.trim().length === 0}
          >
            {saved ? 'Saved' : 'Save'}
          </Pill>
        </div>
        {stored.length > 0 && !dirty && (
          <p className="text-[10.5px] font-mono text-ink-45 mt-2.5">
            Stored on this Mac. It&rsquo;ll be validated when activation ships.
          </p>
        )}
      </div>
    </Panel>
  )
}
