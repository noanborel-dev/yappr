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

// ─── The plate ──────────────────────────────────────────────────────
//
// Lighter blue at the edges, darker blue inboard, BLACK through the
// middle. Which is to say: the same structure as BRAND_WING below, drawn
// at logo scale. The mark is a portrait of the indicator, so it should
// be built the same way the indicator is.
//
// This replaces a soft four-layer mesh — pools of cool light drifting
// over charcoal — built from a reference photograph. It was killed for
// looking like the reference: the soft-blob treatment IS that brand's
// signature, and wearing it made Yappr look like a follower. Borrow a
// structure, not a surface.
//
// The practical gain is that the black centre gives the wordmark a
// ground of its own. On the old mesh the type sat on whatever the light
// happened to be doing behind it and its contrast changed with the size
// of the plate.

/**
 * The lighter blue, at the outer edges.
 *
 * This is ACCENT from notch-states.ts, deliberately — the same blue the
 * waveform bars, the spinner and the done-check already use. Picking a
 * second, nearly-identical blue for the logo is how a palette starts
 * drifting: nobody can tell them apart, so nobody keeps them in sync.
 */
export const BRAND_SKY = '#5A8FE8'
/**
 * The middle and deep blues.
 *
 * The plate no longer steps through these as opaque stops — that is what
 * produced the hard line, and FALLOFF below replaced it. They remain the
 * reference values the falloff's rgba stops are sampled from, and they
 * are what to reach for anywhere the blue is needed flat: a chart
 * series, a filled state, a print asset that cannot carry alpha.
 */
export const BRAND_AZURE = '#2E5697'
export const BRAND_DEEP = '#16305C'

/**
 * The sheen, on the WINGS ONLY.
 *
 * This was one full-width `linear-gradient(180deg, …)` across the whole
 * plate, and it deformed the black centre. The black is a vertical band;
 * lightening its top left the darkest region as a lens in the lower
 * middle, so the housing read as an oval rather than a band — "more
 * circular than square". Worse at small sizes, where the sheen's 46%
 * covers most of a 38px-tall mark.
 *
 * Two corner pools instead, one per wing, so the black band keeps its
 * full height and square top. That also happens to be the truer reading:
 * the black stands for the camera housing, and a housing does not catch
 * a highlight.
 *
 * The circle keeps a full top sheen (TOP_SHEEN) — it has no band to
 * deform, and light falling from above is what makes a disc read as a
 * disc rather than a flat counter.
 */
const WING_SHEEN = [
  'radial-gradient(58% 96% at 6% 0%, rgba(255,255,255,0.18), rgba(255,255,255,0) 72%)',
  'radial-gradient(58% 96% at 94% 0%, rgba(255,255,255,0.18), rgba(255,255,255,0) 72%)',
].join(', ')

const TOP_SHEEN = 'linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0) 46%)'

// ─── How the blue meets the black ───────────────────────────────────
//
// By FADING OUT, over a black base — not by ramping through
// progressively darker blues to #000.
//
// The first version did the latter: SKY → AZURE → DEEP → #000, with the
// last leg covering 11% of the width. It read as a hard line. Two things
// were wrong with it. Chroma falls off much faster than lightness, so a
// saturated dark blue lands right next to black while still looking
// blue, and the last step is a visible boundary rather than an arrival.
// And CSS interpolates in sRGB, which bunches that change into the dark
// end where the eye is most sensitive to it.
//
// Fading the blue's ALPHA over black instead makes the change a dissolve:
// every stop is the same hue getting quieter, so there is no point where
// one colour hands over to another. It is also what "less and less
// opacity as it gets closer" literally describes.
//
// The stops are mirrored around 50% because the plate is symmetric.
const FALLOFF = [
  'rgba(90,143,232,0.88) 0%',
  'rgba(88,138,226,0.82) 6%',
  'rgba(80,126,208,0.70) 13%',
  'rgba(68,110,182,0.54) 21%',
  'rgba(54,90,150,0.37) 29%',
  'rgba(40,70,118,0.21) 36%',
  'rgba(28,54,96,0.10) 42%',
  'rgba(22,46,86,0.03) 47%',
  'rgba(22,46,86,0) 50%',
  'rgba(22,46,86,0.03) 53%',
  'rgba(28,54,96,0.10) 58%',
  'rgba(40,70,118,0.21) 64%',
  'rgba(54,90,150,0.37) 71%',
  'rgba(68,110,182,0.54) 79%',
  'rgba(80,126,208,0.70) 87%',
  'rgba(88,138,226,0.82) 94%',
  'rgba(90,143,232,0.88) 100%',
].join(', ')

/**
 * The mark's dark end. Graphite ink, NOT black.
 *
 * The plate used to run #5A8FE8 at full strength to pure #000 — the
 * whole visible range of the palette inside one 86px mark, which read as
 * harsh beside everything around it. Both ends moved toward each other:
 * this lifts the floor, and FALLOFF above peaks at .88 rather than 1.
 *
 * BRAND_SKY is untouched by that, so the mark and the product's accent
 * are still one colour — the plate simply never renders it at full
 * alpha. Reducing contrast by editing the token would have desynced the
 * logo from the waveform bars that use the same value.
 *
 * BRAND_WING deliberately does NOT use this. See below.
 */
export const BRAND_PLATE_FLOOR = '#151B26'
/**
 * The wing tips. Graphite, following the mark and the panels off navy.
 * Was #2B3950, which was blue enough to look like a lit surface hanging
 * beside the housing rather than an extension of it.
 */
export const BRAND_CHARCOAL = '#2E3745'
/** Deepest wing stop. Not black — black is reserved for the housing. */
export const BRAND_ABYSS = '#1A1F28'

/**
 * The plate, for logo containers. The live notch uses BRAND_WING instead.
 *
 * Symmetric on purpose: black sits at the centre and the blue comes up
 * on BOTH sides. An asymmetric version was the obvious first thought —
 * light at one edge falling to black at the other — but it makes the
 * mark directional, so it stops being the same object when mirrored or
 * placed against a right-hand margin.
 *
 * Black is the BASE layer, with the blue fading out over it — see
 * FALLOFF. The centre still resolves to true black (alpha reaches 0 at
 * 50% and is under .05 either side of it), so the wordmark keeps a black
 * ground; it just arrives there gradually instead of at a line.
 */
export const BRAND_PLATE = `${WING_SHEEN}, linear-gradient(90deg, ${FALLOFF}), ${BRAND_PLATE_FLOOR}`

/**
 * The plate for containers with no long axis — circles and squircles.
 *
 * A left-to-right ramp inside a circle reads as a sphere lit from the
 * side. Radial keeps the same three steps (black centre, darker blue,
 * lighter blue at the rim) while staying rotationally symmetric, which
 * is what a favicon needs: it gets masked, rotated and shrunk by
 * platforms that never ask first.
 */
export const BRAND_PLATE_RADIAL = `${TOP_SHEEN}, radial-gradient(circle at 50% 50%, ${[
  // Same dissolve as FALLOFF, but the stops come in EARLIER. Area on a
  // disc grows with the square of the radius, so the outer ring holds
  // far more pixels than the middle: reusing the linear curve crushed
  // the blue into a thin rim and the icon read as a black dot at favicon
  // size. Redistributed for a circle, not re-coloured.
  'rgba(22,46,86,0) 0%',
  'rgba(22,46,86,0) 12%',
  'rgba(28,54,96,0.14) 24%',
  'rgba(40,70,118,0.29) 38%',
  'rgba(54,90,150,0.46) 52%',
  'rgba(68,110,182,0.62) 66%',
  'rgba(80,126,208,0.76) 82%',
  'rgba(90,143,232,0.88) 100%',
].join(', ')}), ${BRAND_PLATE_FLOOR}`

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
 * The centre is the one value in this file that did NOT ease off black
 * when everything else did. The logo plate lifted to BRAND_PLATE_FLOOR to
 * cut its contrast, and that was right for a mark on a page — but this
 * shape overlaps the physical camera housing, and #000 is what makes the
 * middle disappear into it. Lifting it would trade a working illusion
 * for a consistency nobody can see. The wings followed the palette; the
 * centre cannot.
 *
 * Note this uses CHARCOAL → ABYSS → black, and never touches SLATE. The
 * logo plate can afford SLATE because it is an object on a page; this
 * thing sits in the menu bar over whatever the user is doing, and a lift
 * that bright at the ends turns a piece of hardware into a floating
 * widget. The brand colour is present, at the quietest end of its range.
 */
export const BRAND_WING = `linear-gradient(90deg, ${BRAND_CHARCOAL} 0%, ${BRAND_ABYSS} 14%, #000 32%, #000 68%, ${BRAND_ABYSS} 86%, ${BRAND_CHARCOAL} 100%)`

export type MarkLockup = 'pill' | 'bare' | 'icon' | 'stacked' | 'notch' | 'circle'
export type MarkTone = 'dark' | 'light' | 'ink' | 'white' | 'plate'
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
  // The blue plate. The primary mark on the site and the app icon.
  //
  // Text is full #FFFFFF, not BRAND_ON_DARK. The .92 exists to stop the
  // serif blooming on flat near-black — but here the word sits on the
  // TRUE black centre with lit blue either side of it, and against that
  // much surrounding brightness .92 reads as dirty grey rather than as
  // restraint.
  plate: {
    surface: BRAND_PLATE,
    text: '#FFFFFF',
    dot: BRAND_DOT,
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(12,20,38,0.40)',
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
          // Radial, not the horizontal plate: a left-to-right ramp inside
          // a circle reads as a sphere lit from one side.
          background: tone === 'plate' ? BRAND_PLATE_RADIAL : (t.surface ?? BRAND_BLACK),
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
