# Hosted inference + closed beta — design

**Status:** revised 2026-09-03 against `docs/ARCHITECTURE.md`, which
supersedes the first draft on pricing and on metering.
**Scope:** the proxy, auth, and abuse control that
`docs/ARCHITECTURE.md` lists as absent.

## What this builds

`docs/ARCHITECTURE.md` records the commercial decision — monthly
subscription, no user-supplied key — and names four things the
repository lacks: **a proxy**, **auth**, **metering and abuse
control**, and **a revised privacy claim**. The fourth is already
applied to the site. This spec covers the first three.

Pricing is *not* open here. It is decided
(`docs/pricing-and-economics.md`, 2026-07-29): **Free is unlimited
dictation with cleanup, no card. Pro is $9/mo and gates features —
prompt shaping, select-and-rewrite, persistent context, per-app
polish. No Lifetime tier.**

## Corrections to the first draft

The first draft was written before `docs/ARCHITECTURE.md` existed and
got three things wrong. Recorded so the reasoning is not repeated:

1. **It metered Free.** It proposed per-day and lifetime dictation caps
   as product mechanism. `pricing-and-economics.md` had already
   rejected exactly that: cleanup is **~$0.002–$0.14/user/mo**, so
   *"metering Free was costing conversion without saving meaningful
   money."* Volume limits survive only as anti-abuse ceilings, set
   where no human reaches them.
2. **It gated on volume, not features.** Pro sells four features. The
   proxy's job is to answer *is this user Pro*, not *how much have they
   used*.
3. **It ended beta with an expiry cliff, then offered BYOK.** Free is
   unlimited and permanent, so a tester simply drops to Free and keeps
   working. There is no cliff to design and no key to fall back to.

## Architecture

```
hotkey release ─ t0 ─────────────────────────────────────────►
   ├─ transcribe   LOCAL, parakeet          — audio never leaves the Mac
   ├─ route        local, pure
   ├─ cleanup      Supabase Edge Function ──► Groq   (text only)
   ├─ passes       local, pure
   └─ paste
```

Transcription stays on-device. It is free (~37ms at 1s), and it is the
only reason *"your voice never leaves your Mac"* survives the move to a
subscription. `src/main/provider-lock.ts` now enforces it with tests.

Only cleanup is proxied, and cleanup was already a network call — the
change adds one hop, not a new round trip.

### Why a proxy, and why Supabase

If Yappr pays for inference, the key lives on the user's machine or on
a machine Yappr controls. `app.asar` is a zip, and obfuscation is
irrelevant anyway because the key must travel in an `Authorization`
header the user can read off their own wire. There is no third option.

Supabase Edge Functions are the built-in form of this — the
"authenticated relay" is a documented pattern: hold the key in
`Deno.env`, verify the caller with `supabase.auth.getUser(jwt)`,
forward. Auth, the metering tables and the secret live in one project.

**Supabase does not provide the metering.** Its Edge Function rate
limit counts only function-to-function recursion; inbound requests and
outbound calls to external APIs are exempt. Per-user counters are ours
to write. No third-party gateway can do it either — only our database
knows who our users are.

## Client change is a baseURL swap

`groq-sdk` accepts `baseURL` (`node_modules/groq-sdk/index.d.ts:16`),
and `getClient` (`src/main/providers/groq.ts:13`) is the single seam
every cleanup path funnels through — `createGroqCleanupProvider`,
`judgeEmoji`, and the compactor.

```ts
new Groq({ apiKey: supabaseAccessToken, baseURL: PROXY_URL })
```

The proxy is wire-compatible with `/openai/v1/chat/completions`, so
retry logic, 429 handling and `CLEANUP_RETRY_CAP_MS` keep working
untouched. `pipeline.ts:109-116` is already the local-transcription +
cloud-cleanup branch; it is repointed, not rewritten.

## Auth: email OTP

`signInWithOtp` → six-digit code by email → `verifyOtp` → session.
Chosen over OAuth/PKCE because it needs no `yappr://` protocol
handler, no callback server and no browser round-trip — the expensive
part of desktop OAuth. Session tokens go in Electron `safeStorage`
(Keychain-backed), never `electron-store`, which is plaintext on disk.

Beta is closed: sign-up gated on an `invited_emails` allowlist.

## Entitlement model

| State | Dictation + cleanup | The four Pro features |
|---|---|---|
| `free` | unlimited | no |
| `pro_trial` (7d, no card) | unlimited | yes |
| `pro` ($9/mo) | unlimited | yes |
| `beta` (comped) | unlimited | yes |

Beta testers sit in `beta`. When beta ends they become `free` — the app
keeps working, unlimited, minus the four features. That is the upgrade
incentive and it needs no expiry machinery.

The 7-day trial is real product, not beta scaffolding: pricing says
*no card required to try Pro*, which is what the timer implements.

## Data model

```
invited_emails   email PK, invited_at
profiles         user_id PK, email, state, trial_started_at,
                 pro_since, revoked
usage_counters   user_id, minute_bucket, day_bucket, requests, tokens
usage_totals     day PK, tokens          -- global kill-switch input
```

**No transcript text is stored anywhere, ever.** `usage_counters`
holds counts. The FAQ promises text is *"never stored, never sold,
never used to train anything"* — under BYOK that was the provider's
promise, and behind the proxy it becomes ours.

**The Edge Function must not log request or response bodies.** The
Supabase relay example in the docs does `console.log(e.data)`; doing
that with cleanup text puts transcripts in Supabase logs and breaks
the promise above. Log token counts and status codes only.

## Abuse control

Three layers, not five. Free is deliberately unmetered, so these exist
to catch machines, not to shape the product.

| Layer | Value | Stops |
|---|---|---|
| Per-minute burst | 20 req/min/user | a runaway client loop |
| Global daily ceiling | ~$5/day equivalent | catastrophe, any cause |
| Revocation | `profiles.revoked` | a specific bad actor |

20/min is roughly 3× the fastest sustained human dictation rate, so no
legitimate user meets it. The global ceiling is the only hard
protection against a class of failure we have not thought of; it
bounds worst case regardless of user count.

## Failure modes

- **Proxy down, offline, or ceiling tripped** →
  `createLocalCleanupProvider()` (`pipeline.ts:114`) already exists.
  Text still lands, without LLM polish. Correct degradation.
- **Groq 429** → existing `CLEANUP_RETRY_CAP_MS` logic, unchanged.

### Throughput is the real constraint

`constants.ts:324` records a cleanup call at ~4,400 tokens. On an
8,000 TPM tier that is under 2 dictations per minute across the whole
beta — testers would 429 each other into raw-transcript fallback and
the app would look broken. **A Groq tier upgrade is a hard beta
blocker, not an optimisation.**

## Code and copy debt

- `settings.provider.groqKey` (`types.ts:25`), the Settings field
  (`GeneralTab.tsx:205-219`) and `AITab.tsx:117` — remove. This also
  closes `IPC.SETTINGS_GET` (`ipc.ts:70`) handing a plaintext key to
  every renderer.
- `pipeline.ts:1334` — *"Add a key in Settings → General"* is wrong
  under a subscription, and per ARCHITECTURE.md user-facing copy names
  no models or providers.
- `CLAUDE.md` — already updated 2026-09-03.
- `YapprLanding/CLAUDE.md` and `FAQ.tsx` — **already correct.** Both
  record the removal of *"our servers are not in the path"* and now say
  *"your voice never leaves your Mac"* (2026-08-30). No action.
- `README.md:24` — **fixed 2026-09-03.** Carried *"Yappr's servers are
  never in the path"*, true today and false behind the proxy. Replaced
  with the audio claim, which holds in both worlds.
- `README.md` otherwise — tagline *"Bring your own API key"*, the
  paste-a-Groq-key setup step, the *"How much does BYOK actually
  cost?"* section, and a reference to `llama-3.1-8b-instant`, which
  Groq decommissioned. Deliberately NOT fixed: CLAUDE.md records the
  BYOK gap as tracked, not accidental. Lands with the client cutover.
- `YapprLanding/docs/specs/landing-page-design-spec.md:327` — stale FAQ
  answer describing the BYOK flow. Same treatment, same time.
- `docs/legal-audit-2026-05-17.md` — reads "no proxy" as part of a
  strong posture. That assumption expires here.

## Security

Done 2026-08-31 → 09-03:
- `src/main/redact.ts` + tests — scrubs secrets by field name and by
  value shape on every path into `yappr.log`
- `src/main/provider-lock.ts` + tests — pins transcription on-device,
  including a test that fails if `store.ts` stops calling it
- `.gitignore` covers `.env*`, `*.p8`, `*.p12`

Audited clean: no key literals in tracked source or in full git
history; no `.env` tracked; no telemetry or crash reporter.

Remaining: Groq key exists only as an Edge Function secret;
service-role key never ships in the client; RLS on every table.

## External verification needed

The FAQ now promises, on our behalf, that text is never used to train
anything. **Groq's data-retention and training terms must be confirmed
in writing before the proxy ships.** If they do not match, the copy
changes first.

## Distribution

Apple Developer **individual** enrolment, Developer ID Application
cert, notarization via an App Store Connect API key, then
`notarize: true` in `electron-builder.yml:81` — currently `false`,
which is why a DMG built today is Gatekeeper-blocked. `hardenedRuntime`
and entitlements are already correct; publish is already GitHub
releases with versionless artifact names.

## Out of scope for beta

Paddle checkout, public sign-up, cloud transcription.
Beta testers are comped, so nothing charges during beta.

---

# The paywall

Added 2026-09-03. Tier contents are recorded in `docs/ARCHITECTURE.md`
(amended the same day); this section covers mechanism.

## Tiers

| | Free | Pro ($9/mo) |
|---|---|---|
| Dictation + cleanup | unlimited | unlimited |
| Prompt shaping | yes, on 3 facts | yes, full context |
| Remembered facts | **3** | unlimited |
| Overview paragraph | no | yes |
| Select and rewrite | no | yes |
| Per-app polish | no | yes |

Implemented once in `src/shared/entitlements.ts`. Nothing else branches
on plan name.

## Where each gate is enforced

| Feature | Enforced | Why |
|---|---|---|
| Select and rewrite | **server** | a distinct request mode the proxy sees |
| Fact cap | client | facts never leave the Mac — see below |
| Overview | client | same |
| Per-app polish | client | it is prompt wording, invisible server-side |

**The context cap cannot be server-enforced.** Facts live in local
SQLite and are assembled by `context/prompt-injector.ts`. Enforcing a
cap server-side means shipping the user's fact store to us, which
contradicts the "never stored" commitment. So the proxy rejects what it
can see cheaply and the cap lives in the client.

An `app.asar` unpacker can lift the cap. Accepted, on the arithmetic
that stopped us metering Free: cleanup is ~$0.002–$0.14/user/mo, so the
leak is worth cents and closing it would cost a privacy promise.

The proxy still applies a total-prompt-token ceiling for `free`, which
bounds the leak without inspecting what the context contains.

## How the paywall actually works, end to end

1. **Paddle Checkout** opens in the system browser from Settings.
   Paddle is Merchant of Record, so it handles VAT/sales tax
   registration and remittance — the reason to prefer it over Stripe
   for a solo EU-based seller.
2. **Paddle webhook → Supabase Edge Function.** On
   `subscription.created` / `.updated` / `.canceled`, verify the
   webhook signature, then set `profiles.state`. The webhook is the
   only writer of that column; the client never sets its own plan.
3. **Client reads entitlement** from its session at launch and after
   checkout, caches it in `safeStorage`, and renders locks and the
   "3 / 3 remembered" counter from `entitlementsFor(plan)`.
4. **Proxy re-checks on every cleanup call.** The client's cached plan
   is a UI hint; `profiles.state` is the authority.

Paddle is **not needed for beta** — testers are `beta`, which is Pro,
and nothing charges. Steps 1 and 2 are post-beta work. Steps 3 and 4
are needed for beta, because the beta build must already know what a
plan is.

## Trial

`pro_trial` for 7 days, no card, per "No card required to try Pro".
On expiry the user becomes `free` — the app keeps working, unlimited,
minus the four features. There is no cliff and nothing to fall back to.

## UI — deliberately not designed yet

Locks and the counter hang off `entitlementsFor()`, which now exists.
The visual design of the upgrade surface is a separate piece of work
and should not be guessed at inside this spec.

One constraint it must respect: the indicator's centre stays true black
so it disappears into the notch. **No upsell may render in the
indicator.** Settings and onboarding are the surfaces.
