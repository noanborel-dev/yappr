# Yappr — source of truth

**What this is.** The one file that records what Yappr *is*, how it is
built, and how it makes money. When something here disagrees with a spec,
a plan, or a marketing page, **this file wins** and the other should be
corrected.

**Last updated:** 2026-08-30

> **Read this before answering questions about the business model.** It was
> written because an assistant, working only from the code and the landing
> page, concluded Yappr was bring-your-own-key and asked the user to confirm
> it. That was a reasonable reading of the repository and the wrong answer.
> See "The model changed" below.

---

## The product

Push-to-talk dictation for macOS. Hold a hotkey, speak, release; cleaned
text lands at the cursor. Electron + React + TypeScript.

Everything is in service of the wall-clock between **hotkey release** and
**text on screen**. Anything before release is free — the user is still
talking. `runDictationPipeline` in `src/main/pipeline.ts` owns that path.

Four features carry the product: **prompt shaping**, **select and
rewrite**, **persistent context**, and **per-app polish**.

**Closed source.** Never describe it as OSS, MIT-licensed, auditable,
self-hostable or forkable.

---

## The model changed — subscription, not BYOK

**Users pay a monthly subscription. They do not bring an API key.**

This is the current commercial decision and it is not yet reflected in the
code or the marketing site. Both still describe and implement the older
bring-your-own-key model.

### What the repository says today

| Where | What it currently says or does |
|---|---|
| `src/main/store.ts`, Settings → General | Stores `provider.groqKey`; the user pastes their own |
| `src/main/pipeline.ts` | Refuses select-and-rewrite with *"needs the cleanup service. Add a key in Settings → General."* |
| `src/main/providers/groq.ts` | Calls Groq directly from the user's machine with that key |
| `CLAUDE.md` | *"The differentiation is creative product + BYOK transparency"* |
| `YapprLanding/CLAUDE.md` | Same, plus *"audio goes mic → your provider directly, our servers are not in the path"* — marked **approved verbatim** |
| `YapprLanding` FAQ | Carries that privacy claim on the live page |

### What subscription-without-a-key requires

Each of these is currently absent:

1. **A proxy.** Cleanup calls must go through a Yappr-controlled endpoint
   holding the platform key, not from the user's machine to Groq.
2. **Auth.** The client needs an identity to present. `settings.licenseKey`
   exists as a field but nothing validates it against a server.
3. **Metering and abuse control.** With BYOK the user's own quota was the
   limit. On a platform key, one user's runaway loop is Yappr's bill. Note
   `docs/pricing-and-economics.md` already flags that Free has no usage
   lever — that risk becomes real the moment the key is ours.
4. **A revised privacy claim.** This is the important one.

### The privacy claim — precisely which half breaks

Split audio from text. They are not in the same position, and conflating
them either overstates the problem or hides it.

**Audio — safe, but only by a decision you must keep making.**

Audio does not leave the machine today, and this is stronger than a
default: `getSettings()` in `src/main/store.ts` **hard-coerces**
`provider.provider = 'local'` on every single read. The cloud-transcription
branch in `buildProviders` is therefore unreachable in the shipping build.

That is also a trap. Delete one line of coercion and
`createGroqTranscriptionProvider` starts uploading audio, with no other
code change and nothing on screen to say so — and the FAQ's *"the audio
doesn't leave the machine at all"* becomes false silently. **Keep
transcription on-device.** It is free (Parakeet, ~37ms at 1s) and it is the
only reason the audio claim survives the move to a subscription.

**Transcripts — this is the claim that actually breaks.**

The transcript text already goes to a cloud model for cleanup; that is not
new. What is new is *whose* server. Today it goes from the user's machine
to Groq under the user's own key, so **Yappr never sees it**. Behind a
proxy, every transcript passes through Yappr's infrastructure.

So the position after the change is:

| | Today (BYOK) | Behind the proxy |
|---|---|---|
| Audio | Never leaves the Mac | Unchanged, **if** transcription stays local |
| Transcript text | Goes to Groq, not to Yappr | **Goes through Yappr** |
| Keys | The user's own | There are none |

*"Our servers are not in the path"* is true today and false behind the
proxy. The honest replacement keeps the strong half and drops the part
that stops being true: *your audio never leaves your Mac — transcription
runs on-device. The text is sent for cleanup and is never stored or
trained on.*

**Decided 2026-08-30.** The site now says the strong true thing and stops:
*your voice never leaves your Mac.* It no longer claims our servers are
out of the path, and it does not volunteer that text passes through us.
The standing rule is **never write the opposite of what is true** — if
something stops being true, remove the claim rather than soften it.

Two consequences already applied to the site:

- **No model names.** "What runs the cleanup?" is deleted, and Groq,
  Whisper and Parakeet are gone from the FAQ, the persistent-context demo
  and the hero. Nobody buying a dictation app is choosing a transcription
  model, and naming one dates the page — that FAQ answer was still
  advertising a Whisper tier the product had retired.
- **The "Built with Llama" credit was removed** (2026-09-02) — from the
  footer, the README and `THIRD_PARTY_LICENSES.md`. It was required while
  the pipeline called `llama-3.1-8b-instant`; Groq decommissioned the
  llama-3.x line, the model started returning 404, and cleanup moved to
  `openai/gpt-oss-20b`. Displaying it after that was claiming a model the
  product does not use. gpt-oss is Apache-2.0, whose notice obligations
  attach to redistributing the work — Yappr calls it over an API — so
  there is no equivalent line to display. Worth a second opinion before
  release. The trademark notice stays, with OpenAI in place of Llama.

**Two commitments the copy now makes that the proxy has to honour.** The
FAQ says the text is *"never stored, never sold, never used to train
anything."* Under BYOK that was the provider's promise to the user.
Through a proxy it becomes ours: do not persist transcripts server-side,
and confirm the inference provider's terms match. If either cannot hold,
the copy changes before the proxy ships.

**The legal audit predates this.** `docs/legal-audit-2026-05-17.md` reads
"no proxy" as part of a genuinely strong posture. That assumption expires
with this change and the audit should be revisited.

---

## Pricing

Live decision (2026-07-29, see `docs/pricing-and-economics.md` for the
economics and the history):

- **Free** — unlimited dictation. Cleanup is capped at **2,000 words a
  week**; over the cap it degrades, it does not stop. No card. Keeps
  **prompt shaping** and **three remembered facts**; no overview paragraph.
- **Pro — $9/mo.** Gates *features*, not volume: **select and rewrite**,
  **per-app polish**, and **unlimited persistent context** — every fact plus
  the compacted overview. Prompt shaping runs on Free too, on the
  three-fact layer, so Pro makes it visibly better rather than switching
  it on.
- No Lifetime tier. No card required to try Pro.

**Amended 2026-09-03 (b) — Free is metered again at 2,000 words/week.**
This reinstates the pre-2026-07-29 cap that "unlimited" replaced. The
economics that removed it are unchanged and the cap is *not* a cost
control — cleanup is ~$0.002-$0.14/user/mo, so it saves pennies. What
changed is the other side of the trade: Free now also carries prompt
shaping and three facts (see below), and unlimited volume on top of that
left little reason to pay. The cap restores a recurring moment where
upgrading is the obvious move.

**Over the cap is a downgrade, not a wall.** Dictation continues;
cleanup falls back to `createLocalCleanupProvider()` plus the
deterministic passes in `text-passes.ts`, which still fix brand names,
the dictionary, self-corrections and question marks. `pricing-and-
economics.md` already described this shape — "over-cap Free users degrade
gracefully to local-transcript + regex (still usable), that gap is the
upgrade incentive". A blocked hotkey would just read as a broken app.

Unlike the fact cap, **this one is server-enforceable**: the proxy
already sees the transcript on its way to cleanup, so it counts words and
discards them without storing anything. Weeks bucket by ISO week
server-side so a client clock cannot buy extra words.

That header block in `pricing-and-economics.md` still says "no weekly
word cap" and is now stale; this file wins.

**Amended 2026-09-03 (a) — Free keeps a taste, it is no longer a hard gate.**
The four features previously flipped fully off below Pro. Free now keeps
prompt shaping and three facts, because this file's own reason for
rejecting the hard paywall (`docs/pricing-and-economics.md`: users convert
when they *experience* a feature "rather than just reading a feature
list") argues against zero as much as it argued against metering. Zero
context is invisible absence, and absence does not sell; a visible
"3 / 3 remembered" does. Three is deliberately reachable in week one.

The tier table is implemented once, in `src/shared/entitlements.ts`, and
tested against this section. Nothing else may branch on plan name.

**The context cap is client-side and cannot be otherwise.** Remembered
facts live in local SQLite and are assembled into the prompt by
`context/prompt-injector.ts`. For the proxy to enforce a cap it would have
to receive the user's fact store, which contradicts the "never stored"
commitment above. The proxy therefore rejects only what it can see cheaply
— select-and-rewrite is a distinct request mode — and the fact cap is
enforced in the client. Someone who unpacks `app.asar` can lift it. That
is accepted on the same arithmetic that stopped us metering Free: the leak
is worth cents per month, and closing it would cost a privacy promise.

The subscription model above sits on top of this; it changes **who supplies
the inference key**, not the tiers.

---

## Architecture of record

**Transcription is local and stays local.** One model,
`parakeet-tdt-0.6b-v3`. The whisper engine path remains in the worker
because the Groq cloud provider uses Whisper.

**Cleanup is a cloud LLM call**, and is skipped more often than people
expect — `cleanup-policy.ts` decides, and the order of its rules is
load-bearing. Deterministic passes in `text-passes.ts` always run
afterwards, so skipping cleanup never skips correctness.

**Context memory** is an LLM-written overview injected into every cleanup
prompt, rebuilt by `context/compactor.ts` when the machine is idle. Facts
are bucketed per project; `GLOBAL_SCOPE` exists for cross-project rules.

**The indicator is the product's face.** It hangs from the notch. Its
centre stays true black so it disappears into the camera housing — only the
wings may carry colour. That constraint is not negotiable.

Two rules that keep the codebase testable:

- **Pure logic goes in its own module.** `pipeline.ts` and the worker import
  Electron and cannot load under vitest, so anything worth testing is
  extracted. Tests must cover *shipped* code, never a parallel copy.
- **Comments explain why, and cite the measurement.**

---

## Keeping this current

This file is referenced from `CLAUDE.md`, which is loaded at the start of
every session — that is the mechanism by which it gets read.

**Update it in the same commit as the change** when you touch:

- who pays, what for, or how much
- who supplies the inference key, or where inference runs
- any claim about where audio or text travels
- the four Pro features, or which tier they sit in

A change to any of those that leaves this file stale is an incomplete
change. The failure this file exists to prevent is someone reading the
repository, drawing a confident and reasonable conclusion, and being wrong.
