import { useEffect, useState } from 'react'
import type { Settings, Provider, LocalModelId } from '../../../shared/types'
import type { LocalModelProgress, LocalModelReadiness } from '../../global'
import { MODELS } from '../../../shared/constants'
import { Pill } from '../../shared/ui/Pill'
import { Toggle } from '../../shared/ui/Toggle'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { Panel, SettingRow } from '../../shared/ui/Panel'
import { BrandLogo } from '../../shared/ui/BrandLogo'

interface LocalModelMeta {
  id: LocalModelId
  name: string
  speed: string
  size: string
  description: string
  recommended?: boolean
}

const LOCAL_MODEL_META: LocalModelMeta[] = [
  { id: 'parakeet-tdt-0.6b-v3', name: 'Instant', speed: '~25 ms', size: '339 MB', description: 'NVIDIA Parakeet. ~30× faster than Accurate at matching English quality. English + 24 European languages.', recommended: true },
  { id: 'base', name: 'Fast', speed: '~100 ms', size: '57 MB', description: 'Tiny and ultra-fast. Multilingual. Some mistakes on technical terms.' },
  { id: 'small', name: 'Balanced', speed: '~200 ms', size: '181 MB', description: 'Sub-300ms warm. Multilingual. Near-perfect for English dictation.' },
  { id: 'large-v3-turbo', name: 'Accurate', speed: '~1000 ms', size: '547 MB', description: 'Best on rarer languages. Whisper pads every clip to 30s, so short clips cost the same as long ones.' },
]

interface ProviderInfo {
  value: Provider
  name: string
  model: string
  description: string
  price: string
}

const PROVIDERS: ProviderInfo[] = [
  { value: 'local', name: 'On this Mac', model: 'whisper / parakeet (on-device)', description: 'Runs locally. Offline, free, no keys.', price: 'free · offline' },
  { value: 'groq', name: 'Groq', model: 'whisper-large-v3-turbo', description: 'Fastest cloud Whisper. The free tier covers most people.', price: 'free tier' },
]

export default function AIProviderTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [localReadiness, setLocalReadiness] = useState<LocalModelReadiness | null>(null)
  const [localProgress, setLocalProgress] = useState<Record<string, LocalModelProgress>>({})
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({})

  function refreshStatus() {
    window.yappr.getLocalModelStatus().then((s) => {
      setLocalReadiness(s.readiness)
      setDownloaded(s.downloaded)
      const seed: Record<string, LocalModelProgress> = {}
      for (const p of s.progress) seed[p.modelId] = p
      setLocalProgress(seed)
    })
  }

  useEffect(() => {
    window.yappr.getSettings().then(setSettings)
    refreshStatus()
    const off = window.yappr.onLocalModelProgress((p) => {
      setLocalProgress((prev) => ({ ...prev, [p.modelId]: p }))
      if (p.status === 'done') refreshStatus()
    })
    return off
  }, [])

  if (!settings) return <div className="text-ink-45 text-sm">Loading…</div>

  const { provider } = settings.provider

  async function save(partial: Partial<Settings['provider']>) {
    if (!settings) return
    const updated = { ...settings.provider, ...partial }
    await window.yappr.setSettings({ provider: updated })
    setSettings({ ...settings, provider: updated })
    setTestResult(null)
  }

  async function testKey() {
    if (!settings) return
    setTesting(true)
    setTestResult(null)
    const result = await window.yappr.testProvider('groq', settings.provider.groqKey)
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        ord="06"
        label="Provider"
        headline={<>Your keys, your <em className="italic">audio</em>.</>}
        body="Audio goes from your mic to the provider you pick. Yappr's servers are not in the path."
      />

      <GroupLabel>Transcription</GroupLabel>
      <div className="space-y-2 mb-6">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            onClick={() => save({
              provider: p.value,
              transcriptionModel: MODELS[p.value].transcription,
              cleanupModel: MODELS[p.value].cleanup,
            })}
            className={[
              'w-full text-left bg-card border rounded-card px-4 py-3.5 transition-all duration-150',
              p.value === provider
                ? 'border-ink ring-1 ring-ink'
                : 'border-line hover:border-ink-45',
            ].join(' ')}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                   style={{ background: p.value === 'local' ? '#0E1118' : '#F55036' }}>
                {p.value === 'local'
                  ? <MarkGlyph />
                  : <BrandLogo brand="groq" size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13.5px] font-semibold">{p.name}</span>
                  <span className="text-[10.5px] font-mono text-ink-45 truncate">{p.model}</span>
                </div>
                <div className="text-[11px] text-ink-60 mt-0.5">{p.description}</div>
              </div>
              <span className="text-[10.5px] font-mono text-ink-45 mr-1 shrink-0">{p.price}</span>
              <Radio on={p.value === provider} />
            </div>
          </button>
        ))}
      </div>

      {provider === 'local' && (
        <>
          <GroupLabel>On-device model</GroupLabel>
          <LocalModelPanel
            readiness={localReadiness}
            progress={localProgress}
            downloaded={downloaded}
            selectedModel={settings.provider.localModel}
            onSelectModel={(id) => save({ localModel: id })}
          />
          {downloaded['large-v3-turbo'] && (
            <Panel className="mt-2 mb-6">
              <SettingRow
                title="Smart-switch to Accurate"
                desc="Use the Accurate tier automatically where it pays for itself: code editors always, email over 8s, docs over 12s, anything over 20s. Short casual dictations stay on your tier."
                last
              >
                <Toggle
                  on={settings.provider.localAutoAccurateInCode !== false}
                  onChange={(v) => save({ localAutoAccurateInCode: v })}
                  label="Smart-switch to Accurate"
                />
              </SettingRow>
            </Panel>
          )}
        </>
      )}

      <GroupLabel className="mt-6">
        Cleanup key {provider === 'local' && <span className="text-ink-45 normal-case tracking-normal font-sans">— optional</span>}
      </GroupLabel>
      <Panel>
        <div className="px-5 py-4">
          <div className="flex items-stretch gap-2">
            <input
              type="password"
              value={settings.provider.groqKey}
              onChange={(e) => save({ groqKey: e.target.value })}
              placeholder="gsk_…"
              className="flex-1 bg-paper border border-line rounded-input px-3 py-2.5 text-[12.5px] font-mono placeholder:text-ink-45 focus:outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt-soft"
            />
            <Pill
              variant={testResult?.ok ? 'ok' : 'primary'}
              size="sm"
              onClick={testKey}
              disabled={testing || !settings.provider.groqKey}
            >
              {testing ? '…' : testResult?.ok ? 'Connected' : 'Test'}
            </Pill>
          </div>

          <div className="flex items-start justify-between gap-4 mt-3">
            <p className="text-[11px] text-ink-60 leading-relaxed max-w-[52ch]">
              {provider === 'local'
                ? 'Transcription runs on your Mac either way. A key adds the cleanup pass — register, list formatting, prompt shaping. Without one you get the deterministic fixes only.'
                : 'Used for transcription and cleanup. Stored on this Mac, never sent to a Yappr server.'}
              {' '}
              <button
                onClick={() => window.open('https://console.groq.com', '_blank')}
                className="text-ink-60 hover:text-ink underline underline-offset-2"
              >
                Get a free key ↗
              </button>
            </p>
            {testResult && !testResult.ok && (
              <span className="text-[11px] font-medium text-danger shrink-0">
                {testResult.error}
              </span>
            )}
          </div>
        </div>
      </Panel>

      <p className="text-[10.5px] text-ink-45 mt-4 leading-relaxed">
        {provider === 'local'
          ? 'Audio never leaves your device for transcription. Models live in your user-data folder.'
          : 'Keys are stored on this Mac in the app’s settings file.'}
      </p>
    </div>
  )
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={[
        'w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
        on ? 'bg-ink border-ink' : 'border-line',
      ].join(' ')}
    >
      {on && <span className="w-1.5 h-1.5 rounded-full bg-paper" />}
    </span>
  )
}

// The brand mark, tile-sized: a red dot and the italic serif, on the same
// charcoal the notch is drawn in.
function MarkGlyph() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-[5px] h-[5px] rounded-full"
        style={{ background: '#E84A3A', boxShadow: '0 0 5px rgba(232,74,58,.6)' }}
      />
      <span
        className="text-white leading-none"
        style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: 'italic', fontSize: 13 }}
      >
        Yappr
      </span>
    </span>
  )
}

function LocalModelPanel({
  readiness,
  progress,
  downloaded,
  selectedModel,
  onSelectModel,
}: {
  readiness: LocalModelReadiness | null
  progress: Record<string, LocalModelProgress>
  downloaded: Record<string, boolean>
  selectedModel: LocalModelId
  onSelectModel: (id: LocalModelId) => void
}) {
  if (!readiness) {
    return (
      <Panel>
        <div className="px-5 py-4 text-[11.5px] text-ink-45">Loading model status…</div>
      </Panel>
    )
  }

  if (!readiness.ffmpeg) {
    return (
      <div className="bg-card border border-danger/40 rounded-card px-5 py-4">
        <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-danger mb-1.5">
          ffmpeg not found
        </div>
        <p className="text-[11.5px] text-ink-60 leading-relaxed">
          Run <code className="font-mono">npm install</code> to pull{' '}
          <code className="font-mono">@ffmpeg-installer/ffmpeg</code>, or reinstall Yappr.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {LOCAL_MODEL_META.map((m) => (
        <LocalModelCard
          key={m.id}
          meta={m}
          selected={selectedModel === m.id}
          downloaded={!!downloaded[m.id]}
          progress={progress[m.id]}
          onSelect={() => onSelectModel(m.id)}
        />
      ))}
    </div>
  )
}

function LocalModelCard({
  meta,
  selected,
  downloaded,
  progress,
  onSelect,
}: {
  meta: LocalModelMeta
  selected: boolean
  downloaded: boolean
  progress: LocalModelProgress | undefined
  onSelect: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloading = progress?.status === 'starting' || progress?.status === 'downloading'
  const pct = downloading && progress!.totalBytes > 0
    ? Math.min(100, (progress!.receivedBytes / progress!.totalBytes) * 100)
    : 0

  async function startDownload(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    setError(null)
    const result = await window.yappr.downloadLocalModel(meta.id)
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Download failed')
  }

  async function uninstall(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    setError(null)
    await window.yappr.uninstallLocalModel(meta.id)
    setBusy(false)
  }

  // A <div> rather than a <button>: a disabled button swallows clicks on
  // the Download pill inside it.
  const canSelect = downloaded
  return (
    <div
      role={canSelect ? 'button' : undefined}
      tabIndex={canSelect ? 0 : -1}
      onClick={canSelect ? onSelect : undefined}
      onKeyDown={canSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() } : undefined}
      className={[
        'bg-card border rounded-card px-4 py-3.5 transition-all duration-150',
        selected
          ? 'border-ink ring-1 ring-ink'
          : canSelect
            ? 'border-line hover:border-ink-45 cursor-pointer'
            : 'border-line',
      ].join(' ')}
    >
      <div className="flex items-center gap-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold">{meta.name}</span>
            <span className="text-[10.5px] font-mono text-ink-45">
              {meta.speed} · {meta.size}
            </span>
            {meta.recommended && (
              <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                recommended
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-60 mt-1 leading-snug">{meta.description}</div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {downloading ? (
            <>
              <span className="text-[10.5px] font-mono text-ink-45 tabular-nums">
                {pct.toFixed(0)}%
              </span>
              <Pill variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); window.yappr.cancelLocalModel() }}>
                Cancel
              </Pill>
            </>
          ) : downloaded ? (
            <Pill variant="ghost" size="sm" onClick={uninstall} disabled={busy}>
              {busy ? '…' : 'Remove'}
            </Pill>
          ) : (
            <Pill variant="primary" size="sm" onClick={startDownload} disabled={busy}>
              {busy ? '…' : 'Download'}
            </Pill>
          )}
          {downloaded && <Radio on={selected} />}
        </div>
      </div>

      {downloading && (
        <div className="h-1 bg-ink/[0.06] rounded-full overflow-hidden mt-3">
          <div className="h-full bg-cobalt transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <p className="text-[11px] text-danger mt-2.5">{error}</p>}
    </div>
  )
}
