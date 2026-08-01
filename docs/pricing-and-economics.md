# Yappr Pricing & Economics

**Status:** Draft, decided but not implemented. Holds the Pro-tier plan, Groq
unit economics, infra build-out, and rationale so the next session doesn't
re-derive any of it.

**Last updated:** 2026-07-29

> **⚠️ 2026-07-29 — Free goes uncapped; Pro drops to $9. (User decision.)**
> Supersedes the metering plan below. The landing page ships this now.
>
> - **Free = unlimited dictation with cleanup.** No weekly word cap, no card.
>   Fillers, stutters, false starts and brand-name fixes included. Affordable
>   precisely because of the 2026-06-02 change: transcription is local (~$0)
>   and cleanup is rounding-error COGS (~$0.002–$0.14/user/mo), so metering
>   Free was costing conversion without saving meaningful money.
> - **Pro = $9/mo** (down from $10). The gate is now *features*, not volume:
>   **prompt shaping**, **select-and-rewrite**, **persistent context**, and
>   **per-app polish**. Note per-app polish moves from Free into Pro.
> - **No Lifetime tier** anywhere in the UI (decided 2026-06-02, now reflected).
> - **No card required to try Pro.**
>
> Open risk: Free no longer has a usage lever. If cleanup COGS stops being
> rounding-error (larger model, longer dictations), the only remaining levers
> are price or re-introducing a cap. Watch cleanup spend per active user.

> **⚠️ 2026-06-02 — Local-default transcription changes the metering anchor.**
> The streaming-transcription work (`docs/superpowers/specs/2026-06-02-streaming-
> transcription-design.md`) makes **local on-device transcription the default** on
> capable hardware, at the **Accurate (`large-v3-turbo`)** tier. This removes the
> dominant COGS line item — **cloud whisper minutes** — for most users; llama cleanup
> remains, and it is rounding-error (~$0.002–$0.14/user/mo even for a power-monster).
>
> **What changes:**
> - **The meter moves from cloud-transcription-minutes → cloud-cleanup-words.**
>   Transcription is now free/local/unlimited for everyone; the single thing Free is
>   limited on is **cloud LLM cleanup** (keep ~2,000 words/week), plus the **context-
>   memory** feature gate.
> - **Free gets *better* transcription than the old plan** (Accurate, unlimited,
>   private) at ~$0 COGS. Over-cap Free users degrade gracefully to local-transcript +
>   regex (still usable) — that gap is the upgrade incentive.
> - **Pro ($10/mo) stays the structure** but is repositioned around *cleanup quality +
>   features*: unlimited cloud LLM cleanup at all strictness, **context memory**,
>   command mode, emoji.
> - **No lifetime license, no local LLM** — explicitly decided to keep it a simple,
>   standard SaaS. (Supersedes the "lifetime worth considering" note below and the
>   v1.1 lifetime-tier idea for this product.)
> - **The proxy now carries only cheap cleanup traffic**, so the power-monster margin
>   risk and the whisper-RPM ceiling concerns below are largely mooted for local-
>   default users. The per-user-cost tables below remain accurate *for cloud-fallback
>   users only*.

## TL;DR

- **Free**: 2,000 words/week of cloud cleanup + cloud transcription, plus
  unlimited local Whisper (Fast/Balanced tiers). No card required.
- **Pro**: **$10/mo** or **$96/yr** ($8/mo equivalent). Unlimited
  cloud transcription, full cleanup, command mode, emoji, all features.

Hard rule decided: **users do NOT bring their own Groq key in the managed
plan.** Yappr runs everything through our own Groq account behind a
backend proxy. BYOK stays available as an "advanced" toggle so existing
users aren't broken, but it's not the default flow.

## Pricing model

### Option B (chosen)

| Plan | Price | What's included |
|---|---|---|
| **Free** | $0 | • 2,000 words/week of cloud transcription + polish<br>• Unlimited local Whisper (Fast / Balanced tiers, no cloud call)<br>• Brand-name fixes (`QUICK_FIXES` regex)<br>• Light cleanup (regex filler/stutter strip)<br>• No command mode, no emoji injection, no LLM polish on long-form |
| **Pro** | $10/mo or $96/yr | • Unlimited cloud transcription (Groq whisper-large-v3-turbo)<br>• Full LLM cleanup at all strictness levels<br>• Command mode (rewrite-my-selection)<br>• Emoji-in-messages injection<br>• Priority queue if Groq gets backed up<br>• Access to all local model tiers including Accurate (large-v3-turbo) |

### Option A (considered, rejected)

A hard-paywall "Pro $10/mo or local-only" model was on the table. Rejected
because the free 2,000-words-per-week tier is what every competitor offers
(Wispr, Willow) and serves as a real demo — users see what they're missing
rather than just reading a feature list. Conversion improves dramatically.

### Why $10/mo (and not $15 like the competition)

- Wispr Flow: $15/mo, $144/yr ($12/mo annual)
- Willow Voice: $15/mo, $144/yr ($12/mo annual)
- Superwhisper: $8.49/mo, $84.99/yr, **$249.99 lifetime** (BYOK on cloud LLM)
- MacWhisper: €59 (~$69) lifetime (file transcription, weak comp)

$10/mo undercuts Wispr/Willow by 33% — clear positioning as the "indie
honest pricing" option. The 90%+ margin floor (see below) means we can
afford to undercut without burning runway.

A lifetime option (~$199-249) is worth considering after Pro is established
— it converts well in the indie Mac app market (MacWhisper, Superwhisper
both do it) and locks in revenue early.

## Unit economics — Groq COGS per user

All numbers assume:
- **whisper-large-v3-turbo** transcription ($0.04/hr = $0.000667/min)
- **llama-3.1-8b-instant** cleanup ($0.05/M input, $0.08/M output)
- Prompt caching enabled (~40% reduction on input tokens — system prompt
  is ~500 tokens, reused every call)
- ~70% of dictations actually hit cleanup (30% skip via regex fast path
  for short/clean conversational dictation)
- Average cleanup output: 150 tokens (300 for heavy users on long-form)

### Per-user monthly cost

| User type | Dictations/mo | Audio min/mo | Cleanup calls | Whisper cost | Llama cost | **Total/mo** |
|---|---|---|---|---|---|---|
| **Light** (7/day, 15s) | 210 | 53 | 147 | $0.035 | $0.0023 | **~$0.04** |
| **Medium** (25/day, 20s) | 750 | 250 | 525 | $0.167 | $0.008 | **~$0.18** |
| **Heavy** (120/day, 25s) | 3,600 | 1,500 | 2,520 | $1.000 | $0.057 | **~$1.06** |
| **Power-monster** (300/day, 25s) | 9,000 | 3,750 | 6,300 | $2.500 | $0.14 | **~$2.64** |

**Observations:**
- Whisper minutes dominate. LLM cleanup is rounding error.
- Even a power-monster user costs ~$2.64/mo. At $10/mo Pro, that's still
  74% margin on the worst case.
- Typical Pro user (light-to-medium): ~$0.04-0.18 → **97-99% margin**.

### What happens if we use whisper-large-v3 (non-turbo) instead

Turbo is 2.78× cheaper. If we ever revert (we shouldn't — bench shows
they're indistinguishable on dictation audio), costs scale up:

| User type | Whisper cost on v3 | New total/mo |
|---|---|---|
| Light | $0.098 | $0.10 |
| Medium | $0.464 | $0.47 |
| Heavy | $2.78 | $2.84 |

Still profitable at $10/mo on a heavy user (~72% margin) but loses margin
headroom for the power-monster outliers.

### What happens with llama-3.3-70b-versatile cleanup

70B is ~11.8× more expensive than 8B. We considered this for higher-quality
long-form polish. Quality delta on dictation cleanup is small but real on
list formatting and emoji judgment. Math:

| User type | Llama cost on 70B | New total/mo |
|---|---|---|
| Light | $0.027 | $0.06 |
| Medium | $0.094 | $0.26 |
| Heavy | $0.67 | $1.67 |

Worth keeping 70B in reserve as a future "Pro Plus" tier or as a
context-aware fallback for very-long-form dictations. Default stays at 8B.

## Rate limits at scale

Groq's published Developer-tier limits (rough multiples of free tier):

- **Whisper RPM**: ~200 (free is 20)
- **Whisper audio-seconds/hour**: ~72,000 ASH (free is 7,200)
- **Llama 8B RPM**: ~300 (free is 30)
- **Llama 8B TPM**: ~60,000 (free is 6,000)
- **Llama 8B RPD**: ~500,000 (free is 14,400)

### Stress test: 1,000 daily active users

- 20,000 requests/day distributed evenly = 14 RPM. Trivial.
- **9am peak (30% of DAU in one hour)**: ~6,000 requests in 60 min, peaks
  of 200–300 RPM. **Hits the Whisper 200 RPM ceiling at peak.**

### Mitigation when we get there

1. **Request a higher org-level rate limit from Groq** before we hit 500 paying users
2. **Add request queueing in the proxy** — back-pressure burst traffic so it smooths over 30-60s
3. **Regional routing** — split traffic between US-East and EU regions if/when Groq exposes those endpoints

At 100 paying users the rate limits are not a concern.

## Speed levers under managed mode

What we can do that we couldn't do under BYOK:

### Prompt caching
Groq supports exact-prefix caching with 50% discount on cached tokens.
Our system prompt is ~500 tokens, reused every call. With 120 tokens of
fresh transcript per call, input cost drops ~40%. Also frees TPM headroom
on bursts. **Free win, just configure on the proxy.**

### Streaming Groq responses
`stream: true` on the cleanup call. Words appear in the indicator as Groq
produces them. Currently we wait for the full response. Same UX win as the
(now-hidden) Whisper streaming, but on a hotter path because cleanup is
THE bottleneck on long dictations.

### Geographic proxy routing
Cloudflare Workers run at the edge — Groq's US-East endpoint is closest to
most users. Save 50-150ms RTT vs the user → us-west-2 → Groq round-trip.

### Smart model routing per dictation
- Short dictation, no cleanup needed → skip Groq entirely (already done)
- Medium dictation → llama-3.1-8b-instant (cheap, fast, indistinguishable
  from 70B on cleanup tasks)
- **Future**: long-form (>500 chars), strict polish requested →
  llama-3.3-70b-versatile. Adds ~$0.001 per call, noticeably better prose.
  Gate behind "Pro Plus" tier or just ship for everyone on Pro.

### Whisper turbo over v3
Already done in `2859d04`. 2.78× cheaper, slightly faster, same WER on
dictation audio.

### Open-source / alternative models worth A/B testing later

> **2026-06-03 correction (13-agent research, verified against Groq docs).**
> The earlier note that **`gpt-oss-20b`** is "cheaper than llama-8b with
> similar quality" was **wrong on all three counts** and has been struck:
> - **Not cheaper** — $0.075/M in, $0.30/M out = **1.5× input / 3.75× output**
>   vs `llama-3.1-8b-instant` ($0.05 / $0.08). More expensive at any token mix
>   (reasoning tokens bill as output, widening the gap).
> - **Not faster** — it is a **reasoning model** (harmony chain-of-thought).
>   `reasoning_effort` floors at `low` (no `none`), so it emits CoT tokens
>   *before* the answer → ~3s time-to-first-answer-token on Groq. For SHORT
>   cleanups latency is TTFT-bound, so the ~1000 TPS headline is irrelevant —
>   and cleanup becomes the post-release bottleneck once streaming ships.
> - **Not higher quality** — IFEval ~69.5%, **below** `llama-3.1-8b`'s 80.4%.
>
> Reasoning models also risk pasting CoT into output: `groq.ts` reads
> `message.content` verbatim with no `<think>`/`message.reasoning` guard.
> Hide CoT via `include_reasoning:false` (NOT `reasoning_format`, which is
> unsupported for gpt-oss). **Verdict: avoid `gpt-oss-*` for cleanup.** Full
> scorecard in the 2026-06-03 decision-log entry below.

- **`llama-3.3-70b-versatile`** is the right "bigger model" for a *routed*
  long-form / Strict tier (IFEval 92.1%, non-reasoning, predictable parsing)
  at ~11.8× COGS — Pro/Pro-Plus gated, never the default. See the 70B section
  above and "Smart model routing per dictation."
- **`llama-3.2-3b`**: even cheaper than 8b. Quality drops on prose
  restructuring but might be fine for simple filler removal.
- Higher ROI than any swap: **prompt caching**, **`stream:true` on cleanup**,
  and **smart per-dictation routing** (the sibling subsections above).
- A/B any candidate with `scripts/bench-groq-cleanup.mjs` (latency + output
  discipline + code-switch + COGS) before changing the default.

## Infrastructure to build

### Required for managed Pro mode

| Component | Stack | Effort | Monthly cost (1k users) |
|---|---|---|---|
| **Backend proxy** | Cloudflare Workers (or Fly.io / Render) | 2 days | $5 (Workers free tier covers most use cases up to ~10M requests/mo) |
| **Auth** | Clerk OR Supabase Auth | 1 day | Clerk: $25/mo, Supabase: free tier |
| **Billing** | Stripe Checkout + Customer Portal | 1 day | 2.9% + 30¢/transaction |
| **Usage counter** | Cloudflare KV or Redis | 0.5 day | Free tier covers most |
| **Account UI** | Login screen, plan-aware Settings panel | 1 day | — |
| **App integration** | Switch Groq SDK calls in main process to hit proxy | 0.5 day | — |

**Total: ~1 week of focused work.**

### Why a backend proxy is non-negotiable

You CANNOT ship the Yappr Groq API key embedded in the app binary. It
would be extracted within minutes (Electron apps are unpacked .asar
archives — anyone can read the source). The proxy keeps our key on a
server we control, validates the user's JWT before forwarding each
request, and tracks usage against the free-tier quota.

### Privacy positioning

Current copy: "Audio goes straight to your provider, Yappr never proxies"
— that was the BYOK pitch. Under managed mode we DO proxy, so the copy
needs updating:

- ✅ "Yappr never stores your audio. Each dictation is forwarded to
   Groq for transcription and discarded immediately."
- ✅ "Transcripts are passed through our cleanup pipeline once, then
   discarded. We never train on your dictations."
- ✅ "Pick Local in Settings to skip the cloud entirely — audio never
   leaves your Mac."

The Local option keeps the strongest privacy story intact, which is the
ace in the hole vs Wispr/Willow (who don't have credible offline mode).

## Concrete build order when ready

1. **Pricing UI placeholder** in Settings. Free tier active, Pro tier
   "Coming soon — sign up for early access." Just to anchor the model.
2. **Cloudflare Worker proxy.** Single endpoint, accepts JWT in
   Authorization header, validates against Clerk/Supabase JWKS, forwards
   to Groq. ~150 LOC.
3. **Clerk OR Supabase Auth.** Magic-link login. Embed in the app with a
   PKCE flow because we're a desktop app, not a browser.
4. **Stripe subscription.** $10/mo product, Checkout for new subs,
   Customer Portal for management. Webhook to update user plan in
   Clerk/Supabase user metadata.
5. **Usage tracker.** Cloudflare KV bucket keyed by `userId:weekStartIso`.
   Decrement on every request, reject when over free-tier limit.
6. **App Settings: Account panel.** Shows current plan, usage bar (for
   free users), upgrade CTA, manage subscription button.
7. **Switch main-process Groq SDK calls** to point at the proxy URL
   instead of api.groq.com. SDK doesn't care about hostnames since it
   takes `baseURL` as an option.

### Migration path for existing BYOK users

Don't force-migrate. Add a setting toggle `useManagedCloud: boolean`
defaulting to **true for new users, false for users with an existing
groqKey**. The Settings → AI Provider tab gets a switch:

- ✅ "Use Yappr Cloud (Pro)" — default for new installs
- ⚪ "Bring your own Groq key" — for advanced users

This way the people who set up BYOK still work after the upgrade, and we
don't break anyone's setup.

## Risks to acknowledge

### You become responsible for uptime
When Groq is down, your users are stuck. Under BYOK they could blame Groq;
under managed they blame Yappr. **Mitigation:** keep Local mode working
as a graceful fallback. When the proxy returns 503, the app can offer
"Switch to Local mode for this dictation?" with one click.

### Power-monster users could eat margin
A 1% outlier user dictating 8 hours/day costs ~$10/mo on Groq. At $10
subscription, that's break-even. **Mitigation:** soft fair-use clause in
ToS ("typical use is up to ~3 hours of dictation per day"), monitor for
abuse, throttle individuals before they hit Groq's organization-wide cap.

### Privacy positioning gets murkier
Cleaner messaging needed. The Local option holds — must stay prominent
in onboarding so users who want pure offline see it before they see Pro.

### Stripe abuse / refund chargebacks
Implementation detail but real. Use Stripe Radar (built-in) and a
mandatory 7-day trial that requires a card. Cancel-before-trial-ends is
free, so the friction is small for honest users.

## Open questions

- **Geographic pricing**: should we discount in markets where $10/mo is
  prohibitive (LATAM, SEA)? Stripe supports it. Decide at launch.
- **Team / Family plan**: Wispr does $10/seat for teams. Worth it for the
  first 100 users? Probably not until product-market fit on individual is
  clear.
- **Lifetime deal**: $199-249 lifetime conversion would help cash flow at
  launch. Industry standard in indie Mac apps. Consider for launch promo.
- **Free trial length**: 7-day with card? 14-day? Or just free-tier
  forever and let upgrade demand emerge organically? Recommend the latter
  — friction of card collection drops free signups by 50%+ and the
  free-tier COGS is so low (~$0.02/user/mo) that we can absorb non-paying
  signups indefinitely.

## See also

- `docs/local-whisper-spec.md` — the on-device transcription spec
- `scripts/bench-groq-whisper.mjs` — A/B bench for Groq Whisper models
- `scripts/bench-groq-cleanup.mjs` — A/B bench for Groq cleanup LLMs (latency / discipline / COGS)
- `src/main/pipeline.ts` — current cleanup + transcription pipeline
- `src/shared/constants.ts:140` — `MODELS.groq` defaults

## Decision log

- **2026-05-17**: User decided on Option B (Free + $10/mo Pro). Switched
  default transcription model to whisper-large-v3-turbo (2.78× cheaper,
  same WER). Backend proxy / auth / billing deferred until app is ready
  to ship.
- **2026-06-02**: Streaming-transcription spec makes **local on-device
  transcription the default** at the Accurate tier. Metering anchor moves
  from cloud-transcription-minutes → **cloud-cleanup-words**; context
  memory becomes the Pro feature gate. **No lifetime license, no local
  LLM** — decided to keep a simple two-tier SaaS like the rest of the
  market. COGS collapses ~95% (whisper minutes gone; llama cleanup is
  rounding-error). See the banner at the top of this file and the
  streaming spec §9.
- **2026-06-03**: Researched adopting a newer Groq chat model for the
  **cleanup** pass (13-agent workflow, adversarially verified). Decision:
  **keep `llama-3.1-8b-instant` as the default.** For short cleanups latency
  is TTFT-bound (not steady-state TPS), and cleanup becomes the dominant
  post-release cost once streaming ships — so the high-TPS *reasoning* models
  (`gpt-oss-20b/120b`, `qwen3-32b`) regress it. `gpt-oss-20b` is also more
  expensive AND lower-IFEval than 8b (corrected note in "alternative models"
  above). `llama-3.3-70b-versatile` is reserved for a *routed* long-form /
  Strict (Pro-Plus) tier, not the default. Prefer prompt caching + `stream:true`
  + per-dictation routing over a swap. Added `scripts/bench-groq-cleanup.mjs`
  to A/B latency + output-discipline before any change. Orthogonal to the
  `transcribeCore` seam; sequence after the Phase-0c `runDictationPipeline`
  extraction (shares the `pipeline.ts` cleanup region).
