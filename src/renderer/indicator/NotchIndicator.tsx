import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  resolve,
  fromPipelineState,
  recorderActionFor,
  paintsTranscript,
  bandGeometry,
  formatHotkey,
  ACCENT,
  LABEL_SIZE,
  PREVIEW_MAX_WIDTH,
  TRANSCRIPT_MAX_LINES,
  type NotchState,
  type PipelineState,
} from './notch-states'
import { useIndicatorAudio, BAR_COUNT, WAVE_HEIGHT } from './useIndicatorAudio'

// The dictation indicator, living in the MacBook notch.
//
// The shape is a black bar pinned to the top of the screen whose centre
// band is exactly the width and height of the physical notch, so at rest
// it is indistinguishable from the bare hardware. State changes grow
// "wings" out of both sides: the LEFT wing is always input (what Yappr is
// hearing), the RIGHT wing is always outcome (what Yappr did with it).
//
// See docs/design_handoff_notch_indicator/README.md for the spec this
// implements, and src/renderer/indicator/notch-states.ts for the state
// table and all derived geometry.

declare global {
  interface Window {
    indicator: {
      onStateChange: (cb: (state: string) => void) => () => void
      sendAudioChunk: (chunk: ArrayBuffer) => void
      sendAudioDone: () => void
      getInputDeviceId: () => Promise<string | null>
      getHotkey: () => Promise<string | null>
      toggleRecord: () => void
      pasteLast: () => void
      polishSelection: () => void
      setInteractive: (interactive: boolean) => void
      getNotchGeometry: () => Promise<NotchGeometryIPC>
      onGeometryChanged?: (cb: () => void) => () => void
      getRecent: () => Promise<RecentDictation | null>
      copyRecent: () => void
      retryPaste: () => Promise<boolean>
    }
  }
}

export interface NotchGeometryIPC {
  hasNotch: boolean
  width: number
  height: number
  displayWidth: number
  /** What to draw when there is no notch. Ignored when hasNotch. */
  noNotchIndicator?: 'hidden' | 'placeholder'
  /** Placeholder band width in points; null uses the default. */
  placeholderWidth?: number | null
}

export interface RecentDictation {
  text: string
  /** Where it was pasted, e.g. "Linear". Null when it went to the clipboard. */
  target: string | null
  wordCount: number
  /**
   * Recording length. Null because DictationResult does not carry one
   * today — the caption drops the duration rather than inventing it.
   */
  durationSec: number | null
}

/**
 * Points reserved at the left edge for the  menu and the app name. The
 * prototype measured its mock menu bar; the real one can't be read from
 * Electron, so we reserve a width that clears an app name of reasonable
 * length and let the clamp do the rest.
 */
const LEFT_RESERVE = 190
/**
 * Small on purpose. macOS already hides its own status items when space
 * runs out, and the wide states (peek, clipboard, expanded) need the room.
 */
const RIGHT_RESERVE = 24
const CLEARANCE = 8

/** How long `copied` holds before falling back to `peek`. */
const COPIED_HOLD_MS = 1600

/**
 * Horizontal-only slack around the shape that still counts as hovering
 * it. The notch is a cutout with no pixels, so without slack there is
 * barely anything to aim at when idle. Deliberately not applied
 * vertically — see the pointer handler.
 */
const HOVER_SLACK = 30




// How much of a wing the ambient glow covers, measured from the outer
// edge inward. Deliberately short of the full wing: the blur radius is
// 26px, so a glow filling the wing edge-to-edge would spill back across
// the housing and re-light the middle — the exact thing splitting it in
// two was meant to stop.
const GLOW_WING_FRACTION = 0.72

const FALLBACK_GEOMETRY: NotchGeometryIPC = {
  hasNotch: false,
  width: 220,
  height: 38,
  displayWidth: 1728,
  // 'placeholder' rather than 'hidden' deliberately: this value is used
  // only before the real geometry arrives over IPC, and a fallback that
  // hides the indicator would flash it out of existence on every launch
  // for the split second before the answer comes back.
  noNotchIndicator: 'placeholder',
  placeholderWidth: null,
}

export default function NotchIndicator() {
  const [state, setState] = useState<NotchState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [geometry, setGeometry] = useState<NotchGeometryIPC>(FALLBACK_GEOMETRY)
  const [recent, setRecent] = useState<RecentDictation | null>(null)
  const [panelHeight, setPanelHeight] = useState(0)
  const [hotkey, setHotkey] = useState<string | null>(null)
  const [contentWidth, setContentWidth] = useState<{ left: number; right: number } | null>(null)

  const { waveform, startRecording, stopRecording } = useIndicatorAudio()

  const panelRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const leftInnerRef = useRef<HTMLDivElement>(null)
  const rightInnerRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirrors `state` for the pointer handler, which is installed once and
  // would otherwise close over the first render's value forever.
  const stateRef = useRef<NotchState>('idle')
  stateRef.current = state
  // Last value sent to setInteractive, so a mousemove storm doesn't fire
  // an IPC message per frame.
  const interactiveRef = useRef(false)
  // Previous total width, for choosing the easing direction.
  const prevWidthRef = useRef(geometry.width)
  // True from the moment a dictation starts until it returns to idle.
  // Hover-to-peek is suppressed while it is set.
  //
  // The prototype guarded this with `if (timers.length) return`, but its
  // timer array was never emptied after a run finished — so a single run
  // permanently disabled hover. A boolean cleared on the return to idle
  // is what that guard was reaching for.
  const runActiveRef = useRef(false)
  // The state to restore when the expanded panel closes.
  const beforeExpandRef = useRef<NotchState>('idle')

  const clearCopyTimer = () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = null
  }

  const refreshRecent = useCallback(() => {
    window.indicator
      .getRecent?.()
      .then((r) => setRecent(r))
      .catch(() => setRecent(null))
  }, [])

  // ---- geometry ---------------------------------------------------------
  useEffect(() => {
    let alive = true
    const read = () => {
      window.indicator
        .getNotchGeometry?.()
        .then((g) => {
          if (alive && g) setGeometry(g)
        })
        .catch(() => {
          /* keep the fallback */
        })
    }
    read()
    // Show the key the user actually bound, not a hardcoded one.
    window.indicator
      .getHotkey?.()
      .then((k) => {
        if (alive) setHotkey(formatHotkey(k))
      })
      .catch(() => {
        /* no hint rather than a wrong one */
      })
    // The window is repositioned when the cursor moves to another display;
    // re-read so the centre band matches the new screen's notch.
    window.addEventListener('resize', read)
    // Notch calibration lives in Settings > General. Without this the
    // slider there would only take effect on the next launch.
    const offGeometry = window.indicator.onGeometryChanged?.(read)
    return () => {
      alive = false
      window.removeEventListener('resize', read)
      offGeometry?.()
    }
  }, [])

  // ---- pipeline state ---------------------------------------------------
  useEffect(() => {
    refreshRecent()

    const unsub = window.indicator.onStateChange((s) => {
      if (s.startsWith('error:')) {
        setErrorMsg(s.slice(6))
        runActiveRef.current = true
        setState('error')
        return
      }
      // Streaming partial transcripts are plumbed through but not painted
      // — whisper.cpp emits segments every ~10s of audio, so on a typical
      // 2-15s dictation the first partial lands at the very end and the
      // "streaming" reads as a glitch rather than progress.
      if (s.startsWith('partial:')) return

      const next = fromPipelineState(s as PipelineState)

      const action = recorderActionFor(s as PipelineState)
      if (action === 'start') startRecording()
      else if (action === 'stop') stopRecording()

      if (s === 'idle') {
        runActiveRef.current = false
        clearCopyTimer()
        setState('idle')
        // A run just finished — the transcript it produced is what peek
        // will offer next.
        refreshRecent()
        return
      }

      runActiveRef.current = true
      // Fetch the transcript for any state that paints it. The pipeline
      // writes to history before broadcasting, so by now history[0] is
      // this run's result — without this the drawer showed the previous
      // dictation, i.e. told the user to insert text they hadn't spoken.
      if (paintsTranscript(next)) refreshRecent()
      setState(next)
    })

    return () => {
      unsub()
      clearCopyTimer()
    }
    // startRecording/stopRecording are stable for the life of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRecent])

  // ---- panel measurement ------------------------------------------------
  // Measured, never hand-summed: adding a row to the panel must not
  // silently clip it.
  //
  // scrollHeight, not offsetHeight: the shape clips its children, so once
  // the container is even slightly too short offsetHeight reports the
  // clipped height and the panel can never grow back out of it. That
  // latch is what cut the bottom off.
  //
  // A ResizeObserver rather than a render-time read, because the panel
  // reflows for reasons no render is tied to — the serif face finishing
  // loading, or a longer transcript wrapping onto another line.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) {
      if (panelHeight !== 0) setPanelHeight(0)
      return
    }
    const measure = () => {
      const h = el.scrollHeight
      if (h) setPanelHeight((prev) => (Math.abs(h - prev) > 0.5 ? h : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // Re-attach when the panel appears or disappears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Both drawers share panelRef; only one is mounted at a time.
  }, [state === 'expanded' || state === 'pasting' || state === 'clipboard', recent?.text])

  // ---- wing content measurement -----------------------------------------
  // Each wing sizes to what it holds. Measuring the inner row rather than
  // the wing itself is the point: the wing's width is what we're
  // computing, so reading it back would just echo the last value.
  useLayoutEffect(() => {
    const measure = () => {
      const l = leftInnerRef.current?.scrollWidth ?? 0
      const r = rightInnerRef.current?.scrollWidth ?? 0
      setContentWidth((prev) =>
        prev && Math.abs(prev.left - l) < 0.5 && Math.abs(prev.right - r) < 0.5
          ? prev
          : { left: l, right: r },
      )
    }
    measure()
    // The serif face loading, or a longer transcript, changes the natural
    // width without any render of ours being involved.
    const ro = new ResizeObserver(measure)
    if (leftInnerRef.current) ro.observe(leftInnerRef.current)
    if (rightInnerRef.current) ro.observe(rightInnerRef.current)
    return () => ro.disconnect()
  }, [state, recent?.text, hotkey, errorMsg])

  // ---- interaction ------------------------------------------------------
  //
  // Hover is driven by pointer POSITION on every mousemove, not by
  // enter/leave events on the element. Two reasons, both bugs this
  // replaces:
  //
  //  1. enter/leave fire against a box that is resizing underneath the
  //     cursor. A leave that never arrives — because the shape grew past
  //     the pointer, or the state changed mid-gesture — left the notch
  //     stuck open with no way to dismiss it.
  //  2. setInteractive(true) makes the ENTIRE window opaque to the mouse,
  //     and the window spans the full display width. So a missed leave
  //     didn't just strand the shape, it killed clicks across the whole
  //     top strip of the screen — the menu bar included.
  //
  // Position is self-correcting: however the state got wrong, the next
  // mouse movement puts it right.
  useEffect(() => {
    const apply = (inside: boolean) => {
      if (interactiveRef.current !== inside) {
        interactiveRef.current = inside
        window.indicator.setInteractive(inside)
      }
      // A run owns the shape — hover neither opens nor closes it.
      if (runActiveRef.current) return
      if (inside) {
        if (stateRef.current === 'idle') setState('peek')
      } else if (stateRef.current !== 'idle') {
        clearCopyTimer()
        setState('idle')
      }
    }

    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // Horizontal slack makes the idle target reachable: the notch is a
      // physical cutout, so the shape it stands in for has no pixels to
      // aim at.
      //
      // Vertically there is NO slack — the bound is the shape's own
      // bottom edge. Anything below the notch belongs to whatever app is
      // under the menu bar, and slack there meant reaching for a browser
      // tab woke the indicator instead. r.bottom grows with the expanded
      // panel on its own, so the drawer stays reachable without it.
      const inside =
        e.clientX >= r.left - HOVER_SLACK &&
        e.clientX <= r.right + HOVER_SLACK &&
        e.clientY <= r.bottom
      apply(inside)
    }

    // Cursor left the window entirely (moved below it). No further
    // mousemove will arrive, so release here or interactivity sticks.
    const onOut = () => apply(false)

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onOut)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onOut)
    }
  }, [])

  // Only the peek state's mark is a control. Elsewhere the wordmark is
  // status, and a clickable-looking thing that does nothing is worse than
  // one that plainly doesn't invite the click.
  const micClickable = state === 'peek'

  const startFromNotch = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.indicator.toggleRecord()
  }

  const pasteFromNotch = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.indicator.pasteLast()
  }


  // Click toggles the panel. A click that only ever opens leaves the user
  // with no way to dismiss it except leaving the notch entirely.
  const openPanel = () => {
    if (!recent) return
    if (state === 'expanded') {
      setState(beforeExpandRef.current === 'expanded' ? 'peek' : beforeExpandRef.current)
      return
    }
    beforeExpandRef.current = state
    setState('expanded')
  }

  const copyRecent = (e: React.MouseEvent) => {
    // Must not also trigger the shape's own click-to-expand handler.
    e.stopPropagation()
    window.indicator.copyRecent()
    clearCopyTimer()
    setState('copied')
    copyTimerRef.current = setTimeout(() => {
      setState((s) => (s === 'copied' ? 'peek' : s))
    }, COPIED_HOLD_MS)
  }

  useEffect(() => {
    if (state !== 'expanded') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(beforeExpandRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  // ---- resolve ----------------------------------------------------------
  // The centre band is the notch estimate PLUS a safety margin on each
  // side. The wings butt right up against the band — left wing content is
  // right-aligned, right wing content is left-aligned — so if the estimate
  // is even slightly narrow, the physical cutout eats the edge of whatever
  // is nearest it: the record dot, the first waveform bars, the start of
  // the label. Since width is the one dimension we cannot read, the margin
  // buys tolerance for being wrong in the direction that costs content.
  const { width: bandWidth, height: bandHeight } = bandGeometry(geometry, {
    enabled: geometry.noNotchIndicator === 'placeholder',
    width: geometry.placeholderWidth ?? null,
  })

  const v = resolve({
    state,
    notchWidth: bandWidth,
    notchHeight: bandHeight,
    displayWidth: geometry.displayWidth,
    leftReserve: LEFT_RESERVE,
    rightReserve: RIGHT_RESERVE,
    clearance: CLEARANCE,
    panelHeight,
    prevWidth: prevWidthRef.current,
    contentWidth,
  })
  useEffect(() => {
    prevWidthRef.current = v.width
  }, [v.width])

  // No notch and no placeholder asked for → draw nothing at all.
  //
  // This is the one case where unmounting is correct. The note below
  // explains why the non-notched shape stays mounted at idle: it is the
  // only thing the pointer hit-tests against, so removing it kills hover
  // and peek. That reasoning does not apply here — the user has said they
  // want no indicator on this display, and losing the hover target is
  // part of what they asked for rather than a regression.
  //
  // Placed after every hook so the hook order never changes between
  // renders; React would otherwise tear on the first geometry update.
  if (!geometry.hasNotch && geometry.noNotchIndicator === 'hidden') return null

  // On a Mac with no notch there is no housing to hide in, so a permanent
  // black bar would just be a black bar. Idle renders nothing; the wings
  // still appear for everything else, hanging from the menu bar.
  // Deliberately NOT unmounted at idle on a non-notched Mac. The idle
  // shape already paints nothing — transparent background, no shadow — so
  // returning null bought no visual difference, but it removed the only
  // element the pointer handler hit-tests against. With nothing mounted
  // there was no hover target, so peek could never open and the recent
  // transcript was unreachable on every display without a cutout.

  const label = state === 'error' ? errorMsg || v.label : v.label

  return (
    <div
      ref={wrapRef}
      className="absolute top-0 left-1/2 font-sans"
      onClick={openPanel}
      style={{
        zIndex: 3,
        pointerEvents: 'auto',
        willChange: 'width, margin-left',
        transition: `width ${v.transition}, margin-left ${v.transition}`,
        width: v.width,
        marginLeft: v.offsetFromCenter,
        cursor: recent ? 'pointer' : 'default',
      }}
    >
      <style>{`
        @keyframes notchSpin { to { transform: rotate(360deg) } }
        @keyframes notchPulse { 50% { opacity: .45 } }
        @keyframes notchContentIn {
          from { opacity: 0; transform: scale(.9); filter: blur(3px) }
          to   { opacity: 1; transform: none;      filter: blur(0) }
        }
        @keyframes notchPanelIn {
          from { opacity: 0; transform: translateY(-8px); filter: blur(3px) }
          to   { opacity: 1; transform: none;             filter: blur(0) }
        }
        .notch-in    { animation: notchContentIn 420ms cubic-bezier(.22,1,.36,1) 90ms both; }
        .notch-panel { animation: notchPanelIn 460ms cubic-bezier(.22,1,.36,1) 120ms both; }
        .notch-recent:hover {
          background: rgba(90,143,232,.24);
        }
        .notch-action:hover {
          background: radial-gradient(120% 120% at 50% 0%, rgba(90,143,232,.4), rgba(90,143,232,.14)) !important;
        }
        .notch-mark:hover {
          background: rgba(90,143,232,.28);
          color: #fff;
        }
        /* The double-tap performed on ONE key, which is what the gesture
           actually is — two caps side by side read as a chord, as though
           you press two different keys. The key stays put and depresses
           twice, then rests for two thirds of the cycle: the pause is
           what makes the pair legible as "double" rather than as a blink.
           Glow sizes come from CSS vars so one keyframe serves both the
           inline hint and the full-size one in the drawer. */
        /* Timing, over a 2.6s cycle:
             0.00-0.21s  first press travels down
             0.21-0.39s  HELD down
             0.39-0.60s  releases
             0.60-0.70s  back up — the beat that separates the two taps
             0.70-0.91s  second press travels down
             0.91-1.09s  HELD down
             1.09-1.25s  releases
             1.25-2.60s  rest
           The holds are the point. Without them each press was a ~230ms
           in-and-out that the eye reads as a flicker; pausing at the
           bottom is what makes it look like a key being pressed. The beat
           between the two, and the long rest after, are what make the
           pair read as one double-tap rather than as a pulse. */
        @keyframes notchDoubleTap {
          0%, 23%, 27%, 48%, 100% {
            transform: translateY(0);
            background: rgba(255,255,255,.08);
            border-color: rgba(90,143,232,.35);
            color: rgba(255,255,255,.8);
            box-shadow: 0 0 var(--glow-rest) rgba(90,143,232,.22),
                        inset 0 -2px 0 rgba(0,0,0,.35);
          }
          8%, 15%, 35%, 42% {
            transform: translateY(2px);
            background: rgba(90,143,232,.45);
            border-color: rgba(90,143,232,.85);
            color: #fff;
            box-shadow: 0 0 var(--glow-press) rgba(90,143,232,.7),
                        inset 0 -1px 0 rgba(0,0,0,.3);
          }
        }
        .notch-tap { animation: notchDoubleTap 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          /* Hold the resting glow — the key still draws the eye, it just
             stops moving. */
          .notch-tap { animation: none; }
        }
      `}</style>


      {/* Ambient glow — one blurred ellipse per WING, never the centre.
          It used to be a single ellipse spanning 8%–92%, so the brightest
          part sat directly over the middle of the shape: exactly where
          the physical notch is. That lit the housing, which made the UI
          read as a separate panel parked under the notch rather than as
          something growing out of it.
          The centre now stays black on black and merges with the
          hardware; the glow lives out on the wings, which is also the
          only part that needs to be legible against a black desktop.
          Each ellipse stops short of its wing's inner edge so the blur
          falls off before it reaches the housing. */}
      {[
        { key: 'l', side: 'left' as const, wing: v.leftWing },
        { key: 'r', side: 'right' as const, wing: v.rightWing },
      ].map(({ key, side, wing }) => (
        <span
          key={key}
          style={{
            position: 'absolute',
            [side]: 0,
            width: Math.max(0, wing * GLOW_WING_FRACTION),
            top: 14,
            height: 44,
            borderRadius: 999,
            pointerEvents: 'none',
            filter: 'blur(26px)',
            transition: 'opacity 420ms ease, background 420ms ease, width 420ms ease',
            opacity: v.glowOpacity,
            background: v.glowColor,
          }}
        />
      ))}

      {/* Concave fillets. They sit OUTSIDE the shape, filling the corner
          between its side and the menu bar so it appears to grow out of
          the bar rather than sit on it. They cannot be children of the
          shape itself, which clips. */}
      <span style={filletStyle('left', v.fillet)} />
      <span style={filletStyle('right', v.fillet)} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          // Flat near-black, no gradient. A vertical gradient reads as a
          // painted panel sitting on the screen; a single flat value with
          // a hairline rim and a soft shadow reads as an extension of the
          // machine, which is the whole point of the shape.
          //
          // Fully transparent at idle: anything drawn here persists as a
          // visible black slab during Spaces transitions, where the real
          // notch is composited away and ours is left hanging.
          background: v.isIdle ? 'transparent' : '#0A0B0F',
          overflow: 'hidden',
          willChange: 'height',
          boxShadow: v.isIdle
            ? 'none'
            : '0 10px 28px rgba(0,0,0,.5), inset 0 -1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(255,255,255,.05)',
          transition: `height ${v.transition}, border-radius ${v.transition}, background 200ms ease`,
          height: v.height,
          borderBottomLeftRadius: v.radius,
          borderBottomRightRadius: v.radius,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 'none', height: v.rowHeight }}>
          {/* LEFT WING — input */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              boxSizing: 'border-box',
              overflow: 'hidden',
              willChange: 'width',
              transition: `width ${v.transition}, padding ${v.transition}`,
              paddingRight: v.leftPadding,
              width: v.leftWing,
            }}
          >
            {/* Inner row at natural width — this is what gets measured.
                The outer div animates and clips, so measuring it would
                just return whatever width we already set. */}
            <div
              ref={leftInnerRef}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                width: 'max-content',
                flex: 'none',
              }}
            >
            {v.recordDot && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: '#E84A3A',
                  flex: 'none',
                  boxShadow: '0 0 8px rgba(232,74,58,.85)',
                  animation: 'notchPulse 2s cubic-bezier(.4,0,.6,1) infinite',
                }}
              />
            )}
            {v.waveform && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2.5,
                  height: WAVE_HEIGHT,
                  flex: 'none',
                  filter: 'drop-shadow(0 0 5px rgba(90,143,232,.55))',
                  WebkitMaskImage:
                    'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)',
                  maskImage:
                    'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)',
                }}
              >
                {Array.from({ length: BAR_COUNT }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 2,
                      borderRadius: 1,
                      background: ACCENT,
                      // Driven by the live analyser rather than the
                      // prototype's CSS keyframes — the app already has
                      // real amplitude, and a dictation indicator that
                      // does not react to your voice is a worse one.
                      height: Math.min(
                        WAVE_HEIGHT,
                        Math.max(2, (waveform[i] ?? 0) * (WAVE_HEIGHT / 100)),
                      ),
                      transition: 'height 75ms linear',
                    }}
                  />
                ))}
              </span>
            )}
            {/* The wordmark, not a generic mic glyph — this is the one
                place the app says who it is. The notch itself is the
                charcoal pill the brand mark normally draws, so the mark
                sheds its container and keeps only the italic serif. */}
            {v.mic && (
              <span
                className={`notch-in${micClickable ? ' notch-mark' : ''}`}
                onClick={micClickable ? startFromNotch : undefined}
                title={micClickable ? 'Start dictating' : undefined}
                style={{
                  fontFamily: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: LABEL_SIZE,
                  lineHeight: 1,
                  letterSpacing: '-.005em',
                  color: 'rgba(255,255,255,.92)',
                  textShadow: '0 1px 2px rgba(0,0,0,.35)',
                  whiteSpace: 'nowrap',
                  flex: 'none',
                  cursor: micClickable ? 'pointer' : 'default',
                  padding: micClickable ? '3px 7px' : 0,
                  borderRadius: 7,
                  transition: 'background 160ms ease, color 160ms ease',
                }}
              >
                Yappr
              </span>
            )}
            {/* The key the user actually bound, read from settings. A
                hardcoded hint is worse than none — it teaches the wrong
                shortcut to anyone who hasn't changed the default. */}
            {v.hotkeyHint && hotkey && (
              <span
                className="notch-in"
                style={{
                  fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
                  fontSize: 10,
                  lineHeight: 1,
                  color: 'rgba(255,255,255,.55)',
                  whiteSpace: 'nowrap',
                  flex: 'none',
                  padding: '3px 6px',
                  borderRadius: 5,
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.1)',
                }}
              >
                {hotkey}
              </span>
            )}
            </div>
          </div>

          {/* CENTRE — the notch itself. Never moves, never resizes, and
              paints nothing: the notch is a physical cutout, so there are
              no pixels here to draw on. The prototype's lens dot only
              existed because its notch was a rectangle on a mock desktop. */}
          <div style={{ width: bandWidth, flex: 'none' }} />

          {/* RIGHT WING — outcome */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box',
              overflow: 'hidden',
              willChange: 'width',
              transition: `width ${v.transition}, padding ${v.transition}`,
              paddingLeft: v.rightPadding,
              width: v.rightWing,
            }}
          >
            <div
              ref={rightInnerRef}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: 'max-content',
                flex: 'none',
              }}
            >
            {v.spinner && (
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  flex: 'none',
                  border: '1.5px solid rgba(255,255,255,.18)',
                  borderTopColor: ACCENT,
                  animation: 'notchSpin .8s linear infinite',
                }}
              />
            )}
            {v.check && (
              <svg
                width="13"
                height="13"
                viewBox="0 0 11 11"
                fill="none"
                className="notch-in"
                style={{ flex: 'none' }}
              >
                <path
                  d="M2 5.5 L4.5 8 L9 3"
                  stroke={ACCENT}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {v.errorDot && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: '#E84A3A',
                  flex: 'none',
                  boxShadow: '0 0 8px rgba(232,74,58,.85)',
                }}
              />
            )}
            {v.recent && recent && (
              <span
                className="notch-in notch-recent"
                onClick={copyRecent}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  flex: 'none',
                  // No resting background or border. A filled chip inside
                  // the shape reads as a pill floating in a pill; the
                  // transcript is content, and the shape is already its
                  // container. The hover fill in notch-recent is what
                  // signals it's clickable.
                  padding: '4px 6px',
                  borderRadius: 7,
                  cursor: 'pointer',
                  transition: 'background 200ms ease',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,.88)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                    // Capped so a long dictation can't stretch the shape
                    // across the menu bar — it ellipsizes instead.
                    maxWidth: PREVIEW_MAX_WIDTH,
                  }}
                >
                  {recent.text}
                </span>
                <CopyGlyph size={11} opacity={0.6} />
              </span>
            )}
            {label && (
              <span
                className="notch-in"
                style={{
                  fontFamily: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: LABEL_SIZE,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  letterSpacing: '.005em',
                  textShadow: '0 1px 2px rgba(0,0,0,.35)',
                  color: v.labelColor,
                }}
              >
                {label}
              </span>
            )}
            {/* Suppressed when a drawer is open — the drawer carries the
                gesture at full size, and two of them would compete. */}
            {v.gesture && !v.fallbackPanel && <GestureHint hotkey={hotkey} />}
            </div>
          </div>
        </div>

        {/* Clipboard-fallback drawer. The one state where the user has to
            act, so it gets the room the old bottom-right popup had: the
            text on the left, the double-tap drawn full size on the right. */}
        {v.fallbackPanel && recent && (
          <div
            ref={panelRef}
            className="notch-panel"
            style={{
              flex: 'none',
              boxSizing: 'border-box',
              padding: '0 14px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              minWidth: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,.9)',
                  textWrap: 'pretty',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                }}
              >
                {recent.text}
              </span>
              <span
                style={{
                  fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
                  fontSize: 8.5,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.3)',
                }}
              >
                Copied — not inserted
              </span>
            </div>

            <Hairline />

            <GestureHint hotkey={hotkey} size="lg" />
          </div>
        )}

        {/* Paste drawer — the double-tap gesture's visible result. Same
            downward movement as the full panel, but it carries only the
            text going in. */}
        {v.pastePanel && recent && (
          <div
            ref={panelRef}
            className="notch-panel"
            style={{
              flex: 'none',
              boxSizing: 'border-box',
              padding: '0 14px 13px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: 'rgba(255,255,255,.9)',
                textWrap: 'pretty',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: TRANSCRIPT_MAX_LINES,
                overflow: 'hidden',
              }}
            >
              {recent.text}
            </span>
            <span
              style={{
                fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
                fontSize: 8.5,
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.3)',
              }}
            >
              {recent.target ? `Copied into ${recent.target}` : 'Copied to clipboard'}
            </span>
          </div>
        )}

        {v.panel && recent && (
          <div
            ref={panelRef}
            className="notch-panel"
            style={{
              flex: 'none',
              boxSizing: 'border-box',
              padding: '0 12px 12px',
              display: 'flex',
              alignItems: 'stretch',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 112,
                flex: 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 9,
                paddingTop: 2,
              }}
            >
              <Sparkline />
              <span
                style={{
                  fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
                  fontSize: 9,
                  letterSpacing: '.13em',
                  color: 'rgba(255,255,255,.4)',
                }}
              >
                {recent.durationSec !== null && `${formatDuration(recent.durationSec)} · `}
                {recent.wordCount} WORDS
              </span>
            </div>

            <Hairline />

            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,.9)',
                  textWrap: 'pretty',
                  // Bounded on purpose. An unbounded transcript is how the
                  // shape grew past the window that contains it.
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: TRANSCRIPT_MAX_LINES,
                  overflow: 'hidden',
                }}
                title={recent.text}
              >
                {recent.text}
              </span>
              <span
                style={{
                  fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
                  fontSize: 8.5,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.3)',
                }}
              >
                {recent.target ? `Copied into ${recent.target}` : 'Copied to clipboard'}
              </span>
            </div>

            <Hairline />

            {/* One button and one gesture. Copy is the thing the panel can
                do that the keyboard can't; inserting is already the
                hotkey's double-tap, so it's taught rather than duplicated. */}
            <div
              style={{
                flex: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <PanelAction label="Copy" onClick={copyRecent}>
                <CopyGlyph size={13} opacity={0.85} />
              </PanelAction>
              <GestureHint hotkey={hotkey} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function filletStyle(side: 'left' | 'right', opacity: number): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    [side]: -13,
    width: 13,
    height: 13,
    pointerEvents: 'none',
    background:
      side === 'left'
        ? 'radial-gradient(circle at 0% 100%, transparent 0 13px, #000 13.5px)'
        : 'radial-gradient(circle at 100% 100%, transparent 0 13px, #000 13.5px)',
    transition: 'opacity 360ms cubic-bezier(.4,0,.2,1)',
    opacity,
  }
}

/**
 * The double-tap gesture on the user's own hotkey, drawn as two key caps.
 * Shown wherever text is on the clipboard but not yet in the app.
 *
 * Deliberately not a button. Double-tapping the hotkey already inserts
 * the last dictation, so a button would be a second route to the same
 * action that only exists while the notch is open — the gesture keeps
 * working after it closes.
 */
function GestureHint({
  hotkey,
  size = 'sm',
}: {
  hotkey: string | null
  size?: 'sm' | 'lg'
}) {
  if (!hotkey) return null
  const lg = size === 'lg'
  // One key, pressed twice. The keyframes carry colour, lift and glow;
  // everything here is geometry plus the two glow radii they read.
  const cap: React.CSSProperties & Record<'--glow-rest' | '--glow-press', string> = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
    fontSize: lg ? 26 : 12,
    lineHeight: 1,
    color: 'rgba(255,255,255,.8)',
    minWidth: lg ? 48 : 22,
    height: lg ? 46 : 21,
    padding: lg ? '0 10px' : '0 6px',
    borderRadius: lg ? 11 : 6,
    background: 'rgba(255,255,255,.08)',
    border: '1px solid rgba(90,143,232,.35)',
    flex: 'none',
    '--glow-rest': lg ? '16px' : '8px',
    '--glow-press': lg ? '30px' : '14px',
  }
  return (
    <span
      className="notch-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: lg ? 10 : 6,
        flex: 'none',
      }}
    >
      <span className="notch-tap" style={cap}>
        {hotkey}
      </span>
      <span
        style={{
          fontSize: lg ? 11.5 : 9.5,
          lineHeight: 1.3,
          color: `rgba(255,255,255,${lg ? '.6' : '.45'})`,
          whiteSpace: lg ? 'normal' : 'nowrap',
          maxWidth: lg ? 76 : undefined,
        }}
      >
        {lg ? (
          <>
            double-tap
            <br />
            to insert
          </>
        ) : (
          'double-tap to insert'
        )}
      </span>
    </span>
  )
}

function PanelAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: 46,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
      }}
    >
      <span
        className="notch-action"
        onClick={onClick}
        title={label}
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(120% 120% at 50% 0%, rgba(255,255,255,.14), rgba(255,255,255,.05))',
          border: '1px solid rgba(255,255,255,.1)',
          cursor: 'pointer',
          transition: 'background 200ms ease',
        }}
      >
        {children}
      </span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)' }}>{label}</span>
    </div>
  )
}

function Hairline() {
  return (
    <div
      style={{
        width: 1,
        flex: 'none',
        background:
          'linear-gradient(180deg, transparent, rgba(255,255,255,.13) 25%, rgba(255,255,255,.13) 75%, transparent)',
      }}
    />
  )
}

const SPARK_HEIGHTS = [5, 9, 13, 7, 11, 15, 10, 6, 12, 14, 8, 11, 13, 9, 6, 11, 15, 8]

function Sparkline() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 15 }}>
      {SPARK_HEIGHTS.map((h, i) => (
        <span
          key={i}
          style={{ width: 2, borderRadius: 1, background: ACCENT, opacity: 0.55, height: h }}
        />
      ))}
    </span>
  )
}

function CopyGlyph({ size, opacity }: { size: number; opacity: number }) {
  const stroke = `rgba(255,255,255,${opacity})`
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" style={{ flex: 'none' }}>
      <rect x="4.6" y="1.4" width="8.4" height="9.4" rx="2.2" stroke={stroke} strokeWidth="1.4" />
      <path
        d="M10.4 13.6H3.6a2 2 0 0 1-2-2V4.6"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
