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

### The privacy claim has to change

*"Our servers are not in the path"* is true under BYOK and **false** under a
proxy. It is on the live site, in the FAQ, marked approved verbatim.

Transcription is unaffected — it is local (Parakeet, on-device) and stays
local. What changes is cleanup: the **text** of a dictation would pass
through Yappr's infrastructure. The honest replacement is narrower and
still strong: *audio never leaves your Mac; transcription happens
on-device; only the text of a dictation is sent for cleanup.*

Do not quietly reword the approved copy. Raise it, get a decision, then
change the FAQ, `YapprLanding/CLAUDE.md`, and `CLAUDE.md` together.

---

## Pricing

Live decision (2026-07-29, see `docs/pricing-and-economics.md` for the
economics and the history):

- **Free** — unlimited dictation with cleanup. No word cap, no card.
- **Pro — $9/mo.** Gates *features*, not volume: prompt shaping, select and
  rewrite, persistent context, per-app polish.
- No Lifetime tier. No card required to try Pro.

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
