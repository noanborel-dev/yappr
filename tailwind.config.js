// Palette is the landing page's, verbatim — see
// YapprLanding/design-system/yappr-landing/MASTER.md § Color tokens.
// The app used to run a cool near-white surface with a "volt" blue that
// exists nowhere in the brand; cream IS the brand, so the two now share
// one set of tokens.
const COLORS = {
  paper: '#F6F2E7',   // page surface (--cream). Also the inset/field fill.
  cream2: '#EFE9D8',  // sidebar + recessed rows (--cream-2)
  card: '#FBF9F1',    // card fill (--paper). Lighter than the page, not white.
  ink: '#15161A',
  'ink-60': 'rgba(21,22,26,0.6)',
  'ink-45': 'rgba(21,22,26,0.45)',
  'ink-08': 'rgba(21,22,26,0.08)',
  line: '#D9D2BD',       // hairline borders
  'line-soft': '#E9E2CB',
  accent: '#C8553D',     // eyebrows, active section marks
  'accent-soft': '#FFF7F3',
  cobalt: '#5A8FE8',     // the indicator's accent — waveform, done, focus
  'cobalt-soft': 'rgba(90,143,232,0.18)',
  danger: '#E84A3A',
  ok: '#3D7E3D',
  // Retired. Kept as aliases so surfaces not yet reskinned (onboarding,
  // paste-fallback) stay on-palette instead of rendering the old blue.
  volt: '#5A8FE8',
  'volt-muted': 'rgba(90,143,232,0.25)',
  'volt-glow': 'rgba(90,143,232,0.6)',
}
const RADIUS = { input: '10px', card: '14px', hero: '18px', pill: '999px' }
const FONT = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  // Instrument Serif is the landing's display face and the one the notch
  // label already uses. It's loaded in each renderer's index.html; the
  // stack previously led with Cormorant, which nothing loads — so every
  // headline in Settings was silently rendering as Georgia.
  display: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
  mono: '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace',
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        paper: COLORS.paper,
        cream2: COLORS.cream2,
        ink: COLORS.ink,
        'ink-60': COLORS['ink-60'],
        'ink-45': COLORS['ink-45'],
        'ink-08': COLORS['ink-08'],
        card: COLORS.card,
        line: COLORS.line,
        'line-soft': COLORS['line-soft'],
        accent: COLORS.accent,
        'accent-soft': COLORS['accent-soft'],
        cobalt: COLORS.cobalt,
        'cobalt-soft': COLORS['cobalt-soft'],
        volt: COLORS.volt,
        'volt-muted': COLORS['volt-muted'],
        'volt-glow': COLORS['volt-glow'],
        danger: COLORS.danger,
        ok: COLORS.ok,
      },
      borderRadius: {
        input: RADIUS.input,
        card: RADIUS.card,
        hero: RADIUS.hero,
        pill: RADIUS.pill,
      },
      fontFamily: {
        sans: [FONT.sans],
        display: [FONT.display],
        mono: [FONT.mono],
      },
      keyframes: {
        stepIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        heroPop: {
          '0%':   { opacity: '0', transform: 'translateY(14px) rotate(-1deg)' },
          '60%':  { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateY(0) rotate(0)' },
        },
        checkPop: {
          '0%':   { opacity: '0', transform: 'scale(0.5)' },
          '60%':  { opacity: '1', transform: 'scale(1.15)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        voltPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(43,127,255,0.0)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(43,127,255,0.18)' },
        },
        bgDrift: {
          '0%':   { transform: 'translate(-10%, -10%) scale(1)' },
          '50%':  { transform: 'translate(10%, 6%) scale(1.15)' },
          '100%': { transform: 'translate(-10%, -10%) scale(1)' },
        },
        // Same as stepIn but longer slide distance — for staggered
        // entries inside a step where each piece comes from further
        // below than the page-level fade.
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Spring-scale: overshoots slightly and settles. Used for
        // selection state changes — clicking a provider card, a
        // strictness level, etc. Replaces "flat instant" with kinetic.
        springScale: {
          '0%':   { transform: 'scale(0.94)' },
          '55%':  { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
        // Subtle horizontal highlight sweep — gives a "polished glass"
        // feel on the active provider card. Loops infinitely but
        // mostly transparent so it's a hint of life, not distracting.
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Confetti dot — used on the Done step. Each particle spawns
        // at center, fades out as it travels outward (parent provides
        // the angle via --tx/--ty CSS vars).
        confettiPop: {
          '0%':   { opacity: '1', transform: 'translate(0,0) scale(0.4)' },
          '40%':  { opacity: '1', transform: 'translate(calc(var(--tx) * 0.6), calc(var(--ty) * 0.6)) scale(1)' },
          '100%': { opacity: '0', transform: 'translate(var(--tx), var(--ty)) scale(0.6)' },
        },
      },
      animation: {
        stepIn:    'stepIn 380ms cubic-bezier(0.22,1,0.36,1) both',
        heroPop:   'heroPop 700ms cubic-bezier(0.22,1,0.36,1) both',
        checkPop:  'checkPop 380ms cubic-bezier(0.34,1.56,0.64,1) both',
        voltPulse: 'voltPulse 1.6s ease-in-out infinite',
        bgDrift:   'bgDrift 22s ease-in-out infinite',
        slideUp:    'slideUp 520ms cubic-bezier(0.22,1,0.36,1) both',
        springScale:'springScale 360ms cubic-bezier(0.34,1.56,0.64,1) both',
        shimmer:    'shimmer 3.6s linear infinite',
        confettiPop:'confettiPop 1100ms cubic-bezier(0.22,1,0.36,1) forwards',
      },
    },
  },
  plugins: [],
}
