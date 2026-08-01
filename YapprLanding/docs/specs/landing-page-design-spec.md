# Yappr Landing — Design Spec

> Status: **brainstorm-approved**, ready for implementation.
> Source-of-truth prototypes live in `.superpowers/brainstorm/39530-1778596052/content/`.
> Brand rules live in `design-system/yappr-landing/MASTER.md`.
> Operating rules live in `CLAUDE.md`.

This document consolidates every section decision from the brainstorm into one durable spec. When something contradicts: prototypes > this spec > MASTER.md > CLAUDE.md.

---

## North Star

> **Editorial-meets-utility.** Reads like a literary magazine selling a developer tool. Big italic serif headlines, generous whitespace, cream paper, motion that *captures product behavior* rather than decorating around it. Show, don't explain.

Primary goal: **macOS downloads.** Single dominant CTA. The page sells by showing the product working, not describing it.

**Hard rules:**
- Not open source. Never frame Yappr as OSS / MIT / auditable / forkable. Differentiation = creative + BYOK transparency.
- Each section ≤ 1 sentence of body copy. If it grows bullets or paragraphs, rebuild as motion.
- Cream is the brand. No dark mode.
- The Yappr pill spec must match the real macOS app exactly (liquid-glass, 6 cobalt bars, italic serif label, no timer).
- No emojis as UI icons. SVGs or real brand logos.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) on Vercel |
| Styling | Tailwind + CSS variables for brand tokens |
| Animations | Plain CSS keyframes + small vanilla JS. **No Framer Motion / GSAP.** |
| Fonts | Instrument Serif (display + italic), Inter (UI), JetBrains Mono (eyebrows/keys) |
| Backend | One Vercel Edge function for the live demo |
| Rate limiter | Upstash Redis (free tier) |
| Audio storage | **Never.** Audio streams through, never persisted. |
| Bundle target | < 200KB JS total |

---

## Information architecture

| # | Section | Brainstorm prototype | Status |
|---|---|---|---|
| 1 | Nav (sticky) | `skeleton.html` | Locked |
| 2 | Hero — multi-app cycle | `hero-v5.html` | Locked |
| 3 | Try it live — real mic | `live-demo.html` + `live-demo-spec.html` | Locked |
| 4 | One key, three behaviors | `three-behaviors-v2.html` | Locked |
| 5 | Built for AI coding | `remaining-v4.html` | Locked |
| 6 | Dictionary | `remaining-v4.html` | Locked |
| 7 | Privacy | `remaining-v4.html` | Locked |
| 8 | Pricing — Free | `remaining-v4.html` | Locked |
| 9 | FAQ — 5 items | `remaining-v4.html` | Locked |
| 10 | Final CTA + footer | `remaining-v4.html` | Locked |

Two things were explicitly cut from earlier drafts:
- ❌ Open-source / GitHub-stars section (user doesn't care, and we're not OSS)
- ❌ Polish-per-context as its own section (hero already proves multi-app; collapsed into Section 5 + the polish defaults referenced in Section 3)

---

## Section-by-section

### Section 1 — Nav

- Sticky bar, cream backdrop with `saturate(140%) blur(10px)` over `rgba(246,242,231,.78)`, 1px bottom border `--line-soft`
- Left: Yappr pill logo (small variant, 18px)
- Middle: anchor links to `#hero`, `#demo`, `#hotkey`, `#privacy`, `#pricing`, `#faq`
- Right: "Sign in" (ghost) + "Download macOS" (dark pill, 14.5px, with `⌘ ⇧ D` kbd hint)
- Height 72px

### Section 2 — Hero (multi-app cycle)

Layout: two-column. Left = giant italic headline + sub + download CTA. Right = the **stage**.

**Headline:** `Speak naturally.<br>Send <em>without</em> editing.`
**Sub:** `Voice to clean text — anywhere you can type. <em>Bring your own keys</em>, keep your audio private, never re-record because you said "um."`
**CTA:** `Download for Mac` with `⌘ ⇧ D` kbd hint
**Below CTA, meta line:** `Free · macOS · Windows + Linux on the way →`

**Stage** = a 1:0.78 aspect-ratio gradient panel that contains three layered app shells (only one visible at a time):
1. Slack — purple rail, channel header, formatting toolbar, Slack-green send
2. iMessage — sidebar with threads, centered avatar header, gray-in/green-out bubbles, pill input
3. Gmail — Gmail logo + searchbar, sidebar with Compose pill, Primary/Promotions/Social tabs, the bottom-right slide-up compose card

**Caption track** lives under the pill, NOT inside any app composer. This is the honesty mechanism — the app composer stays empty until the very end, then receives the polished line in one paste.

**Pill** is anchored at `bottom: 6%` of the stage so it never overlaps the message it's dictating.

**Choreography per app loop (~7s each, then crossfade):**
| Time | What happens |
|---|---|
| 0.0s | App fades in. Composer empty. |
| 0.4s | Gmail only: compose card slides up from bottom-right |
| 0.4s | Pill rises from below, state = `listening` |
| 0.7s | Caption appears under pill, labeled "heard" |
| 0.7–3.2s | Raw transcript streams into caption in 2–5 word chunks. "um" strikes through |
| 3.5s | Pill switches to `polishing…` (cobalt spinner). Caption label changes. |
| 3.8s | Caption morphs to polished version. Label → "polished" cobalt |
| 4.0s | Pill switches to `copied — ⌘V to paste` (cobalt check) |
| 4.2s | Polished text pastes into destination app in one shot. Brief cobalt flash on the input |
| 6.0s | Hold for reading |
| 7.0s | Fade out, advance to next app |

**Per-app paste behavior:**
- Slack → fills composer text, "send" button turns Slack green
- iMessage → appears as a sent green bubble; input briefly flashes cobalt
- Gmail → fills reply body, "Send" button activates blue

**Per-app scenarios (NOT the same message rephrased — different messages so this doesn't duplicate Section 5):**
- Slack: rescheduling a meeting → `Hey, Friday works — actually could we do 2 instead of 12? I have a lunch then.`
- iMessage: dinner plans → `yes totally ramen sounds perfect, let's do like 7ish?`
- Gmail: client reply → `Hi David — those numbers on slide 7 are quarter-over-quarter. I'll add a footnote before Tuesday to make it clear. Thanks for catching it.`

**App tabs underneath stage** show which app is currently playing — using real logos:
- `assets/logos/slack.png` · `imessage.png` · `gmail.webp`
- `pointer-events: none` on tabs. Indicators only, no manual clicks. (Manual clicks caused desync bugs.)

**No hover-pause.** The cycle runs autonomously.

### Section 3 — Try it live

The page's centerpiece. A real, working dictation demo using our Groq key.

**Header strip:** Step indicator + live meta. Right side shows `[●] live · groq whisper turbo  |  3 / 5 demos left today`

**App picker (3 buttons):** Slack / iMessage / Gmail with real logos. Active = lifted + indicator dot underneath. Changes the destination mockup AND the polish prompt.

**Mic stage (2-column):**
- Left = big mic button (140px, liquid-glass styling matching the pill). Goes red-rimmed and ripples on hold. Hint: `Hold Control or this button`. Sub: `15s max · 5/day · audio never stored`.
- Right = live output card showing the chosen app shell. Caption track sits underneath, attached to the bottom of the card.

**Interaction:**
- Press-and-hold on the mic button OR press-and-hold the **Control key** on the page (matches the real product's default hotkey)
- 15-second max recording
- Release → POST to `/api/demo` → caption shows raw streaming in → polished morph → paste into the active app shell

**Per-app polish defaults** (Claude Haiku system prompts, from research):
| App | Polish rule |
|---|---|
| iMessage | lowercase · no final period · fragments OK · no greeting/signoff · 1–2 short bubbles · emoji OK |
| Slack | sentence case · light punct · 1–3 sentences · optional opener · no signoff · soften with ! |
| Gmail | full caps/punct · "Hi [name]," · paragraphs · signoff · no emoji · lead with the ask |

Research sources: Gretchen McCulloch *Because Internet*, Penn State period-as-passive-aggressive (Gunraj 2016), Boomerang's 350k-email corpus, Verheijen/Sánchez-Moya WhatsApp studies.

**Privacy footer strip:** `Audio path: your mic → our edge (no log) → Groq Whisper (no retention) → polished by Claude Haiku → back to you. We never persist a byte.`

**No-mic fallback:** Just show the mic-permission prompt. No "Hear ours" pre-recorded sample (parked for later, per user direction).

---

#### Backend spec — `/api/demo` (Vercel Edge function)

```
POST /api/demo
Content-Type: multipart/form-data
Body:
  - audio: Blob (WebM/Opus, ≤15s, ≤1MB)
  - targetApp: 'slack' | 'imsg' | 'gmail'

Response:
  200 → { raw: string, polished: string, ms: { transcribe: number, polish: number } }
  400 → { error: 'invalid_audio' | 'missing_field' }
  429 → { error: 'rate_limited', resetAt: number }
  503 → { error: 'daily_ceiling' | 'provider_down' }
```

**Pipeline:**
1. Validate audio size + duration
2. Hash visitor IP (sha256, salt) → check Upstash Redis counter for `demo:{ip-hash}:{YYYY-MM-DD}`
3. If counter ≥ 5 → return 429
4. If global daily spend counter exceeds `DAILY_KEY_CEILING_USD` → return 503
5. Forward audio to Groq Whisper Large v3 Turbo using `GROQ_API_KEY`
6. Receive raw transcript
7. Forward `{ raw, targetApp }` to Claude Haiku with the per-app polish system prompt
8. Increment IP counter (24h TTL). Increment daily spend counter by estimated cost (~$0.001 per call)
9. Return `{ raw, polished, ms }`. **Never log audio. Never persist transcript.**

**Env vars:**
```
GROQ_API_KEY
ANTHROPIC_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
DAILY_KEY_CEILING_USD=50
IP_HASH_SALT (random per deploy)
```

---

### Section 4 — One key, three behaviors

Layout: full-width card divided into 3 equal panels. Auto-cycles Tap → Hold → Double-tap → Tap…, 4s per panel.

**Per panel:**
- Top: `01 / 02 / 03` ord in mono
- Big italic gesture name (Tap / Hold / Double-tap)
- One-line description
- Animated **physical keycap** (120×120, cream gradient with `0 6px 0 #b8af90` bottom shadow — looks like a real keyboard key) with the ⌃ glyph
- Mini Yappr pill below the keycap showing the gesture's effect

**Active panel** highlights cream (`--accent-soft`) with a 2px red progress bar racing across the bottom (4s linear).

**Animations per gesture:**
- **Tap**: key presses + ripple, pill appears `listening`, 2.4s later key presses again, pill flips to `done · pasted`
- **Hold**: key stays pressed with pulsing red ring, pill `listening`, 2.4s later key releases, pill flips to `done · pasted`
- **Double-tap**: two quick taps with ripples 220ms apart, pill flies in pre-done (`pasted`) since it's a re-paste, no recording

**Bottom of section:** no takeaway box. Section ends clean.

### Section 5 — Built for AI coding

Two-column card: 260px sidebar + dark canvas (`#2a2826`).

**Sidebar — picker:**
- "Talk to →" italic heading + "Click to switch." sub
- 4 rows with real logos (Claude already in `assets/logos/claude.png`; **needs**: `cursor.png`, `chatgpt.png`, `terminal.png` — placeholder marks shown until provided):
  - Claude Code · `/loop /spawn /plan`
  - Cursor · `⌘K · ⌘L`
  - ChatGPT · `browser · desktop`
  - Terminal · `zsh · bash · iTerm`
- Active row = full opacity + cream-tinted background
- Inactive rows = 45% opacity, hover to 85%

**Canvas — recreates each real UI:**

**Claude Code** — matches the actual welcome screen exactly:
- Dark `#1f1d1c` background
- Dashed peach (`#c8553d`) border box with `─ Claude Code v2.0.0 ─` header label
- Two columns inside the box: **left** = "Welcome back Noan!", pixel mascot (drawn in SVG), "Opus 4.7 · Max 20x", cwd path. **right** = "Recent activity" with timestamps + "What's new" with /agents, /security-review, ctrl+b
- Below box: `> ` prompt input with dictated text typing in word-by-word

**Cursor** — matches the actual IDE:
- Top traffic lights + right-side window icons
- Left = `mod.rs` tab (red Rust dot icon), then a **dashed-border inline edit suggestion box** with the typed dictation message + **⌘↵ Accept** (blue pill) / **⌘⌫ Reject** (dim) / "Follow-up instructions… ⇧⌘K"
- Below: real Rust code with line numbers 72–78, syntax highlighted, with diff coloring (line 77 deleted in red, line 77 added in green)
- Right = Chat / Composer tabs, `mod.rs Current File` pill, user's dictated message, assistant response with inline code spans (`TlsAccept`, `TlsSettings`)

**ChatGPT** — clean recreation:
- `ChatGPT 5 ▾` model pill in topbar
- User bubble (gray, right-aligned, max-80%-width) with dictated prompt
- Assistant response with green ✦ avatar
- Composer with `+` button, "Ask anything…" placeholder, mic icon

**Terminal** — minimal zsh:
- `noan@laptop — -zsh — 80×24` titlebar
- `noan@laptop ~/dev/yappr ›` prompt with dictated `gh pr create` command typing in

All 4 are clickable (`addEventListener('click', showApp)`). Auto-cycles every 8.5s. Yappr pill floats at `bottom: 28px` of canvas across all four.

### Section 6 — Dictionary

Single white card. Header row (left = title + sub, right = "Add a word…" pill + "+ Add" button).

**Headline:** `Names & jargon, <em>finally heard</em>.` (em in accent red, italic)
**Sub:** `Add the words Whisper keeps fumbling — coworker names, indie products, your acronyms. They get spelled right, every time.`

**Word grid:** 3 columns × 3 rows of cards. Each card:
- Top row: italic-serif term (26px) + colored category tag (mono, uppercase, in `--accent-soft` bg)
- Bottom: pronunciation in mono with `· ` prefix

**Words shown:**
| Term | Pron | Tag |
|---|---|---|
| Anthropic | an-THROW-pic | Company |
| Groq | grock | Provider |
| Søren | SUH-ren | Name |
| k8s | kates | Jargon |
| OAuth | oh-AUTH | Built-in |
| Whisper-v3-turbo | verbatim | Model |
| Cursor | cursor | App |
| pnpm | pee-en-pee-em | Tool |
| Vercel | ver-CELL | Built-in |

Card hover = white bg, ink border, slight lift.

### Section 7 — Privacy

Dark slab. Centered. Minimalist, matching the three-behaviors register.

**Eyebrow** (green): `Section 7 · Privacy`
**Headline (80px serif):** `Mic → <em>provider</em>. That's it.`
**Lede:** `Audio goes straight from your machine to the provider you chose, using your key. The polished line comes back. We're not in the middle.`

**Diagram** — three pills in a horizontal row, connected by dashed arrows with green packets flying across (2s loop):
1. **Your mic** — dark pill, mic SVG icon in green, "on-device"
2. ↘ dashed arrow with green packet
3. **Groq · your key** — red gradient pill, big white "G", "over TLS"
4. ↘ dashed arrow with green packet (staggered start)
5. **Pasted** — dark pill, cobalt checkmark SVG, "on-device"

**Tagline below diagram** (32px italic green serif): `**Zero bytes** of audio touch our servers.`

Nothing else. No "✕ not in path" box. No "0" callout block. No two-row return diagram. Section 4-level minimalism.

### Section 8 — Pricing

Two-column card.

**Left column — the price card** (cream gradient):
- Name: "Yappr" italic
- Tag: "Forever · no account" mono uppercase
- Price: `$0` (currency 36px, number 96px serif)
- Unit: "per month, per anything"
- Features (5):
  - Unlimited dictations
  - Tap · hold · double-tap
  - Custom dictionary & pronunciations
  - Polish per app
  - macOS — Windows & Linux soon
- CTA: "Download for Mac" with `⌘ ⇧ D` kbd

**Right column:**
- Italic serif quote (30px): `You bring <accent>your own key</accent>. We never touch your card.`
- Groq card: orange-gradient `G` logo + "Groq Whisper" / "Default provider. Recommended." + green "Free tier" pill

No comparison table. No "$0.006/min OpenAI" rows. Just Yappr's price + Groq's free tier.

### Section 9 — FAQ

White card, accordion style. 5 items. Italic serif summaries (26px), red `+ / −` indicator.

| Q | A |
|---|---|
| Does Yappr ever hear my audio? | No. Audio uploads go from the client straight to your chosen provider, using your key, over TLS. Yappr servers are not in the path. The polished text comes back to your device and gets pasted locally. |
| How is this different from *Wispr Flow*? | Wispr proxies your audio through their servers on their plan. Yappr doesn't proxy anything — your audio goes straight to the provider, using your own key. Polish is calibrated per destination app (iMessage stays lowercase, Gmail keeps its greeting). Cost, audio path, and tone are yours, not ours. |
| Which providers work? | Today: Groq (free tier, recommended) for transcription, OpenAI Whisper as an alternative, and Anthropic Claude for the polish pass. Local Whisper via whisper.cpp is on the roadmap. |
| What about Windows and Linux? | macOS is GA. Windows is in private beta. Linux (PipeWire) is coming. |
| Can I run it fully offline? | Yes — point Yappr at a local whisper.cpp endpoint. The pill turns slate-grey to indicate local-only mode. |

First item open by default. Italic em inside summaries only on emphasis words. No weird spaces around em tags.

### Section 10 — Final CTA + footer

Cream gradient slab, centered.

**Headline (120px serif):** `Stop typing.<br><em>Start talking.</em>`
**Lede:** `Free forever. No account. Free Groq tier covers most users.`
**CTA:** "Download for Mac" with `⌘ ⇧ D` kbd
**Below CTA, 48px below:** the Yappr pill, full-size, just sitting there.

**Footer** (dark slab below the cream CTA):
- 4-column grid
- Left col: Yappr pill (small) + tagline "Voice dictation that respects your time and your typing."
- Cols 2–4: Product / Company / Legal link groups
- Bottom row: `© 2026 Yappr Labs · made in San Francisco`

No "MIT" / "made in public" / "GitHub" anywhere.

---

## Open assets

All Section 5 logos now in place:
- ✓ `claudecode.png` — Claude Code orange icon
- ✓ `cursor.png` — Cursor icon
- ✓ `chatgpt.png` — ChatGPT mark
- Terminal uses the `›_` mono placeholder by design (it's the actual macOS Terminal idiom — no logo override needed)

Hero / Polish / Dictionary logos (Slack, iMessage, Gmail) all in place.

---

## Pre-launch checklist

Visual:
- [ ] No emojis as icons (SVG/PNG only)
- [ ] All app logos load from `assets/logos/`
- [ ] Pill spec matches `/Users/noanborel/Yappr` source verbatim
- [ ] No "open source" / "MIT" / "fork" / "GitHub stars" anywhere
- [ ] Italic em used only on differentiator nouns
- [ ] Cream is the only background — no dark mode

Motion:
- [ ] `prefers-reduced-motion: reduce` honored — all auto-loops disabled, end states shown
- [ ] Hero cycles autonomously, no manual tab clicks (`pointer-events: none` on tabs)
- [ ] Section 3 mic respects 15s max + 5/IP/day cap
- [ ] Section 4 cycles 4s per panel
- [ ] Section 5 cycles 8.5s per app
- [ ] No hover-to-pause anywhere (causes desync)

Backend:
- [ ] Edge function deployed, env vars set
- [ ] Upstash Redis configured, free tier
- [ ] IP hash salt set per deploy
- [ ] `DAILY_KEY_CEILING_USD=50` enforced
- [ ] Audio never persisted (verify with traffic log audit)

Accessibility:
- [ ] WCAG AA contrast on cream + ink
- [ ] All buttons have 44×44 hit targets
- [ ] All icons have `aria-label`
- [ ] All logos have `alt` text
- [ ] Focus rings visible (`outline: 2px solid #15161a; outline-offset: 3px`)
- [ ] Tab order matches visual order
- [ ] `html { scroll-behavior: smooth }`

Responsive:
- [ ] 375 / 768 / 1024 / 1440 all tested
- [ ] No horizontal scroll
- [ ] Hero stage collapses gracefully on mobile (apps stack instead of overlay)
- [ ] Section 3 mic stage stacks 1-col on mobile
- [ ] Section 5 sidebar collapses to top bar on mobile

Performance:
- [ ] Bundle < 200KB JS
- [ ] LCP < 2.5s on slow 4G
- [ ] Fonts subset + `font-display: swap`
- [ ] Images: WebP, `loading="lazy"` below the fold
- [ ] No external trackers / analytics for v1
