import { useEffect, useState } from 'react'
import type { NotchGeometry } from '../../global'
import { Toggle } from '../../shared/ui/Toggle'
import { Pill } from '../../shared/ui/Pill'
import { Panel, SettingRow, StackRow } from '../../shared/ui/Panel'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { MenuBar, NotchMark } from '../../shared/ui/NotchMark'
import {
  clampPlaceholderWidth,
  PLACEHOLDER_MIN_PT,
  PLACEHOLDER_MAX_PT,
} from '../../indicator/notch-states'

export default function GeneralTab() {
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [inputDeviceId, setInputDeviceId] = useState<string | null>(null)
  const [audioCues, setAudioCues] = useState<boolean>(true)
  const [pauseMedia, setPauseMedia] = useState<boolean>(true)

  useEffect(() => {
    window.yappr.getLaunchAtLogin().then(setLaunchAtLogin)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      navigator.mediaDevices.enumerateDevices(),
      window.yappr.getSettings(),
    ]).then(([devices, settings]) => {
      if (cancelled) return
      setMics(devices.filter((d) => d.kind === 'audioinput'))
      setInputDeviceId(settings.inputDeviceId)
      setAudioCues(settings.audioCues)
      setPauseMedia(settings.pauseMediaWhileDictating)
    })
    return () => { cancelled = true }
  }, [])

  function handleSelectMic(id: string | null) {
    setInputDeviceId(id)
    window.yappr.setSettings({ inputDeviceId: id })
  }

  function toggleAudioCues(next: boolean) {
    setAudioCues(next)
    window.yappr.setSettings({ audioCues: next })
  }

  function togglePauseMedia(next: boolean) {
    setPauseMedia(next)
    window.yappr.setSettings({ pauseMediaWhileDictating: next })
  }

  async function toggleLaunchAtLogin(next: boolean) {
    setLaunchAtLogin(next)
    await window.yappr.setLaunchAtLogin(next)
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        headline={<>The <em className="italic">quiet</em> settings.</>}
        body="Which mic, what happens at login, and how the indicator sits in your notch."
      />

      <GroupLabel>Input</GroupLabel>
      <Panel className="mb-6">
        <SettingRow title="Microphone" desc="Which input device Yappr records from.">
          <select
            value={inputDeviceId ?? ''}
            onChange={(e) => handleSelectMic(e.target.value || null)}
            className="bg-paper border border-line rounded-input px-3 py-1.5 text-[12px] focus:outline-none focus:border-ink-45 max-w-[240px]"
          >
            <option value="">Default — system microphone</option>
            {mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Unnamed microphone'}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          title="Audio cues"
          desc="A subtle blip when recording starts and ends."
        >
          <Toggle on={audioCues} onChange={toggleAudioCues} label="Audio cues" />
        </SettingRow>
        {/* Ported from fix/short-utterance-latency, which added this row
            against the old markup. HEAD had already rebuilt this tab on
            SettingRow, so it's re-expressed here rather than merged as-is —
            the feature is theirs, the idiom is HEAD's. */}
        <SettingRow
          title="Pause music while dictating"
          desc="Pauses Music and Spotify, then resumes them. Keeps speakers out of the mic."
          last
        >
          <Toggle
            on={pauseMedia}
            onChange={togglePauseMedia}
            label="Pause music while dictating"
          />
        </SettingRow>
      </Panel>

      <GroupLabel>Startup</GroupLabel>
      <Panel className="mb-6">
        <SettingRow
          title="Launch at login"
          desc="Yappr starts in the background when you log in."
        >
          {launchAtLogin === null ? (
            <span className="text-[11px] text-ink-45">Loading…</span>
          ) : (
            <Toggle on={launchAtLogin} onChange={toggleLaunchAtLogin} label="Launch at login" />
          )}
        </SettingRow>
        <SettingRow
          title="Onboarding"
          desc="Walk through the welcome flow again. Your settings are kept."
          last
        >
          <Pill variant="secondary" size="sm" onClick={() => window.yappr.openOnboarding()}>
            Reopen
          </Pill>
        </SettingRow>
      </Panel>

      <GroupLabel>Indicator</GroupLabel>
      <NotchCalibration />

      <GroupLabel className="mt-6">Cleanup key</GroupLabel>
      <CleanupKey />
      <OldModelCleanup />
    </div>
  )
}

// The one surviving piece of the old Provider tab.
//
// Everything else there — cloud vs on-device, four Whisper tiers, a
// smart-switch toggle — is gone: transcription runs on parakeet on-device
// and cleanup goes to Groq, and neither is a choice the product offers.
//
// This field stays because the managed key isn't live yet, so a key has to
// come from somewhere for cleanup to run at all. When the key ships with
// the licence, delete this component and the row that mounts it.
// Weights left behind by retired model tiers. Yappr shipped four Whisper
// tiers before Parakeet replaced them, and their files stayed on disk with
// nothing able to reclaim them — the tier list they were selectable from
// is gone. Shown only when there is something to reclaim, so this row
// disappears for good once used.
function OldModelCleanup() {
  const [info, setInfo] = useState<{ count: number; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.yappr.getOrphanedModels?.().then(setInfo).catch(() => setInfo(null))
  }, [])

  if (!info || info.count === 0) return null

  const size = info.bytes >= 1_000_000_000
    ? `${(info.bytes / 1_000_000_000).toFixed(1)} GB`
    : `${Math.round(info.bytes / 1_000_000)} MB`

  async function remove() {
    setBusy(true)
    await window.yappr.removeOrphanedModels?.()
    const next = await window.yappr.getOrphanedModels?.().catch(() => null)
    setInfo(next ?? { count: 0, bytes: 0 })
    setBusy(false)
  }

  return (
    <Panel>
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">
        <div>
          <div className="text-[13px] font-semibold leading-tight">Old speech models</div>
          <div className="text-[11px] text-ink-45 mt-0.5">
            {size} from earlier versions of Yappr. Not used any more — transcription runs on
            the current on-device model. Safe to remove.
          </div>
        </div>
        <button
          onClick={remove}
          disabled={busy}
          className="text-[11px] font-mono px-3 py-1.5 rounded-input border border-ink-08 hover:border-ink-45 disabled:opacity-50"
        >
          {busy ? 'Removing…' : `Reclaim ${size}`}
        </button>
      </div>
    </Panel>
  )
}

function CleanupKey() {
  const [key, setKey] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    window.yappr.getSettings().then((s) => setKey(s.provider.groqKey))
  }, [])

  if (key === null) return null

  async function save(next: string) {
    setKey(next)
    setResult(null)
    const s = await window.yappr.getSettings()
    await window.yappr.setSettings({ provider: { ...s.provider, groqKey: next } })
  }

  async function test() {
    setTesting(true)
    setResult(await window.yappr.testProvider('groq', key ?? ''))
    setTesting(false)
  }

  return (
    <Panel>
      <div className="px-5 py-4">
        <div className="flex items-stretch gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => save(e.target.value)}
            placeholder="gsk_…"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-paper border border-line rounded-input px-3 py-2.5 text-[12.5px] font-mono placeholder:text-ink-45 focus:outline-none focus:border-ink-45 focus:ring-2 focus:ring-ink-08"
          />
          <Pill
            variant={result?.ok ? 'ok' : 'primary'}
            size="sm"
            onClick={test}
            disabled={testing || !key.trim()}
          >
            {testing ? '…' : result?.ok ? 'Connected' : 'Test'}
          </Pill>
        </div>
        <div className="flex items-center justify-between gap-4 mt-2.5">
          <p className="text-[11px] text-ink-60 leading-relaxed max-w-[54ch]">
            Transcription runs on this Mac and needs nothing. Cleanup — register,
            structure, prompt shaping — runs on Groq. Stored on this Mac only.{' '}
            <button
              onClick={() => window.open('https://console.groq.com', '_blank')}
              className="text-ink-60 hover:text-ink underline underline-offset-2"
            >
              Get a key ↗
            </button>
          </p>
          {result && !result.ok && (
            <span className="text-[11px] text-danger shrink-0">{result.error}</span>
          )}
        </div>
      </div>
    </Panel>
  )
}

// Notch calibration.
//
// This replaces an "Indicator position → Reset" row that wrote
// `indicatorPosition: null`. Nothing has read that value since the
// indicator moved into the notch — the shape is anchored to the housing
// and cannot be dragged — so the button was a control for a setting that
// no longer exists.
//
// What IS worth exposing is the one number the app genuinely cannot read.
// Electron exposes neither NSScreen.safeAreaInsets nor
// auxiliaryTopLeftArea, so notch WIDTH is estimated from display metrics
// and calibrated against one machine. When the estimate is off, the wings
// either tuck under the housing or float away from it — visible, annoying,
// and until now unfixable without editing the settings file by hand.
function NotchCalibration() {
  const [geometry, setGeometry] = useState<NotchGeometry | null>(null)
  const [override, setOverride] = useState<number | null>(null)
  const [noNotchMode, setNoNotchMode] = useState<'hidden' | 'placeholder'>('hidden')
  const [placeholderWidth, setPlaceholderWidth] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([window.yappr.getNotchGeometry(), window.yappr.getSettings()]).then(
      ([g, s]) => {
        setGeometry(g)
        setOverride(s.notchWidthOverride)
        setNoNotchMode(s.noNotchIndicator)
        setPlaceholderWidth(s.placeholderWidth)
        setLoaded(true)
      },
    )
  }, [])

  function commitMode(next: 'hidden' | 'placeholder') {
    setNoNotchMode(next)
    window.yappr.setSettings({ noNotchIndicator: next })
    window.yappr.getNotchGeometry().then(setGeometry)
  }

  function commitPlaceholderWidth(next: number | null) {
    setPlaceholderWidth(next)
    window.yappr.setSettings({ placeholderWidth: next })
    window.yappr.getNotchGeometry().then(setGeometry)
  }

  // Writing on every drag frame is fine: setSettings is an in-process
  // invoke and the indicator repaints from the broadcast, which is what
  // makes this a live preview rather than a number you set blind.
  function commit(next: number | null) {
    setOverride(next)
    window.yappr.setSettings({ notchWidthOverride: next })
    window.yappr.getNotchGeometry().then(setGeometry)
  }

  if (!loaded) {
    return (
      <Panel>
        <div className="px-5 py-4 text-[11.5px] text-ink-45">Reading display…</div>
      </Panel>
    )
  }

  // No cutout: an Air, an external monitor, or any Windows machine.
  // There is nothing to calibrate here — no hardware to line the shape up
  // with — so this is preference, not calibration, and the controls say so.
  if (geometry && !geometry.hasNotch) {
    const showing = noNotchMode === 'placeholder'
    const width = clampPlaceholderWidth(placeholderWidth)
    return (
      <Panel>
        <StackRow
          title="No notch on this display"
          desc="There's no housing for the indicator to hide in, so Yappr keeps out of the way by default. Turn on the placeholder if you'd rather see something while you dictate."
          aside={
            <Toggle
              on={showing}
              onChange={(next) => commitMode(next ? 'placeholder' : 'hidden')}
              label="Show a placeholder"
            />
          }
          last={!showing}
        >
          {!showing && (
            <p className="text-[11px] text-ink-45 leading-snug max-w-[62ch]">
              Nothing is drawn at the top of the screen. Dictation still works exactly
              the same — you just won't see the indicator while it's recording.
            </p>
          )}
        </StackRow>

        {showing && (
          <StackRow
            title="Placeholder width"
            desc="Cosmetic only — there's no cutout to match, so pick whatever size you like sitting at the top of the screen."
            last
          >
            <div className="rounded-[12px] overflow-hidden border border-line mb-4">
              <div className="bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)] pt-0 pb-8">
                <MenuBar>
                  <NotchMark state="recording" notchWidth={Math.round(width * 0.42)} />
                </MenuBar>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <input
                type="range"
                min={PLACEHOLDER_MIN_PT}
                max={PLACEHOLDER_MAX_PT}
                step={1}
                value={width}
                onChange={(e) => commitPlaceholderWidth(Number(e.target.value))}
                aria-label="Placeholder width in points"
                className="flex-1 accent-ink h-1 cursor-pointer"
              />
              <span className="text-[12px] font-mono text-ink w-[62px] text-right tabular-nums">
                {width} pt
              </span>
              <Pill
                variant="secondary"
                size="sm"
                onClick={() => commitPlaceholderWidth(null)}
                disabled={placeholderWidth === null}
              >
                Reset
              </Pill>
            </div>
          </StackRow>
        )}
      </Panel>
    )
  }

  const width = override ?? geometry?.width ?? 200

  return (
    <Panel>
      <StackRow
        title="Notch width"
        desc="macOS doesn't tell apps how wide the notch is, so Yappr estimates it. If the wings tuck under the housing or float away from it, nudge this until the shape's edges meet the black."
        aside={
          <span className="text-[11.5px] text-ink-45 shrink-0">
            {override === null ? 'estimated' : 'calibrated'}
          </span>
        }
        last
      >
        {/* Live preview. The real indicator on screen moves with the
            slider too — this is here so you can see the fit without
            looking up at the menu bar mid-drag. */}
        <div className="rounded-[12px] overflow-hidden border border-line mb-4">
          <div className="bg-[linear-gradient(135deg,#6E83A8_0%,#5A7196_55%,#4F6585_100%)] pt-0 pb-8">
            <MenuBar>
              <NotchMark state="recording" notchWidth={Math.round(width * 0.42)} />
            </MenuBar>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min={120}
            max={260}
            step={1}
            value={width}
            onChange={(e) => commit(Number(e.target.value))}
            aria-label="Notch width in points"
            className="flex-1 accent-ink h-1 cursor-pointer"
          />
          <span className="text-[12px] font-mono text-ink w-[62px] text-right tabular-nums">
            {Math.round(width)} pt
          </span>
          <Pill
            variant="secondary"
            size="sm"
            onClick={() => commit(null)}
            disabled={override === null}
          >
            Use estimate
          </Pill>
        </div>
      </StackRow>
    </Panel>
  )
}
