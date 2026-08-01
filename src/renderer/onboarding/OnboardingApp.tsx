import { useEffect, useMemo, useRef, useState } from 'react'
import groqLogo from '../shared/logos/groq.png'
import type { CategoryStrictness, LocalModelId, Provider, Settings, Strictness } from '../../shared/types'
import type { LocalModelProgress, LocalModelReadiness } from '../global'
import { MODELS, DEFAULT_LOCAL_MODEL_ID } from '../../shared/constants'
import { Pill } from '../shared/ui/Pill'
import { Card } from '../shared/ui/Card'
import { Wordmark } from '../shared/ui/Wordmark'
import { BrandLogo } from '../shared/ui/BrandLogo'

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

const TOTAL_STEPS: Step = 9

function eventToSingleKey(e: KeyboardEvent): string | null {
  const code = e.code
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL'
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT'
  if (code === 'MetaLeft' || code === 'MetaRight') return 'META'
  if (e.key.length === 1) return e.key.toUpperCase()
  if (/^F\d{1,2}$/.test(e.key)) return e.key.toUpperCase()
  return null
}

function prettifyKey(name: string): string {
  if (name === 'CTRL') return '⌃ Ctrl'
  if (name === 'ALT') return '⌥ Option'
  if (name === 'SHIFT') return '⇧ Shift'
  if (name === 'META') return '⌘ Command'
  return name
}

export default function OnboardingApp() {
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [hotkey, setHotkey] = useState<string>('CTRL')
  const [listening, setListening] = useState(false)
  // Two providers: Local (on-device whisper.cpp) and Groq (cloud).
  // Matches the Settings → Provider tab.
  const [provider, setProvider] = useState<Provider>('local')
  const [localModel, setLocalModel] = useState<LocalModelId>(DEFAULT_LOCAL_MODEL_ID)
  const [groqKey, setGroqKey] = useState('')
  const [emojiInMessages, setEmojiInMessages] = useState(false)
  const [strictness, setStrictness] = useState<CategoryStrictness>({
    personal: 1,
    work: 3,
    writing: 2,
  })
  const [micGranted, setMicGranted] = useState(false)
  const [accessibilityGranted, setAccessibilityGranted] = useState(false)
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [inputDeviceId, setInputDeviceId] = useState<string | null>(null)

  // Poll real OS permission state while on the permissions step. Stops as
  // soon as both are granted or the user moves on.
  useEffect(() => {
    if (step !== 2) return
    let cancelled = false
    async function tick() {
      const [mic, acc] = await Promise.all([
        window.yappr.getMicPermissionStatus(),
        window.yappr.isAccessibilityTrusted(),
      ])
      if (cancelled) return
      setMicGranted(mic === 'granted')
      setAccessibilityGranted(acc)
    }
    tick()
    const id = window.setInterval(tick, 750)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [step])

  // Once mic is granted, enumerate available input devices and load the
  // user's saved choice (if any). Browsers only return real device labels
  // after the permission grant, so this can't run until micGranted flips.
  useEffect(() => {
    if (!micGranted) return
    let cancelled = false
    Promise.all([
      navigator.mediaDevices.enumerateDevices(),
      window.yappr.getSettings(),
    ]).then(([devices, settings]) => {
      if (cancelled) return
      const mics = devices.filter((d) => d.kind === 'audioinput')
      setMicDevices(mics)
      // If saved deviceId still exists, keep it. Otherwise fall back to
      // null (= system default) and let the user choose explicitly.
      const saved = settings.inputDeviceId
      const stillAvailable = saved && mics.some((m) => m.deviceId === saved)
      setInputDeviceId(stillAvailable ? saved : null)
    })
    return () => { cancelled = true }
  }, [micGranted])

  function handleSelectMic(id: string | null) {
    setInputDeviceId(id)
    window.yappr.setSettings({ inputDeviceId: id })
  }

  // Capture-key listener for the hotkey step.
  useEffect(() => {
    if (!listening) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      const next = eventToSingleKey(e)
      if (!next) return
      setHotkey(next)
      setListening(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [listening])

  function next() {
    setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as Step) : s))
  }
  function back() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s))
  }

  async function handleRequestMic() {
    const ok = await window.yappr.requestMicPermission()
    setMicGranted(ok)
  }

  async function handleOpenAccessibility() {
    // This triggers the macOS prompt; the polling effect above will pick
    // up the actual grant once the user toggles it in System Settings.
    await window.yappr.openAccessibilitySettings()
  }

  async function handleSaveProvider() {
    setSaving(true)
    // Even when transcription is Local, cleanup still needs an LLM, so
    // we always persist the Groq key. localModel stores the picked
    // model tier separately.
    await window.yappr.setSettings({
      provider: {
        provider,
        groqKey: groqKey.trim(),
        transcriptionModel: MODELS[provider].transcription,
        cleanupModel: MODELS[provider].cleanup,
        localModel,
      },
    })
    setSaving(false)
    next()
  }

  async function handleFinish() {
    const partial: Partial<Settings> = {
      hotkeys: { pushToTalk: hotkey },
      strictness,
      emojiInMessages,
      firstRun: false,
    }
    await window.yappr.setSettings(partial)
    window.yappr.reloadHotkeys()
    window.close()
  }

  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col relative overflow-hidden">
      {/* OS drag strip — full width, top 32px. Required for hiddenInset
          windows; without it the renderer captures clicks and the
          window can't be moved when focused. */}
      <div
        className="absolute top-0 left-0 right-0 h-8 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {/* Drifting volt blob — soft, slow, decorative. Adds depth without
          stealing focus. Sits behind everything via -z-10. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-volt opacity-[0.07] blur-3xl animate-bgDrift -z-10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full bg-volt opacity-[0.05] blur-3xl animate-bgDrift -z-10"
        style={{ animationDelay: '-11s' }}
      />

      {/* Header sits below the macOS traffic-light strip (drag area is
          h-8 / 32px above this). Left padding reserves room for the
          traffic lights at { x: 14, y: 14 } so the wordmark doesn't
          collide with them. */}
      <header className="pl-[88px] pr-6 pt-5 flex items-center justify-between">
        <div className="inline-flex items-center gap-3">
          <Wordmark size="button" />
          <span className="font-mono text-[10.5px] text-ink-45 tabular-nums">
            {String(step).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}
          </span>
        </div>
        {step > 1 && (
          <button onClick={back} className="text-[11.5px] text-ink-45 hover:text-ink transition-colors">
            ← back
          </button>
        )}
      </header>

      {/* Re-key on step change so the stepIn animation replays each step. */}
      <main key={step} className="flex-1 flex flex-col justify-center px-14 pb-12 pt-4 animate-stepIn">
        {step === 1 && (
          <StepWelcome onContinue={next} />
        )}

        {step === 2 && (
          <StepPermissions
            micGranted={micGranted}
            accessibilityGranted={accessibilityGranted}
            onRequestMic={handleRequestMic}
            onOpenAccessibility={handleOpenAccessibility}
            onContinue={next}
            micDevices={micDevices}
            inputDeviceId={inputDeviceId}
            onSelectMic={handleSelectMic}
          />
        )}

        {step === 3 && (
          <StepProvider
            provider={provider}
            onProviderChange={setProvider}
            localModel={localModel}
            onLocalModelChange={setLocalModel}
            groqKey={groqKey}
            onGroqKeyChange={setGroqKey}
            saving={saving}
            onContinue={handleSaveProvider}
          />
        )}

        {step === 4 && (
          <StepHotkey
            hotkey={hotkey}
            listening={listening}
            onToggleListen={() => setListening((l) => !l)}
            onContinue={next}
          />
        )}

        {step === 5 && (
          <StepStrictness
            value={strictness}
            onChange={setStrictness}
            emojiInMessages={emojiInMessages}
            onEmojiChange={setEmojiInMessages}
            onContinue={next}
          />
        )}

        {step === 6 && <StepPillTour onContinue={next} />}

        {step === 7 && <StepRewriteMode onContinue={next} />}

        {step === 8 && <StepAICoding onContinue={next} />}

        {step === 9 && (
          <StepDone hotkey={hotkey} onFinish={handleFinish} />
        )}
      </main>
    </div>
  )
}

// ─── Step 1: Welcome ────────────────────────────────────────────────

function StepWelcome({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <h1 className="text-[56px] leading-[0.95] tracking-tight mb-5">
        Meet <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">Yappr.</span>
      </h1>
      <p
        className="text-[14.5px] text-ink-60 leading-relaxed max-w-[420px] mb-8 animate-slideUp"
        style={{ animationDelay: '180ms' }}
      >
        Press a key. Say what you mean. We type it for you, formatted to match the app you're in.
      </p>
      <div className="animate-slideUp" style={{ animationDelay: '340ms' }}>
        <Pill variant="primary" onClick={onContinue}>
          Get started <span>→</span>
        </Pill>
      </div>
    </>
  )
}

// ─── Step 2: Permissions ────────────────────────────────────────────

function StepPermissions({
  micGranted,
  accessibilityGranted,
  onRequestMic,
  onOpenAccessibility,
  onContinue,
  micDevices,
  inputDeviceId,
  onSelectMic,
}: {
  micGranted: boolean
  accessibilityGranted: boolean
  onRequestMic: () => void
  onOpenAccessibility: () => void
  onContinue: () => void
  micDevices: MediaDeviceInfo[]
  inputDeviceId: string | null
  onSelectMic: (id: string | null) => void
}) {
  const allGranted = micGranted && accessibilityGranted
  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-4">
        Grant <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">access.</span>
      </h1>
      <p
        className="text-[13.5px] text-ink-60 leading-relaxed max-w-[360px] mb-7 animate-slideUp"
        style={{ animationDelay: '140ms' }}
      >
        Yappr needs your microphone to hear you, and Accessibility so it can paste text into the focused app.
      </p>

      <div
        className="space-y-3 mb-7 max-w-[440px] animate-slideUp"
        style={{ animationDelay: '260ms' }}
      >
        <PermissionRow
          label="Microphone"
          hint="Hear what you say."
          granted={micGranted}
          onAction={onRequestMic}
          actionLabel="Allow"
          showLiveMic
          liveMicDeviceId={inputDeviceId}
        />
        {micGranted && micDevices.length > 0 && (
          <Card>
            <div className="px-4 py-3">
              <div className="text-[11.5px] text-ink-60 mb-2">
                Use this microphone
              </div>
              <div className="space-y-1.5">
                <MicChoice
                  label="System default"
                  hint="Whatever your Mac is set to use."
                  selected={inputDeviceId === null}
                  onClick={() => onSelectMic(null)}
                />
                {micDevices.map((d) => (
                  <MicChoice
                    key={d.deviceId}
                    label={d.label || 'Unnamed microphone'}
                    selected={inputDeviceId === d.deviceId}
                    onClick={() => onSelectMic(d.deviceId)}
                  />
                ))}
              </div>
            </div>
          </Card>
        )}
        <PermissionRow
          label="Accessibility"
          hint="Paste into the focused app."
          granted={accessibilityGranted}
          onAction={onOpenAccessibility}
          actionLabel="Open Settings"
        />
      </div>

      <div className="animate-slideUp" style={{ animationDelay: '420ms' }}>
        <Pill variant="primary" onClick={onContinue} disabled={!allGranted}>
          {allGranted ? 'Continue →' : 'Waiting for permissions…'}
        </Pill>
      </div>
    </>
  )
}

function MicChoice({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string
  hint?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left flex items-center gap-3 px-2.5 py-1.5 rounded-input transition-colors',
        selected ? 'bg-ink/5' : 'hover:bg-ink/[0.03]',
      ].join(' ')}
    >
      <span
        className={[
          'w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center',
          selected ? 'border-ink' : 'border-ink-45',
        ].join(' ')}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-ink" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] truncate">{label}</span>
        {hint && <span className="block text-[10.5px] text-ink-45">{hint}</span>}
      </span>
    </button>
  )
}

function PermissionRow({
  label,
  hint,
  granted,
  onAction,
  actionLabel,
  showLiveMic,
  liveMicDeviceId,
}: {
  label: string
  hint: string
  granted: boolean
  onAction: () => void
  actionLabel: string
  showLiveMic?: boolean
  liveMicDeviceId?: string | null
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div>
            <div className="text-[13px] font-medium">{label}</div>
            <div className="text-[11.5px] text-ink-45 mt-0.5">{hint}</div>
          </div>
          {granted && showLiveMic && <LiveMicMeter deviceId={liveMicDeviceId ?? null} />}
        </div>
        {granted ? (
          <span className="text-[12px] font-medium text-ok inline-flex items-center gap-1.5 animate-checkPop">
            <span className="inline-flex w-4 h-4 rounded-full bg-ok/15 items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" className="text-ok">
                <path d="M1.5 5.2 L4 7.5 L8.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Granted
          </span>
        ) : (
          <Pill variant="secondary" onClick={onAction}>
            {actionLabel}
          </Pill>
        )}
      </div>
    </Card>
  )
}

// Live mic level meter — proves to the user that we can actually hear
// them. Pure visual, doesn't store anything. Stops when unmounted.
// Re-mounts when deviceId changes so the meter follows the picker.
function LiveMicMeter({ deviceId }: { deviceId: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let cancelled = false

    async function start() {
      try {
        const constraints: MediaStreamConstraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) return
        ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        const c = canvasRef.current
        if (!c) return
        const draw = () => {
          if (cancelled) return
          analyser.getByteFrequencyData(data)
          const dpr = window.devicePixelRatio || 1
          const W = c.width = c.clientWidth * dpr
          const H = c.height = c.clientHeight * dpr
          const g = c.getContext('2d')
          if (!g) return
          g.clearRect(0, 0, W, H)
          const bars = 12
          const gap = 2 * dpr
          const barW = (W - gap * (bars - 1)) / bars
          for (let i = 0; i < bars; i++) {
            // Sample evenly across the freq spectrum we care about.
            const idx = Math.floor((i / bars) * (data.length * 0.6))
            const v = data[idx] / 255   // 0..1
            const h = Math.max(2 * dpr, v * H)
            const x = i * (barW + gap)
            const y = (H - h) / 2
            g.fillStyle = '#2B7FFF'
            g.fillRect(x, y, barW, h)
          }
          raf = requestAnimationFrame(draw)
        }
        draw()
      } catch {
        // user rejected permission or device unavailable — silently no-op
      }
    }
    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
      if (ctx) ctx.close().catch(() => {})
    }
  }, [deviceId])
  return (
    <canvas
      ref={canvasRef}
      className="w-[88px] h-6 rounded"
      aria-label="live microphone level"
    />
  )
}

// ─── Step 3: Provider ───────────────────────────────────────────────

interface ProviderInfo {
  value: Provider
  name: string
  model: string
  description: string
  price: string
  keyPlaceholder: string
  keyHint: string
  brand: 'groq' | 'local'
}

const ONBOARDING_PROVIDERS: ProviderInfo[] = [
  { value: 'local', brand: 'local', name: 'Local',  model: 'Parakeet TDT (on-device)', description: 'Runs on your Mac. Offline, free, no keys. ~339MB download.', price: 'free, offline', keyPlaceholder: '',      keyHint: '' },
  { value: 'groq',  brand: 'groq',  name: 'Groq',   model: 'whisper-large-v3-turbo', description: 'Fastest cloud Whisper. Free tier covers most users.',          price: 'free tier',     keyPlaceholder: 'gsk_…', keyHint: 'console.groq.com' },
]

function StepProvider({
  provider,
  onProviderChange,
  localModel,
  onLocalModelChange,
  groqKey,
  onGroqKeyChange,
  saving,
  onContinue,
}: {
  provider: Provider
  onProviderChange: (p: Provider) => void
  localModel: LocalModelId
  onLocalModelChange: (id: LocalModelId) => void
  groqKey: string
  onGroqKeyChange: (s: string) => void
  saving: boolean
  onContinue: () => void
}) {
  // Local-model state mirrors the Settings tab — readiness drives
  // whether the user can advance. Per-model progress map lets each
  // card render its own state.
  const [localReadiness, setLocalReadiness] = useState<LocalModelReadiness | null>(null)
  const [localProgress, setLocalProgress] = useState<Record<string, LocalModelProgress>>({})
  const [localDownloaded, setLocalDownloaded] = useState<Record<string, boolean>>({})
  useEffect(() => {
    function refresh() {
      window.yappr.getLocalModelStatus().then((s) => {
        setLocalReadiness(s.readiness)
        setLocalDownloaded(s.downloaded)
        const seed: Record<string, LocalModelProgress> = {}
        for (const p of s.progress) seed[p.modelId] = p
        setLocalProgress(seed)
      })
    }
    refresh()
    const off = window.yappr.onLocalModelProgress((p) => {
      setLocalProgress((prev) => ({ ...prev, [p.modelId]: p }))
      if (p.status === 'done') refresh()
    })
    return off
  }, [])

  // Groq cloud → Groq key. Local → no field shown (model panel below
  // handles it). Cleanup always uses the Groq key, but for the
  // onboarding flow we only surface it when the user picks cloud Groq.
  const keyValue  = provider === 'groq' ? groqKey         : ''
  const keyChange = provider === 'groq' ? onGroqKeyChange : () => {}
  const info = ONBOARDING_PROVIDERS.find((p) => p.value === provider)!
  // For Local: need ffmpeg available AND the user's chosen model
  // downloaded. The user might have downloaded `small.en` but selected
  // `base.en`, so we check the specific selected model's downloaded
  // state — not just any model.
  const ready = provider === 'local'
    ? Boolean(localReadiness?.ffmpeg && localDownloaded[localModel])
    : keyValue.trim().length > 0

  // Show the tier-picker by default only if the user already touched
  // it before (i.e. picked something other than the recommended
  // `small` tier in a previous session). Otherwise hide it behind a
  const tierMeta = ONBOARDING_MODELS.find((m) => m.id === localModel)!

  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-3">
        Pick your <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">provider.</span>
      </h1>
      <p
        className="text-[13.5px] text-ink-60 leading-relaxed max-w-[460px] mb-6 animate-slideUp"
        style={{ animationDelay: '120ms' }}
      >
        Local runs on your Mac. Groq runs in the cloud — faster, free for most users.
      </p>

      {/* Two big visual provider cards — no model names, no prices,
          no jargon. Just the human-language trade-off. */}
      <div
        className="grid grid-cols-2 gap-3 max-w-[560px] mb-5 animate-slideUp"
        style={{ animationDelay: '220ms' }}
      >
        {ONBOARDING_PROVIDERS.map((p) => {
          const selected = p.value === provider
          const friendlyBody = p.value === 'local'
            ? 'Runs on your Mac. Offline. No keys. Slightly slower than cloud.'
            : 'Cloud transcription. Free tier covers most users. Needs a key.'
          return (
            <button
              key={p.value}
              onClick={() => onProviderChange(p.value)}
              className={[
                'text-left bg-card border rounded-[16px] px-4 py-4 relative transition-[transform,border-color,box-shadow,background-color] duration-200',
                'hover:-translate-y-[2px] active:scale-[0.98]',
                selected
                  ? 'border-ink ring-1 ring-ink shadow-md'
                  : 'border-ink-08 hover:border-ink-45 hover:shadow-sm',
              ].join(' ')}
            >
              {/* Selection radio — pops in with spring easing when
                  this card becomes the selected one. */}
              <span className={[
                'absolute top-3.5 right-3.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors duration-200',
                selected ? 'bg-ink border-ink' : 'border-ink-08',
              ].join(' ')}>
                {selected && (
                  <span
                    key="dot"
                    className="w-1.5 h-1.5 rounded-full bg-paper animate-checkPop"
                  />
                )}
              </span>

              {/* Brand glyph + name on one line */}
              <div
                key={selected ? 'sel' : 'unsel'}
                className={['flex items-center gap-2.5 mb-2', selected ? 'animate-springScale origin-left' : ''].join(' ')}
              >
                {p.brand === 'local' ? (
                  <div className="flex items-center justify-center shrink-0">
                    <ProviderGlyph brand={p.brand} />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0"
                       style={{ background: providerTileColor(p.brand) }}>
                    <ProviderGlyph brand={p.brand} />
                  </div>
                )}
                <span className="text-[15px] font-semibold">{p.name}</span>
              </div>

              <div className="text-[11.5px] text-ink-60 leading-snug">
                {friendlyBody}
              </div>
            </button>
          )
        })}
      </div>

      {/* Per-provider configuration. For Local: the active model is
          auto-picked; users only see size details behind a disclosure.
          For Groq: just an API key field. */}
      <div
        key={provider}
        className="max-w-[560px] mb-5 animate-slideUp"
        style={{ animationDelay: '320ms' }}
      >
        {provider === 'local' ? (
          !localReadiness ? (
            <div className="text-[11px] text-ink-45">Loading model status…</div>
          ) : !localReadiness.ffmpeg ? (
            <div className="bg-card border border-danger/40 rounded-card px-4 py-3.5">
              <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-danger mb-1">ffmpeg not found</div>
              <p className="text-[11.5px] text-ink-60 leading-relaxed">
                Run <code className="font-mono">npm install</code> to pull <code className="font-mono">@ffmpeg-installer/ffmpeg</code>, or reinstall Yappr.
              </p>
            </div>
          ) : (
            <>
              {/* Active-tier summary — single compact row. Click to
                  download the model if it's not ready yet. Most users
                  see this card go from "Download" → "Ready" once. */}
              <ActiveTierRow
                meta={tierMeta}
                downloaded={!!localDownloaded[localModel]}
                progress={localProgress[localModel]}
              />

            </>
          )
        ) : (
          <>
            <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-45 mb-1.5">
              {info.name} API Key
            </div>
            <input
              type="password"
              value={keyValue}
              onChange={(e) => keyChange(e.target.value)}
              placeholder={info.keyPlaceholder}
              className="w-full bg-card border border-ink-08 rounded-input px-3 py-2.5 text-[13px] font-mono focus:outline-none focus:border-volt focus:ring-2 focus:ring-volt-muted"
            />
            <a
              onClick={() => window.open(`https://${info.keyHint}`, '_blank')}
              className="text-[11px] text-ink-45 hover:text-ink mt-2 inline-block cursor-pointer"
            >
              Get a key at {info.keyHint} ↗
            </a>
          </>
        )}
      </div>

      <div className="animate-slideUp" style={{ animationDelay: '440ms' }}>
        <Pill variant="primary" onClick={onContinue} disabled={saving || !ready}>
          {saving ? 'Saving…' : 'Continue →'}
        </Pill>
      </div>
    </>
  )
}

// Compact summary of the currently-active local model. Shows model
// name, size, status (downloaded / downloading / not yet), plus a
// disclosure toggle for changing tier. Keeps the provider step from
// looking like a form with 3 redundant choices stacked.
// Reports the single on-device model's download state. Not a chooser —
// there is only one model, so there is nothing to switch to.
function ActiveTierRow({
  meta, downloaded, progress,
}: {
  meta: OnboardingModelMeta
  downloaded: boolean
  progress: LocalModelProgress | undefined
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const downloading = progress?.status === 'starting' || progress?.status === 'downloading'
  const pct = (downloading && progress!.totalBytes > 0)
    ? Math.min(100, (progress!.receivedBytes / progress!.totalBytes) * 100)
    : 0
  async function startDownload() {
    setBusy(true); setError(null)
    const result = await window.yappr.downloadLocalModel(meta.id)
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Download failed')
  }
  return (
    <div className="bg-card border border-ink-08 rounded-card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[12.5px] font-semibold">{meta.name}</span>
            <span className="text-[10px] font-mono text-ink-45">{meta.size}</span>
            {meta.recommended && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-volt bg-volt-muted px-1.5 py-0.5 rounded">
                recommended
              </span>
            )}
          </div>
          <div className="text-[10.5px] text-ink-60 mt-0.5">{meta.hint}</div>
        </div>
        <div className="shrink-0">
          {downloading ? (
            <span className="text-[10.5px] font-mono text-ink-45">{pct.toFixed(0)}%</span>
          ) : downloaded ? (
            <span className="text-[10.5px] font-mono text-ok">✓ ready</span>
          ) : (
            <Pill variant="primary" onClick={startDownload} disabled={busy}>
              {busy ? '…' : 'Download'}
            </Pill>
          )}
        </div>
      </div>
      {downloading && (
        <div className="h-1 bg-ink-08 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-volt transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <p className="text-[10.5px] text-danger mt-2">✗ {error}</p>}
    </div>
  )
}

function ProviderGlyph({ brand }: { brand: 'groq' | 'local' }) {
  if (brand === 'local') {
    // Yappr indicator pill — local is the Yappr-native option.
    return (
      <svg viewBox="0 0 54 22" width="36" height="14">
        <defs>
          <linearGradient id="onb-pill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#12141a"/>
            <stop offset="100%" stopColor="#0e1016"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="54" height="22" rx="11" fill="url(#onb-pill)"/>
        <circle cx="11" cy="11" r="3.0" fill="#e84a3a"/>
        <rect x="22"   y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
        <rect x="26.5" y="3"   width="1.8" height="16" rx="0.9" fill="#5a8fe8"/>
        <rect x="31"   y="9"   width="1.8" height="4"  rx="0.9" fill="#5a8fe8"/>
        <rect x="35.5" y="5"   width="1.8" height="12" rx="0.9" fill="#5a8fe8"/>
        <rect x="40"   y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
      </svg>
    )
  }
  return (
    <img
      src={groqLogo}
      alt="Groq"
      style={{ height: 12, width: 'auto' }}
      draggable={false}
    />
  )
}

function providerTileColor(brand: 'groq' | 'local'): string {
  if (brand === 'local') return '#0E1118'
  return '#F55036'
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Onboarding-step version of the model picker. Same three-tier
// (Fast / Balanced / Accurate) layout as the Settings tab but laid
// out for the narrower onboarding column. Continue is gated on
// (ffmpeg available && the selected model is downloaded), checked by
// the parent — we just render UI.
interface OnboardingModelMeta {
  id: LocalModelId
  name: string
  speed: string
  size: string
  hint: string
  recommended?: boolean
}
const ONBOARDING_MODELS: OnboardingModelMeta[] = [
  { id: 'parakeet-tdt-0.6b-v3', name: 'Instant', speed: '~25 ms', size: '339 MB', hint: 'Near-instant, on-device. English + 24 European languages.' },
]


// ─── Step 4: Hotkey ────────────────────────────────────────────────
// Cycling Tap / Hold / Double-tap demo ported from the Hotkeys
// settings tab's ThreeBehaviors panel. Auto-plays each behavior so
// the user *learns* what the key does without having to perform it.
// The big "press to rebind" button stays — that's the only required
// action on this step.

function keyGlyphFor(name: string): string {
  if (name === 'CTRL') return '⌃'
  if (name === 'ALT') return '⌥'
  if (name === 'SHIFT') return '⇧'
  if (name === 'META') return '⌘'
  if (name === 'SPACE' || name === ' ') return 'space'
  return name.toLowerCase()
}

function StepHotkey({
  hotkey,
  listening,
  onToggleListen,
  onContinue,
}: {
  hotkey: string
  listening: boolean
  onToggleListen: () => void
  onContinue: () => void
}) {
  const glyph = keyGlyphFor(hotkey)

  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-3">
        One key. <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">three</span> behaviors.
      </h1>
      <p
        className="text-[13.5px] text-ink-60 leading-relaxed max-w-[460px] mb-5 animate-slideUp"
        style={{ animationDelay: '120ms' }}
      >
        Tap to toggle. Hold to push-to-talk. Double-tap to re-paste your last dictation.
      </p>

      {/* Rebind affordance — click to capture a new key. Compact so
          the cycling demo gets most of the visual real estate. */}
      <button
        type="button"
        onClick={onToggleListen}
        className={[
          'inline-flex items-center gap-3 bg-card border rounded-[14px] px-4 py-2.5 mb-5 transition-all duration-200 animate-slideUp',
          'hover:-translate-y-[1px] active:scale-[0.98]',
          listening ? 'border-volt shadow-sm' : 'border-ink-08 hover:border-ink-45',
        ].join(' ')}
        style={{ animationDelay: '240ms' }}
      >
        <span className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-45">
          Your key
        </span>
        <span className="font-display italic text-[20px] text-ink leading-none">
          {listening ? 'press any key…' : prettifyKey(hotkey)}
        </span>
        <span className="text-[10.5px] font-mono text-ink-45 ml-2">
          {listening ? '' : '↺ change'}
        </span>
      </button>

      {/* The cycling explanatory demo — same component grammar as the
          Hotkeys settings tab. */}
      <div className="animate-slideUp" style={{ animationDelay: '360ms' }}>
        <OnboardingThreeBehaviors glyph={glyph} />
      </div>

      <div className="mt-5 animate-slideUp" style={{ animationDelay: '500ms' }}>
        <Pill variant="primary" onClick={onContinue}>
          Got it <span>→</span>
        </Pill>
      </div>
    </>
  )
}

// ─── Cycling Tap / Hold / Double demo (ported from HotkeysTab) ────
//
// Each panel is one behavior. The active panel cycles every 4s — its
// keycap depresses on cue, ripple/hold-ring animations fire, and a
// MiniPill below the keycap transitions from "listening" → "pasted"
// during the panel's window.

type HKMode = 'tap' | 'hold' | 'double'

interface HKPanelState {
  pressed: boolean
  holding: boolean
  tapped: boolean
  pillVisible: boolean
  pillDone: boolean
}

const HK_INITIAL_PANEL: HKPanelState = {
  pressed: false,
  holding: false,
  tapped: false,
  pillVisible: false,
  pillDone: false,
}

const HK_PANELS: Array<{ mode: HKMode; ord: string; name: string; oneLiner: string }> = [
  { mode: 'tap',    ord: '01', name: 'Tap',        oneLiner: 'Toggle recording on. Tap again to stop.' },
  { mode: 'hold',   ord: '02', name: 'Hold',       oneLiner: 'Record while held. Release to finish.' },
  { mode: 'double', ord: '03', name: 'Double-tap', oneLiner: 'Paste your last dictation again.' },
]

function OnboardingThreeBehaviors({ glyph }: { glyph: string }) {
  const [active, setActive] = useState<HKMode>('tap')
  const [panels, setPanels] = useState<Record<HKMode, HKPanelState>>({
    tap: { ...HK_INITIAL_PANEL },
    hold: { ...HK_INITIAL_PANEL },
    double: { ...HK_INITIAL_PANEL, pillDone: true },
  })
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  function cleanup() {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }
  function schedule(fn: () => void, delay: number) {
    const t = setTimeout(fn, delay)
    timeoutsRef.current.push(t)
  }
  function setPanel(mode: HKMode, patch: Partial<HKPanelState>) {
    setPanels(prev => ({ ...prev, [mode]: { ...prev[mode], ...patch } }))
  }
  function resetPanel(mode: HKMode) {
    if (mode === 'double') {
      setPanel(mode, { ...HK_INITIAL_PANEL, pillDone: true })
    } else {
      setPanel(mode, HK_INITIAL_PANEL)
    }
  }

  useEffect(() => {
    cleanup()
    ;(Object.keys(panels) as HKMode[]).forEach(m => { if (m !== active) resetPanel(m) })
    resetPanel(active)

    if (active === 'tap') {
      schedule(() => setPanel('tap', { pressed: true, tapped: true }), 400)
      schedule(() => setPanel('tap', { pressed: false, tapped: false }), 600)
      schedule(() => setPanel('tap', { pillVisible: true }), 450)
      schedule(() => setPanel('tap', { pressed: true, tapped: true }), 2800)
      schedule(() => setPanel('tap', { pressed: false, tapped: false }), 3000)
      schedule(() => setPanel('tap', { pillDone: true }), 2900)
    } else if (active === 'hold') {
      schedule(() => setPanel('hold', { pressed: true, holding: true, pillVisible: true }), 400)
      schedule(() => setPanel('hold', { pressed: false, holding: false, pillDone: true }), 2800)
    } else if (active === 'double') {
      schedule(() => setPanel('double', { pressed: true, tapped: true }), 800)
      schedule(() => setPanel('double', { pressed: false, tapped: false }), 950)
      schedule(() => setPanel('double', { pressed: true, tapped: true }), 1020)
      schedule(() => setPanel('double', { pressed: false, tapped: false }), 1170)
      schedule(() => setPanel('double', { pillVisible: true }), 1030)
    }

    schedule(() => {
      const order: HKMode[] = ['tap', 'hold', 'double']
      const next = order[(order.indexOf(active) + 1) % 3]
      setActive(next)
    }, 4000)

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <div
      className="bg-paper border border-ink-08 rounded-[18px] grid grid-cols-3 overflow-hidden max-w-[680px]"
      style={{ boxShadow: '0 30px 60px -30px rgba(20,30,50,0.18)', minHeight: 280 }}
    >
      <style>{`
        @keyframes onb-tb-ripple   { 0% { transform: scale(0.85); border-color: rgba(200,85,61,0.55); opacity: 1; } 100% { transform: scale(1.25); border-color: rgba(200,85,61,0); opacity: 0; } }
        @keyframes onb-tb-holdring { 0% { transform: scale(0.95); opacity: 0.7; } 100% { transform: scale(1.18); opacity: 0; } }
        @keyframes onb-tb-progress { from { width: 0; } to { width: 100%; } }
        .onb-tb-keycap.tap .onb-tb-ripple { animation: onb-tb-ripple 0.5s ease-out; }
        .onb-tb-keycap.holding::after {
          content: ""; position: absolute; inset: -10px;
          border-radius: 24px; border: 1.5px solid rgba(200,85,61,0.5);
          animation: onb-tb-holdring 1.4s ease-out infinite;
          pointer-events: none;
        }
        .onb-tb-progress-anim { animation: onb-tb-progress 4s linear; }
      `}</style>

      {HK_PANELS.map(p => {
        const s = panels[p.mode]
        const isOn = active === p.mode
        return (
          <div
            key={p.mode}
            className={[
              'relative flex flex-col gap-4 px-5 py-6 border-r border-ink-08 last:border-r-0 transition-colors duration-300',
              isOn ? 'bg-[#FFF7F3]' : 'bg-paper',
            ].join(' ')}
          >
            {/* Numbered eyebrow */}
            <div className={[
              'text-[10px] font-mono uppercase tracking-[0.14em]',
              isOn ? 'text-[#C8553D]' : 'text-ink-45',
            ].join(' ')}>
              {p.ord}
            </div>

            {/* Italic serif title */}
            <div
              className="text-[34px] leading-[0.95] tracking-tight text-ink"
              style={{
                fontStyle: 'italic',
                fontFamily: '"Instrument Serif", Georgia, serif',
              }}
            >
              {p.name}
            </div>

            <div className="text-[11.5px] text-ink-60 leading-snug -mt-2">
              {p.oneLiner}
            </div>

            {/* Keycap + pill, anchored to the bottom */}
            <div className="flex flex-col items-center gap-3 mt-auto pt-2">
              <div
                className={[
                  'relative onb-tb-keycap',
                  s.pressed ? 'pressed' : '',
                  s.holding ? 'holding' : '',
                  s.tapped ? 'tap' : '',
                ].join(' ')}
                style={{
                  width: 72, height: 72, borderRadius: 14,
                  background: 'linear-gradient(180deg, #fdfbf3 0%, #e9e1c8 100%)',
                  border: '1px solid #c5bda0',
                  boxShadow: s.pressed
                    ? '0 1px 0 #b8af90, 0 3px 6px rgba(0,0,0,0.08), inset 0 2px 0 rgba(255,255,255,0.7)'
                    : '0 5px 0 #b8af90, 0 8px 18px rgba(0,0,0,0.1), inset 0 2px 0 rgba(255,255,255,0.7)',
                  transform: s.pressed ? 'translateY(4px)' : 'translateY(0)',
                  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span
                  className="onb-tb-ripple"
                  style={{
                    position: 'absolute', inset: -8, borderRadius: 22,
                    border: '1.5px solid rgba(200,85,61,0)', pointerEvents: 'none',
                  }}
                />
                <span
                  className="font-mono text-ink leading-none"
                  style={{ fontSize: glyph.length > 2 ? '14px' : '24px', fontWeight: 500 }}
                >
                  {glyph}
                </span>
                {(glyph === '⌃' || glyph === '⌥' || glyph === '⇧' || glyph === '⌘') && (
                  <span
                    className="absolute font-mono text-ink-45 uppercase"
                    style={{
                      bottom: 6, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 7, letterSpacing: '0.1em',
                    }}
                  >
                    {glyph === '⌃' ? 'Control' : glyph === '⌥' ? 'Option' : glyph === '⇧' ? 'Shift' : 'Command'}
                  </span>
                )}
              </div>

              <div
                style={{
                  opacity: isOn && (s.pillVisible || s.pillDone) ? 1 : 0,
                  transition: 'opacity 0.35s',
                  height: 22,
                }}
              >
                <HotkeyPanelPill done={s.pillDone} />
              </div>
            </div>

            {/* Bottom progress bar — fills over the 4s the panel is active */}
            <span
              key={isOn ? `${p.mode}-on` : `${p.mode}-off`}
              className={[
                'absolute left-0 bottom-0 h-[2px] bg-[#C8553D]',
                isOn ? 'onb-tb-progress-anim' : '',
              ].join(' ')}
              style={{ width: isOn ? undefined : 0 }}
            />
          </div>
        )
      })}
    </div>
  )
}

// Mini status pill used inside the cycling-behaviors demo. Two states:
// listening (red dot + bars) and done (green dot + cobalt check).
function HotkeyPanelPill({ done }: { done: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-white"
      style={{
        background: 'linear-gradient(180deg, rgba(18,20,26,0.92) 0%, rgba(14,16,22,0.88) 100%)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.36), inset 0 -1px 0 rgba(0,0,0,0.4), 0 6px 14px -6px rgba(0,0,0,0.55)',
      }}
    >
      {!done ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#E84A3A]" style={{ boxShadow: '0 0 6px rgba(232,74,58,0.7)' }} />
          <div className="flex items-end gap-[1.5px] h-2.5">
            <span className="w-[1.5px] h-1.5 rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="w-[1.5px] h-2 rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="w-[1.5px] h-2.5 rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="w-[1.5px] h-2 rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="w-[1.5px] h-1.5 rounded-[0.5px] bg-[#5A8FE8]" />
          </div>
          <span className="text-[9.5px] leading-none italic ml-0.5" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
            listening
          </span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
          <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5L4.5 8L9 3" stroke="#5A8FE8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[9.5px] leading-none italic ml-0.5" style={{ color: '#5A8FE8', fontFamily: '"Instrument Serif", Georgia, serif' }}>
            pasted
          </span>
        </>
      )}
    </div>
  )
}

// ─── Step 5: Strictness — 3-substep side-by-side flow ──────────────

type StrictCat = keyof CategoryStrictness
const SUBSTEP_ORDER: StrictCat[] = ['personal', 'work', 'writing']

// Per-bucket meta + sample dictation + per-level cleaned output.
// Hard-coded; not a real LLM call. Each bucket's preview pane mocks
// the canvas the user would actually be writing into.
const CAT_META: Record<StrictCat, {
  title: string
  blurb: string
  apps: string
  raw: string
  outputs: Record<Strictness, string>
  visual: 'imessage' | 'email' | 'doc'
}> = {
  personal: {
    title: 'Personal messaging',
    blurb: 'Friends, family, group chats. Most people want this loose.',
    apps: 'iMessage · WhatsApp · Telegram',
    raw: "yo um so are we still on for tomorrow or like did that move",
    outputs: {
      1: "yo so are we still on for tomorrow or like did that move",
      2: "are we still on for tomorrow or did that move",
      3: "Are we still on for tomorrow, or has it moved?",
    },
    visual: 'imessage',
  },
  work: {
    title: 'Work messaging',
    blurb: 'Colleagues — chat and email. Polished by default.',
    apps: 'Slack · Discord · Gmail · Outlook',
    raw: "hey just wanted to follow up on the proposal um can you let me know if you got a chance to look at it",
    outputs: {
      1: "hey just wanted to follow up on the proposal can you let me know if you got a chance to look at it",
      2: "Just following up on the proposal — can you let me know if you've had a chance to look?",
      3: "Hi — following up on the proposal. Could you let me know once you've had a chance to review it?",
    },
    visual: 'email',
  },
  writing: {
    title: 'Writing & AI',
    blurb: 'Longform docs and AI prompts. Balanced tends to feel right.',
    apps: 'Notion · Google Docs · Claude · ChatGPT',
    raw: "so the main idea is that um we want users to feel like the app is responding to them and like adapting",
    outputs: {
      1: "so the main idea is that we want users to feel like the app is responding to them and like adapting",
      2: "The main idea is that we want users to feel the app is responding to them and adapting.",
      3: "The core idea: users should feel the app responds and adapts to them.",
    },
    visual: 'doc',
  },
}

// Char-by-char reveal hook. Plays a "the AI is typing" effect on the
// preview output whenever the source text changes (level change or
// category change). Tunable speed via msPerChar.
function useTypewriter(text: string, msPerChar = 14): string {
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown('')
    let i = 0
    const id = window.setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) window.clearInterval(id)
    }, msPerChar)
    return () => window.clearInterval(id)
  }, [text, msPerChar])
  return shown
}


const LEVEL_LABEL: Record<Strictness, string> = { 1: 'Light', 2: 'Balanced', 3: 'Strict' }

function StepStrictness({
  value,
  onChange,
  emojiInMessages,
  onEmojiChange,
  onContinue,
}: {
  value: CategoryStrictness
  onChange: (v: CategoryStrictness) => void
  emojiInMessages: boolean
  onEmojiChange: (v: boolean) => void
  onContinue: () => void
}) {
  const [substep, setSubstep] = useState<StrictCat>('personal')
  const idx = SUBSTEP_ORDER.indexOf(substep)
  const meta = CAT_META[substep]
  const level = value[substep]

  function setLevel(lvl: Strictness) {
    onChange({ ...value, [substep]: lvl })
  }
  function handleNext() {
    const nextIdx = idx + 1
    if (nextIdx < SUBSTEP_ORDER.length) setSubstep(SUBSTEP_ORDER[nextIdx])
    else onContinue()
  }
  function handleSubBack() {
    if (idx > 0) setSubstep(SUBSTEP_ORDER[idx - 1])
  }

  const isLast = idx === SUBSTEP_ORDER.length - 1

  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-4">
        How <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">polished?</span>
      </h1>

      {/* Sub-step pips — show progress through personal → work → writing. */}
      <div
        className="flex items-center gap-2 mb-7 animate-slideUp"
        style={{ animationDelay: '140ms' }}
      >
        {SUBSTEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={[
              'h-1 rounded-full transition-all duration-300',
              i === idx ? 'bg-ink w-10' : i < idx ? 'bg-ink/60 w-6' : 'bg-ink-08 w-6',
            ].join(' ')}
          />
        ))}
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-ink-45 ml-2">
          {idx + 1} / {SUBSTEP_ORDER.length}
        </span>
      </div>

      {/* Side-by-side: picker on the left, app-shaped preview on the right. */}
      <div className="grid grid-cols-2 gap-8 max-w-[760px] mb-7">
        <div key={substep} className="animate-stepIn flex flex-col justify-center">
          <div className="text-[24px] font-semibold leading-tight mb-1.5">{meta.title}</div>
          <div className="text-[11.5px] text-ink-45 mb-7">{meta.apps}</div>

          <div className="flex gap-2">
            {([1, 2, 3] as Strictness[]).map((lvl) => {
              const selected = level === lvl
              return (
                <button
                  key={lvl}
                  onClick={() => setLevel(lvl)}
                  className={[
                    'flex-1 px-3 py-2.5 rounded-pill text-[13px] font-medium border transition-all duration-150',
                    selected
                      ? 'bg-ink text-paper border-ink -translate-y-0.5'
                      : 'bg-card text-ink border-ink-08 hover:border-ink-45',
                  ].join(' ')}
                >
                  {LEVEL_LABEL[lvl]}
                </button>
              )
            })}
          </div>

          {/* Emoji toggle appears on the 'personal' substep — that's
              the messaging-focused screen where it makes sense. Off
              by default; opt-in here or in Settings → Polish later. */}
          {substep === 'personal' && (
            <button
              type="button"
              onClick={() => onEmojiChange(!emojiInMessages)}
              aria-pressed={emojiInMessages}
              className={[
                'mt-5 flex items-start gap-3 p-3 rounded-card border text-left transition-colors w-full',
                emojiInMessages ? 'border-ink bg-ink/[0.04]' : 'border-ink-08 hover:border-ink-45',
              ].join(' ')}
            >
              <span
                className={[
                  'shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors relative',
                  emojiInMessages ? 'bg-ink' : 'bg-ink-08',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-0.5 w-4 h-4 rounded-full bg-paper transition-all',
                    emojiInMessages ? 'left-[18px]' : 'left-0.5',
                  ].join(' ')}
                />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium">Add emojis when relevant</div>
                <p className="text-[10.5px] text-ink-60 mt-0.5 leading-snug">
                  Sprinkle one emoji when there's a concrete moment — "ramen at 5" → "ramen at 5 🍜". Off by default; only fires in casual chats.
                </p>
              </div>
            </button>
          )}
        </div>

        <div key={`${substep}-${level}`} className="animate-stepIn">
          {meta.visual === 'imessage' && (
            <IMessageMock raw={meta.raw} cleaned={meta.outputs[level]} />
          )}
          {meta.visual === 'email' && (
            <EmailMock raw={meta.raw} cleaned={meta.outputs[level]} />
          )}
          {meta.visual === 'doc' && (
            <DocMock raw={meta.raw} cleaned={meta.outputs[level]} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {idx > 0 && (
          <button onClick={handleSubBack} className="text-[12px] text-ink-45 hover:text-ink">
            ← previous
          </button>
        )}
        <Pill variant="primary" onClick={handleNext}>
          {isLast ? 'Continue →' : 'Next →'}
        </Pill>
      </div>
    </>
  )
}

// ─── Step 5 visual mocks ───────────────────────────────────────────

function MockHeader({ brand, label }: { brand?: 'imessage' | 'gmail' | 'notion' | 'slack' | 'claude'; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-1">
      {brand && <BrandLogo brand={brand} size={14} />}
      <div className="text-[10.5px] font-mono uppercase tracking-wider text-ink-45">{label}</div>
    </div>
  )
}

function IMessageMock({ raw, cleaned }: { raw: string; cleaned: string }) {
  const typed = useTypewriter(cleaned)
  return (
    <div>
      <MockHeader brand="imessage" label="iMessage" />
      <div className="bg-card rounded-card border border-ink-08 px-3 py-3 shadow-sm">
        <div className="text-center text-[10px] text-ink-45 mb-3 font-mono">Today 2:14 PM</div>
        {/* Received bubble — what you said, gray */}
        <div className="flex justify-start mb-2">
          <div className="bg-[#e9e9eb] text-ink text-[12.5px] px-3 py-1.5 rounded-[16px] rounded-bl-[4px] max-w-[78%] leading-snug">
            {raw}
          </div>
        </div>
        {/* Sent bubble — what Yappr types, iMessage blue */}
        <div className="flex justify-end">
          <div className="bg-[#0b93f6] text-white text-[12.5px] px-3 py-1.5 rounded-[16px] rounded-br-[4px] max-w-[78%] leading-snug">
            {typed}
            <span className="inline-block w-[2px] h-[12px] bg-white/80 ml-0.5 align-text-bottom animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailMock({ raw, cleaned }: { raw: string; cleaned: string }) {
  const typed = useTypewriter(cleaned)
  return (
    <div>
      <MockHeader brand="gmail" label="Gmail · Compose" />
      <div className="bg-card rounded-card border border-ink-08 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ink-08 bg-paper/40">
          <div className="text-[11px] text-ink-45">To: <span className="text-ink">alex@company.com</span></div>
          <div className="text-[11px] text-ink-45 mt-1">Subject: <span className="text-ink">Quick follow-up</span></div>
        </div>
        <div className="px-4 py-3 min-h-[110px]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-45 mb-1.5">You said</div>
          <div className="text-[11.5px] text-ink-45 italic mb-3 leading-snug">"{raw}"</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-45 mb-1.5">Yappr types</div>
          <div className="text-[13px] text-ink leading-snug">
            {typed}
            <span className="inline-block w-[2px] h-[14px] bg-ink ml-0.5 align-text-bottom animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DocMock({ raw, cleaned }: { raw: string; cleaned: string }) {
  const typed = useTypewriter(cleaned)
  return (
    <div>
      <MockHeader brand="notion" label="Notion · Page" />
      <div className="bg-card rounded-card border border-ink-08 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2 border-b border-ink-08">
          <div className="text-[15px] font-semibold leading-tight">Untitled</div>
        </div>
        <div className="px-5 py-4 min-h-[110px]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-45 mb-1.5">You said</div>
          <div className="text-[11.5px] text-ink-45 italic mb-3 leading-snug">"{raw}"</div>
          <div className="text-[13px] text-ink leading-snug">
            {typed}
            <span className="inline-block w-[2px] h-[14px] bg-ink ml-0.5 align-text-bottom animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Step 6: Done ──────────────────────────────────────────────────

function StepDone({ hotkey, onFinish }: { hotkey: string; onFinish: () => void }) {
  const hotkeyHint = useMemo(() => prettifyKey(hotkey), [hotkey])
  // Pressing the hotkey here finishes onboarding — the user's first
  // hotkey press is literally what we asked them to do, so it should
  // close the window and let them start dictating right away.
  useEffect(() => {
    function matches(e: KeyboardEvent): boolean {
      const code = e.code
      if (hotkey === 'CTRL')  return code === 'ControlLeft' || code === 'ControlRight'
      if (hotkey === 'ALT')   return code === 'AltLeft'     || code === 'AltRight'
      if (hotkey === 'SHIFT') return code === 'ShiftLeft'   || code === 'ShiftRight'
      if (hotkey === 'META')  return code === 'MetaLeft'    || code === 'MetaRight'
      return e.key.toUpperCase() === hotkey
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!matches(e)) return
      e.preventDefault()
      onFinish()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hotkey, onFinish])

  return (
    <div className="flex flex-col items-center text-center -mt-8 relative">
      {/* Confetti burst — 12 dots fired from behind the pill. Pure
          decoration; fires once on mount, then settles. */}
      <DoneConfetti />

      {/* Brand pill, large, breathing — the only visual on this screen */}
      <div
        className="mb-8 relative animate-checkPop"
        style={{
          filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.18))',
          animation: 'done-breathe 3.6s ease-in-out infinite, checkPop 540ms cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        <style>{`
          @keyframes done-breathe {
            0%, 100% { transform: scale(1);    filter: brightness(1) drop-shadow(0 12px 24px rgba(0,0,0,0.18)); }
            50%      { transform: scale(1.04); filter: brightness(1.06) drop-shadow(0 16px 32px rgba(0,0,0,0.22)); }
          }
        `}</style>
        <BrandPillSvg width={168} height={68} />
      </div>

      <h1 className="text-[56px] leading-[0.95] tracking-tight mb-3">
        You're <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">ready.</span>
      </h1>
      <p
        className="text-[14.5px] text-ink-60 leading-relaxed max-w-[420px] mb-8 animate-slideUp"
        style={{ animationDelay: '320ms' }}
      >
        Press <span className="font-mono text-ink bg-card border border-ink-08 px-1.5 py-0.5 rounded text-[13px]">{hotkeyHint}</span> and start talking.
      </p>

      <div className="animate-slideUp" style={{ animationDelay: '480ms' }}>
        <Pill variant="primary" onClick={onFinish}>
          Start using Yappr ✨
        </Pill>
      </div>
    </div>
  )
}

// Small confetti burst behind the pill on the Done step. Fires once
// when the step mounts. Pure decoration — 12 dots radiating outward
// in a cone above the pill, each running the confettiPop keyframe
// with a per-dot CSS variable for direction.
function DoneConfetti() {
  // Pre-compute the dots so re-renders don't reshuffle the cone.
  const dots = useMemo(() => {
    const colors = ['#E84A3A', '#5A8FE8', '#22C55E', '#FFB22E', '#C8553D']
    return Array.from({ length: 14 }, (_, i) => {
      // Spread across a wide cone above + to the sides of the pill.
      const angle = -Math.PI / 2 + (i / 13 - 0.5) * Math.PI * 1.6
      const dist = 90 + (i * 17) % 90
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        color: colors[i % colors.length],
        size: 5 + (i % 3) * 1.5,
        delay: i * 28,
      }
    })
  }, [])
  return (
    <div className="absolute left-1/2 top-[58px] -translate-x-1/2 pointer-events-none w-1 h-1 z-0">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute left-0 top-0 rounded-full animate-confettiPop"
          style={{
            width: d.size,
            height: d.size,
            background: d.color,
            ['--tx' as string]: `${d.tx}px`,
            ['--ty' as string]: `${d.ty}px`,
            animationDelay: `${d.delay}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TEACHING STEPS (6, 7, 8) — animated demos in the same motion
// language as Settings → AI / Dictionary / Polish / Hotkey. Each step
// renders a self-contained scripted demo that loops, so the page
// feels alive rather than static.
//
// Shared keyframes are inlined per-step (rather than in a global
// stylesheet) so each step's animation timing is co-located with its
// markup. Duplication is intentional.
// ═══════════════════════════════════════════════════════════════════

// macOS-style window chrome — three traffic-light dots.
function TrafficLights() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[10px] h-[10px] rounded-full bg-[#FF5F57]" />
      <span className="w-[10px] h-[10px] rounded-full bg-[#FEBC2E]" />
      <span className="w-[10px] h-[10px] rounded-full bg-[#28C840]" />
    </div>
  )
}

// macOS pointer cursor. Positioned absolutely by parent; animated via
// shared keyframes named by the parent step.
function MacCursor() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" className="drop-shadow-md pointer-events-none">
      <path
        d="M1.5,1 L1.5,15.2 L5,12.2 L7,17 L9,16.2 L7,11.4 L12.2,11.4 Z"
        fill="white"
        stroke="black"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Step 6: The pill ──────────────────────────────────────────────
// Full lifecycle demo: cursor drifts to the bottom, pill brightens,
// menu opens, "Start recording" is highlighted, pill transitions
// through listening → polishing → pasted. ~8s loop.

function StepPillTour({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-4">
        Your <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">pill</span> is always there.
      </h1>
      <p
        className="text-[13.5px] text-ink-60 leading-relaxed max-w-[460px] mb-6 animate-slideUp"
        style={{ animationDelay: '140ms' }}
      >
        A small Yappr pill lives at the bottom of every screen. Hover to wake it. Click for a menu — no hotkey required.
      </p>

      <div className="animate-slideUp" style={{ animationDelay: '280ms' }}>
        <PillLifecycleDemo />
      </div>

      <div className="mt-6 animate-slideUp" style={{ animationDelay: '460ms' }}>
        <Pill variant="primary" onClick={onContinue}>
          Got it <span>→</span>
        </Pill>
      </div>
    </>
  )
}

// Live desktop-frame demo. Cursor drifts toward the pill at the
// bottom, pill brightens, menu opens, "Start recording" highlights,
// menu closes, pill transitions through listening → done. Loops on
// an 8s cycle. Same motion language as the AITab AppMockCycle.
function PillLifecycleDemo() {
  return (
    <div className="relative bg-[#f2efe6] border border-ink-08 rounded-[18px] overflow-hidden h-[280px] max-w-[640px]">
      <style>{`
        /* Desktop "wallpaper" subtly drifts. Keeps the frame from looking dead. */
        @keyframes onbpill-bgshift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }

        /* 8s lifecycle:
             0–10%   idle pill at 50% opacity, cursor off to the side
             10–28%  cursor drifts toward pill; pill brightens at 22%
             28–38%  menu pops above pill; cursor sits on "Start recording"
             38–48%  menu fades; pill enters listening state
             48–72%  listening (waveform animating)
             72–82%  brief polishing spinner
             82–94%  pill turns to "pasted" (green dot + check)
             94–100% pill fades back to idle dim state                    */

        /* Cursor lifecycle — these targets are in the canvas
           coordinate space. Tuned so the cursor's hot-spot (top-left)
           visually lands on the pill body and then on the highlighted
           "Start recording" menu row, not in empty space next to them.
              0–8%   : off-screen left, invisible
              12–22% : fade in, drift toward bottom-center
              22–28% : settle ON the pill (left ~50%, top ~84% — pill
                       sits at canvas-bottom ~88% center)
              28–32% : "click" — small hop up by 2px
              34–46% : rise up to the menu's first row
                       (left ~50%, top ~50% — menu's "Start recording"
                       row when menu is open)
              48–52% : fade out (the click has fired)                  */
        @keyframes onbpill-cursor {
          0%, 8%   { opacity: 0; left: 22%; top: 60%; }
          14%      { opacity: 1; }
          24%      { opacity: 1; left: 50%; top: 84%; }
          30%      { opacity: 1; left: 50%; top: 82%; }
          34%      { opacity: 1; left: 50%; top: 84%; }
          44%      { opacity: 1; left: 50%; top: 54%; }
          48%      { opacity: 0; left: 50%; top: 54%; }
          100%     { opacity: 0; left: 22%; top: 60%; }
        }

        /* The whole pill container brightens / scales when "hovered". */
        @keyframes onbpill-wake {
          0%, 18%  { opacity: 0.5; transform: translateX(-50%) scale(1); }
          24%, 92% { opacity: 1; transform: translateX(-50%) scale(1.06); }
          100%     { opacity: 0.5; transform: translateX(-50%) scale(1); }
        }

        /* Menu fades in at 28%, fades out at 48%. */
        @keyframes onbpill-menu {
          0%, 26%  { opacity: 0; transform: translateX(-50%) translateY(6px); }
          32%, 44% { opacity: 1; transform: translateX(-50%) translateY(0); }
          50%, 100%{ opacity: 0; transform: translateX(-50%) translateY(4px); }
        }

        /* "Start recording" row highlight pulses to point the cursor. */
        @keyframes onbpill-rowhighlight {
          0%, 32%  { background-color: transparent; }
          36%, 44% { background-color: rgba(255,255,255,0.10); }
          48%, 100%{ background-color: transparent; }
        }

        /* Pill states — listening / polishing / done shells fade in & out
           inside the same pill body. */
        @keyframes onbpill-stateIdle {
          0%, 47%  { opacity: 1; }
          48%, 96% { opacity: 0; }
          100%     { opacity: 1; }
        }
        @keyframes onbpill-stateListening {
          0%, 47%  { opacity: 0; }
          50%, 71% { opacity: 1; }
          74%, 100%{ opacity: 0; }
        }
        @keyframes onbpill-statePolishing {
          0%, 71%  { opacity: 0; }
          74%, 81% { opacity: 1; }
          84%, 100%{ opacity: 0; }
        }
        @keyframes onbpill-stateDone {
          0%, 82%  { opacity: 0; }
          85%, 94% { opacity: 1; }
          96%, 100%{ opacity: 0; }
        }

        @keyframes onbpill-bar1 { 0%,100% { height: 4px; } 50% { height: 9px; } }
        @keyframes onbpill-bar2 { 0%,100% { height: 7px; } 50% { height: 2px; } }
        @keyframes onbpill-bar3 { 0%,100% { height: 9px; } 50% { height: 5px; } }
        @keyframes onbpill-bar4 { 0%,100% { height: 3px; } 50% { height: 8px; } }
        @keyframes onbpill-bar5 { 0%,100% { height: 6px; } 50% { height: 2px; } }

        .onbpill-cursor { animation: onbpill-cursor 8s ease-in-out infinite; }
        .onbpill-wake   { animation: onbpill-wake   8s ease-in-out infinite; }
        .onbpill-menu   { animation: onbpill-menu   8s ease-in-out infinite; transform-origin: bottom center; }
        .onbpill-rowhi  { animation: onbpill-rowhighlight 8s ease-in-out infinite; }
        .onbpill-sidle      { animation: onbpill-stateIdle      8s linear infinite; }
        .onbpill-slisten    { animation: onbpill-stateListening 8s linear infinite; }
        .onbpill-spolish    { animation: onbpill-statePolishing 8s linear infinite; }
        .onbpill-sdone      { animation: onbpill-stateDone      8s linear infinite; }
        .onbpill-bar1 { animation: onbpill-bar1 0.7s ease-in-out infinite; }
        .onbpill-bar2 { animation: onbpill-bar2 0.6s ease-in-out infinite; }
        .onbpill-bar3 { animation: onbpill-bar3 0.55s ease-in-out infinite; }
        .onbpill-bar4 { animation: onbpill-bar4 0.65s ease-in-out infinite; }
        .onbpill-bar5 { animation: onbpill-bar5 0.5s ease-in-out infinite; }
      `}</style>

      {/* Fake-app surface behind the pill — gives a sense of "any app". */}
      <div className="absolute inset-0 flex flex-col">
        <div className="px-3 py-2 border-b border-ink-08 bg-white/70 flex items-center gap-3 shrink-0">
          <TrafficLights />
          <div className="text-[11px] text-ink-45 font-mono">any app · any window</div>
        </div>
        {/* Fake content lines so the pill has context */}
        <div className="flex-1 px-6 py-5 space-y-2 opacity-50">
          <div className="h-2.5 bg-ink-08 rounded w-[60%]" />
          <div className="h-2.5 bg-ink-08 rounded w-[80%]" />
          <div className="h-2.5 bg-ink-08 rounded w-[45%]" />
          <div className="h-2.5 bg-ink-08 rounded w-[72%]" />
          <div className="h-2.5 bg-ink-08 rounded w-[55%]" />
        </div>
      </div>

      {/* The cursor — animated across the lifecycle. */}
      <div
        className="onbpill-cursor absolute pointer-events-none"
        style={{ zIndex: 30 }}
      >
        <MacCursor />
      </div>

      {/* Menu — fades in above the pill during the "click" beat. */}
      <div
        className="onbpill-menu absolute left-1/2 pointer-events-none rounded-[12px] p-1.5"
        style={{
          bottom: 64,
          zIndex: 20,
          minWidth: 200,
          background: 'linear-gradient(180deg, rgba(18,20,26,0.94) 0%, rgba(14,16,22,0.90) 100%)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 12px 24px rgba(0,0,0,0.32)',
        }}
      >
        <PillMenuRow
          icon={<span className="w-2 h-2 rounded-full bg-danger" style={{ boxShadow: '0 0 6px rgba(232,74,58,0.8)' }} />}
          label="Start recording"
          highlight
        />
        <PillMenuRow
          icon={
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M2 5.5 L4.5 8 L9 3" stroke="#5A8FE8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          }
          label="Paste last dictation"
        />
        <PillMenuRow
          icon={
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 6 L6 2 L10 6 M6 2 L6 10" stroke="#5A8FE8" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          }
          label="Polish selection"
        />
      </div>

      {/* The pill itself — anchored bottom-center, fades brighter on the
          "wake" beat, then switches between idle / listening / polishing
          / done shells inside the same charcoal pill. */}
      <div
        className="onbpill-wake absolute left-1/2 -translate-x-1/2"
        style={{ bottom: 18, zIndex: 25 }}
      >
        <div className="relative inline-block">
          {/* IDLE shell — the brand pill itself */}
          <div className="onbpill-sidle">
            <BrandPillSvg width={88} height={36} />
          </div>

          {/* LISTENING shell — full liquid-glass pill with red dot + 5 bars */}
          <div className="onbpill-slisten absolute inset-0 flex items-center justify-center">
            <DemoStatusPill kind="listening" />
          </div>

          {/* POLISHING shell — spinner */}
          <div className="onbpill-spolish absolute inset-0 flex items-center justify-center">
            <DemoStatusPill kind="polishing" />
          </div>

          {/* DONE shell — green dot + cobalt check + "pasted" */}
          <div className="onbpill-sdone absolute inset-0 flex items-center justify-center">
            <DemoStatusPill kind="done" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PillMenuRow({ icon, label, highlight }: { icon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <div
      className={['flex items-center gap-2.5 px-3 py-2 rounded-[10px]', highlight ? 'onbpill-rowhi' : ''].join(' ')}
    >
      <span className="w-3 flex items-center justify-center shrink-0">{icon}</span>
      <span
        className="text-[12.5px] leading-tight text-white/95"
        style={{
          fontStyle: 'italic',
          fontFamily: '"Instrument Serif", Georgia, serif',
        }}
      >
        {label}
      </span>
    </div>
  )
}

// One charcoal pill shell with three states. The parent toggles which
// shell is opaque on the lifecycle timeline.
function DemoStatusPill({ kind }: { kind: 'listening' | 'polishing' | 'done' }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill text-white"
      style={{
        background: 'linear-gradient(180deg, rgba(18,20,26,0.92) 0%, rgba(14,16,22,0.88) 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1.2px 0 rgba(255,255,255,0.36), inset 0 -1px 0 rgba(0,0,0,0.4), 0 6px 14px rgba(0,0,0,0.3)',
      }}
    >
      {kind === 'listening' && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#E84A3A]" style={{ boxShadow: '0 0 6px rgba(232,74,58,0.7)' }} />
          <div className="flex items-end gap-[1.5px] h-2.5">
            <span className="onbpill-bar1 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbpill-bar2 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbpill-bar3 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbpill-bar4 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbpill-bar5 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
          </div>
          <span className="text-[10.5px] ml-0.5 leading-none italic" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
            listening
          </span>
        </>
      )}
      {kind === 'polishing' && (
        <>
          <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-[#5A8FE8] animate-spin" />
          <span className="text-[10.5px] ml-0.5 leading-none italic" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
            polishing…
          </span>
        </>
      )}
      {kind === 'done' && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
          <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5L4.5 8L9 3" stroke="#5A8FE8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[10.5px] ml-0.5 leading-none italic" style={{ color: '#5A8FE8', fontFamily: '"Instrument Serif", Georgia, serif' }}>
            pasted
          </span>
        </>
      )}
    </div>
  )
}

// Standalone Yappr brand pill SVG — same design as the tray icon
// and the indicator window's idle pill so the brand stays consistent
// across every surface.
function BrandPillSvg({ width = 108, height = 44 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 54 22" width={width} height={height}>
      <defs>
        <linearGradient id="onb-bp-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#12141a"/>
          <stop offset="100%" stopColor="#0e1016"/>
        </linearGradient>
        <linearGradient id="onb-bp-hi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.34"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="onb-bp-glow" cx="11" cy="11" r="7" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#e84a3a" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#e84a3a" stopOpacity="0"/>
        </radialGradient>
        <clipPath id="onb-bp-clip">
          <rect x="0" y="0" width="54" height="22" rx="11"/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="54" height="22" rx="11" fill="url(#onb-bp-grad)"/>
      <g clipPath="url(#onb-bp-clip)">
        <rect x="0" y="0" width="54" height="12" fill="url(#onb-bp-hi)"/>
      </g>
      <rect x="0.3" y="0.3" width="53.4" height="21.4" rx="10.7" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.4"/>
      <circle cx="11" cy="11" r="7" fill="url(#onb-bp-glow)"/>
      <circle cx="11" cy="11" r="3.0" fill="#e84a3a"/>
      <rect x="22"   y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
      <rect x="26.5" y="3"   width="1.8" height="16" rx="0.9" fill="#5a8fe8"/>
      <rect x="31"   y="9"   width="1.8" height="4"  rx="0.9" fill="#5a8fe8"/>
      <rect x="35.5" y="5"   width="1.8" height="12" rx="0.9" fill="#5a8fe8"/>
      <rect x="40"   y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
      <rect x="44.5" y="8.5" width="1.8" height="5"  rx="0.9" fill="#5a8fe8"/>
    </svg>
  )
}

// ─── Step 7: Rewrite-selection mode ────────────────────────────────
// "Highlight any text, dictate an instruction, Yappr edits it in
// place." This is the feature most users will never discover without
// being told — it turns Yappr from a dictation tool into a voice
// assistant for editing existing text.

function StepRewriteMode({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-4">
        Edit with your <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">voice.</span>
      </h1>
      <p
        className="text-[13.5px] text-ink-60 leading-relaxed max-w-[480px] mb-7 animate-slideUp"
        style={{ animationDelay: '140ms' }}
      >
        Highlight text anywhere on your Mac, then press your hotkey and say what to change. Yappr rewrites the selection — no copy-paste, no chat window.
      </p>

      <div className="animate-slideUp" style={{ animationDelay: '280ms' }}>
        <RewriteDemo />
      </div>

      <div className="mt-6 animate-slideUp" style={{ animationDelay: '460ms' }}>
        <Pill variant="primary" onClick={onContinue}>
          Got it <span>→</span>
        </Pill>
      </div>
    </>
  )
}

// Live rewrite-mode demo. Cycles three real macOS-app surfaces
// (Gmail / Notion / iMessage); inside each surface the cursor drags
// across text creating a native-blue selection, the Yappr pill
// fades in at bottom-center with the instruction bubble above it, the
// "before" text fades to the "after" text. 6.4s per scenario.
//
// Shares the exact timeline grammar with AITab's AppMockCycle so the
// onboarding and the live AI tab feel like one continuous motion
// system.

type RewriteScenario = 'gmail' | 'notion' | 'imessage'
const REWRITE_ORDER: RewriteScenario[] = ['gmail', 'notion', 'imessage']

const REWRITE_TIMELINE = `
  @keyframes onbrw-cursor {
    0%, 8%      { opacity: 0; transform: translate(0%, 0); }
    14%         { opacity: 1; transform: translate(0%, 0); }
    27%         { opacity: 1; transform: translate(100%, 0); }
    32%, 100%   { opacity: 0; transform: translate(100%, 0); }
  }
  @keyframes onbrw-selection {
    0%, 12%     { transform: scaleX(0); }
    27%         { transform: scaleX(1); }
    62%         { transform: scaleX(1); opacity: 1; }
    68%, 100%   { transform: scaleX(1); opacity: 0; }
  }
  @keyframes onbrw-before {
    0%, 50%     { opacity: 1; }
    62%, 100%   { opacity: 0; }
  }
  @keyframes onbrw-after  {
    0%, 58%     { opacity: 0; }
    70%, 100%   { opacity: 1; }
  }
  @keyframes onbrw-pill {
    0%, 28%     { opacity: 0; transform: translate(-50%, 8px); }
    35%, 78%    { opacity: 1; transform: translate(-50%, 0); }
    85%, 100%   { opacity: 0; transform: translate(-50%, 4px); }
  }
  @keyframes onbrw-instr {
    0%, 32%     { opacity: 0; transform: translate(-50%, 6px); }
    40%, 70%    { opacity: 1; transform: translate(-50%, 0); }
    78%, 100%   { opacity: 0; transform: translate(-50%, 4px); }
  }
  @keyframes onbrw-bar1 { 0%,100% { height: 4px; } 50% { height: 9px; } }
  @keyframes onbrw-bar2 { 0%,100% { height: 7px; } 50% { height: 2px; } }
  @keyframes onbrw-bar3 { 0%,100% { height: 9px; } 50% { height: 5px; } }
  @keyframes onbrw-bar4 { 0%,100% { height: 3px; } 50% { height: 8px; } }
  @keyframes onbrw-bar5 { 0%,100% { height: 6px; } 50% { height: 2px; } }

  .onbrw-cursor    { animation: onbrw-cursor 6.4s ease-in-out infinite; }
  .onbrw-selection { animation: onbrw-selection 6.4s ease-in-out infinite; transform-origin: left center; }
  .onbrw-before    { animation: onbrw-before 6.4s ease-in-out infinite; }
  .onbrw-after     { animation: onbrw-after 6.4s ease-in-out infinite; }
  .onbrw-pill      { animation: onbrw-pill 6.4s ease-in-out infinite; }
  .onbrw-instr     { animation: onbrw-instr 6.4s ease-in-out infinite; }
  .onbrw-bar1 { animation: onbrw-bar1 0.7s ease-in-out infinite; }
  .onbrw-bar2 { animation: onbrw-bar2 0.6s ease-in-out infinite; }
  .onbrw-bar3 { animation: onbrw-bar3 0.55s ease-in-out infinite; }
  .onbrw-bar4 { animation: onbrw-bar4 0.65s ease-in-out infinite; }
  .onbrw-bar5 { animation: onbrw-bar5 0.5s ease-in-out infinite; }
`

function RewriteDemo() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % REWRITE_ORDER.length), 6400)
    return () => window.clearInterval(id)
  }, [])
  const s = REWRITE_ORDER[idx]
  return (
    <div className="bg-card border border-ink-08 rounded-[14px] overflow-hidden max-w-[640px]">
      <div key={s} className="animate-stepIn">
        {s === 'gmail'    && <RewriteGmailMock />}
        {s === 'notion'   && <RewriteNotionMock />}
        {s === 'imessage' && <RewriteIMessageMock />}
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3 pt-2 border-t border-ink-08 bg-paper/40">
        {REWRITE_ORDER.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={[
              'h-1 rounded-full transition-all duration-300',
              i === idx ? 'w-5 bg-ink' : 'w-1.5 bg-ink-08 hover:bg-ink-45',
            ].join(' ')}
            aria-label={`Show ${REWRITE_ORDER[i]} example`}
          />
        ))}
      </div>
    </div>
  )
}

// MiniPill listening render — same shell used by all three rewrite
// mocks. Pinned to bottom-center of the mock by the parent.
function RewriteMiniPill() {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-white"
      style={{
        background: 'linear-gradient(180deg, rgba(18,20,26,0.92) 0%, rgba(14,16,22,0.88) 100%)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.36), inset 0 -1px 0 rgba(0,0,0,0.4), ' +
          '0 6px 14px -6px rgba(0,0,0,0.55)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#E84A3A]"
        style={{ boxShadow: '0 0 6px rgba(232,74,58,0.7)' }}
      />
      <div className="flex items-end gap-[1.5px] h-2.5">
        <span className="onbrw-bar1 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
        <span className="onbrw-bar2 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
        <span className="onbrw-bar3 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
        <span className="onbrw-bar4 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
        <span className="onbrw-bar5 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
      </div>
      <span
        className="text-[10px] leading-none ml-0.5"
        style={{
          fontStyle: 'italic',
          fontFamily: '"Instrument Serif", Georgia, serif',
        }}
      >
        listening
      </span>
    </div>
  )
}

// Helper — the dark italic instruction bubble that pops in above the
// pill while Yappr is listening. Pinned bottom-center by the parent.
function InstructionBubble({ text }: { text: string }) {
  return (
    <div
      className="text-[10.5px] px-2.5 py-1 rounded-pill bg-[#1c1c1e] text-white whitespace-nowrap shadow-lg"
      style={{
        fontStyle: 'italic',
        fontFamily: '"Instrument Serif", Georgia, serif',
      }}
    >
      "{text}"
    </div>
  )
}

// ─── Rewrite mock: Gmail (formal) ─────────────────────────────────
function RewriteGmailMock() {
  return (
    <div className="relative bg-white h-[320px] overflow-hidden">
      <style>{REWRITE_TIMELINE}</style>

      {/* Chrome */}
      <div className="px-3 py-2 border-b border-ink-08 bg-[#F6F8FC] flex items-center gap-3 shrink-0">
        <TrafficLights />
        <div className="text-[11px] text-ink-45 font-mono">Gmail · Compose</div>
      </div>

      <div className="px-6 py-5">
        <div className="text-[10.5px] text-ink-45 mb-1">To: alex@team.com</div>
        <div className="text-[10.5px] text-ink-45 mb-3">Subject: Quick favor</div>

        {/* Before / after stack with absolute overlay */}
        <div className="relative">
          {/* Before — selectable line */}
          <div className="onbrw-before text-[13px] leading-relaxed text-ink relative inline-block">
            hey can you send me that doc when you have a sec
            {/* Native-blue selection rectangle — scaleX from 0→1 */}
            <span
              className="onbrw-selection absolute inset-0 bg-[#B4D8FF]/55 pointer-events-none rounded-[2px]"
            />
            {/* Cursor — drifts left → right across the line */}
            <span className="onbrw-cursor absolute -top-1 left-0">
              <MacCursor />
            </span>
          </div>

          {/* After — fades in over before */}
          <div className="onbrw-after absolute top-0 left-0 text-[13px] leading-relaxed text-ink font-medium">
            When you have a moment, could you please send me that document?
          </div>
        </div>
      </div>

      {/* Instruction bubble + pill — pinned bottom-center */}
      <div className="onbrw-instr absolute left-1/2 pointer-events-none" style={{ bottom: 52 }}>
        <InstructionBubble text="make it more formal" />
      </div>
      <div className="onbrw-pill absolute left-1/2 pointer-events-none" style={{ bottom: 16 }}>
        <RewriteMiniPill />
      </div>
    </div>
  )
}

// ─── Rewrite mock: Notion (compress) ──────────────────────────────
function RewriteNotionMock() {
  return (
    <div className="relative bg-white h-[320px] overflow-hidden">
      <style>{REWRITE_TIMELINE}</style>

      <div className="px-3 py-2 border-b border-ink-08 bg-[#FAFAF7] flex items-center gap-3 shrink-0">
        <TrafficLights />
        <div className="text-[11px] text-ink-45 font-mono">Notion · Migration plan</div>
      </div>

      <div className="px-6 py-5">
        <div className="text-[15px] font-semibold mb-2.5 text-ink">Database migration</div>

        <div className="relative">
          <div className="onbrw-before text-[12px] leading-relaxed text-ink-60 relative inline-block">
            The migration will require updating the schema, backfilling the new column, switching reads over, and finally dropping the old column once we verify nothing breaks.
            <span className="onbrw-selection absolute inset-0 bg-[#B4D8FF]/55 pointer-events-none rounded-[2px]" />
            <span className="onbrw-cursor absolute -top-1 left-0">
              <MacCursor />
            </span>
          </div>
          <div className="onbrw-after absolute top-0 left-0 text-[12px] leading-relaxed text-ink font-medium">
            The migration adds a column, backfills it, swaps reads, then drops the old one.
          </div>
        </div>
      </div>

      <div className="onbrw-instr absolute left-1/2 pointer-events-none" style={{ bottom: 52 }}>
        <InstructionBubble text="tighten this to one sentence" />
      </div>
      <div className="onbrw-pill absolute left-1/2 pointer-events-none" style={{ bottom: 16 }}>
        <RewriteMiniPill />
      </div>
    </div>
  )
}

// ─── Rewrite mock: iMessage (soften) ──────────────────────────────
function RewriteIMessageMock() {
  return (
    <div className="relative bg-[#f2f2f7] h-[320px] overflow-hidden">
      <style>{REWRITE_TIMELINE}</style>

      <div className="px-3 py-2 border-b border-ink-08 bg-white/85 flex items-center gap-3 shrink-0">
        <TrafficLights />
        <div className="text-[11px] text-ink-45 font-mono">iMessage · Sam</div>
      </div>

      <div className="px-6 py-5 flex justify-end">
        {/* iMessage outgoing bubble */}
        <div className="relative max-w-[300px]">
          <div className="onbrw-before bg-[#0b93f6] text-white text-[13px] leading-snug px-3 py-1.5 rounded-[18px] rounded-br-[4px] relative">
            I disagree with this approach for several reasons
            <span className="onbrw-selection absolute inset-1 bg-white/30 pointer-events-none rounded-[2px]" />
            <span className="onbrw-cursor absolute -top-2 left-2">
              <MacCursor />
            </span>
          </div>
          <div className="onbrw-after absolute top-0 left-0 right-0 bg-[#0b93f6] text-white text-[13px] leading-snug px-3 py-1.5 rounded-[18px] rounded-br-[4px]">
            I see this differently — here's where I'm hesitant.
          </div>
        </div>
      </div>

      <div className="onbrw-instr absolute left-1/2 pointer-events-none" style={{ bottom: 52 }}>
        <InstructionBubble text="soften the tone" />
      </div>
      <div className="onbrw-pill absolute left-1/2 pointer-events-none" style={{ bottom: 16 }}>
        <RewriteMiniPill />
      </div>
    </div>
  )
}

// ─── Step 8: AI coding mode ────────────────────────────────────────
// IDEs and terminals get a different cleanup pass that preserves code
// faithfully + a quick note on the built-in dictionary so users know
// brand names won't get mangled.

function StepAICoding({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <h1 className="text-[42px] leading-[0.98] tracking-tight mb-4">
        Built for <span className="font-display italic font-medium inline-block animate-heroPop origin-bottom-left">AI coding.</span>
      </h1>
      <p
        className="text-[13.5px] text-ink-60 leading-relaxed max-w-[520px] mb-6 animate-slideUp"
        style={{ animationDelay: '140ms' }}
      >
        When you dictate in Cursor, Claude Code, Warp, or any IDE, Yappr keeps it faithful — code stays as code, brand names get the right capitalization, and your variable names come out exact.
      </p>

      <div className="animate-slideUp" style={{ animationDelay: '280ms' }}>
        <AICodingDemo />
      </div>

      <p
        className="text-[11px] text-ink-45 mt-4 max-w-[520px] leading-relaxed animate-slideUp"
        style={{ animationDelay: '420ms' }}
      >
        Add your own jargon, names, and product terms any time in <span className="font-mono">Settings → Dictionary</span>.
      </p>

      <div className="mt-5 animate-slideUp" style={{ animationDelay: '540ms' }}>
        <Pill variant="primary" onClick={onContinue}>
          Got it <span>→</span>
        </Pill>
      </div>
    </>
  )
}

// Live AI-coding demo. A Cursor-style IDE mock with the AI chat panel
// open. Cycles three scenarios every 6s: each shows the raw spoken
// transcript fading out into the polished chat-prompt version with
// preserved variables/backticks/brand-names. MiniPill sits at the
// bottom-center of the IDE frame in listening state during the
// "speaking" beat.

type CodingScenario = {
  /** What the user actually says — shown briefly. Underline-decorated
   *  spans flag variable names that need preservation. */
  spoken: React.ReactNode
  /** The cleaned chat-pane content Yappr pastes. */
  polished: React.ReactNode
}

const CODING_SAMPLES: CodingScenario[] = [
  {
    spoken: <>"add a function called <span className="underline decoration-[#5A8FE8] decoration-2 underline-offset-2">get user by id</span> that takes a string and returns a promise"</>,
    polished: (
      <>
        Add a function called <CodeChip>getUserById</CodeChip> that takes a string and returns a promise.
      </>
    ),
  },
  {
    spoken: <>"push to <span className="underline decoration-[#5A8FE8] decoration-2 underline-offset-2">git hub</span> and run <span className="underline decoration-[#5A8FE8] decoration-2 underline-offset-2">koob control</span> apply"</>,
    polished: (
      <>
        Push to <CodeChip plain>GitHub</CodeChip> and run <CodeChip>kubectl apply</CodeChip>.
      </>
    ),
  },
  {
    spoken: <>"open a <span className="underline decoration-[#5A8FE8] decoration-2 underline-offset-2">P R</span> against <span className="underline decoration-[#5A8FE8] decoration-2 underline-offset-2">main</span> and tag <span className="underline decoration-[#5A8FE8] decoration-2 underline-offset-2">cloud</span>"</>,
    polished: (
      <>
        Open a PR against <CodeChip>main</CodeChip> and tag <CodeChip plain>Claude</CodeChip>.
      </>
    ),
  },
]

function CodeChip({ children, plain }: { children: React.ReactNode; plain?: boolean }) {
  if (plain) {
    // Brand name — kept as prose, not a backtick chip
    return (
      <span className="font-medium underline decoration-[#2B7FFF] decoration-2 underline-offset-2">
        {children}
      </span>
    )
  }
  return (
    <span
      className="font-mono text-[12px] bg-[#5A8FE8]/15 text-ink rounded px-1 py-0.5"
      style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}
    >
      `{children}`
    </span>
  )
}

function AICodingDemo() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % CODING_SAMPLES.length), 6400)
    return () => window.clearInterval(id)
  }, [])
  const s = CODING_SAMPLES[idx]
  return (
    <div className="bg-card border border-ink-08 rounded-[14px] overflow-hidden max-w-[640px]">
      <div key={idx} className="animate-stepIn">
        <CursorIdeMock spoken={s.spoken} polished={s.polished} />
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3 pt-2 border-t border-ink-08 bg-paper/40">
        {CODING_SAMPLES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={[
              'h-1 rounded-full transition-all duration-300',
              i === idx ? 'w-5 bg-ink' : 'w-1.5 bg-ink-08 hover:bg-ink-45',
            ].join(' ')}
            aria-label={`Scenario ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

const CODING_TIMELINE = `
  /* 6.4s cycle:
       0–18%   IDE at rest (no chat input, idle dim pill at bottom)
       18–28%  spoken transcript fades in, pill brightens to listening
       28–62%  spoken transcript visible
       62–72%  spoken fades out as polished fades in, pill → polishing
       72–94%  polished prompt visible in the chat input, pill → done
       94–100% pill fades back toward idle                              */

  @keyframes onbai-spoken {
    0%, 18%   { opacity: 0; transform: translateY(2px); }
    26%, 60%  { opacity: 1; transform: translateY(0); }
    66%, 100% { opacity: 0; transform: translateY(0); }
  }
  @keyframes onbai-polished {
    0%, 64%   { opacity: 0; transform: translateY(2px); }
    72%, 94%  { opacity: 1; transform: translateY(0); }
    96%, 100% { opacity: 0; transform: translateY(0); }
  }
  @keyframes onbai-pillListen {
    0%, 18%   { opacity: 0; }
    24%, 62%  { opacity: 1; }
    66%, 100% { opacity: 0; }
  }
  @keyframes onbai-pillPolish {
    0%, 65%   { opacity: 0; }
    70%, 80%  { opacity: 1; }
    83%, 100% { opacity: 0; }
  }
  @keyframes onbai-pillDone {
    0%, 81%   { opacity: 0; }
    84%, 94%  { opacity: 1; }
    96%, 100% { opacity: 0; }
  }
  @keyframes onbai-pillIdle {
    0%, 17%   { opacity: 0.55; }
    20%, 95%  { opacity: 0; }
    98%, 100% { opacity: 0.55; }
  }
  @keyframes onbai-caret { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }

  @keyframes onbai-bar1 { 0%,100% { height: 4px; } 50% { height: 9px; } }
  @keyframes onbai-bar2 { 0%,100% { height: 7px; } 50% { height: 2px; } }
  @keyframes onbai-bar3 { 0%,100% { height: 9px; } 50% { height: 5px; } }
  @keyframes onbai-bar4 { 0%,100% { height: 3px; } 50% { height: 8px; } }
  @keyframes onbai-bar5 { 0%,100% { height: 6px; } 50% { height: 2px; } }

  .onbai-spoken     { animation: onbai-spoken     6.4s ease-in-out infinite; }
  .onbai-polished   { animation: onbai-polished   6.4s ease-in-out infinite; }
  .onbai-pillIdle   { animation: onbai-pillIdle   6.4s ease-in-out infinite; }
  .onbai-pillListen { animation: onbai-pillListen 6.4s ease-in-out infinite; }
  .onbai-pillPolish { animation: onbai-pillPolish 6.4s ease-in-out infinite; }
  .onbai-pillDone   { animation: onbai-pillDone   6.4s ease-in-out infinite; }
  .onbai-caret      { animation: onbai-caret 1s linear infinite; }
  .onbai-bar1 { animation: onbai-bar1 0.7s ease-in-out infinite; }
  .onbai-bar2 { animation: onbai-bar2 0.6s ease-in-out infinite; }
  .onbai-bar3 { animation: onbai-bar3 0.55s ease-in-out infinite; }
  .onbai-bar4 { animation: onbai-bar4 0.65s ease-in-out infinite; }
  .onbai-bar5 { animation: onbai-bar5 0.5s ease-in-out infinite; }
`

function CursorIdeMock({ spoken, polished }: CodingScenario) {
  return (
    <div className="relative bg-[#1a1d24] h-[320px] overflow-hidden">
      <style>{CODING_TIMELINE}</style>

      {/* Chrome — dark IDE bar */}
      <div className="px-3 py-2 border-b border-white/10 bg-[#15171c] flex items-center gap-3 shrink-0">
        <TrafficLights />
        <div className="text-[11px] text-white/50 font-mono">Cursor · src/users.ts</div>
        <div className="ml-auto text-[10px] text-white/40 font-mono">AI chat</div>
      </div>

      <div className="flex h-[calc(100%-37px)]">
        {/* Left: faux code editor */}
        <div className="flex-1 px-4 py-4 border-r border-white/10 text-[11px] font-mono space-y-1 leading-relaxed">
          <div className="text-white/30">1</div>
          <div><span className="text-[#c5a3ff]">export async function</span> <span className="text-[#82c8ff]">listUsers</span><span className="text-white/70">() {'{'}</span></div>
          <div className="pl-4 text-white/60">{'// ...'}</div>
          <div><span className="text-white/70">{'}'}</span></div>
          <div className="text-white/30">5</div>
          <div className="text-white/30">6</div>
        </div>

        {/* Right: AI chat panel — the dictation lands here */}
        <div className="w-[58%] bg-[#13151a] flex flex-col">
          <div className="px-3 py-2 border-b border-white/10 text-[10.5px] font-mono text-white/40 uppercase tracking-[0.14em]">
            Chat
          </div>

          {/* Chat input — where the prompt materializes */}
          <div className="flex-1 px-3 py-3 relative">
            <div
              className="rounded-[10px] bg-[#1c1f26] border border-white/10 px-3 py-3 min-h-[120px] text-[12.5px] leading-relaxed text-white/95 relative"
            >
              {/* Spoken raw — fades in first */}
              <div
                className="onbai-spoken text-white/65 italic"
                style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontStyle: 'italic',
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  right: 12,
                }}
              >
                {spoken}
              </div>

              {/* Polished — fades in second */}
              <div className="onbai-polished" style={{ position: 'relative' }}>
                {polished}
                <span className="onbai-caret inline-block w-[6px] h-[14px] bg-[#5A8FE8] ml-0.5 -mb-0.5 align-middle" />
              </div>
            </div>

            <div className="mt-2 text-[10px] font-mono text-white/35">
              ⌃ + your dictation
            </div>
          </div>
        </div>
      </div>

      {/* Idle pill — dim, always visible at the bottom */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none onbai-pillIdle" style={{ bottom: 12 }}>
        <BrandPillSvg width={68} height={28} />
      </div>

      {/* Listening pill — fades in while user is speaking */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none onbai-pillListen" style={{ bottom: 12 }}>
        <CodingPillShell kind="listening" />
      </div>

      {/* Polishing pill */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none onbai-pillPolish" style={{ bottom: 12 }}>
        <CodingPillShell kind="polishing" />
      </div>

      {/* Done pill — pasted */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none onbai-pillDone" style={{ bottom: 12 }}>
        <CodingPillShell kind="done" />
      </div>
    </div>
  )
}

function CodingPillShell({ kind }: { kind: 'listening' | 'polishing' | 'done' }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-white"
      style={{
        background: 'linear-gradient(180deg, rgba(18,20,26,0.95) 0%, rgba(14,16,22,0.92) 100%)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.36), 0 6px 14px rgba(0,0,0,0.5)',
      }}
    >
      {kind === 'listening' && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#E84A3A]" style={{ boxShadow: '0 0 6px rgba(232,74,58,0.7)' }} />
          <div className="flex items-end gap-[1.5px] h-2.5">
            <span className="onbai-bar1 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbai-bar2 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbai-bar3 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbai-bar4 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
            <span className="onbai-bar5 w-[1.5px] rounded-[0.5px] bg-[#5A8FE8]" />
          </div>
          <span className="text-[10px] leading-none italic ml-0.5" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
            listening
          </span>
        </>
      )}
      {kind === 'polishing' && (
        <>
          <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-[#5A8FE8] animate-spin" />
          <span className="text-[10px] leading-none italic ml-0.5" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
            polishing…
          </span>
        </>
      )}
      {kind === 'done' && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
          <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5L4.5 8L9 3" stroke="#5A8FE8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[10px] leading-none italic ml-0.5" style={{ color: '#5A8FE8', fontFamily: '"Instrument Serif", Georgia, serif' }}>
            pasted
          </span>
        </>
      )}
    </div>
  )
}
