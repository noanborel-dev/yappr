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

Section order:
1. Nav
2. Hero (cycles Slack → iMessage → Gmail)
3. **Try it live** — real mic, our key, rate-limited
4. One key, three behaviors (Tap / Hold / Double-tap)
5. Polish per context
6. Dictionary
7. Privacy / BYOK
8. Pricing — Free, one card
9. FAQ — 5 items
10. Final CTA + footer

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

### 1. The Yappr Pill (the brand mark, basically)

Spec pulled directly from the real product source (`/Users/noanborel/Yappr` app):

```css
background: linear-gradient(180deg, rgba(18,20,26,0.82), rgba(14,16,22,0.74));
backdrop-filter: blur(34px) saturate(180%);
border: 1px solid rgba(255,255,255,0.12);
box-shadow:
  inset 0 1.2px 0 rgba(255,255,255,0.42),
  inset 0 -1px 0 rgba(0,0,0,0.45),
  0 8px 16px rgba(0,0,0,0.35);
padding: 8px 16px;
border-radius: 999px;
animation: pill-breathe 3.6s ease-in-out infinite; /* scale 1 → 1.012 */
```

Pill states (cycle):
- **`listening`** — red dot (#E84A3A) + 6 cobalt bars (#5A8FE8) + italic serif label
- **`polishing…`** — 12px spinner (cobalt top-border) + italic serif label
- **`copied — ⌘V to paste`** — 13px cobalt check SVG + italic serif label

No timer in the pill. Bars are 6, not 4, 2px wide with 1px radius, max-height 15px.

**Bars pacing (matches the real macOS app):** randomize heights on a **220ms** tick. CSS transition is **200ms ease-out**. This produces a gentle, breathing visualization, not a frantic spectrum analyzer. Don't speed it up.

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
