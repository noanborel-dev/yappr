# Yappr Landing — Design System (MASTER)

> Global Source of Truth. Page-specific overrides live in `pages/[page].md` and beat this file when present.
> Auto-generated picks were overridden manually — the auto picker chose "Vibrant & Block-based" which is wrong for our editorial brand.

---

## Brand North Star

Yappr is **editorial-meets-utility**. The site reads like a literary magazine that happens to be selling a developer tool. Big italic display serif, generous whitespace, cream paper, occasional motion that *captures* product behavior rather than decorating around it. **Show, don't explain.**

Visual register (held across all sections):
- Big italic serif headline (1–2 lines max)
- One short subline (1 sentence)
- One animated proof element
- Stop. Move on.

If a section needs 3+ paragraphs of body copy, it's wrong — rebuild as motion.

---

## Pattern

**Hero-Centric + Interactive Product Demo** with **Exaggerated Minimalism** typography over an **Editorial Grid / Magazine** layout. The Yappr recording pill uses **Liquid Glass** (and ONLY the pill — nowhere else).

Section order (2026-07-29 — builder repositioning):
1. Nav — four items only: Try it · Features · Pricing · FAQ
2. Hero — terminal running Claude Code, ramble in → structured prompt lands
3. **01 Prompt shaping** — before/after
4. **02 Select and rewrite** — Cursor editor, selection → spoken fix
5. **03 Persistent context** — the overview paragraph gaining learned clauses
6. **04 Per-app polish** — proof, not pitch
7. **Try it live** — press-and-hold Control, terminal is the default target
8. Pricing — two cards: Free (unlimited) and Pro $9
9. FAQ
10. Final CTA + footer

**Section header pattern (`SectionHead.tsx`):** numbered mono eyebrow +
serif headline on the left, the single line of body copy hung on the right
and baseline-aligned. Don't stack the lede under the headline — it strands
the right third of the measure.

**Deleted sections:** Three behaviors, Dictionary, Local mode, AI coding,
Privacy. The hotkey gestures survive as an animated row under the live demo;
dictionary + gestures are Free-tier lines in pricing; privacy copy lives in
the FAQ, verbatim and not to be reworded.

---

## Color tokens

```css
/* Foundations */
--cream:        #f6f2e7;  /* page bg, headers */
--cream-2:      #efe9d8;  /* secondary bg, dividers */
--paper:        #fbf9f1;  /* card bg */
--ink:          #15161a;  /* primary text, dark CTAs */
--ink-2:        #2a2c33;  /* body text */
--muted:        #6b6b6b;  /* meta, captions */
--line:         #d9d2bd;  /* hairline borders */
--line-soft:    #e9e2cb;  /* even softer borders */

/* Accents — used contextually, never decoratively */
--accent:       #c8553d;  /* eyebrows, hover, primary CTAs in features */
--accent-soft:  #fff7f3;  /* tinted card bg when section is "on" */
--red:          #e15454;  /* pill recording dot (alt) */
--cobalt:       #5A8FE8;  /* pill bars, done state, polish accent */
--cobalt-soft:  rgba(90,143,232,.18);

/* Yappr pill (Liquid Glass — DO NOT use elsewhere) */
--pill-bg-1:    rgba(18,20,26,0.82);
--pill-bg-2:    rgba(14,16,22,0.74);
--pill-dot:     #E84A3A;
--pill-glow:    rgba(232,74,58,0.8);
--pill-blur:    34px;

/* The plate — the brand mark's fill. Mirrored in the app's YapprMark.tsx
   and in app/icon.svg; change all three together. */
--sky:          #5A8FE8;  /* lighter blue, at the edges. SAME as --cobalt */
--azure:        #2E5697;  /* middle step — without it the ramp is a hard edge */
--deep:         #16305C;  /* darker blue, last stop before black */

/* Live notch only — never the logo plate. */
--charcoal:     #2B3950;  /* the wing tips */
--abyss:        #172130;  /* the wing's mid stop. NOT black — black is the housing */
```

Light mode only. No dark mode — the cream IS the brand.

---

## Typography

| Role | Font | Why |
|---|---|---|
| **Display** | Instrument Serif (with italic) | Big italic serif is the editorial signature |
| **Body / UI** | Inter | Clean utility, neutral, contrasts with serif |
| **Mono** | JetBrains Mono | Eyebrows, key captions, code, timestamps |
| **Pill label** | Instrument Serif italic (15px) | Pulled from actual Yappr app source |

Tailwind config:
```js
fontFamily: {
  serif: ['Instrument Serif', 'Cormorant Garamond', 'Georgia', 'serif'],
  sans:  ['Inter', 'system-ui', 'sans-serif'],
  mono:  ['JetBrains Mono', 'ui-monospace', 'monospace'],
}
```

Scale (h1 hero / section / sub / body / eyebrow):
- Hero h1: `font-size: clamp(64px, 8vw, 120px); line-height: 0.92; letter-spacing: -.02em;`
- Section h1: `72–80px; line-height: 0.95; letter-spacing: -.02em;`
- Italic em inside headlines is **always** the differentiator word
- Body: `17–18px; line-height: 1.5;`
- Eyebrow: `JetBrains Mono 11px; letter-spacing: .14em; uppercase; color: --accent`

Headlines drop the period unless the sentence is the punchline. Italic is reserved for the **noun being emphasized**, never used decoratively.

---

## Components

### 1. Two different objects — do not merge them

**The brand mark** (`PillLogo.tsx`) is the **notch silhouette** — square across
the top, rounded only at the bottom — carrying the **plate**, a red dot and the
wordmark in italic serif. Nav (centred, hanging from the top edge), footer,
final CTA.

It is no longer a pill and no longer flat charcoal. The filename survives to
avoid churn across three call sites; the shape and fill do not.

**The plate** is lighter blue at the edges, darker blue inboard, **black through
the middle** — which is to say BRAND_WING's structure drawn at logo scale. The
mark is a portrait of the indicator, so it is built the way the indicator is.
Defined as `--plate` / `--plate-radial` in `app/globals.css` and mirrored in two
places that cannot import it: `BRAND_PLATE` / `BRAND_PLATE_RADIAL` in the app's
`src/renderer/shared/ui/YapprMark.tsx`, and `app/icon.svg`. **Change all three
together.**

Three things about it are load-bearing:

- **`--sky` is the same value as `--cobalt`.** The logo's lighter blue and the
  product's accent are one colour, not two blues that nearly match — two would
  drift, because nobody can tell them apart well enough to keep them in sync.
- **Black is held flat from 34% to 66%**, not passed through at a midpoint. A
  gradient that merely crosses black never reads as black, and the wordmark
  ends up on a slightly-blue ground that shifts with the plate's size. 34/66 is
  BRAND_WING's own geometry: same object, same proportions. A narrower band was
  tried and failed at nav size — ~14px of black under a ~45px word.
- **Symmetric, not directional.** Light at one edge falling to black at the
  other was the obvious first thought, but it stops being the same object when
  mirrored or set against a right-hand margin.

> ⚠️ This previously documented a soft four-layer *atmosphere* — pools of cool
> light drifting over charcoal, built from a reference photograph. **It was
> removed for looking like the reference.** The soft-blob treatment is that
> brand's signature, and wearing it made Yappr look like a follower. If you
> find `--atmosphere` or `BRAND_ATMOSPHERE` anywhere, it is a leftover.

**Where the notch cannot go:** favicons, avatars, and any social profile slot.
Those are free-floating squares masked to a circle, and a notch detached from a
top edge is just a rounded rectangle — i.e. the pill this system replaced. Use
the circle (`app/icon.svg`) there. Below ~32px the wordmark stops being legible
at all.

**The recording indicator** is NOT that pill. It is the **notch indicator**
(`NotchIndicator.tsx`, ported from `src/renderer/indicator/`). The app source
explains the relationship: *the notch itself is the charcoal pill the brand
mark normally draws, so the mark sheds its container and keeps only the italic
serif.*

> ⚠️ This section previously documented a floating liquid-glass lozenge —
> rounded on all sides, gradient fill, 6 bars. **That design no longer exists
> in the app.** The whole site was showing it. If you find any of it left,
> it's a bug.

### 2. The notch indicator

Pulled from `src/renderer/indicator/NotchIndicator.tsx` + `notch-states.ts`.
**Re-pull rather than approximate** if the app changes.

```css
/* HORIZONTAL only. True black under the centre band, lifting to charcoal
   at the wings. Mirrors BRAND_WING in the app's YapprMark.tsx. */
background: linear-gradient(90deg,
  #2B3950 0%, #172130 14%, #000 32%, #000 68%, #172130 86%, #2B3950 100%);
border-radius: 0 0 11px 11px;   /* square on top — it HANGS from the menu bar */
box-shadow:
  0 10px 28px rgba(0,0,0,.5),
  inset 0 -1px 0 rgba(255,255,255,.08),
  inset 0 0 0 1px rgba(255,255,255,.05);
```

The previous spec here said *flat, NOT a gradient*. That was right about
**vertical** gradients — top-down shading reads as a panel sitting on the
screen — and it is still right about them. Across the shape is the opposite
case: the centre overlaps the physical camera housing, so anything but `#000`
there is a visible seam, and the illusion the whole indicator rests on is that
the middle **is** the hardware. Lifting only at the wings, which never pretended
to be hardware, is what lets the middle disappear. The ramp finishes by 32% so
the colour is already black *before* the housing starts, not at its edge.

The wings use `CHARCOAL → ABYSS → black` and never touch `SLATE`. The logo
plate can afford `SLATE` because it is an object on a page; this sits in the
menu bar over whatever the user is doing, and a lift that bright at the ends
turns a piece of hardware into a floating widget.

**The organizing rule, from the design handoff — this is load-bearing:**
the shape is asymmetric with fixed meaning.

| | |
|---|---|
| **LEFT wing** | always *input* — what Yappr is hearing |
| **CENTRE** | the physical notch. Never moves, paints nothing |
| **RIGHT wing** | always *outcome* — what Yappr did with it |

- `ACCENT #5A8FE8` · `DANGER #E84A3A`
- Waveform: **9 bars** (`BAR_COUNT`), 2px wide, 2.5px gap, **13px** max
  (`WAVE_HEIGHT`), edge-masked, cobalt with a drop-shadow
- Record dot: 6px `#E84A3A`, `0 0 8px` glow, 2s pulse
- Label + wordmark: Instrument Serif italic **13.5px** (`LABEL_SIZE`)
- Labels verbatim: `listening` · `polishing…` · `pasted` · `copied — ⌘V` ·
  `didn't catch that`. Note it is **not** "copied — ⌘V to paste".

**Placement is part of the spec.** It hangs from the top edge of a screen. It
may never float in the middle of a window — a mockup that needs one gets a
menu-bar strip (`.hero-menubar` / `.sr-menubar` / `.ws-menubar`) for it to
hang from, or it doesn't get an indicator at all.

### 2. Buttons

| Variant | Use |
|---|---|
| `.btn-dark` | Primary — black pill, cream text, optional kbd hint |
| `.btn-cream` | Secondary — white bg, ink border |
| `.btn-line` | Tertiary on dark sections — transparent, hairline border |

All buttons:
- `border-radius: 999px;`
- `padding: 14px 22px;`
- `font-weight: 600; font-size: 14.5px;`
- `transition: transform .12s ease, background .12s ease;`
- `hover: translateY(-1px)`
- 44px minimum hit target

### 3. Cards

Default card:
```css
background: #fff;
border: 1px solid var(--line);
border-radius: 14–18px;
box-shadow: 0 30px 60px -30px rgba(20,30,50,.18);
```

When "active" or playing: tint background `--accent-soft`, eyebrow goes `--accent`, optional progress bar on bottom edge.

### 4. Eyebrow tag

```html
<div class="eyebrow">Section 4 · One key, three behaviors</div>
```
```css
font-family: var(--mono); font-size: 11px;
letter-spacing: .14em; text-transform: uppercase;
color: var(--accent); margin-bottom: 14px;
```

---

## Motion rules

| Rule | Value |
|---|---|
| Default micro-interaction | `200–300ms ease-out` (entering), `ease-in` (exiting) |
| Page-load animations | One per viewport at a time, max |
| Stagger | 60–120ms between siblings |
| Cycling demos | 4–7s per state, auto-advance, **no hover-pause** |
| Tab/picker interactions | Disable manual click on hero (auto-cycle only). Allow on Section 3/5. |
| `prefers-reduced-motion` | Honor it — kill all auto-cycles, fade in once, hold |
| Transforms | Use `transform` and `opacity` only. Never animate `width`, `height`, `top`, `left`. |
| Easing | `cubic-bezier(.4, 0, .2, 1)` for material-style. `ease-out` for everything else. |
| Linear | NEVER for UI motion. Linear is for `progress` bars only. |

Hero loops Slack → iMessage → Gmail. Other sections (three-behaviors, polish, privacy) auto-advance to demonstrate concept.

---

## Per-app polish defaults (Section 5 — research-backed)

| App | Style | Polish rule (Claude system prompt) |
|---|---|---|
| **iMessage** | Casual SMS | `lowercase · no final period · fragments OK · no greeting/signoff · 1–2 short bubbles · emoji OK` |
| **WhatsApp** | Casual, slight punct | `lowercase or sentence case · light punct · one message · emoji OK · no signoff` |
| **Slack** | Workplace casual | `sentence case · light punct · 1–3 sentences · optional opener · no signoff · soften with !` |
| **Gmail** | Professional email | `full caps/punct · "Hi [name]," · paragraphs · signoff · no emoji · lead with the ask` |

Sources: Gretchen McCulloch *Because Internet*, Penn State period-as-passive-aggressive study (Gunraj 2016), Boomerang's 350k-email analysis, Verheijen/Sánchez-Moya WhatsApp corpus studies. Documented in the research panel of Section 3.

---

## Logos / assets

All logos live in `/assets/logos/`. Filenames are normalized — no spaces, lowercase:

```
# App targets (hero + Section 5 + dictionary)
slack.png         imessage.png        gmail.webp
claudecode.png    cursor.png          chatgpt.png
claude.png        notion.png

# Wordmarks (footer / fallback)
slack-wordmark.png  notion-wordmark.png  claude-wordmark.png  gmail-wordmark.webp
```

Inside `<img>` tags, set `width:` explicitly. Never load logos from CDN — they're licensed for editorial use only and must ship with the repo.

Still missing (parked): `terminal.png` (using `›_` placeholder is fine — it's the actual macOS Terminal idiom), plus `groq.png` / `openai.png` / `anthropic.png` for the provider section if needed later.

---

## Accessibility floor

- Contrast: 4.5:1 minimum for body text. The cream/ink combo is 14.8:1. ✓
- Keyboard nav: tab order matches visual order. Focus rings visible — `outline: 2px solid var(--ink); outline-offset: 3px;`
- Touch targets: 44×44px minimum. All buttons and pickers are 40+ already.
- `aria-label` on every icon-only button (pickers, mic, send, etc.)
- `alt` text on every logo image
- Honor `prefers-reduced-motion: reduce` — kill auto-loops, show end states only
- Anchor links: `html { scroll-behavior: smooth }`

---

## Anti-patterns (don't do)

| Anti-pattern | Why we don't |
|---|---|
| ❌ Emojis as UI icons | Use SVGs (Lucide / Heroicons / brand SVGs) — emojis render inconsistently across OS |
| ❌ Text-heavy sections | If it's more than one short sentence of body, rebuild as motion |
| ❌ Drop shadows on everything | Only the pill + active cards get shadow. Cream-on-cream sections use hairline borders. |
| ❌ Dark mode | We're a one-mode brand. Cream is the brand. |
| ❌ Hover-to-pause loops | Caused desync bugs in v1. Loops are observe-only on the hero. |
| ❌ Big serif everywhere | Serif is reserved for headlines + the pill label. Body is Inter. |
| ❌ Multiple animations on one screen | One animated proof per viewport. The rest is still. |
| ❌ "Built with React" / "Powered by" badges | We're a product, not a tech stack |
| ❌ "Open source" / "MIT" / "view source" / "fork" / "star on GitHub" | **Yappr is closed-source.** Differentiation = creative + BYOK, not OSS |

---

## Known dev-environment issues

**Turbopack hot-reload occasionally drops new CSS rules.** When adding new custom classes to `app/globals.css`, the dev server sometimes serves a stale CSS bundle that excludes them — layout breaks silently. Fix: kill dev server (`pkill -f "next dev"`), delete `.next/`, restart. This does NOT affect production builds (`npm run build`).

---

## Pre-delivery checklist

- [ ] No emojis as icons (SVGs only)
- [ ] `cursor: pointer` on all clickable elements
- [ ] Hover states 150–300ms ease
- [ ] Text contrast 4.5:1 minimum
- [ ] Focus rings visible (`outline: 2px solid #15161a; outline-offset: 3px`)
- [ ] `prefers-reduced-motion` honored — auto-cycles disabled, end states shown
- [ ] Responsive at 375 / 768 / 1024 / 1440
- [ ] No horizontal scroll
- [ ] Pill spec exactly matches `/Users/noanborel/Yappr` source (liquid glass, 6 bars, italic label, no timer)
- [ ] Each section ≤ 1 sentence of body copy
- [ ] All app references use real SVGs/PNGs from `/assets/logos/`
