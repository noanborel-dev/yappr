// Onboarding: prove the microphone works, here, now.
//
// The step this replaces was a permissions checklist — a row labelled
// "Microphone", an Allow button, a dropdown of device names. It could
// report that access was granted and still be wrong in the one way that
// actually breaks dictation: a granted permission with the wrong input
// live (AirPods in a pocket, a monitor's array mic) looks identical to a
// working setup right up until the first transcript comes back empty.
//
// So this screen asks for a sentence and watches the level instead.
// There is nothing to read here: the bars move, or they don't.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useAdvanceOnEnter } from './nav'
import { Pill } from '../shared/ui/Pill'
import { ACCENT } from '../indicator/notch-states'

// ─── Analyser tuning ────────────────────────────────────────────────
// Lifted from useIndicatorAudio, which cannot be imported here: it reads
// the device id off `window.indicator`, a bridge that only exists in the
// indicator window. Every constant below is a measurement, not a taste
// call — read the comments in that file before changing one.

// At fftSize 256 a bin is ~187Hz, so 24 bins covers ~0–4.5kHz, which is
// where speech energy actually is. Spreading the meter over all 128 bins
// maps most of it to silence and the thing barely moves.
const SPEECH_BINS = 24

// Bands the speech range is split into. The indicator uses 9 because its
// wing is 30px wide; at hero scale 12 reads better and still leaves two
// bins per band. Past ~12 a band is a single bin, and neighbouring bars
// start jumping independently — that reads as flicker, not as a voice.
const BANDS = 12

// Headroom over the decibel window, so conversational speech at arm's
// length visibly moves without pinning at 100.
const WAVEFORM_GAIN = 1.45

const METER_HEIGHT = 84

// ─── Success detection ──────────────────────────────────────────────
// A peak band over HEARD_LEVEL for HEARD_MS of speech. The grace window
// exists because syllable gaps and plosive closures drop the level to
// near zero for 100–200ms mid-phrase; without it the fill resets between
// words and a normally-spoken sentence never completes.
const HEARD_LEVEL = 26
const HEARD_MS = 600
const QUIET_GRACE_MS = 260

// macOS grants happen outside this window and fire no event, so the only
// way to notice the user flipping the switch is to keep asking. Same
// cadence the accessibility step already polls at.
const PERMISSION_POLL_MS = 750

// A muted or broken mic must not trap someone in onboarding. After this
// long without completing, offer a way past.
const RESCUE_MS = 15000

const PHRASE = 'hey Yappr, can you hear me'

// The `ok` token, needed as a literal because the bars are painted inline.
const OK = '#3D7E3D'

// The same edge treatment the notch waveform uses, so this reads as that
// instrument scaled up rather than as a different widget.
const EDGE_MASK = 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)'

// macOS built-in mics. Worth singling out because a Bluetooth headset
// switches the link to a low-bandwidth voice profile the moment its mic
// opens, and the transcript degrades with it.
const BUILT_IN = /built-?in|internal|macbook|imac|mac ?mini|mac ?studio/i

// Capture constraints tuned for RECOGNITION, not for a phone call.
// Chrome's defaults are all `true`; that chain gates quiet consonants and
// smears word onsets, which is how "Mais" transcribed as "Made". The
// meter also has to run on the same signal the pipeline records, or it
// is measuring audio the user will never dictate through.
const ASR_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: 16000,
}

async function openMic(deviceId: string | null): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { ...ASR_CONSTRAINTS, deviceId: { exact: deviceId } },
      })
    } catch {
      // Stale id — device unplugged, or the per-origin salt rotated.
      // A different mic beats a dead meter.
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: ASR_CONSTRAINTS })
  } catch (err) {
    // Denial has to surface as denial; only constraint failures retry.
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      throw err
    }
    // Some devices reject the exact sampleRate/channelCount pair. The DSP
    // flags are the part that matters for accuracy — keep those.
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  }
}

interface Device {
  id: string | null
  label: string
  builtIn: boolean
}

type Phase = 'starting' | 'listening' | 'blocked'
type Block = 'denied' | 'nodevice'

export function MicStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<Phase>('starting')
  const [block, setBlock] = useState<Block>('denied')
  const [bands, setBands] = useState<number[]>(() => Array<number>(BANDS).fill(0))
  const [progress, setProgress] = useState(0)
  const [heard, setHeard] = useState(false)
  // Enter opens the moment the meter has actually heard something — the
  // same condition the Continue button is disabled by, so the keyboard
  // route can never work while the button says you are not ready yet.
  useAdvanceOnEnter(heard)
  const [devices, setDevices] = useState<Device[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [rescue, setRescue] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const loudMsRef = useRef(0)
  const lastLoudRef = useRef(0)
  const heardRef = useRef(false)
  const deadRef = useRef(false)
  // Which device the pipeline is currently open on, so a device refresh
  // can tell whether it needs to reopen.
  const openOnRef = useRef<string | null>(null)
  // An explicit pick outranks the built-in recommendation on every later
  // refresh — otherwise plugging in a headset would silently drag the
  // user back to the laptop mic.
  const pickedRef = useRef(false)

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    try {
      void ctxRef.current?.close()
    } catch {
      // Already closed. Worth swallowing: the onboarding window closes at
      // finish, and a stream left running keeps the orange recording dot
      // lit afterwards.
    }
    ctxRef.current = null
  }, [])

  const listen = useCallback(
    async (deviceId: string | null) => {
      teardown()
      if (deadRef.current) return
      setPhase('starting')
      if (!heardRef.current) {
        loudMsRef.current = 0
        setProgress(0)
      }

      let stream: MediaStream
      try {
        stream = await openMic(deviceId)
      } catch (err) {
        if (deadRef.current) return
        const name = err instanceof DOMException ? err.name : ''
        setBlock(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nodevice' : 'denied')
        setPhase('blocked')
        return
      }
      if (deadRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      // Defaults (-100/-30) are a window sized for music. Raw mic input
      // with autoGainControl off sits low and quiet in that range, so
      // normal speech only ever reached the bottom of the scale.
      analyser.minDecibels = -78
      analyser.maxDecibels = -22
      // Enough smoothing to stop strobing, little enough to track syllables.
      analyser.smoothingTimeConstant = 0.65
      ctx.createMediaStreamSource(stream).connect(analyser)

      streamRef.current = stream
      ctxRef.current = ctx
      openOnRef.current = deviceId
      setPhase('listening')

      const data = new Uint8Array(analyser.frequencyBinCount)
      let last = performance.now()
      lastLoudRef.current = last

      const tick = () => {
        analyser.getByteFrequencyData(data)
        // Average each band over its slice rather than sampling one bin —
        // a single bin is noisy enough that bars jump independently.
        const next = Array.from({ length: BANDS }, (_, i) => {
          const lo = Math.floor((i / BANDS) * SPEECH_BINS)
          const hi = Math.max(lo + 1, Math.floor(((i + 1) / BANDS) * SPEECH_BINS))
          let sum = 0
          for (let b = lo; b < hi && b < data.length; b++) sum += data[b]
          const avg = sum / Math.max(1, hi - lo)
          return Math.min(100, Math.round((avg / 255) * 100 * WAVEFORM_GAIN))
        })
        setBands(next)

        const now = performance.now()
        // Clamped because a backgrounded window throttles rAF to ~1Hz,
        // and one such frame would otherwise award the whole 600ms.
        const dt = Math.min(50, now - last)
        last = now

        if (!heardRef.current) {
          const level = Math.max(...next)
          if (level >= HEARD_LEVEL) {
            loudMsRef.current += dt
            lastLoudRef.current = now
          } else if (now - lastLoudRef.current > QUIET_GRACE_MS) {
            loudMsRef.current = 0
          }
          const p = Math.min(1, loudMsRef.current / HEARD_MS)
          setProgress(p)
          if (p >= 1) {
            heardRef.current = true
            setHeard(true)
          }
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    },
    [teardown],
  )

  const refreshDevices = useCallback(async () => {
    let all: MediaDeviceInfo[] = []
    try {
      all = await navigator.mediaDevices.enumerateDevices()
    } catch {
      return
    }
    if (deadRef.current) return

    // 'default' and 'communications' are aliases for a device already in
    // the list; keeping them makes the same mic appear twice.
    const list: Device[] = all
      .filter(
        (d) =>
          d.kind === 'audioinput' &&
          d.deviceId &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications',
      )
      .map((d) => ({
        id: d.deviceId,
        label: d.label.replace(/^Default\s*[-–]\s*/i, '') || 'Microphone',
        builtIn: BUILT_IN.test(d.label),
      }))
    setDevices(list)

    if (pickedRef.current) return
    if (openOnRef.current && list.some((d) => d.id === openOnRef.current)) {
      setSelected(openOnRef.current)
      return
    }
    // Nothing chosen yet: land on the built-in rather than on whatever
    // macOS last routed audio to. Recommending it in the list while
    // metering a headset would be advice the screen itself contradicts.
    const rec = list.find((d) => d.builtIn) ?? null
    setSelected(rec?.id ?? null)
    if (rec && rec.id !== openOnRef.current) {
      void window.yappr.setSettings({ inputDeviceId: rec.id })
      await listen(rec.id)
    }
  }, [listen])

  // Boot: ask, open, meter. There is no Allow button — the macOS prompt
  // is the Allow button, and it arrives with the screen.
  useEffect(() => {
    deadRef.current = false
    let cancelled = false

    void (async () => {
      let status: string
      try {
        status = await window.yappr.getMicPermissionStatus()
      } catch {
        status = 'unknown'
      }
      if (cancelled) return

      if (status !== 'granted') {
        if (status === 'denied' || status === 'restricted') {
          setBlock('denied')
          setPhase('blocked')
          return
        }
        let ok = false
        try {
          ok = await window.yappr.requestMicPermission()
        } catch {
          ok = false
        }
        if (cancelled) return
        if (!ok) {
          setBlock('denied')
          setPhase('blocked')
          return
        }
      }

      let saved: string | null = null
      try {
        saved = (await window.yappr.getSettings()).inputDeviceId
      } catch {
        saved = null
      }
      if (cancelled) return
      pickedRef.current = saved !== null
      openOnRef.current = saved
      setSelected(saved)
      await listen(saved)
      if (cancelled) return
      // Device labels are empty strings until a stream exists, so the
      // list is only worth reading after the mic is open.
      await refreshDevices()
    })()

    return () => {
      cancelled = true
      deadRef.current = true
      teardown()
    }
  }, [listen, refreshDevices, teardown])

  // Recover the moment the user flips the switch in System Settings.
  useEffect(() => {
    if (phase !== 'blocked') return
    const id = window.setInterval(() => {
      void (async () => {
        let status: string
        try {
          status = await window.yappr.getMicPermissionStatus()
        } catch {
          return
        }
        if (status !== 'granted' || deadRef.current) return
        await listen(openOnRef.current)
        await refreshDevices()
      })()
    }, PERMISSION_POLL_MS)
    return () => window.clearInterval(id)
  }, [phase, listen, refreshDevices])

  useEffect(() => {
    const onChange = () => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [refreshDevices])

  useEffect(() => {
    if (heard) return
    const id = window.setTimeout(() => setRescue(true), RESCUE_MS)
    return () => window.clearTimeout(id)
  }, [heard])

  function pick(id: string | null) {
    pickedRef.current = true
    setSelected(id)
    void window.yappr.setSettings({ inputDeviceId: id })
    void listen(id)
  }

  const rows: Device[] = devices.length
    ? devices
    : [{ id: null, label: 'System microphone', builtIn: false }]

  const blocked = phase === 'blocked'
  const pct = heard ? 100 : progress * 100
  const mirrored = [...bands].reverse().concat(bands)

  // The phrase fills as the meter accumulates loud frames: the progress
  // read and the thing to say are the same object, so neither needs a
  // label.
  const phraseFill: CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${heard ? '#15161A' : ACCENT} ${pct}%, rgba(21,22,26,0.20) ${pct}%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  }

  return (
    <div className="max-w-[640px]">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
        Microphone
      </div>
      <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-6">
        {blocked ? (
          <>
            macOS is <em className="italic">muting</em> us.
          </>
        ) : heard ? (
          <>
            Loud and <em className="italic">clear</em>.
          </>
        ) : (
          <>
            Say this <em className="italic">out loud</em>.
          </>
        )}
      </h1>

      {blocked ? (
        <Blocked reason={block} onRetry={() => void listen(openOnRef.current)} />
      ) : (
        <div className="bg-white/55 backdrop-blur-xl backdrop-saturate-150 rounded-card shadow-glass px-8 pt-5 pb-7 mb-5">
          <div className="h-5 flex items-center justify-center mb-4">
            {heard ? (
              <span className="inline-flex items-center gap-2 animate-checkPop">
                <span className="w-[17px] h-[17px] rounded-full bg-ok flex items-center justify-center">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M2.5 6.3 4.9 8.7 9.5 3.5"
                      stroke="#FBF9F1"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-ok">
                  heard you
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span
                  className={`w-[6px] h-[6px] rounded-full ${phase === 'listening' ? 'animate-pulse' : 'opacity-40'}`}
                  style={{ background: ACCENT }}
                />
                <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-ink-45">
                  {phase === 'listening' ? 'listening' : 'waking the mic'}
                </span>
              </span>
            )}
          </div>

          <div className="text-center mb-6 px-4">
            <span
              className="font-display text-[30px] leading-[1.15] tracking-[-0.01em]"
              style={phraseFill}
            >
              {PHRASE}
            </span>
          </div>

          <div
            className="flex items-center justify-center gap-[6px]"
            style={{
              height: METER_HEIGHT,
              filter: `drop-shadow(0 0 10px ${heard ? 'rgba(61,126,61,.30)' : 'rgba(90,143,232,.45)'})`,
              WebkitMaskImage: EDGE_MASK,
              maskImage: EDGE_MASK,
            }}
          >
            {mirrored.map((v, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  borderRadius: 3,
                  backgroundColor: heard ? OK : ACCENT,
                  height: Math.min(METER_HEIGHT, Math.max(3, (v / 100) * METER_HEIGHT)),
                  transition: 'height 75ms linear, background-color 320ms ease',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {!blocked && (
        <div className="bg-white/55 backdrop-blur-xl backdrop-saturate-150 rounded-card overflow-hidden shadow-glass mb-6">
          {rows.map((d, i) => {
            const on = d.id === selected
            return (
              <button
                key={d.id ?? 'system'}
                onClick={() => pick(d.id)}
                className={[
                  'w-full text-left px-5 py-3 flex items-center gap-3 transition-colors',
                  i === rows.length - 1 ? '' : 'border-b border-white/55',
                  on ? 'bg-ink/[0.04]' : 'hover:bg-ink/[0.02]',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'shrink-0 w-[15px] h-[15px] rounded-full border flex items-center justify-center',
                    on ? 'border-ink' : 'border-line',
                  ].join(' ')}
                >
                  {on && <span className="w-[7px] h-[7px] rounded-full bg-ink animate-springScale" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold truncate">{d.label}</span>
                  {d.builtIn && (
                    <span className="block text-[11px] text-ink-45 mt-0.5">
                      Bluetooth mics drop to call quality the moment they listen.
                    </span>
                  )}
                </span>
                {d.builtIn && (
                  <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.14em] text-ok bg-ok/10 border border-ok/25 rounded-pill px-2 py-[3px]">
                    Recommended
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Pill variant="primary" onClick={onNext} disabled={!heard}>
          Continue
        </Pill>
        {/* Escape hatch for a mic that genuinely cannot be heard — a dead
            input must not be a locked door. */}
        {!heard && (rescue || blocked) && (
          <Pill variant="ghost" size="sm" onClick={onNext}>
            Skip
          </Pill>
        )}
      </div>
    </div>
  )
}

// Denial is the one state that has to explain itself: the switch lives in
// an app this window has no IPC to open, so the screen draws the row to
// look for instead of narrating a path. The poll upstairs notices the
// flip on its own, which is why there is nothing to press afterwards.
function Blocked({ reason, onRetry }: { reason: Block; onRetry: () => void }) {
  if (reason === 'nodevice') {
    return (
      <div className="bg-white/55 backdrop-blur-xl backdrop-saturate-150 rounded-card shadow-glass px-6 py-6 mb-6 flex items-center gap-4">
        <span className="w-[7px] h-[7px] rounded-full bg-danger shrink-0" />
        <span className="text-[13px] font-semibold flex-1">No microphone connected.</span>
        <Pill variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Pill>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <div className="rounded-card overflow-hidden border border-line bg-[#0A0B0F] p-7">
        <div className="mx-auto max-w-[380px] bg-card rounded-[10px] shadow-glass-lift overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft text-[11px] text-ink-45">
            Privacy &amp; Security <span className="mx-1">›</span> Microphone
          </div>
          <div className="px-4 py-3 flex items-center gap-3">
            <span className="w-7 h-7 rounded-[7px] bg-ink flex items-center justify-center font-display italic text-paper text-[15px] leading-none">
              Y
            </span>
            <span className="text-[13px] font-semibold flex-1">Yappr</span>
            {/* Drawn in the position to move it to, not a working control. */}
            <span className="relative w-[36px] h-[21px] rounded-pill bg-ok shrink-0 animate-pulse">
              <span className="absolute top-[2.5px] left-[17px] w-4 h-4 rounded-full bg-card shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Pill variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Pill>
        <span className="text-[11.5px] text-ink-45">Flip it and this screen picks up on its own.</span>
      </div>
    </div>
  )
}
