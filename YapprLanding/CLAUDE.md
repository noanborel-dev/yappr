# Yappr Landing — Operating Rules

This file is auto-loaded every session. It tells you how to work in this repo. **Design rules** live in `design-system/yappr-landing/MASTER.md` — read that file before touching anything visual.

---

## What this is

The marketing site for **Yappr** — a macOS voice-dictation app that polishes your speech per destination (iMessage, Slack, Gmail, etc.) and pastes the cleaned result. **Closed-source commercial product** — do NOT describe as open source / MIT / auditable / forkable / "source is public." The differentiation angle is *more creative, BYOK transparency, audio never proxied through us* — not OSS. The product lives one directory up at `/Users/noanborel/Yappr`. This landing page is its own project.

Primary goal: **macOS downloads**. Single dominant CTA. The page should sell by showing the product working, not describing it.

---

## Stack

- **Framework:** Next.js 14 (App Router) on Vercel — needed for the edge function powering Section 3's live demo
- **Package manager:** `npm` (already installed; not bringing in pnpm for one project)
- **Styling:** Tailwind + a small set of CSS variables for the cream/ink/accent tokens
- **Animations:** Plain CSS keyframes + small vanilla JS for cycling demos. **No Framer Motion / GSAP** unless a section truly needs it (the existing brainstorm prototypes prove plain CSS is enough)
- **Fonts:** Google Fonts — Instrument Serif (display + italic), Inter (UI), JetBrains Mono (mono)
- **Edge function:** Vercel Edge Runtime for the Groq → Claude Haiku pipeline. Upstash Redis (free tier) for per-IP rate limiting
- **No analytics for v1** unless explicitly asked. Plausible later if needed
- **No CMS.** Copy lives in the code

---

## How to work

### 1. Design first, code second

If the user asks for a new section or a feature, **mock it in HTML/CSS to the brainstorm server first** (`.superpowers/brainstorm/...`) and get sign-off before adding to the real site. The brainstorm prototypes in this repo are the source of truth for what each section should look like.

### 2. Match the prototype, don't reinvent

The brainstorm prototypes already solved several rounds of design problems (the honest demo flow with the caption track, the multi-app hero cycle, the three-behaviors panel motion, the per-app polish defaults). When porting to the real site:

- Keep the exact motion choreography that's in the prototypes
- Keep the exact copy, headlines, eyebrows
- Keep the exact per-app polish defaults from the research panel

If you want to deviate, **ask first**. Don't quietly "improve."

### 3. The pill is the brand

The Yappr recording pill must match the real macOS app exactly. The spec lives in `MASTER.md` under "The Yappr Pill" and was pulled from the actual app source. **Never approximate it.** If you're unsure of a spec detail, re-pull from `/Users/noanborel/Yappr`.

### 4. Show, don't explain

Default to motion over copy. Each section should hit:
- One italic-serif headline (1–2 lines)
- One sentence of body
- One animated proof
- Stop

If a section starts growing bullet lists, paragraphs, or feature grids — rebuild it as motion. This rule comes from the user directly and is non-negotiable.

### 5. NOT open source — strip every OSS reference

Yappr is closed-source. Never write "open source", "MIT-licensed", "view source", "audit reproduces it", "self-host", "fork it", "star on GitHub", or any contributor/stars framing. The differentiation angle is **creative product + BYOK transparency**, not OSS. The privacy story is "audio goes mic → your provider directly, our servers are not in the path" — no source-availability claim.

### 6. Logos

All app/brand logos live in `assets/logos/` with normalized names (lowercase, no spaces). Always reference via relative path. Never load from a CDN or hotlink. The current set is: `slack.png`, `imessage.png`, `gmail.webp`, `claude.png`, `notion.png` + their `-wordmark` variants.

When a new logo is needed (e.g., `cursor.png`, `chatgpt.png` for the parked "Built for AI coding" section), pause and ask the user to drop the official SVG/PNG in rather than approximating with inline SVG.

---

## Section status

| # | Section | Brainstorm prototype | Notes |
|---|---|---|---|
| 1 | IA / skeleton | `skeleton.html` | Locked |
| 2 | Hero (multi-app cycle) | `hero-v5.html` | Locked. Caption-track approach. Auto-cycle Slack → iMessage → Gmail, no manual clicks. |
| 3 | Live demo | `live-demo.html` + `live-demo-spec.html` | Press-and-hold Control. Edge function spec ready. Polish defaults per app researched. |
| 4 | Three behaviors | `three-behaviors-v2.html` | Locked. Minimal version, not the verbose v1. |
| 5–10 | Polish, Dictionary, Privacy, Pricing, FAQ, Final CTA | `remaining-sections.html` | Drafted, pending review |
| **Parked** | "Built for AI coding" | Not started | Dedicated section showing pill inside Claude Code / Cursor / terminal. Like the Superwhisper screenshot the user shared. Build when we get to it, not in the hero. |

---

## Backend spec (Section 3 live demo)

When you implement the `/api/demo` endpoint:

- **Runtime:** Vercel Edge
- **Method:** POST, `multipart/form-data` (audio blob) + `targetApp` field
- **Pipeline:** Audio → Groq Whisper Large v3 Turbo → Claude Haiku polish (per-app system prompt from MASTER.md) → return `{ raw, polished }`
- **Rate limit:** 5/IP/day, audio max 15s / 1MB, daily key ceiling $50 in env
- **Storage:** Upstash Redis free tier for rate counter. **No audio persistence ever.**
- **Errors:** 429 (rate limit), 503 (daily ceiling), 400 (bad audio), 500 (provider error). Browser surfaces these in the caption track ("rate limited — come back tomorrow")
- **Env:** `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DAILY_KEY_CEILING_USD`

---

## What NOT to do

- ❌ Don't add framework dependencies for "convenience" — keep the bundle small. The whole site should ship under 200KB JS.
- ❌ Don't introduce dark mode. Cream is the brand.
- ❌ Don't gate the demo behind email capture. The user explicitly didn't want that.
- ❌ Don't mention pricing tiers that don't exist yet ("Pro", "Enterprise"). Today it's just Free.
- ❌ Don't add hover-to-pause to looping demos. It caused desync bugs.
- ❌ Don't break the per-app polish research. iMessage stays lowercase. Gmail keeps its greeting. Slack stays sentence-case.
- ❌ Don't claim "Wispr Flow but free" as the headline angle — comparison is OK in the FAQ, but the hero should sell on its own merits.

---

## When in doubt

Read `design-system/yappr-landing/MASTER.md` for visual rules. Read the relevant brainstorm prototype HTML for the exact motion + copy. If something contradicts between the two, MASTER wins.

If both are silent, ask the user.
