import { useEffect, useRef, useState } from 'react'

type IndicatorState =
  | 'idle'
  | 'recording'
  | 'stopping'
  | 'processing'
  | 'done'
  | 'clipboard'
  | 'error'

declare global {
  interface Window {
    indicator: {
      onStateChange: (cb: (state: string) => void) => () => void
      sendAudioChunk: (chunk: ArrayBuffer) => void
      sendAudioDone: () => void
      getInputDeviceId: () => Promise<string | null>
      toggleRecord: () => void
      pasteLast: () => void
      polishSelection: () => void
      setInteractive: (interactive: boolean) => void
    }
  }
}

export default function Indicator() {
  const [state, setState] = useState<IndicatorState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [waveform, setWaveform] = useState<number[]>(Array(6).fill(0))
  // Live partial transcript streamed from the local provider's
  // onNewSegments. Painted in the pill during 'processing' so the
  // user sees words appearing as whisper produces them instead of
  // waiting on the static "polishing…" label for the full inference
  // duration. Cleared on state transitions out of processing.
  const [partial, setPartial] = useState('')
  // Idle-pill UX state. `hovered` fades the small pill up to full
  // opacity and slightly scales it; `menuOpen` shows the click menu.
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  // Persistent audio pipeline — set up once at mount, kept warm for the
  // lifetime of the indicator window. Spinning up getUserMedia +
  // AudioContext per recording cost ~50–200ms and cut off the first
  // word of dictation. With the warm pipeline, recorder.start() begins
  // capturing within ~5ms of the hotkey press.
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false

    async function prewarm() {
      try {
        const stream = await openMic()
        // Constraints are advisory: a device may ignore any of them. Log what
        // was actually applied so a regression in capture quality is visible
        // rather than silent.
        try {
          const st = stream.getAudioTracks()[0]?.getSettings?.()
          if (st) {
            console.info('[Indicator] mic settings', {
              echoCancellation: st.echoCancellation,
              noiseSuppression: st.noiseSuppression,
              autoGainControl: st.autoGainControl,
              sampleRate: st.sampleRate,
              channelCount: st.channelCount,
            })
          }
        } catch { /* diagnostics only */ }
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        source.connect(analyser)
        streamRef.current = stream
        audioContextRef.current = ctx
        analyserRef.current = analyser
      } catch (err) {
        // Permission not yet granted, or mic unavailable. startRecording
        // will retry on demand.
        console.warn('[Indicator] Mic prewarm deferred:', err)
      }
    }
    prewarm()

    const unsub = window.indicator.onStateChange((s) => {
      if (s.startsWith('error:')) {
        setErrorMsg(s.slice(6))
        setState('error')
        return
      }
      // Streaming partial transcript: don't change state, just paint
      // the running text in the pill. Local provider fires these
      // during processing on long clips.
      if (s.startsWith('partial:')) {
        setPartial(s.slice(8))
        return
      }
      const next = s as IndicatorState
      setState(next)
      if (next === 'recording') startRecording()
      else if (next === 'stopping') stopRecording()
      // Clear the partial transcript when state moves away from
      // processing so a stale fragment doesn't bleed into the next
      // dictation's UI.
      if (next !== 'processing') setPartial('')
      // Auto-close the click menu whenever state leaves idle (e.g.
      // recording started from a hotkey while the menu was open).
      if (next !== 'idle') setMenuOpen(false)
    })

    return () => {
      cancelled = true
      unsub()
      cancelAnimationFrame(animFrameRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      audioContextRef.current?.close()
      streamRef.current = null
      audioContextRef.current = null
      analyserRef.current = null
    }
  }, [])

  async function ensurePipeline(): Promise<{ stream: MediaStream; analyser: AnalyserNode } | null> {
    if (streamRef.current && analyserRef.current && audioContextRef.current) {
      return { stream: streamRef.current, analyser: analyserRef.current }
    }
    try {
      const stream = await openMic()
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      streamRef.current = stream
      audioContextRef.current = ctx
      analyserRef.current = analyser
      return { stream, analyser }
    } catch (err) {
      console.error('[Indicator] Mic error:', err)
      return null
    }
  }

  // Open the user's selected mic. If the saved deviceId is invalid (mic
  // unplugged, deviceId stale across reboots) we fall back to system
  // default rather than throwing — losing audio entirely is worse than
  // using a different mic. Settings IPC access is wrapped defensively
  // because the preload bridge may not be ready on cold start.
  // Capture constraints tuned for SPEECH RECOGNITION, not for a phone call.
  //
  // `{ audio: true }` lets Chrome apply its defaults — echoCancellation,
  // noiseSuppression and autoGainControl all ON. That chain is designed to
  // make a voice intelligible to a human on a VoIP call, and it actively
  // hurts an ASR model:
  //   - noiseSuppression spectrally gates quiet, low-energy sounds, which
  //     is precisely what French fricatives, liaisons and word-final
  //     consonants are;
  //   - autoGainControl pumps the level around speech onsets, smearing the
  //     first phoneme of a phrase;
  //   - echoCancellation applies non-linear attenuation.
  //
  // Symptom that led here: clean TTS French transcribes perfectly on every
  // engine, while real dictation produced "Mais" -> "Made" (word-initial)
  // and "bien ici" -> "bien iscidise" (soft consonants) — the two failure
  // shapes this DSP is known to cause. Whisper and Parakeet are both trained
  // on natural, noisy audio; they want the raw signal, not a cleaned one.
  //
  // Mono at 16kHz is what the models consume anyway (ffmpeg downsamples to
  // exactly this), so asking for it here avoids a resample round-trip.
  const ASR_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    sampleRate: 16000,
  }

  async function openMic(): Promise<MediaStream> {
    let deviceId: string | null = null
    try {
      deviceId = (await window.indicator.getInputDeviceId?.()) ?? null
    } catch {
      deviceId = null
    }
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...ASR_AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
        })
      } catch (err) {
        console.warn('[Indicator] Saved mic unavailable, using default:', err)
      }
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: ASR_AUDIO_CONSTRAINTS })
    } catch (err) {
      // Some devices reject the exact sampleRate/channelCount. Drop to the
      // DSP flags alone rather than falling all the way back to defaults —
      // those flags are the part that actually matters for accuracy.
      console.warn('[Indicator] ASR constraints rejected, retrying minimal:', err)
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    }
  }

  async function startRecording() {
    const pipeline = await ensurePipeline()
    if (!pipeline) return
    const { stream, analyser } = pipeline

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    // Chrome's default Opus bitrate for an audio-only recorder is modest;
    // at 64kbps mono, Opus is effectively transparent for speech, so this
    // stops the codec undoing the capture-quality work above. Still tiny:
    // ~8KB/s, and the blob never leaves the machine on the local path.
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
    mediaRecorderRef.current = recorder

    // One self-contained WebM blob emitted on stop. Streaming chunks
    // (timeslice=100ms) produced corrupted containers because only the
    // first chunk had the EBML header.
    const blobs: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) blobs.push(e.data)
    }
    recorder.onstop = async () => {
      const full = new Blob(blobs, { type: mimeType })
      const buf = await full.arrayBuffer()
      window.indicator.sendAudioChunk(buf)
      window.indicator.sendAudioDone()
      // Intentionally NOT tearing down the stream/context — kept warm
      // for the next session.
    }
    recorder.start()

    const tick = () => {
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const bars = Array.from({ length: 6 }, (_, i) => {
        const idx = Math.floor((i / 6) * data.length)
        return Math.round((data[idx] / 255) * 100)
      })
      setWaveform(bars)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  function stopRecording() {
    cancelAnimationFrame(animFrameRef.current)
    setWaveform(Array(6).fill(0))
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    mediaRecorderRef.current = null
  }

  // Hover hit-zone handlers — flip the window interactive while the
  // cursor is over the idle pill so clicks register on the menu.
  //
  // We DELIBERATELY do not close the menu when leaving the pill: the
  // menu sits above the pill with a small gap, and moving the cursor
  // toward the menu fires mouseleave on the pill (cursor crossed the
  // gap), which would close the menu before the user could click any
  // item. The menu's own mouseleave handler closes it when the cursor
  // genuinely leaves the menu's bounds.
  function handleHoverEnter() {
    setHovered(true)
    if (state === 'idle') window.indicator.setInteractive(true)
  }
  function handleHoverLeave() {
    setHovered(false)
    // If the menu is open, keep the window interactive so the menu
    // can still receive its own mouseleave when the cursor leaves it.
    // Otherwise flip off so clicks fall through to the app below.
    if (!menuOpen) window.indicator.setInteractive(false)
  }
  function handleMenuLeave() {
    setMenuOpen(false)
    setHovered(false)
    window.indicator.setInteractive(false)
  }

  // Shared label style used by both idle popover and active states.
  const labelStyleIdle = {
    fontStyle: 'italic',
    fontFamily: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
    fontWeight: 400,
    letterSpacing: '0.005em',
    textShadow: '0 1px 2px rgba(0,0,0,0.35)',
  } as const

  // ============================================================
  // IDLE STATE — small dimmed pill always visible at the bottom
  // of the screen. Brightens on hover, opens a click menu when
  // tapped. Hotkey or menu click transitions to the active pill.
  // ============================================================
  if (state === 'idle') {
    const idleOpacity = hovered ? 1 : 0.42
    return (
      <div
        // Hit-zone is anchored to the bottom-center of the canvas.
        // pointerEvents: none on the wrapper — children opt back in.
        className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col items-center justify-end font-sans"
        style={{ width: 240, height: 200, pointerEvents: 'none' }}
      >
        <style>{`
          @keyframes idleBreathe {
            0%, 100% { transform: scale(1); }
            50%      { transform: scale(1.05); }
          }
          @keyframes menuIn {
            from { opacity: 0; transform: translateY(4px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
          }
          .anim-menu-in { animation: menuIn 160ms ease-out; transform-origin: bottom center; }
          .idle-breathe { animation: idleBreathe 4.2s ease-in-out infinite; }
        `}</style>

        {/* Click menu — sits above the pill, fades in when open.
            mouseleave on the menu (NOT on the pill) closes it: that
            way the cursor can travel from pill → menu without the
            close handler firing prematurely while crossing the small
            visual gap between them. */}
        {menuOpen && (
          <div
            onMouseLeave={handleMenuLeave}
            className="mb-3 flex flex-col gap-1 rounded-[14px] p-1.5 anim-menu-in"
            style={{
              background:
                'linear-gradient(180deg, rgba(18,20,26,0.92) 0%, rgba(14,16,22,0.88) 100%)',
              backdropFilter: 'blur(34px) saturate(180%)',
              WebkitBackdropFilter: 'blur(34px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow:
                'inset 0 1.2px 0 rgba(255,255,255,0.30), 0 12px 24px rgba(0,0,0,0.35)',
              pointerEvents: 'auto',
              minWidth: 210,
              // Eliminate the visual gap (mb-3 = 12px) that the cursor
              // had to traverse. With marginBottom 0 and padding-bottom
              // on the wrapper holding both, mouseleave on the menu
              // fires only when the cursor actually leaves the menu,
              // not on the gap crossing.
              marginBottom: 8,
            }}
          >
            <MenuItem
              icon={
                <span
                  className="w-2 h-2 rounded-full bg-danger"
                  style={{ boxShadow: '0 0 6px rgba(232,74,58,0.8)' }}
                />
              }
              label="Start recording"
              onClick={() => {
                window.indicator.toggleRecord()
                setMenuOpen(false)
              }}
              labelStyle={labelStyleIdle}
            />
            <MenuItem
              icon={
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5 L4.5 8 L9 3" stroke="#5A8FE8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              }
              label="Paste last dictation"
              onClick={() => {
                window.indicator.pasteLast()
                setMenuOpen(false)
              }}
              labelStyle={labelStyleIdle}
            />
            <MenuItem
              icon={
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6 L6 2 L10 6 M6 2 L6 10" stroke="#5A8FE8" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              }
              label="Polish selection"
              hint="highlight text first"
              onClick={() => {
                window.indicator.polishSelection()
                setMenuOpen(false)
              }}
              labelStyle={labelStyleIdle}
            />
          </div>
        )}

        {/* The idle pill. Hover hit-zone is generously padded so the
            cursor catches it before reaching the visible shape. */}
        <div
          onMouseEnter={handleHoverEnter}
          onMouseLeave={handleHoverLeave}
          onClick={() => setMenuOpen((o) => !o)}
          className="cursor-pointer flex items-center justify-center"
          style={{ pointerEvents: 'auto', padding: '12px 22px' }}
        >
          <div
            className="idle-breathe"
            style={{
              opacity: idleOpacity,
              transition: 'opacity 250ms ease-out, transform 250ms ease-out',
              transform: hovered ? 'scale(1.08)' : 'scale(1)',
              filter: hovered
                ? 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))'
                : 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))',
            }}
          >
            {/* Yappr brand pill at idle size. Same SVG as the tray
                icon + the Provider hero so the brand stays consistent. */}
            <svg viewBox="0 0 54 22" width="72" height="30">
              <defs>
                <linearGradient id="idle-pill-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#12141a"/>
                  <stop offset="100%" stopColor="#0e1016"/>
                </linearGradient>
                <linearGradient id="idle-pill-hi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.34"/>
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
                </linearGradient>
                <radialGradient id="idle-pill-glow" cx="11" cy="11" r="7" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor="#e84a3a" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="#e84a3a" stopOpacity="0"/>
                </radialGradient>
                <clipPath id="idle-pill-clip">
                  <rect x="0" y="0" width="54" height="22" rx="11"/>
                </clipPath>
              </defs>
              <rect x="0" y="0" width="54" height="22" rx="11" fill="url(#idle-pill-grad)"/>
              <g clipPath="url(#idle-pill-clip)">
                <rect x="0" y="0" width="54" height="12" fill="url(#idle-pill-hi)"/>
              </g>
              <rect x="0.3" y="0.3" width="53.4" height="21.4" rx="10.7" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.4"/>
              <circle cx="11" cy="11" r="7" fill="url(#idle-pill-glow)"/>
              <circle cx="11" cy="11" r="3.0" fill="#e84a3a"/>
              <rect x="22"   y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
              <rect x="26.5" y="3"   width="1.8" height="16" rx="0.9" fill="#5a8fe8"/>
              <rect x="31"   y="9"   width="1.8" height="4"  rx="0.9" fill="#5a8fe8"/>
              <rect x="35.5" y="5"   width="1.8" height="12" rx="0.9" fill="#5a8fe8"/>
              <rect x="40"   y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
              <rect x="44.5" y="8.5" width="1.8" height="5"  rx="0.9" fill="#5a8fe8"/>
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // Liquid Glass pill, charcoal variant. The refractive top edge is the
  // signature detail — a near-white inner highlight and a near-black
  // bottom inset together give the pill a poured-resin feel against any
  // wallpaper. Drop-shadow lives on the parent (not box-shadow) so the
  // shadow follows the rounded outline and Electron's transparent
  // window doesn't leave a rectangular halo.
  const pillStyle = {
    background:
      'linear-gradient(180deg, rgba(18,20,26,0.82) 0%, rgba(14,16,22,0.74) 100%)',
    backdropFilter: 'blur(34px) saturate(180%)',
    WebkitBackdropFilter: 'blur(34px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow:
      'inset 0 1.2px 0 rgba(255,255,255,0.42), ' +
      'inset 0 -1px 0 rgba(0,0,0,0.45)',
  }

  // More saturated, slightly cooler blue than before — reads as proper
  // cobalt instead of lavender at this scale. Glow uses a wider falloff
  // so each bar feels like it's emitting light.
  const accent = '#5A8FE8'
  const accentGlow = 'rgba(90,143,232,0.65)'

  // Shared text style for italic state labels. Instrument Serif at a
  // medium weight reads more elegant than Cormorant at small size, with
  // a subtle text-shadow so the glyphs don't dissolve into the glass.
  const labelStyle = {
    fontStyle: 'italic',
    fontFamily: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
    fontWeight: 400,
    letterSpacing: '0.005em',
    textShadow: '0 1px 2px rgba(0,0,0,0.35)',
  } as const

  return (
    <div
      // Anchored to bottom-center of the canvas so the active pill
      // appears in the same spot as the idle pill — visually it looks
      // like the idle pill is expanding into its full form.
      //
      // Animation goes on the INNER pill, not this wrapper. The
      // wrapper already carries a `translateX(-50%)` from Tailwind's
      // -translate-x-1/2; layering a scale() animation on top of
      // that transform produces a transient horizontal drift while
      // scaling (the centering math doesn't re-compute during the
      // scale interpolation). Wrapping the animation around an
      // inner div keeps the centering and the scale on separate
      // transform stacks.
      className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center justify-center font-sans"
    >
      <style>{`
        @keyframes pillEmerge {
          from { opacity: 0; transform: scale(0.55) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        .anim-pill-emerge { animation: pillEmerge 180ms cubic-bezier(0.22, 1.4, 0.36, 1); transform-origin: bottom center; }
        @keyframes pillBreathe {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50%      { transform: scale(1.012); filter: brightness(1.05); }
        }
        @keyframes refractGlide {
          0%, 100% { background-position: -120% 0; opacity: 0; }
          12%      { opacity: 0.55; }
          50%      { background-position: 220% 0; opacity: 0; }
        }
        .pill-breathe { animation: pillBreathe 3.6s ease-in-out infinite; }
        .pill-refract::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(115deg,
            transparent 25%,
            rgba(255,255,255,0.18) 48%,
            rgba(255,255,255,0.32) 50%,
            rgba(255,255,255,0.18) 52%,
            transparent 75%);
          background-size: 220% 100%;
          background-position: -120% 0;
          /* No mix-blend-mode here — overlay on a transparent
             Electron surface produces a rectangular compositing
             artifact (the "box halo" the user reported). The plain
             gradient at low opacity is enough refraction. */
          pointer-events: none;
          opacity: 0;
          animation: refractGlide 5.2s ease-in-out infinite;
        }
      `}</style>
      <div
        className="inline-flex items-center gap-2.5 px-4 py-2 rounded-pill text-white relative overflow-hidden pill-breathe pill-refract anim-pill-emerge"
        style={{
          ...pillStyle,
          // drop-shadow on the pill itself (not the parent flex
          // container) so the shadow strictly traces the pill's
          // rounded silhouette. When applied to the parent, the
          // transparent Electron window's bounds occasionally
          // contribute to the filter's rasterization, producing a
          // faint rectangular halo.
          filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))',
        }}
      >
        {(state === 'recording' || state === 'stopping') && (
          <>
            <span
              className="w-[7px] h-[7px] rounded-full bg-danger animate-pulse shrink-0"
              style={{ boxShadow: '0 0 8px rgba(232,74,58,0.8)' }}
            />
            <div className="flex items-end gap-[2px] h-[15px]">
              {waveform.map((v, i) => (
                <div
                  key={i}
                  className="w-[2px] rounded-[1px] transition-all duration-75"
                  style={{
                    height: `${Math.max(3, v * 0.15)}px`,
                    background: accent,
                    boxShadow: `0 0 6px ${accentGlow}`,
                  }}
                />
              ))}
            </div>
            <span
              className="text-[15px] ml-1 leading-none text-white/95"
              style={labelStyle}
            >
              listening
            </span>
          </>
        )}
        {state === 'processing' && (
          <>
            <span
              className="w-3 h-3 rounded-full border-[1.5px] border-white/20 animate-spin shrink-0"
              style={{
                borderTopColor: accent,
                filter: `drop-shadow(0 0 3px ${accentGlow})`,
              }}
            />
            {/* Static label. We DELIBERATELY don't paint the live
                partial transcript here even though it's plumbed all
                the way through — whisper.cpp emits segments every
                ~10s of audio internally, so on typical dictations
                (2-15s) the first partial arrives at the very end and
                the visible "streaming" is more jarring than useful.
                Keeping the partial state wired in for future use
                (e.g. very long Accurate dictations); just not
                surfacing it in the pill. */}
            <span
              className="text-[15px] leading-none text-white/95"
              style={labelStyle}
            >
              polishing…
            </span>
          </>
        )}
        {(state === 'done' || state === 'clipboard') && (
          <>
            <svg width="13" height="13" viewBox="0 0 11 11" fill="none" style={{ filter: `drop-shadow(0 0 3px ${accentGlow})` }}>
              <path
                d="M2 5.5 L4.5 8 L9 3"
                stroke={accent}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <span
              className="text-[15px] leading-none"
              style={{ ...labelStyle, color: accent }}
            >
              {state === 'clipboard' ? 'copied — ⌘V to paste' : 'pasted'}
            </span>
          </>
        )}
        {state === 'error' && (
          <>
            <span
              className="w-[7px] h-[7px] rounded-full bg-danger shrink-0"
              style={{ boxShadow: '0 0 8px rgba(232,74,58,0.8)' }}
            />
            <span className="text-[15px] leading-none text-white/95" style={labelStyle}>
              {errorMsg || 'transcription failed'}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({
  icon, label, hint, onClick, labelStyle,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onClick: () => void
  labelStyle: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-left transition-colors hover:bg-white/[0.10]"
      style={{ pointerEvents: 'auto' }}
    >
      <span className="w-3 flex items-center justify-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] leading-tight text-white/95" style={labelStyle}>{label}</div>
        {hint && <div className="text-[10px] leading-tight text-white/45 mt-0.5">{hint}</div>}
      </div>
    </button>
  )
}
