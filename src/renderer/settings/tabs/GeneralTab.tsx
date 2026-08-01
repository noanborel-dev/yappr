import { useEffect, useState } from 'react'
import type { NotchGeometry } from '../../global'
import { Toggle } from '../../shared/ui/Toggle'
import { Pill } from '../../shared/ui/Pill'
import { Panel, SettingRow, StackRow } from '../../shared/ui/Panel'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { MenuBar, NotchMark } from '../../shared/ui/NotchMark'

export default function GeneralTab() {
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [inputDeviceId, setInputDeviceId] = useState<string | null>(null)
  const [audioCues, setAudioCues] = useState<boolean>(true)

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

  async function toggleLaunchAtLogin(next: boolean) {
    setLaunchAtLogin(next)
    await window.yappr.setLaunchAtLogin(next)
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        ord="07"
        label="General"
        headline={<>The <em className="italic">quiet</em> settings.</>}
        body="Which mic, what happens at login, and how the indicator sits in your notch."
      />

      <GroupLabel>Input</GroupLabel>
      <Panel className="mb-6">
        <SettingRow title="Microphone" desc="Which input device Yappr records from.">
          <select
            value={inputDeviceId ?? ''}
            onChange={(e) => handleSelectMic(e.target.value || null)}
            className="bg-paper border border-line rounded-input px-3 py-1.5 text-[12px] focus:outline-none focus:border-cobalt max-w-[240px]"
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
          last
        >
          <Toggle on={audioCues} onChange={toggleAudioCues} label="Audio cues" />
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
    </div>
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
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([window.yappr.getNotchGeometry(), window.yappr.getSettings()]).then(
      ([g, s]) => {
        setGeometry(g)
        setOverride(s.notchWidthOverride)
        setLoaded(true)
      },
    )
  }, [])

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

  if (geometry && !geometry.hasNotch) {
    return (
      <Panel>
        <SettingRow
          title="No notch on this display"
          desc="Yappr shows the indicator hanging from the top edge of the screen instead. Nothing to calibrate."
          muted
          last
        />
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
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-45 shrink-0">
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
