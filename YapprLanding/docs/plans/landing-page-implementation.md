# Yappr Landing — Implementation Plan

> Status: ready to execute.
> Scope: turn the approved brainstorm prototypes into a shipped Next.js site on Vercel with a working live-demo endpoint.
> Spec: `docs/specs/landing-page-design-spec.md`. Brand: `design-system/yappr-landing/MASTER.md`. Operations: `CLAUDE.md`.

## What we're building

A Next.js 14 (App Router) site at `yappr.app` (TBD domain) with:
- 10 sections, all pixel-locked to the approved prototypes in `.superpowers/brainstorm/39530-1778596052/content/`
- One Vercel Edge function powering the in-page dictation demo (Groq Whisper → Claude Haiku polish)
- Upstash Redis for per-IP rate limiting
- Zero JS frameworks beyond React + a handful of vanilla CSS animations
- Bundle < 200KB JS

## What we're explicitly NOT building (yet)

- Live mic in the demo — **building it** (the spec calls for it; A1+B1+C1+D1+E1 picked)
- Pre-recorded "Hear ours" fallback — parked
- Windows / Linux download CTAs — only macOS button works in v1
- Analytics — parked
- CMS — copy lives in JSX
- Auth / signup — Free, no account in v1
- Pricing tiers other than Free — none exist yet

## Strategy

**Port, don't rebuild.** The brainstorm prototypes already solved every design question through 5+ rounds of iteration. The job here is faithful translation to React components — same motion, same copy, same colors, same per-pixel spacing. Anything the prototypes don't address (responsive behavior on real mobile, focus rings, reduced-motion fallbacks) gets resolved fresh.

Order of work is risk-first: prove the backend works before building the prettier pieces. If the demo endpoint doesn't pan out, we change Section 3 fundamentally.

## Phases

### Phase 0 — Project scaffold (half a day)

**Goal:** clean Next.js app deploying to a Vercel preview, with fonts, Tailwind, and the design tokens wired up.

1. `pnpm create next-app@latest . --typescript --tailwind --app --import-alias "@/*" --no-eslint`. Choose: no src/ dir.
2. Install deps: `@upstash/redis`, `@upstash/ratelimit`, `groq-sdk`, `@anthropic-ai/sdk`.
3. `tailwind.config.ts` — register `serif: 'Instrument Serif'`, `sans: 'Inter'`, `mono: 'JetBrains Mono'`; theme colors from MASTER.md.
4. `app/globals.css` — import Google Fonts (Instrument Serif + Inter + JetBrains Mono, weights as defined), declare CSS variables for all brand tokens.
5. `app/layout.tsx` — apply fonts to `<body>`, set `lang="en"`, add the metadata block (title, description, OG image, Twitter card).
6. Copy `assets/logos/` (already exists) into `public/logos/`.
7. Verify locally with `pnpm dev`. Push to GitHub. Connect Vercel. Confirm preview URL renders.

**Verify:** preview deploys, Instrument Serif loads, body bg is `#f6f2e7`. Lighthouse Perf > 95 on the bare scaffold.

### Phase 1 — The pill component (half a day)

**Goal:** ship the Yappr pill as a reusable component matching the actual macOS app spec verbatim. Everything else in the site references it.

1. Create `components/Pill.tsx`. Props: `state: 'listening' | 'polishing' | 'done'`, optional `label?: string` override.
2. Implement liquid-glass styling from MASTER.md: gradient bg, 34px backdrop-blur, inset highlights, breathing scale animation.
3. Three sub-states:
   - `listening`: red dot (#E84A3A) with pulse animation + 6 cobalt bars (#5A8FE8) with random height animation + italic-serif "listening" label
   - `polishing`: 12px cobalt-top spinner + "polishing…"
   - `done`: 13px cobalt check SVG + "copied — ⌘V to paste" (or custom label)
4. Size variants: `xs` (logo size, 13px), `default` (15px label), `large` (used in hero, slightly bigger).
5. Create `components/PillLogo.tsx` — the static "Yappr" branded pill used in nav and footer (different from the recording pill).
6. Honor `prefers-reduced-motion` — kill bars animation, kill breathing.
7. Document in Storybook? No — single-file component, just render all states on a `/_dev/pill` page for visual QA.

**Verify:** open `/_dev/pill`. All three states render exactly as in the prototypes. Side-by-side with screenshot of real macOS app at this point — they should be indistinguishable.

### Phase 2 — Static sections first (1.5 days)

**Goal:** ship every section that doesn't need motion, get the page reading right on its own.

Build in this order (least to most motion):
1. `<Nav />` (Section 1)
2. `<Pricing />` (Section 8) — easiest, no motion
3. `<FAQ />` (Section 9) — native `<details>`, no JS
4. `<FinalCTA />` (Section 10) — static
5. `<Dictionary />` (Section 6) — chip hover only
6. `<Privacy />` (Section 7) — packet animation, but otherwise static layout

For each component:
- Copy the HTML structure from the corresponding prototype HTML
- Convert to JSX with React/Tailwind
- Move inline styles to Tailwind classes + a small `.module.css` if a section has unique animation keyframes
- Use real logo `<img>` from `/public/logos/`
- Implement `prefers-reduced-motion` fallback for any animated bits
- Mobile responsive: stack at < 768px

Compose them in `app/page.tsx`. Page should now render top-to-bottom without any motion sections wired up.

**Verify:** Lighthouse Perf still > 90 with all images. Mobile (375px) renders without horizontal scroll. Keyboard tab order is correct. All buttons have visible focus rings.

### Phase 3 — Motion sections (2 days)

**Goal:** wire up the four animated sections (Hero, Three-behaviors, Section 5 AI coding, Section 3 demo UI shell).

Build in this order:

#### 3a. Three-behaviors (Section 4)
Easiest motion — it's just CSS animations + a setInterval to cycle. Port `three-behaviors-v2.html` JS to a `<ThreeBehaviors />` component. Use `useEffect` + `setInterval`. Cleanup on unmount.

#### 3b. Hero (Section 2)
Most complex section. Port `hero-v5.html`:
- `<Hero />` renders the headline, sub, CTA, and the stage
- The stage holds 3 app shells as separate components: `<SlackShell />`, `<ImessageShell />`, `<GmailShell />`
- Each app shell takes a `phase` prop: `'idle' | 'recording' | 'polishing' | 'pasting' | 'done'` and renders accordingly
- A `useHeroCycle()` hook drives the choreography: maintains `currentApp` + `phase`, advances every ~7s
- The caption track is its own component `<CaptionTrack />` that receives raw text chunks + a polished string
- `<Pill />` from Phase 1, positioned absolutely at `bottom: 6%` of stage

#### 3c. Section 5 (AI coding)
Port `remaining-v4.html` section 5:
- `<AiCoding />` with a sidebar picker + canvas
- 4 app shells: `<ClaudeCodeShell />`, `<CursorShell />`, `<ChatGPTShell />`, `<TerminalShell />`
- Pixel mascot in `<ClaudeCodeShell />` stays as inline SVG
- `useAiCycle()` hook drives 8.5s rotation + manual click override
- Each shell receives the dictated prompt as a `text` prop; types it in via a `useTypewriter()` hook

#### 3d. Section 3 (demo UI shell only — backend in Phase 4)
Build the UI now, wire to a stub `mockDemo()` that returns hardcoded raw + polished text after 800ms. We'll replace the stub in Phase 4.
- `<LiveDemo />` with picker, mic button, output card, caption track
- Press-and-hold mic button: `onMouseDown` / `onMouseUp` (+ touch handlers)
- Press-and-hold Control key: global `keydown` / `keyup` listener
- Output card swaps between the three app shells from Phase 3b (reuse them)

**Verify:** All four motion sections run smoothly. No frame drops on Chrome dev tools "Slow 4x" CPU throttle. `prefers-reduced-motion` disables all loops and shows end states. Manual QA on Safari, Chrome, Firefox.

### Phase 4 — The live demo backend (1 day)

**Goal:** real audio capture → real Groq → real Claude → result back to browser.

1. Set up Upstash Redis (free tier). Create database. Note REST URL + token.
2. Set up Groq + Anthropic API keys. Add to Vercel project env vars (Preview + Production scopes both).
3. Create `app/api/demo/route.ts` — Edge Runtime (`export const runtime = 'edge'`).
4. Implement the pipeline from the spec:
   - Parse `multipart/form-data` (audio blob + targetApp field)
   - Validate audio size (≤1MB) and duration (≤15s, by reading WebM header or by trusting client + size proxy)
   - Hash visitor IP from headers (`x-forwarded-for`, with sha256 + env salt)
   - Check rate limiter: `demo:{ip-hash}:{YYYY-MM-DD}` ≤ 5
   - Check daily global spend ceiling
   - Stream audio to Groq Whisper Large v3 Turbo
   - Send `{ raw, targetApp }` to Claude Haiku with the per-app system prompt
   - Return `{ raw, polished, ms: { transcribe, polish } }`
   - Increment counters with 24h TTL
   - Catch errors → typed error responses (429, 503, 400, 500)
5. Per-app polish prompts as constants in `lib/polish-prompts.ts`. Sourced from MASTER.md.
6. Browser-side: in `<LiveDemo />`, replace `mockDemo()` with a real `fetch('/api/demo')` call. Use MediaRecorder to capture WebM/Opus. On `mouseUp` / `keyUp`, stop recording, POST blob.
7. Error UI: surface 429 / 503 / 400 in the caption track ("rate limited — come back tomorrow" / "we're at the daily cap" / "audio too long").

**Verify:** End-to-end test on preview deploy. Hold Control, speak, get real text back. Run it 6 times from one IP — 6th call returns 429. Inspect Upstash dashboard, see counter. Audit Vercel function logs — no audio bytes logged anywhere.

### Phase 5 — Polish + ship (half a day)

**Goal:** the page is correct. Make it fast and findable.

1. **Images:** convert all logos to WebP where they're PNG. Set explicit `width`/`height` on every `<Image>`. Use Next `<Image>` with `priority` for hero, `loading="lazy"` for everything below the fold.
2. **Fonts:** subset Google Fonts to Latin + the specific weights used. `font-display: swap`. Preload Instrument Serif since it's the hero font.
3. **CSS:** purge Tailwind. Inline critical CSS for above-the-fold sections via Next built-in.
4. **JS:** code-split by section using `next/dynamic` with `ssr: false` for any sections that depend on `window` (the hero stage motion, the AI coding cycle, the demo). Below-the-fold dynamic imports get loaded on scroll.
5. **Metadata:** OG image (1200×630, hero screenshot), Twitter card, favicon, app touch icon.
6. **robots.txt + sitemap.xml**.
7. **Lighthouse pass:** target Perf ≥ 95, Accessibility 100, Best Practices 100, SEO 100. Fix anything that drops.
8. **Pre-launch checklist** from the spec — walk through each item, tick them off.
9. Deploy to production. Smoke-test the live URL. Walk through full page on mobile + desktop. Try the demo. Try with mic denied. Try with rate limit hit.

**Verify:** production URL loads, Lighthouse passes, demo works end-to-end, no console errors, no broken images.

## File tree (target end state)

```
YapprLanding/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                # composes all 10 sections
│   ├── globals.css             # tokens + base
│   └── api/
│       └── demo/
│           └── route.ts        # Edge function
├── components/
│   ├── Pill.tsx
│   ├── PillLogo.tsx
│   ├── Nav.tsx
│   ├── Hero.tsx
│   ├── HeroStage.tsx
│   ├── shells/
│   │   ├── SlackShell.tsx
│   │   ├── ImessageShell.tsx
│   │   ├── GmailShell.tsx
│   │   ├── ClaudeCodeShell.tsx
│   │   ├── CursorShell.tsx
│   │   ├── ChatGPTShell.tsx
│   │   └── TerminalShell.tsx
│   ├── CaptionTrack.tsx
│   ├── LiveDemo.tsx
│   ├── ThreeBehaviors.tsx
│   ├── AiCoding.tsx
│   ├── Dictionary.tsx
│   ├── Privacy.tsx
│   ├── Pricing.tsx
│   ├── FAQ.tsx
│   ├── FinalCTA.tsx
│   └── Footer.tsx
├── hooks/
│   ├── useHeroCycle.ts
│   ├── useAiCycle.ts
│   ├── useTypewriter.ts
│   ├── useHoldKey.ts           # press-and-hold Control
│   └── useReducedMotion.ts
├── lib/
│   ├── polish-prompts.ts       # per-app Claude system prompts
│   ├── groq.ts                 # Groq client wrapper
│   ├── anthropic.ts            # Claude client wrapper
│   └── ratelimit.ts            # Upstash wrapper
├── public/
│   ├── logos/                  # already exists
│   └── og-image.png
├── docs/
│   ├── specs/landing-page-design-spec.md
│   └── plans/landing-page-implementation.md
├── design-system/yappr-landing/MASTER.md
└── CLAUDE.md
```

## Risks & open questions

| Risk | Likelihood | Mitigation |
|---|---|---|
| Groq Whisper Turbo rate-limits our free tier under viral traffic | medium | Daily $50 ceiling + per-IP cap. Falls back to 503. |
| WebM/Opus encoding differs across browsers | medium | Test on Chrome / Safari / Firefox. Use `MediaRecorder` with mimetype fallback chain. |
| Cursor's official logo isn't free for editorial use | low | User to confirm; placeholder mark in place meanwhile |
| Pill `backdrop-filter: blur(34px)` causes jank on older devices | low | Test on iPhone 11 / older Macs; fallback to solid background if FPS < 30 |
| Audio bytes accidentally land in Vercel logs | low but critical | Audit the edge function code; `console.log` only `{ms, status}`, never audio handle |
| Press-and-hold Control conflicts with macOS/Linux secondary-click | low | Add an alt key option in settings later; for v1, the mic button is the fallback |

## Decisions deferred to implementation time

- Domain choice (yappr.app? yappr.so? user to pick)
- Whether to put the demo behind a soft "what's your email?" gate for 6th+ use (currently no — user said no email capture)
- Whether to ship a `/changelog` page in v1 (currently no)
- Sentry / error tracking (currently no)

## Effort estimate

| Phase | Estimate |
|---|---|
| 0 — scaffold | 4h |
| 1 — pill | 4h |
| 2 — static sections | 12h |
| 3 — motion sections | 16h |
| 4 — backend | 8h |
| 5 — polish + ship | 4h |
| **Total** | **48h ≈ 1 focused week** |

Buffer 20% for browser bugs and copy revisions. Realistic ship window: **1.5 weeks** of focused work from `pnpm create` to public URL.
