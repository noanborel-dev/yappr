import { useEffect, useState } from 'react'
import { Toggle } from '../../shared/ui/Toggle'
import { Pill } from '../../shared/ui/Pill'
import { SectionHero } from '../../shared/ui/SectionHero'

export default function GeneralTab() {
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null)
  const [resetting, setResetting] = useState(false)
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

  async function resetIndicatorPosition() {
    setResetting(true)
    await window.yappr.setSettings({ indicatorPosition: null })
    setTimeout(() => setResetting(false), 1200)
  }

  function reopenOnboarding() {
    window.yappr.openOnboarding()
  }

  return (
    <div className="max-w-[760px]">
      <SectionHero
        label="INDICATOR"
        accent="cobalt"
        headline={<>The <em className="font-display italic">floating</em> pill.</>}
        body="Drag it anywhere on screen — it remembers. Hides while you type, reveals when you speak."
        visual={<IndicatorPreview />}
      />

      <div className="bg-card border border-ink-08 rounded-[14px] overflow-hidden">
        {/* Microphone row */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-ink-08">
          <div>
            <div className="text-[13px] font-semibold leading-tight">Microphone</div>
            <div className="text-[11px] text-ink-45 mt-0.5">Which input device Yappr records from.</div>
          </div>
          <select
            value={inputDeviceId ?? ''}
            onChange={(e) => handleSelectMic(e.target.value || null)}
            className="bg-paper border border-ink-08 rounded-[10px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-volt max-w-[260px]"
          >
            <option value="">Default — system microphone</option>
            {mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Unnamed microphone'}
              </option>
            ))}
          </select>
        </div>

        {/* Audio cues row */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-ink-08">
          <div>
            <div className="text-[13px] font-semibold leading-tight">Audio cues</div>
            <div className="text-[11px] text-ink-45 mt-0.5">Subtle blip when recording starts and ends.</div>
          </div>
          <Toggle on={audioCues} onChange={toggleAudioCues} />
        </div>

        {/* Pause music row */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-ink-08">
          <div>
            <div className="text-[13px] font-semibold leading-tight">Pause music while dictating</div>
            <div className="text-[11px] text-ink-45 mt-0.5">Pauses Music and Spotify, then resumes them. Keeps speakers out of the mic.</div>
          </div>
          <Toggle on={pauseMedia} onChange={togglePauseMedia} />
        </div>

        {/* Launch at login */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-ink-08">
          <div>
            <div className="text-[13px] font-semibold leading-tight">Launch at login</div>
            <div className="text-[11px] text-ink-45 mt-0.5">Yappr starts in the background when you log in.</div>
          </div>
          {launchAtLogin === null ? (
            <span className="text-[11px] text-ink-45">Loading…</span>
          ) : (
            <Toggle on={launchAtLogin} onChange={toggleLaunchAtLogin} />
          )}
        </div>

        {/* Indicator position */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-ink-08">
          <div>
            <div className="text-[13px] font-semibold leading-tight">Indicator position</div>
            <div className="text-[11px] text-ink-45 mt-0.5">Reset the floating pill to its default screen position.</div>
          </div>
          <Pill variant="secondary" onClick={resetIndicatorPosition}>
            {resetting ? 'Reset ✓' : 'Reset'}
          </Pill>
        </div>

        {/* Reopen onboarding */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">
          <div>
            <div className="text-[13px] font-semibold leading-tight">Onboarding</div>
            <div className="text-[11px] text-ink-45 mt-0.5">Walk through the welcome flow again. Your settings are kept.</div>
          </div>
          <Pill variant="secondary" onClick={reopenOnboarding}>Reopen</Pill>
        </div>
      </div>
    </div>
  )
}

// Wallpaper-tinted preview surface with a small replica of the recording
// indicator pill — gives users a one-glance sense of what the floating
// pill looks and feels like in real use.
function IndicatorPreview() {
  return (
    <div
      className="relative w-full max-w-[280px] aspect-[4/2.6] rounded-[14px] overflow-hidden border border-ink-08"
      style={{
        background:
          'linear-gradient(135deg, #6E83A8 0%, #5A7196 50%, #4F6585 100%)',
      }}
    >
      <div className="absolute top-2.5 left-3 text-[9px] font-mono uppercase tracking-[0.18em] text-white/65">
        Preview
      </div>
      <div className="absolute inset-x-0 bottom-5 flex justify-center">
        <PillReplica />
      </div>
    </div>
  )
}

function PillReplica() {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill"
      style={{
        background: 'linear-gradient(180deg, rgba(18,20,26,0.84) 0%, rgba(14,16,22,0.78) 100%)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(0,0,0,0.45), 0 6px 14px -6px rgba(0,0,0,0.5)',
      }}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-[#E84A3A] shrink-0" />
      <div className="flex items-end gap-[2px] h-[10px]">
        <span className="w-[2px] h-2 rounded-[1px] bg-[#5A8FE8]" />
        <span className="w-[2px] h-3 rounded-[1px] bg-[#5A8FE8]" />
        <span className="w-[2px] h-[7px] rounded-[1px] bg-[#5A8FE8]" />
        <span className="w-[2px] h-[9px] rounded-[1px] bg-[#5A8FE8]" />
        <span className="w-[2px] h-[5px] rounded-[1px] bg-[#5A8FE8]" />
        <span className="w-[2px] h-[8px] rounded-[1px] bg-[#5A8FE8]" />
      </div>
      <span className="text-[10.5px] font-mono text-white/85 tabular-nums ml-0.5">0:14</span>
    </div>
  )
}
