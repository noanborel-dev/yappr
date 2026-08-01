# Yappr — engineering notes

Push-to-talk dictation for macOS. Hold a hotkey, speak, release; cleaned text
lands at the cursor.

> **Naming.** The product is **Yappr**. The checkout directory on disk is still
> named `OpenFlow`, and so is `OpenFlowLanding/` (the marketing site). That is
> legacy only — never use "OpenFlow" in user-facing text.

> **Not open source.** Yappr is closed-source. Never describe it as OSS,
> MIT-licensed, auditable, self-hostable, or forkable. The differentiation is
> *creative product + BYOK transparency*, not source availability.

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
   ├─ transcribe            local whisper.cpp or Parakeet, or cloud Groq
   ├─ route                 which cleanup register applies
   ├─ cleanup (often skipped)  one Groq LLM call
   ├─ deterministic passes  always run, never skipped
   └─ paste
```

`runDictationPipeline` in `src/main/pipeline.ts` owns this.

---

## Transcription engines

Two engines behind one worker. `engineForModel(path)` in `transcribe-core.ts`
picks by model path.

| tier | model | measured on M5 Pro |
|---|---|---|
| Instant | `parakeet-tdt-0.6b-v3` (q4_0, 339MB) | 37ms @1s → 164ms @16s |
| Fast | whisper `base` | ~55–90ms |
| Balanced | whisper `small` | ~170–245ms |
| Accurate | whisper `large-v3-turbo` | **~870ms, flat** |

**The single most important fact in this codebase:** Whisper's encoder always
runs on a padded **30-second window**. A 0.8s clip and a 27s clip both cost
~870ms. Cost is per *call*, not per *second*. Consequences:

- Elevating a short clip to Accurate buys nothing and costs ~800ms.
- Chunked "streaming" at 2s intervals cannot help — the final chunk still
  costs a full window. Only chunking at ~30s boundaries would, and only for
  audio longer than one window.
- Parakeet has no such window; its cost scales with audio length. That is why
  it is the default tier.

Parakeet caveats: no `language` option, no initial prompt (so the dictionary
*bias* doesn't apply — `applyDictionaryReplacements` still corrects those terms
downstream), and it covers English + 24 European languages, not Whisper's ~100.

The worker (`whisper-worker.ts`) keeps **two models resident** and evicts LRU.
Tier switching is common now that elevation is length-gated, and a reload costs
150–290ms plus a Metal recompile. `whisper-host.ts` serialises all transcribes
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

**Skipping cleanup never skips correctness.** The deterministic passes in
`text-passes.ts` always run afterwards: brand names, user dictionary,
self-correction, spelled-name collapse, question marks.

### Cleanup registers

| register | behaviour | when |
|---|---|---|
| REFORMAT (`ai_prompt`) | restructures into a markdown prompt | primary AI app, readable `AXTextArea`, or detected AI CLI with ≥12 words |
| FAITHFUL_AI | LLM runs, must not restructure | spoken AI cue, or AI CLI with a short dictation |
| POLISHED | normal cleanup | messaging / email / docs / other |
| verbatim | no LLM | code, or under 8 words |

`classifyCodeSurface` in `ai-intent.ts` is pure and adversarially tested.
Note the thresholds were set independently and do not reconcile: <8 words no
LLM, ≥12 words reformat, and 8–11 is a faithful dead zone.

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
  Anything worth testing (`text-passes`, `routing`, `cleanup-policy`,
  `ai-intent`, `model-cache-policy`, `compaction-gate`, `media-apps`) is
  extracted and tested. Tests must cover *shipped* code, not a parallel copy.
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
