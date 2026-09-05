# Yappr — engineering notes

Push-to-talk dictation for macOS. Hold a hotkey, speak, release; cleaned text
lands at the cursor.

> **Naming.** The product is **Yappr**, everywhere — code, docs, UI, repo,
> marketing site (`YapprLanding/`). There is no "OpenFlow" anything.
>
> If you see `~/OpenFlow` in a path, that is a stale local checkout
> directory, not a name to propagate. Renaming a directory is a local
> `mv` plus `git worktree repair`; nothing in the repo depends on it.

> **Not open source.** Yappr is closed-source. Never describe it as OSS,
> MIT-licensed, auditable, self-hostable, or forkable. The differentiation
> is the product — this used to say "BYOK transparency", which is gone
> along with the key.

> **Source of truth: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).** Read
> it before answering anything about the business model, pricing, or where
> audio and text travel. It wins over any other file, including this one.
>
> **Yappr is a monthly subscription. Users do NOT bring their own API key.**
> The code and the landing site still implement and describe the older
> bring-your-own-key model — that gap is real, deliberate to record, and
> catalogued in that file. Do not "fix" the discrepancy by assuming BYOK is
> current; an assistant reading only the repo already made that mistake.
>
> Keep it current in the same commit whenever you change who pays, who
> supplies the inference key, or any claim about where data goes.

---

## The one flow that matters

Everything is in service of the wall-clock between **hotkey release** and
**text on screen**. Anything before release is free — the user is still
talking — which is why every latency measurement uses release as t0.

```
hotkey press ──► pause music ──┐
                mic capture ───┤  (all overlapped with the user speaking)
                AX-role probe ─┘
hotkey release ─── t0 ──────────────────────────────────────────►
   │
   ├─ transcribe            local Parakeet, or cloud Groq (whisper)
   ├─ route                 which cleanup register applies
   ├─ cleanup (often skipped)  one Groq LLM call
   ├─ deterministic passes  always run, never skipped
   └─ paste
```

`runDictationPipeline` in `src/main/pipeline.ts` owns this.

---

## Transcription engines

**One local model: `parakeet-tdt-0.6b-v3`** (q4_0, 339MB), 37ms @1s → 164ms
@16s. The whisper tiers (base / small / large-v3-turbo) were retired — Parakeet
beat all of them at matching English quality, and a single tier deletes the
entire auto-elevation machinery along with the tier-swap reload cost.

The whisper engine path REMAINS in the worker and `engineForModel(path)` still
routes by model path — the Groq cloud provider uses Whisper, and re-adding a
local tier should stay cheap. Anything registered in `LOCAL_MODELS` whose path
doesn't match /parakeet/i will load through `initWhisper`.

**Still the single most important fact in this codebase:** Whisper's encoder always
runs on a padded **30-second window**. A 0.8s clip and a 27s clip both cost
~870ms. Cost is per *call*, not per *second*. Consequences:

- Chunked "streaming" at 2s intervals cannot help — the final chunk still
  costs a full window. Only chunking at ~30s boundaries would, and only for
  audio longer than one window.
- Parakeet has no such window; its cost scales with audio length. That is why
  it is now the only local tier.
- This is also why auto-elevation was removed: it traded ~800ms for accuracy
  that Parakeet already matched.

Parakeet caveats: no `language` option, no initial prompt (so the dictionary
*bias* doesn't apply — `applyDictionaryReplacements` still corrects those terms
downstream), and it covers English + 24 European languages, not Whisper's ~100.

The worker (`whisper-worker.ts`) keeps **two models resident** and evicts LRU.
With one local tier nothing swaps in practice, but the cache is kept: a reload
costs 150–290ms plus a Metal recompile, and it makes re-adding a tier free.

`whisper-host.ts` serialises all transcribes
through a `SerialQueue` — the context is not reentrant.

---

## Cleanup: when the LLM runs

`cleanup-policy.ts` decides. Order is load-bearing.

1. **Disfluency** (filler / stutter / self-correction) → always run the LLM,
   any length, any category. Pasting "um" is worse than the latency saved.
2. **Under `SHORT_UTTERANCE_MAX_WORDS` (8)** → skip entirely. This beats
   everything below it, including `runFaithfulAi`.
3. **`code` category** → verbatim, skip-eligible; yields to `runFaithfulAi`.
4. Everything else → run.

Checking category *before* length was a real bug: a six-word phrase came back
`code-verbatim`, which the pipeline lets `faithful_ai` override, so short
dictations went to the LLM anyway, hit Groq's 6000 TPM limit, and took 6.5s.

**Skipping cleanup never skips correctness.** A chain of deterministic
passes always runs afterwards, in this order, at the end of
`runDictationPipeline`: brand names, dictionary aliases, user dictionary,
near-miss dictionary, self-correction, spoken numbers, spoken email
addresses, then — on non-`code` surfaces only — spelled-name collapse and
question marks.

**There is no `text-passes.ts`.** This file and `docs/ARCHITECTURE.md`
both claimed there was until 2026-09-05. Five of those passes are private
functions inside `pipeline.ts` and therefore untested; the other four
(`near-miss`, `correction-pass`, `spoken-numbers`, `spoken-email`) are
pure modules in `src/shared/` and are tested. An extraction exists on the
unmerged branch `worktree-phase0a-correctness-bugs` (`1c91c29`), written
2026-07-29 against a pipeline that has moved a long way since; treat it
as a starting point, not a patch to apply.

**The chain runs on the dictation path only.** `runCommandPipeline`
(select-and-rewrite) and `repolishEntry` (re-polish from history) run
none of it, so re-polishing an entry drops the brand-name, dictionary,
self-correction and question-mark fixes the original dictation had. That
is a known gap, not a design.

### Cleanup registers

| register | behaviour | when |
|---|---|---|
| REFORMAT (`ai_prompt`) | restructures into a markdown prompt | primary AI app, readable `AXTextArea`, or detected AI CLI with ≥8 words — ≥5 when the text opens with an imperative verb |
| FAITHFUL_AI | LLM runs, must not restructure | spoken AI cue, or AI CLI with a short dictation |
| POLISHED | normal cleanup | messaging / email / docs / other |
| verbatim | no LLM | code, or under 8 words |

`classifyCodeSurface` in `ai-intent.ts` is pure and adversarially tested.
The word thresholds now reconcile, and did not always. Reformat once
required 12 words while the LLM was skipped under 8, leaving an 8–11
"faithful dead zone" that paid a full round-trip to return the text
almost unchanged. `MIN_REFORMAT_WORDS` is 8, matching
`SHORT_UTTERANCE_MAX_WORDS`, so nothing lands in between.

One deliberate exception, added 2026-09-04: with an AI CLI detected, text
that OPENS with an imperative verb reformats from 5 words
(`MIN_ACTIONABLE_REFORMAT_WORDS`). Without it the floor was a cliff
meaning could not see — "build a landing page about my app" (7) came back
near-identical while "build ME a landing page about my app" (8) got
shaped. It keys on `hasImperativeOpener`, NOT `isActionableRequest`: the
latter also fires on "let's", which would drag "let's see how quick this
is" into reformat — the phrase that 429'd and cost 6.5s.

A transcript bound for reformat also bypasses the short-utterance skip
(`cleanupSkipReason`'s `willReformat`), for the same reason compose does:
it is a brief, not the output, so skipping it pastes the brief.

### Rate limits

Groq replies to a 429 with "try again in Ns". If that exceeds
`CLEANUP_RETRY_CAP_MS`, **do not retry** — the attempt cannot succeed and the
wait is pure user-visible delay. Falling back to the raw transcript instantly
is strictly better.

---

## Audio capture

`Indicator.tsx` requests raw audio explicitly:

```js
{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }
```

Chrome's defaults are all `true`. That chain is tuned for VoIP intelligibility
and actively harms ASR: noise suppression gates quiet consonants, auto-gain
smears word onsets. It produced French errors like `"Mais"` → `"Made"`
(word-initial) and `"bien ici"` → `"bien iscidise"` (soft consonants), while
the same sentences transcribed perfectly from clean audio on every engine.

If dictation degrades in a noisy room, this is the trade to revisit.

Capture still emits **one WebM blob on stop**. Timeslice chunking produces
corrupt containers — only the first chunk carries the EBML header.

---

## Context memory

An LLM-written overview paragraph, injected into every cleanup prompt
(`context/prompt-injector.ts`), rebuilt by `context/compactor.ts` once enough
dictations accumulate.

Compaction deliberately waits for the machine to be idle — it is a
multi-second LLM call that must not compete with a dictation. The gate lives in
`context/compaction-gate.ts` (pure, tested); a 60s poll keeps re-asking until
it passes, and is kicked at startup because the counter is persisted.

The original bug: the trigger fired `setTimeout(…, 0)` immediately after
stamping "user just active", so the gate always saw ~0ms of quiet and refused.
It never ran once in 316 dictations. **If you touch the scheduler, keep the
retry** — the gate is correct, asking only once is not.

---

## Conventions

- **Pure logic goes in its own module.** `pipeline.ts`, `local.ts` and the
  worker all import Electron or native bindings and cannot load under vitest.
  Anything worth testing (`cleanup-policy`, `ai-intent`, `near-miss`,
  `correction-pass`, `spoken-numbers`, `spoken-email`, `constraints-block`,
  `rewrite-prompt`, `rewrite-guard`, `model-cache-policy`,
  `compaction-gate`, `media-apps`) is extracted and tested. Tests must
  cover *shipped* code, not a parallel copy — `prompt-size.test.ts` spent
  a while failing that rule by measuring the prompt with an empty context
  block, a shape the reformat path never sends.
- **Comments explain why, and cite the measurement.** Most non-obvious
  constants here came from a real log or benchmark; say which.
- **Regression tests use the real failing input**, verbatim, with a comment
  naming the symptom.
- AppleScript must check the System Events process list before addressing an
  app — `tell application "Music"` will *launch* it.

## Commands

```
npm run dev         # electron-vite dev
npm test            # vitest
npm run typecheck   # tsc, both projects
npm run build       # electron-vite build
```

`npm run lint` is currently broken repo-wide — no ESLint config file exists.
