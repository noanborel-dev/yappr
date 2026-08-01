import { useEffect, useRef, useState } from 'react'

// The mic pipeline, extracted from the original bottom-centre pill so the
// notch indicator can reuse it unchanged. Every comment below records a
// tuning decision that cost something to learn — none of it is incidental.

/**
 * Bars painted in the notch's left wing. The prototype used 13; 9 reads
 * the same at a glance and lets the wing be meaningfully narrower, which
 * is what keeps the shape from dominating the menu bar.
 */
export const BAR_COUNT = 9

/** Height of the waveform box in the wing, in px. */
export const WAVE_HEIGHT = 13

export interface IndicatorAudio {
  /** Per-bar amplitude, 0-100. All zeroes when not recording. */
  waveform: number[]
  startRecording: () => Promise<void>
  stopRecording: () => void
}

export function useIndicatorAudio(): IndicatorAudio {
  const [waveform, setWaveform] = useState<number[]>(Array(BAR_COUNT).fill(0))

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
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
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

    return () => {
      cancelled = true
      cancelAnimationFrame(animFrameRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
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
  // noiseSuppression and autoGainControl all ON. That chain exists to make a
  // voice intelligible to a human on a VoIP call, and it actively hurts ASR:
  //   - noiseSuppression spectrally gates quiet, low-energy sounds, which is
  //     exactly what French fricatives, liaisons and word-final consonants are
  //   - autoGainControl pumps level around speech onsets, smearing the first
  //     phoneme of a phrase
  //   - echoCancellation applies non-linear attenuation
  //
  // Diagnosed from real dictation: "Mais" -> "Made" (word-initial) and
  // "bien ici" -> "bien iscidise" (soft consonants), while the same French
  // sentences transcribed perfectly from clean audio on every engine tested.
  // Both models are trained on natural, un-processed audio; they want the raw
  // signal. Mono 16kHz is what they consume anyway, so asking for it here also
  // avoids a resample.
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
      // Some devices reject the exact sampleRate/channelCount. Fall back to
      // the DSP flags alone — those are the part that matters for accuracy.
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
    // 64kbps mono Opus is effectively transparent for speech, so the codec
    // doesn't undo the capture-quality work above. ~8KB/s.
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
      const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
        const idx = Math.floor((i / BAR_COUNT) * data.length)
        return Math.round((data[idx] / 255) * 100)
      })
      setWaveform(bars)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  function stopRecording() {
    cancelAnimationFrame(animFrameRef.current)
    setWaveform(Array(BAR_COUNT).fill(0))
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    mediaRecorderRef.current = null
  }

  return { waveform, startRecording, stopRecording }
}
