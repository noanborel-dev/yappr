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

// Bins the bars are spread over. At fftSize 256 each bin is ~187Hz, so
// 24 bins covers roughly 0-4.5kHz, where speech actually lives.
const SPEECH_BINS = 24

// Headroom on top of the decibel window, so conversational speech at a
// normal distance visibly moves without pinning at 100.
const WAVEFORM_GAIN = 1.45

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
        // 256 gives 128 bins across 0-24kHz, ~187Hz each. At the old
        // fftSize of 64 a bin was 750Hz wide and there were only 32,
        // which is why the meter barely moved: speech energy sits under
        // ~4kHz, so it filled the first five bins and the remaining 27 —
        // most of the meter — were mapped to silence.
        analyser.fftSize = 256
        // Defaults are -100/-30dB, a window sized for music. Raw mic input
        // with autoGainControl OFF sits low and quiet in that range, so
        // normal speech only ever reached the bottom of the scale.
        analyser.minDecibels = -78
        analyser.maxDecibels = -22
        // Enough smoothing to stop strobing, little enough to track
        // syllables.
        analyser.smoothingTimeConstant = 0.65
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
      // 256 gives 128 bins across 0-24kHz, ~187Hz each. At the old
      // fftSize of 64 a bin was 750Hz wide and there were only 32,
      // which is why the meter barely moved: speech energy sits under
      // ~4kHz, so it filled the first five bins and the remaining 27 —
      // most of the meter — were mapped to silence.
      analyser.fftSize = 256
      // Defaults are -100/-30dB, a window sized for music. Raw mic input
      // with autoGainControl OFF sits low and quiet in that range, so
      // normal speech only ever reached the bottom of the scale.
      analyser.minDecibels = -78
      analyser.maxDecibels = -22
      // Enough smoothing to stop strobing, little enough to track
      // syllables.
      analyser.smoothingTimeConstant = 0.65
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
    // A second 'start' without an intervening 'stop' used to overwrite
    // mediaRecorderRef while the previous recorder kept running. The
    // orphan still fired its own onstop -> sendAudioDone, so one dictation
    // delivered two blobs and pasted twice. Discard any live recorder
    // first, and suppress its onstop so it cannot deliver.
    const stale = mediaRecorderRef.current
    if (stale) {
      mediaRecorderRef.current = null
      stale.onstop = null
      try { if (stale.state !== 'inactive') stale.stop() } catch { /* already dead */ }
      console.warn('[Indicator] discarded a recorder that was still running')
    }

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
      // Spread the bars across the SPEECH band only, and average each
      // bar's slice rather than sampling one bin — a single bin is noisy
      // enough that neighbouring bars jump independently, which reads as
      // flicker rather than as a voice.
      const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
        const lo = Math.floor((i / BAR_COUNT) * SPEECH_BINS)
        const hi = Math.max(lo + 1, Math.floor(((i + 1) / BAR_COUNT) * SPEECH_BINS))
        let sum = 0
        for (let b = lo; b < hi && b < data.length; b++) sum += data[b]
        const avg = sum / Math.max(1, hi - lo)
        return Math.min(100, Math.round((avg / 255) * 100 * WAVEFORM_GAIN))
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
