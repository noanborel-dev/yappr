// The Yappr mark. One implementation, every context.
//
// There were three, and they disagreed:
//
//   Wordmark.tsx          pill, #0E1018→#08090E gradient, #FFF text, font
//                         stack written longhand
//   NotchMark.tsx         bare, rgba(255,255,255,.92) text, SERIF const
//   NotchIndicator.tsx    bare, rgba(255,255,255,.92) text, longhand again,
//                         inline rather than a component
//
// The deepest of those is not that the values differ — it is that the pill
// claims, in its own comment, to "mirror the actual indicator pill the user
// sees in the wild", and then paints itself a DIFFERENT BLACK from the notch
// it is a picture of. #0E1018 against #0A0B0F. Put the logo next to the
// hardware and the illusion the mark is built on breaks.
//
// So this is not a restyle. It is the same shape drawn once, in the notch's
// own values, and reused — which is also the only way three copies stop
// drifting apart again.
//
// THE SYSTEM: two axes and a size scale, not a folder of variants.
//   lockup — what is drawn      (pill · bare · icon · stacked)
//   tone   — what it is drawn on (dark · light · ink · white)
//   size   — how big             (hero · button · inline · favicon)
// Every combination that is useful is reachable; nothing is a special case.

import type { CSSProperties, ReactNode } from 'react'

// ─── Brand constants — the single source for all three surfaces ─────

/** The notch shell. The mark and the hardware it depicts are one colour. */
export const BRAND_BLACK = '#0A0B0F'

/**
 * Text on black.
 *
 * .92, not #FFF. Pure white on near-black blooms at small sizes and the
 * serif's thin strokes fatten; the shipped indicator already used .92 and
 * was the better of the two. The pill was the outlier.
 */
export const BRAND_ON_DARK = 'rgba(255,255,255,.92)'

/** Ink, for the mark on cream or paper. */
export const BRAND_INK = '#15161A'

/**
 * The dot.
 *
 * Deliberately NOT the terracotta brand accent (#C8553D). It means
 * recording — the same red every camera and every record button has used
 * for fifty years — and borrowing the accent for it would trade a
 * universally understood signal for brand tidiness.
 */
export const BRAND_DOT = '#E84A3A'

export const BRAND_SERIF = '"Instrument Serif", "Cormorant Garamond", Georgia, serif'

// ─── The atmosphere ─────────────────────────────────────────────────
//
// A charcoal-blue field with a cool highlight drifting across it, rather
// than a flat plate. Reference was a soft-focus navy photograph — the
// quality wanted is that it MOVES: light pooling in one corner and
// falling away, not a ramp from A to B.
//
// Which is why this is four overlapping layers and not one gradient. A
// single linear-gradient reads as a ramp no matter which stops it gets;
// the drift comes from soft radials at different positions and radii
// fading to full transparency, so no two points on the plate resolve the
// same way. The reference's highlight is warm taupe — this one is cooled
// to blue-grey, because a warm highlight over charcoal blue turns muddy
// where they meet.

/** The lighter white. Cool, so it stays in the blue family. */
export const BRAND_MIST = '#D6DEE8'
/** Mid tone, where the highlight falls off. */
export const BRAND_HAZE = '#96A7BE'
/** The transition into the body colour. */
export const BRAND_SLATE = '#56677F'
/** The charcoal blue the whole system is named for. */
export const BRAND_CHARCOAL = '#2B3950'
/** Deepest corner. Not black — black is reserved for the housing. */
export const BRAND_ABYSS = '#172130'

/**
 * The plate. Logo containers only — never the live notch (see BRAND_WING).
 *
 * The highlight is TALLER than it is wide (58% × 120%) and sits off to
 * one side. That is what makes it a pool of light rather than a band: a
 * highlight as wide as the plate reaches both edges at the same height,
 * and the eye reads any edge-to-edge change as a ramp however soft it
 * is. Keeping it narrow and letting it run off the top and bottom
 * instead gives light falling ACROSS the plate, which is the quality the
 * reference had and the first three attempts did not.
 */
export const BRAND_ATMOSPHERE = [
  `radial-gradient(58% 120% at 26% 8%, rgba(214,222,232,0.90), rgba(214,222,232,0) 60%)`,
  `radial-gradient(46% 80% at 88% 34%, rgba(150,167,190,0.42), rgba(150,167,190,0) 66%)`,
  `radial-gradient(120% 120% at 58% 112%, #0F1926 14%, rgba(15,25,38,0) 72%)`,
  `linear-gradient(148deg, ${BRAND_SLATE} 0%, ${BRAND_CHARCOAL} 44%, ${BRAND_ABYSS} 100%)`,
].join(', ')

/**
 * The live notch shell — and the one rule that cannot bend.
 *
 * The centre of this shape overlaps the physical camera housing, which is
 * true black. Anything else there is a visible seam, and the illusion the
 * whole indicator rests on is that the middle IS the hardware. So the
 * centre stays #000 and only the wings, which hang off the sides of the
 * housing and were never pretending to be hardware, lift to charcoal.
 *
 * 32% / 68% rather than a hard edge: the eye finds a seam far more easily
 * than a ramp, so the transition happens across the part of the shape
 * already clear of the housing.
 *
 * Note this uses CHARCOAL → ABYSS → black, and never touches SLATE. The
 * logo plate can afford SLATE because it is an object on a page; this
 * thing sits in the menu bar over whatever the user is doing, and a lift
 * that bright at the ends turns a piece of hardware into a floating
 * widget. The brand colour is present, at the quietest end of its range.
 */
export const BRAND_WING = `linear-gradient(90deg, ${BRAND_CHARCOAL} 0%, ${BRAND_ABYSS} 14%, #000 32%, #000 68%, ${BRAND_ABYSS} 86%, ${BRAND_CHARCOAL} 100%)`

export type MarkLockup = 'pill' | 'bare' | 'icon' | 'stacked' | 'notch' | 'circle'
export type MarkTone = 'dark' | 'light' | 'ink' | 'white' | 'atmosphere'
export type MarkSize = 'hero' | 'button' | 'inline' | 'favicon'

// Sizes are a scale, not four unrelated numbers: each step is roughly
// 0.62 of the one above, which keeps the dot-to-letter relationship
// constant instead of drifting as it shrinks.
const SIZES: Record<MarkSize, { px: number; dot: number; padX: number; padY: number; gap: number; radius: number }> = {
  hero:    { px: 30, dot: 9,   padX: 22, padY: 9,   gap: 12, radius: 999 },
  button:  { px: 18, dot: 6,   padX: 14, padY: 6,   gap: 9,  radius: 999 },
  inline:  { px: 14, dot: 5,   padX: 10, padY: 4.5, gap: 7,  radius: 999 },
  favicon: { px: 11, dot: 4,   padX: 8,  padY: 3.5, gap: 5,  radius: 999 },
}

interface ToneSpec {
  surface: string | null
  text: string
  dot: string
  /** Rim + drop, so the pill reads as an object rather than a sticker. */
  shadow: string | null
}

const TONES: Record<MarkTone, ToneSpec> = {
  // The default. A real pill on a light page.
  dark: {
    surface: BRAND_BLACK,
    text: BRAND_ON_DARK,
    dot: BRAND_DOT,
    shadow:
      'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.12)',
  },
  // Inverted, for placement on photography or a dark section.
  light: {
    surface: '#FBF9F1',
    text: BRAND_INK,
    dot: BRAND_DOT,
    shadow: 'inset 0 0 0 1px rgba(21,22,26,0.10), 0 1px 2px rgba(0,0,0,0.18)',
  },
  // One colour. For embossing, stamps, single-colour print, and anywhere
  // a red dot would be a second plate for no reason.
  ink: {
    surface: null,
    text: BRAND_INK,
    dot: BRAND_INK,
    shadow: null,
  },
  // Knockout, for dark photography and video.
  white: {
    surface: null,
    text: '#FFFFFF',
    dot: '#FFFFFF',
    shadow: null,
  },
  // The charcoal-blue plate. The primary mark on the site and the app
  // icon. Text is full #FFFFFF here, not BRAND_ON_DARK: .92 exists to
  // stop the serif blooming against flat near-black, and this plate is
  // lighter and textured enough that .92 reads as grey instead.
  atmosphere: {
    surface: BRAND_ATMOSPHERE,
    text: '#FFFFFF',
    dot: BRAND_DOT,
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(16,22,31,0.34)',
  },
}

export interface YapprMarkProps {
  lockup?: MarkLockup
  tone?: MarkTone
  size?: MarkSize
  /**
   * Show the recording dot. Off for read-only contexts — in a footer or a
   * document the dot reads as a bullet or a typo rather than a brand cue.
   */
  dot?: boolean
  /** Live state: the dot gains its glow. Only meaningful with a dot. */
  recording?: boolean
  className?: string
  style?: CSSProperties
}

export function YapprMark({
  lockup = 'pill',
  tone = 'dark',
  size = 'button',
  dot = true,
  recording = false,
  className = '',
  style,
}: YapprMarkProps) {
  const s = SIZES[size]
  const t = TONES[tone]

  const word = (
    <span
      className="leading-none"
      style={{
        fontFamily: BRAND_SERIF,
        fontStyle: 'italic',
        fontWeight: 400,
        fontSize: s.px,
        letterSpacing: '-0.005em',
        color: t.text,
        // Only on a dark surface. On cream this reads as a printing fault.
        textShadow: tone === 'dark' ? '0 1px 2px rgba(0,0,0,0.35)' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      Yappr
    </span>
  )

  const dotEl = dot ? (
    <span
      aria-hidden
      className="rounded-full shrink-0"
      style={{
        width: s.dot,
        height: s.dot,
        background: t.dot,
        boxShadow: recording ? `0 0 ${Math.max(3, s.dot)}px ${BRAND_DOT}` : undefined,
      }}
    />
  ) : null

  // BARE — no container. For use INSIDE the notch, where the hardware is
  // already the pill: drawing another one would be a pill inside a pill.
  if (lockup === 'bare') {
    return (
      <span className={`inline-flex items-center ${className}`} style={{ gap: s.gap, ...style }}>
        {dotEl}
        {word}
      </span>
    )
  }

  // NOTCH — the shape the product actually is: flat across the top,
  // rounded only at the bottom, so it HANGS from an edge.
  //
  // The caller has to supply that edge. A notch with nothing above it is
  // a rounded rectangle, and a rounded rectangle with a word in it is a
  // pill — which is the mark this system exists to replace. Anywhere
  // there is no top edge to hang from, use `circle` instead.
  if (lockup === 'notch') {
    return (
      <span
        className={`inline-flex items-center ${className}`}
        style={{
          gap: s.gap,
          padding: `${s.padY * 1.15}px ${s.padX * 1.25}px ${s.padY * 1.35}px`,
          // Square on top, rounded at the bottom.
          borderRadius: `0 0 ${s.px * 0.8}px ${s.px * 0.8}px`,
          background: t.surface ?? BRAND_BLACK,
          boxShadow: t.shadow ?? undefined,
          ...style,
        }}
      >
        {dotEl}
        {word}
      </span>
    )
  }

  // CIRCLE — for favicons, avatars and social profiles, which mask to a
  // circle whatever you hand them.
  //
  // This is where the notch cannot go: those slots have no top edge, and
  // below roughly 32px the notch silhouette is an unreadable blob. Same
  // plate and same word, so it still reads as one system.
  if (lockup === 'circle') {
    const box = s.px * 3.1
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{
          width: box,
          height: box,
          borderRadius: 999,
          background: t.surface ?? BRAND_BLACK,
          boxShadow: t.shadow ?? undefined,
          ...style,
        }}
      >
        {word}
      </span>
    )
  }

  // ICON — the dot alone, in a rounded square. For app icons, avatars and
  // favicons, where "Yappr" is illegible before the container is.
  if (lockup === 'icon') {
    const box = s.px * 1.9
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{
          width: box,
          height: box,
          // macOS squircle proportion — ~22% of the side.
          borderRadius: box * 0.22,
          background: t.surface ?? BRAND_BLACK,
          boxShadow: t.shadow ?? undefined,
          ...style,
        }}
      >
        <span
          aria-hidden
          className="rounded-full"
          style={{
            width: box * 0.3,
            height: box * 0.3,
            background: t.dot,
            boxShadow: recording ? `0 0 ${box * 0.22}px ${BRAND_DOT}` : undefined,
          }}
        />
      </span>
    )
  }

  // STACKED — dot above wordmark. For narrow columns and square crops,
  // where the horizontal lockup would have to shrink to fit.
  if (lockup === 'stacked') {
    return (
      <span
        className={`inline-flex flex-col items-center ${className}`}
        style={{ gap: s.gap * 0.7, ...style }}
      >
        {dotEl}
        {word}
      </span>
    )
  }

  // PILL — the primary lockup.
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{
        background: t.surface ?? 'transparent',
        boxShadow: t.shadow ?? undefined,
        borderRadius: s.radius,
        padding: `${s.padY}px ${s.padX}px`,
        gap: s.gap,
        ...style,
      }}
    >
      {dotEl}
      {word}
    </span>
  )
}

/**
 * Back-compat shim.
 *
 * Four call sites already say <Wordmark size="inline" />. Keeping the name
 * working means the unification lands without touching them, and the
 * shape they render is now the shared one.
 */
export function Wordmark({
  size = 'button',
  withoutDot,
}: {
  size?: MarkSize
  withoutDot?: boolean
}): ReactNode {
  return <YapprMark lockup="pill" tone="dark" size={size} dot={!withoutDot} />
}
