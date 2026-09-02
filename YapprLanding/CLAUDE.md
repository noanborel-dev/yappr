# Yappr Landing — Operating Rules

This file is auto-loaded every session. It tells you how to work in this repo. **Design rules** live in `design-system/yappr-landing/MASTER.md` — read that file before touching anything visual.

---

## What this is

The marketing site for **Yappr** — a macOS voice-dictation app that polishes your speech per destination (iMessage, Slack, Gmail, etc.) and pastes the cleaned result. **Closed-source commercial product** — do NOT describe as open source / MIT / auditable / forkable / "source is public." The differentiation angle is *what the product does* — not OSS, and no longer BYOK (see "NOT open source" below). The product lives one directory up at `/Users/noanborel/Yappr`. This landing page is its own project.

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

Yappr is closed-source. Never write "open source", "MIT-licensed", "view source", "audit reproduces it", "self-host", "fork it", "star on GitHub", or any contributor/stars framing.

**The differentiation is the product, not the plumbing.** It used to be
written here as "BYOK transparency". That is gone: Yappr is a subscription
and users do not bring a key, so there is no key to be transparent about.
What sells is what it does — a ramble becomes a structured prompt, you
rewrite a selection by voice, it remembers your project.

**The privacy line is now: your audio never leaves your Mac.** That is
true, it is the thing people actually ask about, and it survives the move
to a subscription because transcription is on-device.

It replaces "audio goes mic → your provider directly, our servers are not
in the path", which stops being true once cleanup runs through Yappr
instead of the user's own key. **Never write the opposite of what is
true.** If text does route through us, say nothing about it rather than
claiming it does not. See `docs/ARCHITECTURE.md` in the app repo.

### 6. Logos

All app/brand logos live in `assets/logos/` with normalized names (lowercase, no spaces). Always reference via relative path. Never load from a CDN or hotlink. The current set is: `slack.png`, `imessage.png`, `gmail.webp`, `claude.png`, `notion.png` + their `-wordmark` variants.

When a new logo is needed (e.g., `cursor.png`, `chatgpt.png` for the parked "Built for AI coding" section), pause and ask the user to drop the official SVG/PNG in rather than approximating with inline SVG.

---

## Positioning (2026-07-29 rewrite — read this before touching copy)

The site is aimed at **builders who live in Claude Code, Cursor and the
terminal**, not at general dictation users. The pitch is *not* "dictation is
faster than typing" — it's "you already talk to Claude Code all day, and Yappr
makes you better at it."

**Three features carry the page, in this order:** prompt shaping →
select-and-rewrite → persistent context. Per-app polish is demoted to proof.

### Copy rules (hard)

- Never "fully local" or "100% private" — transcription is local, cleanup is not.
- **No latency numbers as a claim.** The live demo proves speed.
- Banned words: "AI-powered", "seamless", "revolutionary", "supercharge".
- Short sentences. Developer talking to developer, not landing-page voice.
- Don't invent features. Only the three above plus per-app polish.
- Primary CTA is **"Start yapping"** everywhere. Consistent, no variants.
- Every section showing a paid feature carries a `.pro-tag`.
- **Competitors are never named outside the FAQ.** In-section comparisons stay
  oblique ("other voice tools…"). The FAQ is the one place Wispr is named.
- **Keep the vocabulary/project distinction exact.** Persistent context is
  pitched as "a context window for your dictation" — the Claude analogy does
  the explaining for this audience. But rival tools *do* persist a personal
  dictionary, so the honest claim is that they learn your **vocabulary** while
  this learns your **project**. Never sharpen it into "they have no memory."

### Section order (current)

Page rhythm follows the shape that works on comparable sites (Wispr Flow):
hero → "is this for me" → features → proof → try it → price → CTA.

| # | Section | Component | Notes |
|---|---|---|---|
| 1 | Hero | `Hero.tsx` | Terminal running Claude Code. Ramble in → `## Goal / ## Tasks / ## Constraints` lands. Single looped scenario — the old 3-app cycle is gone; the structured prompt needs the dwell time. |
| 2 | Who it's for | `BuiltForBuilders.tsx` | Dark full-bleed **pinned scroll sequence**: 320vh track, panel sticks, three beats swap one line at a time while `WorkspaceScene.tsx` changes to match (idle tabs → ramble + pill → structured prompt + Claude working). Compatibility strip below the track. |
| 3 | Prompt shaping | `PromptShaping.tsx` | **Autoplaying demo sequence**, loops while in view: transcript streams word by word → filler strikes through and drops → the shaped prompt types itself, and as each line lands the source phrase it came from lights up in the transcript. That highlight is the whole point — it shows nothing was summarised away. |
| 4 | Select and rewrite | `SelectRewrite.tsx` | One surface (Cursor), done accurately. Not a carousel of generic windows. |
| 5 | Persistent context | `PersistentContext.tsx` | Shows the overview paragraph gaining clauses it learned. |
| 6 | Per-app polish | `PerAppPolish.tsx` | Proof, not pitch. Pro-gated. |
| 7 | Try it live | `LiveDemo.tsx` | Below the features. Terminal is the default target. Carries the animated Tap/Hold/Double-tap row. |
| 8 | Pricing | `Pricing.tsx` | Two tiers only: Free (unlimited) and Pro $9. |
| 9 | FAQ | `FAQ.tsx` | Carries the privacy copy verbatim. |
| 10 | Final CTA | `FinalCTA.tsx` | |

**Two sections deliberately NOT copied from Wispr:**
- **No "Nx faster than typing" stat block.** Speed isn't the pitch here, and we
  don't publish latency claims. The live demo carries speed by doing.
- **No testimonial wall.** Not until there are real quotes — don't invent them.
  When real ones exist, the slot is between per-app polish and the live demo.

**No borrowed likenesses.** A real person's photo on the page implies an
endorsement they never gave, however aspirational the art direction.

**Deleted:** `ThreeBehaviors`, `Dictionary`, `LocalMode`, `AiCoding`, `Privacy`
(as a section). Dictionary and hotkey behaviors survive as Free-tier lines in
pricing; the hotkey gestures also survive as the animated row under the demo.
Privacy copy lives in the FAQ. It was marked "approved verbatim, don't
reword it"; **that was superseded on 2026-08-30** when the model moved to a
subscription, because the approved wording claimed our servers were not in
the path and that stops being true. Rewritten then, and the standing rule
is the one above: say the audio stays on the Mac, and never write the
opposite of what is true about the text.

**No model names anywhere on the site.** Which transcriber, whose LLM,
which vendor we do not depend on — none of it belongs in front of a
customer. It dates the page every time the stack changes (the FAQ was
still advertising a Whisper tier the product had retired) and it invites
the reader to audit our plumbing instead of buying the thing.

There is no longer an exception. The footer carried a "Built with Llama"
credit, required by the Llama 3 Community License § 5(a) while the
pipeline called llama-3.1-8b-instant. Groq decommissioned that line and
the pipeline moved to `openai/gpt-oss`, so the credit was naming a model
the product does not use — a false attribution, which is worse than the
missing one it was added to fix. gpt-oss is Apache-2.0 and carries no
equivalent branding requirement. The trademark line stays.

### Mockups must look like the real app

If a shell reads as "a generic dark window with a title bar", it has failed.
`CursorShell` has an activity rail, tab strip, gutter, syntax colors and a
status bar because that's what makes it recognizable at a glance. Same standard
applies to anything new.

---

## Photography

The page ships with **no photographs** — every visual is CSS-drawn app chrome.
That's a deliberate constraint, not an oversight: this is software with no
physical form, and a page of stock photos of people at laptops reads as a
template. Apple can lead with product shots because the Vision Pro is an
object you can hold.

When real photography arrives, the slot is built:

- `PhotoBand.tsx` — full-bleed 21:9 band (4:5 on phones), gradient scrim, one
  huge line of type over it. **Renders `null` when no `src` is set**, so an
  unfilled band never ships as a grey box.
- `photos.tsx` — the shot list, with resolution/crop/licensing spec and search
  terms for each. Two shots are specified (a build bench, a late desk); a third
  is noted as probably unnecessary. Uncomment an entry once the file lands in
  `public/photos/`.

Hard rules for anything that goes in there: licensed for commercial use, no
identifiable faces (on a product page a real person reads as an endorsement
they never gave), warm natural light (cold blue-grey stock fights the cream),
and never an image lifted from a competitor's site.

**`.bleed`** is the Apple technique that needs no photography: it lets a
mockup escape the 1240px text column and run to 1560px. Used on the dark
select-and-rewrite section. Use it sparingly — it only reads as premium
when most of the page respects the measure.

## The Apple-inspired motion system

Four devices, reused deliberately. A technique used once reads as a gimmick;
used three times it reads as a system. Don't add a fifth without removing one.

| Device | Component | Where |
|---|---|---|
| **Pinned scroll sequence** | `BuiltForBuilders` | Who it's for — panel sticks, three beats swap |
| **Autoplaying demo loop** | `PromptShaping` | 01 — transcript streams, output types, source highlights |
| **Scroll-linked growth** | `ScrollExpand.tsx` | 02 select-and-rewrite, 04 per-app polish, 03 context card |
| **Statement chapter break** | `Statement.tsx` | Between the feature run and the live demo |

- `ScrollExpand` maps scroll position to `scale` continuously (0.88 → 1). It
  **replaces** `Reveal` on an element — never nest them, they both write
  `transform` and fight. `transform-origin: 50% 15%` so it opens downward.
- `Statement` never fades below `0.25` opacity. A chapter break that vanishes
  reads as a rendering bug, not as restraint.
- A statement immediately above a section means **that section drops its own
  headline** — the live demo lost `.demo-title` for exactly this reason. Two
  big serif lines back to back is the same sentence twice.

## Animation gotchas (learned the hard way)

- **`overflow: hidden` kills `position: sticky`.** It makes the element a
  scroll container, so a pinned child silently un-pins and sits at the top of
  its track — the section renders as a tall empty box. Use `overflow: clip`.
- **Anything that types or streams needs a reserved height.** `min-height`
  isn't enough: as content fills, the box grows and the whole section jitters.
  Set a fixed `height` sized for the final state (`.ps-said` / `.ps-out` are
  both `330px`), with mobile falling back to auto.
- **Absolutely-positioned labels hung outside a card** get clipped the moment
  that card gets `overflow: hidden`. Put them inside.
- **Centred sections centre their mockups' text too.** Any window or terminal
  shell inside a `text-align: center` block needs its own `text-align: left`.
- **Turbopack drops newly-added CSS classes constantly** on this project. If a
  new section renders as unstyled text, it's the dev server, not the code:
  `pkill -f "next dev" && rm -rf .next` and restart. Production builds are fine.

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
