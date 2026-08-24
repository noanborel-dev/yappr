// The recording indicator, drawn at Settings scale.
//
// This replaces MiniPill — a rounded liquid-glass lozenge with a timer,
// which was a faithful miniature of an indicator the app stopped shipping.
// Every mock in Settings that showed one was teaching users to look for
// something that no longer exists.
//
// The state table is IMPORTED from the real indicator rather than copied,
// so a label or accent that changes there changes here. The organizing
// rule survives from the design handoff and must survive any edit:
//
//   LEFT wing  = input   (what Yappr is hearing)
//   CENTRE     = the physical notch. Never moves, paints nothing.
//   RIGHT wing = outcome (what Yappr did with it)
//
// Square at the top, rounded only at the bottom — it HANGS from the menu
// bar. Which is also why it may never float in the middle of a mock: use
// <MenuBar> to give it an edge to hang from, or leave it out.

import type { ReactNode } from 'react'
import { STATES, ACCENT, DANGER, LABEL_SIZE, type NotchState } from '../../indicator/notch-states'
import { YapprMark, BRAND_WING, BRAND_CHARCOAL } from './YapprMark'

/** Waveform geometry, matching useIndicatorAudio's constants. */
const BAR_COUNT = 9
const WAVE_HEIGHT = 13

// The live indicator drives bar heights from a mic analyser. There's no
// analyser behind a mock, so these are a fixed profile that reads as a
// voice — plus a per-bar animation delay so it moves without ever
// syncing into a single pulsing block.
const WAVE_PROFILE = [0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6, 0.3]

const SERIF = '"Instrument Serif", "Cormorant Garamond", Georgia, serif'

interface Props {
  state: NotchState
  /**
   * Width of the centre band, in px. The real one tracks the physical
   * camera housing (~150–190pt); mocks are a fraction of screen width, so
   * they get a proportionally smaller notch.
   */
  notchWidth?: number
  /** Height of the shape. The real one is exactly the notch's height. */
  height?: number
  /** Uniform scale, applied from the top centre. Content stays at spec. */
  scale?: number
  /** The user's actual push-to-talk glyph, for the `peek` hint. */
  hotkey?: string | null
}

export function NotchMark({
  state,
  notchWidth = 56,
  height = 30,
  scale = 1,
  hotkey = null,
}: Props) {
  const spec = STATES[state] ?? STATES.idle
  const idle = state === 'idle'

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top center',
      }}
    >
      <style>{NOTCH_KEYFRAMES}</style>

      {/* Ambient glow — a blurred ellipse behind the shape. */}
      {spec.glow && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            top: 6,
            height: 26,
            borderRadius: 999,
            filter: 'blur(18px)',
            background: spec.glow,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Concave fillets, sitting OUTSIDE the shape — they fill the corner
          against the bar so it grows out of it rather than sits on it.
          They can't be children of the shape, which clips. */}
      {!idle && <Fillet side="left" />}
      {!idle && <Fillet side="right" />}

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height,
          // Imported from the real indicator rather than restated: black
          // under the centre band so it merges with the housing, lifting
          // to charcoal blue only at the wings. A VERTICAL gradient here
          // would read as a panel sitting on the screen — this one runs
          // across, which is what keeps the middle looking like hardware.
          background: idle ? 'transparent' : BRAND_WING,
          borderRadius: `0 0 ${idle ? 15 : 19}px ${idle ? 15 : 19}px`,
          boxShadow: idle
            ? 'none'
            : '0 10px 28px rgba(0,0,0,.5), inset 0 -1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(255,255,255,.05)',
          overflow: 'hidden',
        }}
      >
        {/* LEFT — input */}
        <Wing side="left" open={spec.lw > 0}>
          {spec.recordDot && <RecordDot />}
          {spec.waveform && <Waveform />}
          {spec.mic && <Wordmark />}
          {spec.hotkeyHint && hotkey && <KeyHint glyph={hotkey} />}
        </Wing>

        {/* CENTRE — the housing. There are no pixels here on real
            hardware; in a mock it's the same fill as the shell. */}
        <div style={{ width: notchWidth, flex: 'none' }} />

        {/* RIGHT — outcome */}
        <Wing side="right" open={spec.rw > 0}>
          {spec.spinner && <Spinner />}
          {spec.check && <Check />}
          {spec.errorDot && <RecordDot color={DANGER} still />}
          {spec.label && (
            <span
              style={{
                fontFamily: SERIF,
                fontStyle: 'italic',
                fontSize: LABEL_SIZE,
                lineHeight: 1,
                letterSpacing: '-.005em',
                whiteSpace: 'nowrap',
                color: spec.labelColor ?? 'rgba(255,255,255,.95)',
                textShadow: '0 1px 2px rgba(0,0,0,.35)',
              }}
            >
              {spec.label}
            </span>
          )}
        </Wing>
      </div>
    </div>
  )
}

/**
 * A menu-bar strip for the indicator to hang from.
 *
 * Placement is part of the indicator's spec: it hangs from the top edge of
 * a screen and may never float mid-window. Any mock that wants one wraps
 * its top edge in this.
 */
export function MenuBar({
  children,
  tone = 'desktop',
  right,
}: {
  children?: ReactNode
  tone?: 'desktop' | 'dark' | 'light'
  right?: ReactNode
}) {
  // Translucent by default rather than opaque: the caller paints the
  // wallpaper, and the bar is a frosted strip over it. Painting the same
  // gradient here made the strip invisible, so the shape appeared to hang
  // off nothing — and "it hangs from the menu bar" is the whole point.
  const bg =
    tone === 'dark'
      ? 'rgba(10,11,15,.92)'
      : tone === 'light'
        ? 'rgba(255,255,255,.72)'
        : 'rgba(255,255,255,.14)'
  return (
    <div
      style={{
        position: 'relative',
        height: 30,
        background: bg,
        borderBottom: '1px solid rgba(255,255,255,.16)',
        backdropFilter: 'blur(8px)',
        flex: 'none',
      }}
    >
      {right && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 0,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {right}
        </div>
      )}
      {/* The shape hangs from the bar's top edge, overlapping it. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          transform: 'translateX(-50%)',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Parts ──────────────────────────────────────────────────────────

function Wing({
  side,
  open,
  children,
}: {
  side: 'left' | 'right'
  open: boolean
  children: ReactNode
}) {
  if (!open) return <div style={{ width: 0, flex: 'none' }} />
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flex: 'none',
        // WING_PADDING on the inner edge (against the housing), a wider
        // outer pad so content clears the rounded corner.
        paddingLeft: side === 'left' ? 12 : 3,
        paddingRight: side === 'left' ? 3 : 12,
      }}
    >
      {children}
    </div>
  )
}

function RecordDot({ color = DANGER, still }: { color?: string; still?: boolean }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: color,
        flex: 'none',
        boxShadow: `0 0 8px ${color}d9`,
        animation: still ? undefined : 'notchMarkPulse 2s cubic-bezier(.4,0,.6,1) infinite',
      }}
    />
  )
}

function Waveform() {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2.5,
        height: WAVE_HEIGHT,
        flex: 'none',
        filter: 'drop-shadow(0 0 5px rgba(90,143,232,.55))',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)',
        maskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)',
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className="notch-mark-bar"
          style={{
            width: 2,
            borderRadius: 1,
            background: ACCENT,
            height: Math.max(2, WAVE_PROFILE[i] * WAVE_HEIGHT),
            animationDelay: `${(i % 4) * -0.17}s`,
          }}
        />
      ))}
    </span>
  )
}

// The mark inside the notch uses the shared BARE lockup: the hardware is
// already the pill, so drawing another one would be a pill inside a pill.
// It used to be a local copy of the same italic serif, which is how the
// notch and the brand pill ended up on different whites.
function Wordmark() {
  return <YapprMark lockup="bare" tone="dark" dot={false} style={{ fontSize: LABEL_SIZE }} />
}

function KeyHint({ glyph }: { glyph: string }) {
  return (
    <span
      style={{
        fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1,
        color: 'rgba(255,255,255,.55)',
        padding: '3px 6px',
        borderRadius: 5,
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.1)',
        flex: 'none',
      }}
    >
      {glyph}
    </span>
  )
}

function Spinner() {
  return (
    <span
      style={{
        width: 11,
        height: 11,
        borderRadius: 999,
        border: '1.5px solid rgba(255,255,255,.22)',
        borderTopColor: ACCENT,
        flex: 'none',
        animation: 'notchMarkSpin .7s linear infinite',
      }}
    />
  )
}

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flex: 'none' }}>
      <path
        d="M2 5.5 L4.5 8 L9 3"
        stroke={ACCENT}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Fillet({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        [side]: -13,
        width: 13,
        height: 13,
        pointerEvents: 'none',
        // Matches the wing's outer edge, not the housing — see the same
        // note in NotchIndicator's filletStyle.
        background:
          side === 'left'
            ? `radial-gradient(circle at 0% 100%, transparent 0 13px, ${BRAND_CHARCOAL} 13.5px)`
            : `radial-gradient(circle at 100% 100%, transparent 0 13px, ${BRAND_CHARCOAL} 13.5px)`,
      }}
    />
  )
}

const NOTCH_KEYFRAMES = `
  @keyframes notchMarkPulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
  @keyframes notchMarkSpin  { to { transform: rotate(360deg); } }
  @keyframes notchMarkBar   { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
  .notch-mark-bar { animation: notchMarkBar .62s ease-in-out infinite; transform-origin: center; }
  @media (prefers-reduced-motion: reduce) {
    .notch-mark-bar { animation: none; }
  }
`
