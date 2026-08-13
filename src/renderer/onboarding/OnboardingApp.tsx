import { useEffect, useState } from 'react'
import type { CategoryStrictness, Settings, Strictness } from '../../shared/types'
import { Pill } from '../shared/ui/Pill'
import { Toggle } from '../shared/ui/Toggle'
import { Wordmark } from '../shared/ui/Wordmark'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'

// Setup, in the same language as the app it sets up: cream paper, one
// italic serif line per screen, the real notch indicator, one thing to do.
//
// It was nine steps and ~2,700 lines. Three of those steps were feature
// tours with no decision in them, and one of those tours taught a floating
// indicator this app stopped shipping.
//
// A fourth step is gone for a different reason: it asked which engine to
// run and which API key to use. That is not a question a person who just
// paid for a dictation app can answer, and it is not one they should have
// to — transcription is our problem, not theirs. Setup now collects only
// what genuinely belongs to the user: their permissions, their key, and
// how much clean-up they want.

const STEPS = ['Welcome', 'Permissions', 'Hotkey', 'Polish', 'Done'] as const
type Step = number

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

const KEY_GLYPH: Record<string, string> = {
  CTRL: '⌃', ALT: '⌥', SHIFT: '⇧', META: '⌘',
}
const KEY_NAME: Record<string, string> = {
  '⌃': 'Control', '⌥': 'Option', '⇧': 'Shift', '⌘': 'Command',
}
function glyphFor(key: string): string {
  return KEY_GLYPH[key] ?? key.toLowerCase()
}

export default function OnboardingApp() {
  const [step, setStep] = useState<Step>(0)
  const [hotkey, setHotkey] = useState('CTRL')
  const [listening, setListening] = useState(false)
  const [emojiInMessages, setEmojiInMessages] = useState(false)
  const [strictness, setStrictness] = useState<CategoryStrictness>({
    personal: 1, work: 3, writing: 2,
  })
  const [micGranted, setMicGranted] = useState(false)
  const [accessibilityGranted, setAccessibilityGranted] = useState(false)
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [inputDeviceId, setInputDeviceId] = useState<string | null>(null)

  // Poll real OS permission state while on the permissions step. macOS
  // grants happen in System Settings, outside this window, so there is no
  // event to listen for.
  useEffect(() => {
    if (step !== 1) return
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
    return () => { cancelled = true; window.clearInterval(id) }
  }, [step])

  // Device labels only exist after the grant, so this can't run earlier.
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
      const saved = settings.inputDeviceId
      setInputDeviceId(saved && mics.some((m) => m.deviceId === saved) ? saved : null)
    })
    return () => { cancelled = true }
  }, [micGranted])

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

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  async function finish() {
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
    <div className="h-screen bg-paper text-ink font-sans flex flex-col overflow-hidden select-none">
      {/* OS drag strip. Without it a hiddenInset window can't be moved
          while focused — the renderer eats the click first. */}
      <div
        className="absolute top-0 left-0 right-0 h-8 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <header className="pl-[88px] pr-7 pt-5 pb-2 flex items-center justify-between shrink-0">
        <div className="inline-flex items-center gap-3">
          <Wordmark size="inline" />
          <span className="font-mono text-[10px] text-ink-45 tabular-nums tracking-[0.14em]">
            {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
          </span>
        </div>
        {step > 0 && step < STEPS.length - 1 && (
          <button
            onClick={back}
            className="text-[11.5px] text-ink-45 hover:text-ink transition-colors"
          >
            ← back
          </button>
        )}
      </header>

      {/* Progress hairline — the whole chrome the old flow spent a header
          row on, in 2px. */}
      <div className="h-[2px] bg-line-soft mx-7 shrink-0 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <main key={step} className="flex-1 min-h-0 overflow-auto px-14 py-8 animate-stepIn">
        {step === 0 && <Welcome onNext={next} />}
        {step === 1 && (
          <Permissions
            micGranted={micGranted}
            accessibilityGranted={accessibilityGranted}
            onRequestMic={async () => setMicGranted(await window.yappr.requestMicPermission())}
            onOpenAccessibility={() => window.yappr.openAccessibilitySettings()}
            micDevices={micDevices}
            inputDeviceId={inputDeviceId}
            onSelectMic={(id) => {
              setInputDeviceId(id)
              window.yappr.setSettings({ inputDeviceId: id })
            }}
            onNext={next}
          />
        )}
        {step === 2 && (
          <HotkeyStep
            hotkey={hotkey}
            listening={listening}
            onToggleListen={() => setListening((l) => !l)}
            onNext={next}
          />
        )}
        {step === 3 && (
          <PolishStep
            value={strictness}
            onChange={setStrictness}
            emoji={emojiInMessages}
            onEmoji={setEmojiInMessages}
            onNext={next}
          />
        )}
        {step === 4 && <Done hotkey={hotkey} onFinish={finish} />}
      </main>
    </div>
  )
}

// ─── Shared step furniture ──────────────────────────────────────────

function StepHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: React.ReactNode
  lede?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        {eyebrow}
      </div>
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-3">
        {title}
      </h1>
      {lede && (
        <p className="text-[13.5px] text-ink-60 leading-relaxed max-w-[52ch]">{lede}</p>
      )}
    </div>
  )
}

// ─── 01 Welcome ─────────────────────────────────────────────────────

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="max-w-[640px]">
      <StepHead
        eyebrow="Welcome"
        title={<>Hold a key. <em className="italic">Say anything.</em></>}
        lede="Yappr listens while you hold your key, cleans up what you said, and types it where you were already typing — shaped for the app you're in."
      />

      {/* The indicator, doing the thing, before a word of explanation. */}
      <div className="rounded-hero overflow-hidden border border-line mb-7 bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)]">
        <MenuBar>
          <NotchMark state="recording" notchWidth={92} />
        </MenuBar>
        <div className="h-[92px]" />
      </div>

      <Pill variant="primary" onClick={onNext}>Set it up →</Pill>
      <p className="text-[11px] text-ink-45 mt-4">Four screens. About a minute.</p>
    </div>
  )
}

// ─── 02 Permissions ─────────────────────────────────────────────────

function Permissions({
  micGranted,
  accessibilityGranted,
  onRequestMic,
  onOpenAccessibility,
  micDevices,
  inputDeviceId,
  onSelectMic,
  onNext,
}: {
  micGranted: boolean
  accessibilityGranted: boolean
  onRequestMic: () => void
  onOpenAccessibility: () => void
  micDevices: MediaDeviceInfo[]
  inputDeviceId: string | null
  onSelectMic: (id: string | null) => void
  onNext: () => void
}) {
  return (
    <div className="max-w-[640px]">
      <StepHead
        eyebrow="Permissions"
        title={<>Two <em className="italic">switches</em>, once.</>}
        lede="macOS keeps these behind System Settings. Yappr can't work around either, and asks for nothing else."
      />

      <div className="bg-card border border-line rounded-card overflow-hidden mb-6">
        <PermissionRow
          title="Microphone"
          desc="So Yappr can hear you. Audio is never written to disk."
          granted={micGranted}
          action={<Pill variant="secondary" size="sm" onClick={onRequestMic}>Allow</Pill>}
        />
        <PermissionRow
          title="Accessibility"
          desc="So the cleaned text can be typed into the app you're in."
          granted={accessibilityGranted}
          action={<Pill variant="secondary" size="sm" onClick={onOpenAccessibility}>Open settings</Pill>}
          last={!micGranted}
        />
        {micGranted && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
            <div>
              <div className="text-[13px] font-semibold">Input device</div>
              <div className="text-[11px] text-ink-45 mt-1">Which microphone to record from.</div>
            </div>
            <select
              value={inputDeviceId ?? ''}
              onChange={(e) => onSelectMic(e.target.value || null)}
              className="bg-paper border border-line rounded-input px-3 py-1.5 text-[12px] max-w-[240px] focus:outline-none focus:border-cobalt"
            >
              <option value="">Default — system microphone</option>
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Unnamed microphone'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Pill variant="primary" onClick={onNext} disabled={!micGranted}>
          Continue →
        </Pill>
        {!micGranted && (
          <span className="text-[11.5px] text-ink-45">Microphone is required.</span>
        )}
        {micGranted && !accessibilityGranted && (
          <span className="text-[11.5px] text-ink-45">
            Without Accessibility, text lands on your clipboard instead.
          </span>
        )}
      </div>
    </div>
  )
}

function PermissionRow({
  title,
  desc,
  granted,
  action,
  last,
}: {
  title: string
  desc: string
  granted: boolean
  action: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4',
        last ? '' : 'border-b border-line-soft',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          {title}
          {granted && (
            <span className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-[0.14em] text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok" /> granted
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-45 mt-1">{desc}</div>
      </div>
      {granted ? (
        <span className="text-[11.5px] font-mono text-ink-45 px-3">done</span>
      ) : (
        action
      )}
    </div>
  )
}

// ─── 04 Hotkey ──────────────────────────────────────────────────────

function HotkeyStep({
  hotkey,
  listening,
  onToggleListen,
  onNext,
}: {
  hotkey: string
  listening: boolean
  onToggleListen: () => void
  onNext: () => void
}) {
  const glyph = glyphFor(hotkey)
  return (
    <div className="max-w-[640px]">
      <StepHead
        eyebrow="Hotkey"
        title={<>Pick your <em className="italic">key</em>.</>}
        lede="Hold it to talk, tap to toggle, double-tap to paste your last dictation again. Control is a good default — it does nothing on its own."
      />

      <div className="flex items-center gap-6 mb-7">
        <button
          onClick={onToggleListen}
          aria-label="Rebind dictation key"
          className="shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5"
          style={{
            width: 96, height: 96, borderRadius: 18,
            background: 'linear-gradient(180deg, #fdfbf3 0%, #e9e1c8 100%)',
            border: listening ? '1.5px solid #C8553D' : '1px solid #c5bda0',
            boxShadow: listening
              ? '0 0 0 4px rgba(200,85,61,0.14), 0 6px 0 #b8af90, 0 12px 22px rgba(0,0,0,0.12), inset 0 2px 0 rgba(255,255,255,0.7)'
              : '0 6px 0 #b8af90, 0 12px 22px rgba(0,0,0,0.12), inset 0 2px 0 rgba(255,255,255,0.7)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <span className="font-mono text-ink leading-none" style={{ fontSize: glyph.length > 2 ? 18 : 34, fontWeight: 500 }}>
            {glyph}
          </span>
          {KEY_NAME[glyph] && (
            <span className="font-mono text-ink-45 uppercase" style={{ fontSize: 8, letterSpacing: '0.1em' }}>
              {KEY_NAME[glyph]}
            </span>
          )}
        </button>

        <div className="min-w-0">
          <div className="text-[13px] font-semibold">
            {listening ? 'Press any key…' : `${KEY_NAME[glyph] ?? hotkey} is your dictation key`}
          </div>
          <p className="text-[11.5px] text-ink-60 mt-1 leading-relaxed max-w-[38ch]">
            {listening
              ? 'The next key you press becomes it. Modifiers work on their own.'
              : 'Click the keycap to bind a different one.'}
          </p>
          <button
            onClick={onToggleListen}
            className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-45 hover:text-ink mt-2.5 transition-colors"
          >
            {listening ? 'cancel' : '↺ rebind'}
          </button>
        </div>
      </div>

      <Pill variant="primary" onClick={onNext}>Continue →</Pill>
    </div>
  )
}

// ─── 05 Polish ──────────────────────────────────────────────────────

const REGISTERS: Array<{
  id: keyof CategoryStrictness
  label: string
  apps: string
  sample: Record<Strictness, string>
}> = [
  {
    id: 'personal',
    label: 'Texting friends',
    apps: 'iMessage · WhatsApp',
    sample: {
      1: 'yeah friday works could we do 2 instead',
      2: 'yeah friday works — could we do 2 instead?',
      3: 'Friday works. Could we do 2 instead of 12?',
    },
  },
  {
    id: 'work',
    label: 'Work messages',
    apps: 'Slack · Gmail · Outlook',
    sample: {
      1: 'hey friday works can we do 2 instead',
      2: 'Hey — Friday works, could we do 2 instead?',
      3: 'Friday works for me. Could we move it to 2 rather than 12?',
    },
  },
  {
    id: 'writing',
    label: 'Docs & AI',
    apps: 'Notion · Claude · ChatGPT',
    sample: {
      1: 'the main idea is we want it to feel like it adapts',
      2: 'The main idea is that it should feel like it adapts.',
      3: 'The core idea: it should feel adaptive.',
    },
  },
]

const LEVELS: Strictness[] = [1, 2, 3]
const LEVEL_LABEL: Record<Strictness, string> = { 1: 'Light', 2: 'Balanced', 3: 'Strict' }

function PolishStep({
  value,
  onChange,
  emoji,
  onEmoji,
  onNext,
}: {
  value: CategoryStrictness
  onChange: (v: CategoryStrictness) => void
  emoji: boolean
  onEmoji: (v: boolean) => void
  onNext: () => void
}) {
  return (
    <div className="max-w-[640px]">
      <StepHead
        eyebrow="Polish"
        title={<>How much <em className="italic">clean-up</em>?</>}
        lede="Yappr matches the register of wherever you're typing. Set the starting point — you can change it any time."
      />

      <div className="bg-card border border-line rounded-card overflow-hidden mb-5">
        {REGISTERS.map((r, i) => (
          <div
            key={r.id}
            className={['px-5 py-4', i < REGISTERS.length - 1 ? 'border-b border-line-soft' : ''].join(' ')}
          >
            <div className="flex items-center justify-between gap-4 mb-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{r.label}</div>
                <div className="text-[11px] text-ink-45 mt-0.5">{r.apps}</div>
              </div>
              <div className="flex items-center gap-0.5 bg-ink/[0.05] rounded-pill p-0.5 shrink-0">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => onChange({ ...value, [r.id]: lvl })}
                    className={[
                      'px-3 py-1 rounded-pill text-[11.5px] font-medium transition-all duration-150',
                      value[r.id] === lvl ? 'bg-ink text-paper' : 'text-ink-60 hover:text-ink',
                    ].join(' ')}
                  >
                    {LEVEL_LABEL[lvl]}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[12.5px] text-ink-60 italic leading-snug">
              “{r.sample[value[r.id]]}”
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-line rounded-card px-5 py-4 mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Emoji in casual chats</div>
          <div className="text-[11px] text-ink-45 mt-1">
            One emoji when there’s something concrete to mark. Never in work messages or code.
          </div>
        </div>
        <Toggle on={emoji} onChange={onEmoji} label="Emoji in casual chats" />
      </div>

      <p className="text-[11px] text-ink-45 mb-4">
        Code and terminal are always faithful — words are never dropped there.
      </p>

      <Pill variant="primary" onClick={onNext}>Continue →</Pill>
    </div>
  )
}

// ─── 06 Done ────────────────────────────────────────────────────────

function Done({ hotkey, onFinish }: { hotkey: string; onFinish: () => void }) {
  const glyph = glyphFor(hotkey)
  const [state, setState] = useState<'recording' | 'processing' | 'done'>('recording')

  // The hand-off is a demo, not a checklist: the shape runs a full
  // dictation on a loop, so the last thing setup shows is the thing
  // you'll see next.
  //
  // Self-scheduling rather than three timers keyed off `state` — that
  // version re-ran its own effect on every transition and the cleanup
  // cancelled the timers that hadn't fired yet, so it stopped at
  // "polishing" and never came back.
  useEffect(() => {
    const CYCLE: Array<['recording' | 'processing' | 'done', number]> = [
      ['recording', 2200],
      ['processing', 1200],
      ['done', 2600],
    ]
    let i = 0
    let timer = 0
    const tick = () => {
      setState(CYCLE[i][0])
      timer = window.setTimeout(() => {
        i = (i + 1) % CYCLE.length
        tick()
      }, CYCLE[i][1])
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="max-w-[640px]">
      <StepHead
        eyebrow="Ready"
        title={<>That&rsquo;s it. <em className="italic">Go talk.</em></>}
        lede={
          <>
            Hold <span className="font-mono text-ink">{KEY_NAME[glyph] ?? hotkey}</span> anywhere on
            your Mac and say something. Yappr lives in your menu bar — the notch tells you what it&rsquo;s doing.
          </>
        }
      />

      <div className="rounded-hero overflow-hidden border border-line mb-7 bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)]">
        <MenuBar>
          <NotchMark state={state} notchWidth={92} />
        </MenuBar>
        <div className="h-[92px] flex items-center justify-center">
          <span className="text-[11.5px] font-mono text-white/70">
            {state === 'recording' ? 'hold to talk' : state === 'processing' ? 'polishing' : 'pasted'}
          </span>
        </div>
      </div>

      <Pill variant="primary" onClick={onFinish}>Start yapping</Pill>
      <p className="text-[11px] text-ink-45 mt-4">
        Everything here lives in Settings, from the menu bar icon.
      </p>
    </div>
  )
}
