// Onboarding: the one screen where the user does the thing.
//
// Every other step collects a setting. This one teaches the single
// behaviour that people do not believe until they watch it happen: you
// may change your mind mid-sentence and the retraction never reaches the
// screen. Describing that in a paragraph converts nobody; watching
// "no wait, make it 4" strike through and disappear does.
//
// There is no dictation IPC in the onboarding preload bridge, so the
// pipeline cannot actually run here. What IS real is the microphone —
// so the mic decides WHEN the demo fires, and the transformation itself
// is a scripted animation. That split is deliberate: the part the user
// controls is real, the part we could only fake is the part that would
// otherwise have been a screenshot.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdvanceOnEnter } from './nav'
import { Pill } from '../shared/ui/Pill'
import { BrandLogo } from '../shared/ui/BrandLogo'
import { MenuBar, NotchMark } from '../shared/ui/NotchMark'
import { ACCENT, type NotchState } from '../indicator/notch-states'

// ─── The lesson ─────────────────────────────────────────────────────

/**
 * The utterance, split into what survives and what does not.
 *
 * The kept pieces concatenate to the clean result (modulo the capital and
 * the full stop, which the deterministic passes add) — so when the
 * dropped pieces collapse, the line left behind is already the answer.
 * Keep that property if you edit the script: it is what makes the
 * collapse read as one continuous edit rather than a cut to a new slide.
 */
interface Seg {
  text: string
  drop: boolean
}

const SEGMENTS: Seg[] = [
  { text: 'Um, so ', drop: true },               // filler
  { text: "let's grab coffee at ", drop: false },
  { text: '3 — no wait, make it ', drop: true }, // the self-correction
  { text: '4', drop: false },
]

const RAW = SEGMENTS.map((s) => s.text).join('')
const CLEAN = "Let's grab coffee at 4."

/** What we ask them to say — RAW without the filler nobody says on cue. */
const PROMPT_HEAD = 'Let’s grab coffee at 3 — '
const PROMPT_EM = 'no wait'
const PROMPT_TAIL = ', make it 4'

// Timings. Fast enough that nobody waits, slow enough that the
// strikethrough is readable before it goes.
const TYPE_MS = 22
const SETTLE_MS = 320
const MARK_MS = 700
const COLLAPSE_MS = 460

// ─── Mic ────────────────────────────────────────────────────────────

// 13 bars here rather than the indicator's 9: that 9 was chosen to keep
// the notch's left wing narrow, and this meter has a whole column to live
// in. Every other constant below is the indicator's, unchanged — each one
// is a tuned measurement, not a taste call.
const BAR_COUNT = 13
const SPEECH_BINS = 24   // at fftSize 256 a bin is ~187Hz → ~0–4.5kHz, where speech lives
const WAVEFORM_GAIN = 1.45
const METER_HEIGHT = 30

// Voice-activity thresholds, in the same 0–100 units the bars are drawn
// in. SPEECH_ON sits above room tone but well under a spoken syllable;
// MIN_SPEECH_MS stops a door slam or a keyboard clatter from firing the
// lesson; SPEECH_OFF_MS is long enough to survive the pause in the middle
// of "at 3 — no wait".
const SPEECH_ON = 12
const MIN_SPEECH_MS = 400
const SPEECH_OFF_MS = 950

// Chrome's defaults (echoCancellation / noiseSuppression / autoGainControl
// all ON) are tuned for VoIP intelligibility and measurably wreck ASR —
// see the "Mais" → "Made" diagnosis in useIndicatorAudio. This is only a
// meter, but it has to open the mic the way real capture does, or the
// level shown here would not be the level dictation gets.
const ASR_AUDIO: MediaTrackConstraints = {
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
        audio: { ...ASR_AUDIO, deviceId: { exact: deviceId } },
      })
    } catch {
      // Saved mic unplugged, or the id went stale across a reboot. A
      // different mic beats no mic.
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: ASR_AUDIO })
  } catch {
    // Some devices reject the exact sampleRate/channelCount. The three
    // DSP flags are the part that matters; drop the rest.
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  }
}

type Phase = 'armed' | 'listening' | 'typing' | 'marking' | 'collapsing' | 'landed'

const NOTCH_FOR: Record<Phase, NotchState> = {
  armed: 'idle',
  listening: 'recording',
  typing: 'processing',
  marking: 'processing',
  collapsing: 'processing',
  landed: 'done',
}

export function PracticeStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<Phase>('armed')
  // Live throughout. This is the last teaching screen and its whole point
  // is that you try it — but someone who has already understood should
  // not be held here, and the Continue button was never disabled either.
  useAdvanceOnEnter(true)
  const [typed, setTyped] = useState(0)
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0))
  const [micReady, setMicReady] = useState<boolean | null>(null)
  const [reduced, setReduced] = useState(false)
  const [escape, setEscape] = useState(false)
  const [played, setPlayed] = useState(false)

  const timers = useRef<number[]>([])
  const typeTimer = useRef<number | null>(null)
  const holding = useRef(false)
  // Read inside the rAF loop, which is created once and would otherwise
  // close over a stale phase forever. `landed` counts as live so a second
  // attempt needs no button: speak again and the lesson runs again.
  const vadArmed = useRef(false)
  const live = phase === 'armed' || phase === 'listening' || phase === 'landed'
  vadArmed.current = live

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    if (typeTimer.current !== null) {
      window.clearInterval(typeTimer.current)
      typeTimer.current = null
    }
  }, [])

  const play = useCallback(() => {
    clearTimers()
    setPlayed(true)
    setTyped(0)
    setPhase('typing')

    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms))
    }

    if (reduced) {
      // Same three beats, held long enough to read, with the travel
      // removed rather than the story.
      setTyped(RAW.length)
      at(200, () => setPhase('marking'))
      at(200 + MARK_MS, () => setPhase('collapsing'))
      at(260 + MARK_MS, () => setPhase('landed'))
      return
    }

    let i = 0
    const iv = window.setInterval(() => {
      i += 1
      setTyped(i)
      if (i >= RAW.length) {
        window.clearInterval(iv)
        typeTimer.current = null
      }
    }, TYPE_MS)
    typeTimer.current = iv

    const t0 = RAW.length * TYPE_MS + SETTLE_MS
    at(t0, () => setPhase('marking'))
    at(t0 + MARK_MS, () => setPhase('collapsing'))
    at(t0 + MARK_MS + COLLAPSE_MS, () => setPhase('landed'))
  }, [clearTimers, reduced])

  // Held in a ref so the audio graph below can be built once and never
  // torn down mid-utterance just because `play` got a new identity.
  const onSpeechEnd = useRef(play)
  onSpeechEnd.current = play

  // One mic, opened for the life of the step. The rAF loop bails while we
  // are not listening — during the animation the meter is meant to be
  // still, and 60 renders a second behind a CSS transition buys nothing.
  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0

    async function start() {
      try {
        const status = await window.yappr.getMicPermissionStatus()
        if (status === 'denied' || status === 'restricted') {
          if (!cancelled) setMicReady(false)
          return
        }
        const settings = await window.yappr.getSettings()
        const s = await openMic(settings.inputDeviceId)
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        // 256 → 128 bins, ~187Hz each. At 64 the meter barely moved:
        // speech energy all landed in the first few bins and the rest of
        // the meter was mapped to silence.
        analyser.fftSize = 256
        // Defaults (-100/-30) are a window sized for music. Raw mic with
        // autoGainControl OFF sits low and quiet inside that range.
        analyser.minDecibels = -78
        analyser.maxDecibels = -22
        // Enough smoothing to stop strobing, little enough to track
        // syllables.
        analyser.smoothingTimeConstant = 0.65
        ctx.createMediaStreamSource(s).connect(analyser)
        if (!cancelled) setMicReady(true)

        const data = new Uint8Array(analyser.frequencyBinCount)
        let speechStart = 0
        let lastLoud = 0

        const tick = () => {
          raf = requestAnimationFrame(tick)
          if (!vadArmed.current) return
          analyser.getByteFrequencyData(data)
          // Average each bar over a slice of the speech band rather than
          // sampling one bin — a single bin is noisy enough that
          // neighbouring bars jump independently, which reads as flicker
          // rather than as a voice.
          const next = Array.from({ length: BAR_COUNT }, (_, i) => {
            const lo = Math.floor((i / BAR_COUNT) * SPEECH_BINS)
            const hi = Math.max(lo + 1, Math.floor(((i + 1) / BAR_COUNT) * SPEECH_BINS))
            let sum = 0
            for (let b = lo; b < hi && b < data.length; b++) sum += data[b]
            const avg = sum / Math.max(1, hi - lo)
            return Math.min(100, Math.round((avg / 255) * 100 * WAVEFORM_GAIN))
          })
          setBars(next)

          const level = next.reduce((a, b) => a + b, 0) / BAR_COUNT
          const now = performance.now()
          if (level >= SPEECH_ON) {
            lastLoud = now
            if (!speechStart) speechStart = now
            setPhase((p) => (p === 'armed' || p === 'landed' ? 'listening' : p))
          }
          // While the key is down the user, not the room, decides when the
          // utterance ends — releasing is the signal.
          if (holding.current || !speechStart) return
          if (now - lastLoud > SPEECH_OFF_MS && lastLoud - speechStart > MIN_SPEECH_MS) {
            speechStart = 0
            lastLoud = 0
            onSpeechEnd.current()
          }
        }
        tick()
      } catch {
        if (!cancelled) setMicReady(false)
      }
    }
    void start()

    return () => {
      // The onboarding window closes at finish; a leaked stream keeps the
      // orange recording dot lit for the rest of the session.
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
    }
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  // Hold-to-talk, on any modifier. The push-to-talk key picked one step
  // ago is not persisted until the flow finishes, so reading settings back
  // here would show whatever was saved before — accepting all four
  // modifiers teaches the gesture without ever naming the wrong key.
  useEffect(() => {
    const isModifier = (e: KeyboardEvent) => /^(Control|Alt|Shift|Meta)/.test(e.code)
    function down(e: KeyboardEvent) {
      if (e.repeat || !isModifier(e)) return
      holding.current = true
      clearTimers()
      setTyped(0)
      setPhase('listening')
    }
    function up(e: KeyboardEvent) {
      if (!holding.current || !isModifier(e)) return
      holding.current = false
      play()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [clearTimers, play])

  // Never a dead end: no mic, or a long silence, and the demo offers to
  // run itself.
  useEffect(() => {
    if (micReady === false) {
      setEscape(true)
      return
    }
    // Also covers the half-attempt: a cough trips `listening`, the
    // utterance never lands, and without this the step would just sit there.
    if (phase !== 'armed' && phase !== 'listening') return
    const t = window.setTimeout(() => setEscape(true), 9000)
    return () => window.clearTimeout(t)
  }, [micReady, phase])

  const showEscape = escape || played
  const collapsed = phase === 'collapsing' || phase === 'landed'
  const marked = phase === 'marking' || collapsed

  return (
    <div className="max-w-[640px]">
      <style>{LOCAL_KEYFRAMES}</style>

      {/* The only instruction on the screen. */}
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-4">
        Hold your key and say
      </div>

      <h1 className="font-display text-[46px] leading-[1.06] tracking-[-0.02em]">
        &ldquo;{PROMPT_HEAD}
        <em className="italic">{PROMPT_EM}</em>
        {PROMPT_TAIL}&rdquo;
      </h1>

      {/* Live level. Doubles as the rule under the headline, so "we can
          hear you" costs no words and no extra furniture. */}
      <div aria-hidden className="flex items-end gap-[4px] mt-5 mb-7" style={{ height: METER_HEIGHT }}>
        {bars.map((v, i) => (
          <span
            key={i}
            style={{
              width: 3,
              borderRadius: 2,
              background: ACCENT,
              height: Math.min(METER_HEIGHT, Math.max(2, v * (METER_HEIGHT / 100))),
              transition: reduced ? undefined : 'height 75ms linear, opacity 240ms ease',
              opacity: live ? 1 : 0.22,
              filter: live ? 'drop-shadow(0 0 6px rgba(90,143,232,.5))' : undefined,
            }}
          />
        ))}
      </div>

      {/* The stage. Wallpaper plus a menu bar, so the indicator hangs from
          an edge the way it does on a real screen instead of floating. */}
      <div className="rounded-card overflow-hidden border border-ink-08 shadow-lift bg-[#0A0B0F]">
        <MenuBar right={<span className="font-mono text-[10px] text-white/70 tabular-nums">9:41</span>}>
          <NotchMark state={NOTCH_FOR[phase]} notchWidth={64} />
        </MenuBar>

        <div className="px-7 pt-10 pb-8">
          <div className="bg-white/70 backdrop-blur-xl backdrop-saturate-150 rounded-card shadow-glass-lift px-4 py-3.5 flex items-center gap-3">
            <BrandLogo brand="imessage" size={20} className="shrink-0" />

            <div className="flex-1 min-w-0 text-[15px] leading-[1.45] min-h-[22px]">
              {phase === 'landed' ? (
                <span className={reduced ? 'text-ink' : 'inline-block text-ink animate-springScale'}>
                  {CLEAN}
                </span>
              ) : (
                <>
                  {/* Nothing has been transcribed while they are still
                      talking. An empty field with a live caret is the
                      honest state, and it is what makes the raw text
                      read as an arrival rather than as a caption. */}
                  {phase !== 'armed' && phase !== 'listening' && (
                    <TypedLine typed={typed} marked={marked} collapsed={collapsed} reduced={reduced} />
                  )}
                  <Caret />
                </>
              )}
            </div>

            {/* Mock send target. This is what "the text lands where you
                were already typing" looks like, and it costs no sentence. */}
            <span
              aria-hidden
              className="shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center transition-colors duration-300"
              style={{ background: phase === 'landed' ? ACCENT : 'rgba(21,22,26,0.10)' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                  stroke={phase === 'landed' ? '#fff' : 'rgba(21,22,26,0.35)'}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-7">
        <Pill variant={phase === 'landed' ? 'primary' : 'secondary'} onClick={onNext}>
          Continue
        </Pill>
        {showEscape && (
          <Pill variant="ghost" size="sm" onClick={play} className="animate-slideUp">
            {played ? 'Again' : 'Show me'}
          </Pill>
        )}
      </div>
    </div>
  )
}

// ─── Parts ──────────────────────────────────────────────────────────

/**
 * The raw transcript, mid-edit.
 *
 * Dropped pieces shrink to nothing via an inline-grid track going
 * 1fr → 0fr, which animates down from the text's intrinsic width without
 * anyone having to measure it. `max-width` would need a pixel number we
 * do not have, and `scaleX` would leave a hole the surviving words never
 * close.
 */
function TypedLine({
  typed,
  marked,
  collapsed,
  reduced,
}: {
  typed: number
  marked: boolean
  collapsed: boolean
  reduced: boolean
}) {
  let cursor = 0
  return (
    <>
      {SEGMENTS.map((seg, i) => {
        const start = cursor
        cursor += seg.text.length
        const visible = seg.text.slice(0, Math.max(0, Math.min(seg.text.length, typed - start)))
        if (!visible) return null

        if (!seg.drop) {
          return (
            <span key={i} className="text-ink-60" style={{ whiteSpace: 'pre-wrap' }}>
              {visible}
            </span>
          )
        }

        return (
          <span
            key={i}
            style={{
              display: 'inline-grid',
              gridTemplateColumns: collapsed ? '0fr' : '1fr',
              opacity: collapsed ? 0 : 1,
              transition: reduced
                ? undefined
                : `grid-template-columns ${COLLAPSE_MS}ms cubic-bezier(.4,0,.2,1), opacity ${Math.round(COLLAPSE_MS * 0.6)}ms linear`,
            }}
          >
            <span
              style={{ overflow: 'hidden', minWidth: 0, whiteSpace: 'pre-wrap' }}
              className={
                marked
                  ? 'text-danger line-through decoration-[1.5px] decoration-danger/70 bg-danger/[0.08] rounded-[3px]'
                  : 'text-ink-45'
              }
            >
              {visible}
            </span>
          </span>
        )
      })}
    </>
  )
}

function Caret() {
  return (
    <span
      aria-hidden
      className="practice-caret"
      style={{
        display: 'inline-block',
        width: 2,
        height: 17,
        marginLeft: 1,
        verticalAlign: '-3px',
        borderRadius: 1,
        background: ACCENT,
      }}
    />
  )
}

const LOCAL_KEYFRAMES = `
  @keyframes practiceCaret { 0%, 45% { opacity: 1; } 55%, 100% { opacity: 0; } }
  .practice-caret { animation: practiceCaret 1.05s steps(1, end) infinite; }
  @media (prefers-reduced-motion: reduce) {
    .practice-caret { animation: none; }
  }
`
