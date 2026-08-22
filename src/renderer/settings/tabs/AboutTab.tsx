import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import type { AppInfo } from '../../global'
import { Wordmark } from '../../shared/ui/Wordmark'
import { Pill } from '../../shared/ui/Pill'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { Panel, SettingRow } from '../../shared/ui/Panel'

export default function AboutTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.yappr.getSettings().then(setSettings)
    window.yappr.getAppInfo().then(setInfo)
  }, [])

  const version = info?.version ?? '—'

  return (
    <div className="max-w-[720px]">
      <SectionHead
        headline={<>Yappr <em className="italic">{version}</em>.</>}
        body="Version, license, and where to look when something goes wrong."
      />

      <div className="flex items-center gap-5 bg-card border border-line rounded-card px-6 py-5 mb-6">
        <Wordmark size="hero" />
        <div className="flex-1 min-w-0">
          {/* Read from the running app. This line used to be three string
              literals — "v0.1.0 · Build 218 · macOS arm64" — which were
              wrong the moment any of them changed, and would have shipped
              "arm64" to every Intel Mac. */}
          <div className="text-[11.5px] font-mono text-ink-60">
            v{version} · macOS {info?.arch ?? '—'}
            {info && !info.packaged && ' · dev'}
          </div>
          <div className="flex items-center gap-1.5 mt-2.5">
            <Tag>BYOK</Tag>
            <Tag>no telemetry</Tag>
          </div>
        </div>
        <Pill variant="secondary" onClick={() => window.open('https://yappr.app/download', '_blank')}>
          Check for updates
        </Pill>
      </div>

      {/* The privacy story was told three times on this tab: a flow
          diagram with a struck-through "Yappr servers" node, then the
          same sentence under it, then the same sentence again at the
          bottom of the page. It's one sentence. */}
      <p className="text-[12px] text-ink-60 leading-relaxed mb-6 max-w-[64ch]">
        Your voice is transcribed on this Mac and never leaves it. Cleanup text goes
        to Groq. Yappr never sees or stores your audio, your transcripts, or your keys
        on any server we control.
      </p>

      <GroupLabel>License</GroupLabel>
      <LicenseCard settings={settings} onChange={setSettings} />

      <GroupLabel className="mt-6">Diagnostics</GroupLabel>
      <Panel className="mb-6">
        <SettingRow title="Log file" desc="Every error the app has recorded, in plain text." last>
          <Pill variant="secondary" size="sm" onClick={() => window.yappr.revealLog()}>
            Reveal in Finder ↗
          </Pill>
        </SettingRow>
      </Panel>

      <GroupLabel>Links</GroupLabel>
      <Panel className="mb-6">
        <LinkRow href="https://yappr.app" label="yappr.app" />
        <LinkRow href="https://yappr.app/privacy" label="Privacy policy" />
        <LinkRow href="https://yappr.app/licenses" label="Third-party licenses" last />
      </Panel>

      <p className="text-[10px] text-ink-45 leading-relaxed">
        Built with Llama. Llama 3 is licensed under the Llama 3 Community License,
        Copyright © Meta Platforms, Inc. Slack, Gmail, iMessage, Notion, Cursor,
        ChatGPT, Claude, Groq, Llama and Whisper are trademarks of their respective
        owners. Yappr is not affiliated with or endorsed by these companies.
      </p>
    </div>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'ok' }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-[9.5px] font-mono uppercase tracking-[0.14em]',
        tone === 'ok' ? 'bg-ok/10 text-ok' : 'bg-ink/[0.06] text-ink-60',
      ].join(' ')}
    >
      {tone === 'ok' && <span className="w-1.5 h-1.5 rounded-full bg-ok" />}
      {children}
    </span>
  )
}

function LinkRow({ href, label, last }: { href: string; label: string; last?: boolean }) {
  return (
    <button
      onClick={() => window.open(href, '_blank')}
      className={[
        'w-full flex items-center justify-between px-5 py-3 text-[12px] text-left transition-colors hover:bg-paper/60',
        last ? '' : 'border-b border-line-soft',
      ].join(' ')}
    >
      <span>{label}</span>
      <span className="text-ink-45">↗</span>
    </button>
  )
}

// Interest capture plus a real persistence path: Stripe isn't live, so
// nothing validates, but a key pasted today is in place for the launch.
// The old card carried three buttons (Save / Remove / Notify me) and two
// paragraphs to say that.
function LicenseCard({
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
