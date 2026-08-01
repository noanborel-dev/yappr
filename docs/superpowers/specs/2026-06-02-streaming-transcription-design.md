# Streaming Transcription — Design Spec

**Date:** 2026-06-02
**Status:** Reviewed (critique team + user decisions folded in) — ready for implementation planning
**Product:** Yappr (checkout directory is still named `OpenFlow` on disk)

> **Change log:** Revised 2026-06-02 after a multi-agent critique (39 flaws raised,
> 38 survived cross-examination, 16 improvements) and a round of user decisions.
> This revision: locks the **Accurate tier as the uniform default**, replaces the
> first-run eligibility check with a **self-healing** one, pins the **eval-gate
> methodology**, specifies **`finalize()` drain/failure semantics** and the
> **single-worker queue invariant**, corrects the **per-chunk language** handling,
> and adds the **PCM→WAV cloud bridge**. See §9 for the decision log.

---

## 1. Goal

Reduce the **perceived** latency of a dictation by transcribing audio in **chunks
during the hold**, so that when the user releases the hotkey, nearly all the audio
is already transcribed and only a short final chunk plus the existing cleanup pass
remain. The user feels the result appear almost immediately after they stop talking.

**Streaming is a local-transcription feature.** Decided 2026-06-02:

- **Local whisper.cpp is the streaming path, and is the default on capable hardware**
  (`provider: 'local'`). Transcription happens on-device, chunked during the hold;
  the cloud is used **only** for the single LLM cleanup at the end. Rationale: it's
  the lowest-latency option (the only post-release network call is the cleanup), it
  incurs **zero cloud cost for transcription**, and it's the most private and most
  outage-resilient.
- **The default local tier is Accurate (`large-v3-turbo`), uniformly.** Because
  transcription now happens *during* the hold, the user pays no perceived latency for
  the larger model — so there is no reason to ship the weaker `small` tier as a
  default. This is the same model the cloud fallback uses, so **accuracy is uniform
  whether a dictation runs locally or on cloud** — the only quality variable left is
  the chunking delta (§8), never a model downgrade.
- **Cloud Groq transcription stays the one-shot fallback**, unchanged from today, for
  machines that can't run `large-v3-turbo` fast enough locally and for the brief
  window before the model has finished downloading. We do **not** build cloud chunking
  (Groq has no streaming API anyway). This is "local-first with a cloud safety net,"
  not local-only.
- **New installs default to `provider: 'local'`** via onboarding. There are **no
  existing production users**, so there is **no migration logic** — no prompt-to-
  migrate, no auto-migrate path. The only first-run concern is the model **download**
  (§4.3).

We want to **minimize cloud usage for transcription** because it incurs per-second
cost; local transcription removes that line item entirely. See §9 "Monetization
interaction" and `docs/pricing-and-economics.md`.

### Non-goals

- **Changing anything downstream of the assembled transcript.** The cleanup LLM
  call, the deterministic regex passes, emoji, paste, and history all stay exactly
  as they are. Cleanup runs **once**, on the **full assembled transcript**, at
  release — never per chunk.
- **A real-time streaming ASR session to Groq.** Groq's Whisper endpoint is strict
  request/response (verified: no streaming/partial API). We chunk client-side and
  fire one fast request per chunk; we do not hold a streaming socket.
- **No live transcript in the pill.** Decided: the pill shows `listening` during the
  hold, `polishing` on release (when the assembled transcript is sent to the cleanup
  LLM), then `pasted` — never streamed words. The win is latency, not visible text.
  This means the renderer-facing partial-transcript path is **removed**, not
  repurposed; the orchestrator assembles chunk results internally in the main process.
- **No local LLM cleanup.** Cleanup stays the cloud LLM (or BYOK) exactly as today.
  We are not introducing an on-device cleanup model.

### Hard requirement

- **Multilingual code-switching must keep working.** A user who says an English
  sentence with a French phrase mid-way (`"... j'aime bien travailler sur mon
  ordinateur ..."`) must still get the foreign span transcribed in its own
  language. Chunking must not break this. (See §4.2 rule 2 — this is why we keep
  `language:'auto'` per chunk and reject any "pin the session language" optimization.)

---

## 2. Why this is worth doing (the latency case, from real data)

Measured on the user's machine (M5 Pro, local `large-v3-turbo`):

| Dictation | Audio length | Transcribe | Cleanup | Post-release wait |
|---|---|---|---|---|
| "Okay so ideally…" | 90.4s | 2615ms | 819ms | **3436ms** |
| "Really the way…" | 63.1s | 2043ms | *skipped* | **2044ms** |
| "I'm writing an email…" | 36.1s | 1470ms | 837ms | **2319ms** |
| "Can you figure out…" | 21.0s | 972ms | *skipped* | **973ms** |

Two facts drive the design:

1. **Whisper turbo runs ~25–35× real-time *on this machine, warm*.** A 10s chunk
   transcribes in ~350ms, far faster than it takes to speak the next chunk. So
   transcribing chunks *during* the hold is effectively free — the worker idles
   between chunks. **Caveat:** 25–35× is M5-Pro-warm-only. Slower machines have less
   headroom; this is exactly what the eligibility check (§4.3) and the per-tier RTF
   table (§8) exist to measure. The feature's whole validity rests on one inequality:
   *cumulative per-chunk transcribe time (plus per-chunk fixed overhead) < cumulative
   speech time*, with margin.
2. **Transcription is 76–100% of the post-release wait.** Moving it onto the hold
   collapses the wait to "final short chunk + cleanup + paste."

Projected post-release wait with streaming (reference machine):

| Dictation | Now | Streamed (est.) | Saved |
|---|---|---|---|
| 90.4s | 3.4s | ~1.0s | ~70% |
| 63.1s | 2.0s | ~0.3s | ~85% |
| 36.1s | 2.3s | ~1.0s | ~57% |

The win scales with dictation length — biggest exactly where the current wait
annoys people.

---

## 3. Current architecture (and the one seam we touch)

Today, on hotkey release, the renderer sends one WebM blob to the main process,
which runs `runDictationPipeline` (`src/main/pipeline.ts:786`):

| # | Step | Code |
|---|---|---|
| 1 | `onState('processing')` | `:798` |
| 2 | Pick providers (local vs groq) + build Whisper bias dictionary | `:800–801` |
| 3 | Refresh focused app **concurrently** (overlaps transcription) | `:810` |
| 4 | **🎯 Transcribe** `transcription.transcribe(audioBuffer, {dictionary, onPartial})` | `:813` |
| 5 | Silence/hallucination bail (`isLikelySilence`) | `:827` |
| 6 | Resolve category + AI-chat-surface detection (AX role) | `:832–866` |
| 7 | Kick off emoji judge in parallel (separate Groq call on raw transcript) | `:897` |
| 8 | Cleanup decision: paused / fast-path skip / **LLM** + length-guard | `:910–980` |
| 9 | Post-LLM regex passes (always): quickFixes → dictionary → self-correct → spelled-name → question-marks | `:985–1018` |
| 10 | Append emoji | `:1024` |
| 11 | `pasteText` (paste or clipboard fallback) | `:1031` |
| 12 | `onState('done')`, return `{transcript, cleaned, …}` | `:1038` |

**The seam is line `:813`.** Steps 5–12 operate on the assembled `transcript` and
stay byte-for-byte unchanged. Streaming swaps *how step 4 produces the transcript*;
nothing else moves. This isolation is what makes the change safe — and it is a
load-bearing invariant of this spec.

> **Second consumer of the seam:** `runCommandPipeline` (`pipeline.ts:1085`,
> "rewrite-my-selection" command mode) is a **second full-clip `transcribe()`
> caller**. The PCM-only capture change (§4.4, M6) changes *its* input too. Command
> mode is short-utterance and does **not** need streaming, but it must keep working
> through whatever capture/format change we make. Treat it as a fallback-path consumer
> of the shared `transcribeCore` (§4.4).

---

## 4. The streaming design

### 4.1 Mechanism — chunk at silence, adaptive cap (Approach A)

An **orchestrator** in the main process receives audio chunks during the hold,
transcribes each via the active provider, reassembles them in order, and on release
produces the full transcript that feeds step 4's seam.

Chunk boundaries are chosen by **voice-activity / energy**, not a fixed clock:

- Cut at a **natural pause** (silence) → never split a word. This is the *safe* cut:
  nobody pauses mid-word, so silence-aligned boundaries self-protect quality.
- If the user speaks continuously, force a cut at an **adaptive cap** so streaming
  keeps up. The cap is **a function of measured RTF + the locked tier**, not a fixed
  clock: a high-headroom machine uses a larger cap (fewer forced mid-speech cuts =
  better boundary accuracy); a borderline machine uses a smaller cap (keeps the final
  chunk tiny). Default ~8s, bounded ~4–15s. Forced cuts are the **only** risky
  boundaries — they are also rare in normal (pausing) speech.
- Each chunk is a self-contained phrase → near-one-shot accuracy; the **existing
  final cleanup pass** smooths any residual boundary roughness **for users who run
  cleanup**. Note: the local-no-key, fast-path-skip, and paused-cleanup users get
  **no** boundary smoothing — so the assembly/join rule (§4.4) must be correct on its
  own, not lean on cleanup.

We considered and rejected (documented for posterity):

- **B: overlapping windows + timestamp dedup** — highest accuracy but more
  reconciliation logic. On the **local** path the overlap cost objection does **not**
  apply (overlap is local compute absorbed by the headroom, not billed cloud audio).
  Kept as the **first mitigation** if the eval (§8) shows Approach A's forced-cut
  boundaries hurt — applied as a **targeted small overlap around forced-cap cuts
  only**, not on every silence cut.
- **C: native per-backend streaming** — best per backend, but two code paths and it
  breaks the "one mechanism for everybody" goal.

### 4.2 The five rules

1. **Silence-cut + adaptive cap.** Boundaries at pauses (from the energy signal the
   capture graph already computes), with a hard cap (adaptive to measured RTF + locked
   tier, default ~8s) to bound the final-chunk size and keep transcription ahead of
   speech.
2. **Code-switching preserved.** Each substantial chunk is transcribed with
   **`language:'auto'`** (today's whole-clip behavior, applied per chunk) — we do
   **not** detect-then-force a single language on a chunk, because a no-pause mid-chunk
   switch (`"I think j'aime bien this approach"`) lands inside one chunk and forcing it
   would anglicize the French span. **Neighbor-inheritance (forcing a language) applies
   ONLY to sub-~1.5s fragments**, to suppress the short-fragment noise misfires seen in
   the logs (`"clean."`→fr, `"Gracias…"`→es). The "pin the session language across
   middle chunks" optimization is **explicitly rejected** — it breaks the locked
   case. *(Plumbing required — see §4.4: the worker must echo `result.language` and
   accept an optional forced `language` per chunk. The binding exposes no
   detection-confidence field, so confidence-gated logic is out of scope.)*
3. **Short final-chunk handling.** If the release leaves a near-empty final chunk
   (below a threshold T ≈ 300ms / sub-minimum-speech-duration), **prepend its PCM to
   the previous chunk's retained PCM and re-transcribe only that bounded tail** rather
   than transcribing ~50ms of audio (kills the `input too short — 50ms`
   hallucination). `finalize()`'s assembled transcript must therefore allow the last
   chunk's text to be **replaced** by the re-transcription. Previous-chunk PCM is
   retained until `finalize()` resolves.
4. **Single-worker queue with a hard serialization invariant (local).** **Invariant:
   at most one `transcribeData` in flight per `WhisperContext`.** This does **not**
   exist today (`whisper-host.ts:186` fires `proc.send` immediately; the worker runs
   `void handle(msg)` per message → two overlapping chunks would call `transcribeData`
   concurrently on a non-reentrant context → corruption/crash). Streaming is the first
   caller that can overlap (a final chunk while an earlier one still runs; finalize
   racing a mid-stream chunk). **A host-side FIFO is a HIGH Phase-0c prerequisite**
   (§0c) — chain on the existing `pending` ids in `workerTranscribe`. Within one
   utterance the tier is locked, so a single global lock over the one resident context
   suffices.
5. **Session guard.** A per-recording session id is stamped on every chunk and checked
   **at enqueue *and* at assembly**, so a stale chunk from a superseded dictation can't
   bleed in and can't head-of-line-block a fresh dictation. Abort must both invalidate
   the session id **and** issue a worker `cancel` for in-flight chunks. *(Note:
   fugood's cancel is **cooperative** — `stop()` sets a flag checked at segment
   boundaries, so an in-flight chunk runs ~350ms to completion before the queue frees.
   Document this bounded behavior; do not assume preemptive abort.)*

### 4.3 Streaming path (local) vs. fallback (cloud)

- **Local whisper.cpp (the streaming path):** chunks are queued to the in-process
  worker as they're cut at silence. With sufficient real-time headroom each chunk
  finishes long before the next arrives, so the worker idles between chunks and the
  final chunk is near-instant at release.
- **Cloud Groq (the fallback, unchanged):** stays the existing one-shot path — full
  audio uploaded and transcribed at release **on the same `large-v3-turbo` model**, so
  no accuracy is lost relative to local. We do **not** chunk to the cloud (Groq has no
  streaming API; per-chunk uploads would incur RTT we're avoiding). A machine that
  can't stream locally falls back to this.

**Eligibility — self-healing, never a hard one-shot disqualification.** A capable
machine must not be permanently dumped onto cloud because of a single bad measurement
(cold Metal shader-compile, Spotlight indexing, a background build). So:

1. **First-run benchmark is warm + best-of-N.** Discard the first (cold) inference;
   take the median/best of a few short samples of `large-v3-turbo`. **Eligible if RTF
   ≥ ~3× real-time** on the locked tier (the 3× margin means one slow chunk can't build
   permanent backlog). Cache the result keyed by `(resolved model id, machine)`.
2. **Continuously re-estimated from real use.** Every actual local dictation already
   measures its own RTF for free; keep a rolling estimate and **re-evaluate
   continuously**. If first-run mis-bucketed a capable machine, the next few real
   dictations promote it to local automatically. Cost of a wrong first guess = "a few
   dictations went to cloud, then it self-corrected" — no user-visible harm (cloud is
   the same accurate model).
3. **Manual override in Settings** (`Force local` / `Force cloud`) so a power user is
   never stuck behind a bad guess.
4. **Re-benchmark on app update.**

In practice the floor lands around **"any Apple Silicon Mac (M1+)"**; Intel/no-Metal
Macs fall to cloud. But the gate is **measured, not a hardware allowlist**, so it
auto-adapts to odd configs and future hardware. Also gate on **RAM** (a single
resident `large-v3-turbo` context is ~1.5GB; fine on 8GB, but check) — not RTF alone.

**Mid-stream slowness policy (confirmed).** If an eligible machine falls behind during
a hold (thermal throttle, background load): **drain locally** — keep transcribing the
backlog on-device; at release the user waits for it to clear, which is *exactly
today's one-shot latency* (worst case = no slower than today, never worse). Then
**demote eligibility for the *next* utterance** (ease the tier or route next to cloud).
**Never re-upload mid-stream to cloud** — that re-incurs the exact transcription cost
we're eliminating and breaks the privacy promise. Add a runtime backlog guard that
trips this path when queue depth / lag exceeds a budget.

**Key decision: chunk orchestration lives in the pipeline/session layer, not inside
the provider.** `transcribe()` stays a single-buffer call; the orchestrator owns
chunking, ordering, language-inheritance, and assembly. This keeps the provider
simple and means the cloud fallback needs no streaming contract it can't honor.

### 4.4 New interfaces (the architectural backbone)

These are the clean seams that make streaming sound *and* make future work easier.
They replace today's god-file + stringly-typed surfaces (see Phase 0):

- **`RecordingSession` controller (main).** Owns `sessionId`, chunk assembly, the
  transcription-session lifecycle, and the dictation state machine — extracted out
  of `index.ts`. It **subsumes (does not parallel)** the existing `index.ts`
  `sessionId` / `stillLatest` / `audioChunks`. Created at hotkey press, fed chunks
  during the hold, finalized at release.
- **`StreamingTranscriptionSession` abstraction (local).** `pushChunk({seq, pcm,
  isFinal})`, `finalize(): Promise<string>`. **`finalize()` semantics (M2 — load-
  bearing):**
  1. Enqueue the final chunk.
  2. **`await` *all* outstanding chunk promises for this `sessionId` to *settle*
     (not merely resolve)** — a literal "transcribe the final chunk and assemble"
     would read a partially-populated buffer. Assembly waits for the full set.
  3. Assemble in `seq` order using the explicit join rule (below).
  - **Failure semantics:** every chunk's PCM is **retained** until `finalize()`
    resolves. Per-chunk inferences run *outside* `withRetry` (which only wraps `:813`),
    so the **orchestrator does its own per-chunk retry**. On **unrecoverable** chunk
    loss, `finalize()` **throws** → the pipeline falls back to a **one-shot decode over
    the retained full PCM buffer** (which also feeds the existing cloud fallback
    cleanly). **Never** assemble and paste a silently truncated transcript — that is
    strictly worse than today's atomic one-shot.
  - When a machine is ineligible for local streaming, the session is bypassed and the
    existing one-shot `transcribe(fullBuffer)` path runs instead — the `:813` seam
    accepts either an assembled transcript (streaming) or a one-shot result (fallback).
- **Explicit assembly/join rule.** Trim each chunk, join with a single space, preserve
  trailing punctuation. Must be correct **without** relying on cleanup (local-no-key,
  fast-path, and paused-cleanup users get no boundary smoothing).
- **Shared `transcribeCore(pcm, modelId, decodeOpts) → {text, segments, language}`.**
  One core used by both the streaming session and the one-shot `transcribe()` (which
  stays live for the cloud fallback **and** command mode). Tier selection stays
  per-path, but the bias-prompt and decode params come from one place — preventing the
  decode/bias **drift** that is the most concrete code-switch divergence hazard.
- **Two distinct hallucination/silence sets.** A **stricter per-chunk set** (only true
  Whisper artifacts: `[blank_audio]`, `[silence]`, `(music)` — **never** real words like
  "okay/thanks/you") used to **drop-this-chunk-and-continue, never abort the session**;
  and the existing **permissive whole-utterance set** for the assembled-transcript bail
  at `pipeline.ts:827`. The §0c de-dup must preserve **both**, not collapse them.
- **Structured indicator events.** Replace the prefix-string `broadcastState`
  (`'partial:'` / `'error:'` / state) with a discriminated union defined once in
  `shared/types` (`{kind:'state'|'error', …}`) or separate IPC channels. (No `partial`
  kind — the renderer-facing partial path is deleted, §0b.)
- **Chunk IPC contract.** `{sessionId, seq, pcm, isFinal}` — replaces the
  identity-less `sendAudioChunk(ArrayBuffer)` that today treats chunks as fragments
  of one WebM file.
- **Worker protocol.** Add a session/request id; **echo model identity AND
  `TranscribeResult.language`** in `result` replies; **accept an optional forced
  `language` per chunk** (the binding already supports `TranscribeOptions.language`);
  support `cancel` (cooperative — see rule 5). Cache resident contexts (see RAM note
  below).
- **Audio-format bridge (M6).** `createCaptureGraph` emits **PCM**, but the cloud
  fallback uploads an encoded container (`groq.ts:54`, `toFile(..., 'audio.webm')`) and
  Groq rejects raw PCM; `local.ts:209` `webmToPcm16` *also* assumes WebM input. Since
  eligibility is decided at hold-start, **encode the assembled PCM → WAV (s16le) in
  main for the cloud one-shot** (ffmpeg already shells out), confirm WAV as the upload
  format, and update `webmToPcm16`'s contract. This ripples into **both** providers'
  input contracts and into command mode — specify it once here.
- **`createCaptureGraph(deviceId)` (renderer).** One shared AudioWorklet-based
  capture helper (PCM out + RMS/energy for silence detection + waveform), replacing
  the MediaRecorder-WebM approach and the 3–4 duplicated mic-setup blocks.

> **Resident-context / RAM note.** Within one utterance the tier is locked, so a
> **single resident context suffices mid-stream** — the 2-context cache only matters
> *between* dictations (where the ~150ms reload is already acceptable). Safe default:
> **cache = 1, evict-LRU**; document when/if a 2nd context loads. Align
> `prewarmModelId` with the hold-start tier lock so the common case doesn't diverge
> (avoids a ~650ms first-chunk reload).

---

## 5. Phase 0 — Foundation (from the architecture audit)

A multi-agent audit (8 subsystem auditors + adversarial verification, 60/64 findings
confirmed) surfaced issues that we fix **before** building chunking. Split into
**prerequisites** (streaming is unsound without them) and **hygiene** (must land
before the eval baseline is captured so the WER comparison is stable, but don't gate
streaming structurally).

### 0a. Ship-now correctness bugs — HYGIENE (run on every dictation, incl. local/no-LLM + code)

> These run downstream of the seam and don't gate streaming structurally — but they
> **must merge before the §8 eval baseline is captured** so the WER comparison isn't
> measuring these bugs.

- **`applyQuestionMarks` splits on ANY period** (`pipeline.ts:539`) →
  `"open app.tsx"`→`"open app?tsx"`, `"version 3.2"`→`"version 3?2"`. Guard against
  intra-token periods; scope to no-LLM/code-safe paths. **[HIGH]**
- **`applySelfCorrection` deletes real clauses** (`pipeline.ts:420`) →
  `"I love Paris, actually Rome is better"`→`"I love Rome is better"`. Tighten the
  NAME-vs-NAME rewrite. **[HIGH]**
- **`"GPT for"`→`"GPT-4"`** (`pipeline.ts:273`) eats the preposition. Drop the rule. **[MED]**
- **Discord bundle ID wrong** — `com.discord` vs real `com.hnc.Discord`. The bug is at
  `pipeline.ts:309` (the `constants.ts:31` citation in earlier drafts is stale). **[MED]**
- **Code-switching has zero prompt-level protection** (`prompts.ts`) — add an explicit
  "preserve the user's language, including mid-sentence switches" instruction. The
  artifact-stripping/loopback regexes are English-only and could leak foreign meta-text. **[MED]**

### 0b. Dead-weight removal — HYGIENE (shrink the surface streaming touches)

- **Partial-transcript path (renderer-facing)** — fully plumbed worker→host→provider→
  pipeline→main→preload→renderer but never rendered. Since we've decided **not** to
  surface live text (§1), **delete it end-to-end**: the `partial:` broadcast,
  `setPartial`, the dead pill branch, the worker `'partial'` message + `onNewSegments`
  wiring, and the `onPartial` param on `TranscriptionProvider.transcribe`. (It also
  contradicts §1.) The orchestrator still consumes per-chunk results *internally in
  main* to assemble — that stays. Fix the wrong "cumulative" comments on the internal
  segment callback (fugood emits only new segments, not the running transcript).
- **`looksEnumerated` + 3 regexes** (`pipeline.ts:207`) — zero call sites. Delete.
- **`perAppRules` / `customPrompt`** (`types.ts:45`) — plumbed end-to-end, no UI to
  populate it. Delete (UI is out of scope here).
- **`audioCues` toggle** — shown in Settings, plays no sound. Implement or remove.
- **`EMOJI_BLOCK`** + dead `emojiInMessages` prompt branch; `canSkipCleanup` unused
  `_strictness` (computed twice); dead model-helper exports; `whisperCli` always-true
  stub; `LocalBinaryMissingError` dead `which` param.

### 0c. Streaming-prep refactors — PREREQUISITE (these ARE phase one of the feature)

- **Host-side single-worker FIFO queue** enforcing the rule-4 invariant ("at most one
  `transcribeData` in flight per context"). **[HIGH — new, M1]**
- **2-context model cache in the worker** (`whisper-worker.ts:58`) — end the
  `large→small→large` GPU release + Metal recompile thrash (~150ms + ~500ms per
  switch). Default **cache = 1 resident mid-stream**, evict-LRU (see §4.4 RAM note). **[HIGH]**
- **Extract `runDictationPipeline`** (`pipeline.ts:786`, 260-line god fn) into
  routing / post-processing / paste units so the `:813` seam is clean. **[HIGH]**
- **Extract a session controller from `index.ts`** (716-line god file). **[MED]**
- **Replace the stringly `broadcastState` protocol** with structured events. **[HIGH]**
- **Structured chunk IPC** with session id + seq + isFinal. **[HIGH]**
- **Worker protocol:** request id, model + `language` identity in `result`, optional
  forced per-chunk `language`, `cancel` support. **[MED]**
- **De-duplicate** the triplicated hallucination/silence string set into one module —
  **preserving the two distinct sets** (per-chunk strict vs whole-utterance permissive,
  §4.4). **[MED]**
- **`createCaptureGraph` helper** + AudioWorklet PCM capture, **plus the PCM→WAV bridge
  for the cloud one-shot and command mode** (M6). **[HIGH]**
- **Shared `transcribeCore`** extraction (§4.4). **[MED]**

---

## 6. Phases 1–N — The streaming feature

1. **Capture** — AudioWorklet PCM + energy-based silence detection + chunk emission
   over the structured IPC contract (`createCaptureGraph`); PCM→WAV bridge for the
   cloud/command paths.
2. **Orchestrator** — `StreamingTranscriptionSession`: queue, order, language-inherit
   (sub-1.5s only), short-chunk merge, `finalize()` with full-drain + per-chunk retry +
   throw-to-one-shot-fallback semantics (§4.4).
3. **Local provider adaptation** — per-chunk PCM into the local worker via the FIFO;
   tier locked at hold-start (Accurate by default; full duration is unknowable mid-
   stream). Plus the **self-healing eligibility check** (§4.3) routing ineligible
   machines to the cloud one-shot, and the **mid-stream backlog guard / drain-locally**
   policy.
4. **Wire the seam** — `pipeline.ts:813` calls `session.finalize()` (streaming) or the
   existing `transcribe(fullBlob)` (fallback). Steps 5–12 unchanged; assert
   `transcript` is the full assembled text either way.
5. **Pill UX** — `listening` (hold) → `polishing` (release / cleanup) → `pasted`. No
   live transcript text (decided §1).
6. **Eval gate** — see §8. This is the ship/no-ship decision.

---

## 7. Execution — the agent team

A communicating team, coordinated through writing-plans → execution. The **Integration
Lead** is the only integrator and the human's single point of contact; specialists
report to the Lead at phase boundaries.

- **👤 Integration Lead** — owns the `:813` seam + the shared contracts (chunk IPC,
  session lifecycle, structured events, `transcribeCore`); sequences merges; the only
  integrator; relays human direction to specialists.
- **🎙️ Capture Agent** — `createCaptureGraph`, AudioWorklet PCM, silence cuts, chunk
  emission, the PCM→WAV bridge. ⇄ Orchestrator on the IPC contract.
- **⚙️ Orchestrator Agent** — `StreamingTranscriptionSession`, ordering, assembly,
  language inheritance, short-chunk merge, `finalize()` drain/failure semantics. ⇄
  Capture, ⇄ Provider.
- **🧠 Provider/ASR Agent** — per-chunk local transcription via the FIFO, tier lock,
  per-chunk hallucination reject (strict set), self-healing eligibility + drain-locally
  guard. → Eval.
- **📊 Eval/Quality Agent** — the WER + latency + code-switch + boundary-WER harness;
  builds the per-tier RTF table; owns the merge gate (§8).
- **🔪 Adversarial Reviewer** — races: out-of-order chunks, release mid-flight, stale
  session, mid-stream chunk failure, the worker serialization invariant, cooperative-
  cancel timing.

**Merge order:** Phase 0c prerequisites (esp. the FIFO + structured contracts) land
first; 0a/0b hygiene lands before the eval baseline is captured. Then Capture +
Provider; Orchestrator integrates; Eval + Reviewer gate before anything touches
`pipeline.ts:813`. The 0a bug fixes are shippable independently as quick wins.

---

## 8. Risks & the eval gate

### Headline risk — cross-chunk context loss (the primary driver of the WER delta)

Whole-clip Whisper conditions every word on the entire utterance; **independent
per-chunk transcription throws that conditioning away.** This — *not* the boundary cuts
— is the **primary mechanism** behind the chunking WER delta the eval gates on (§9 open
unknown #1). It bites hardest exactly where context disambiguates: proper nouns,
technical terms, and any word whose correct spelling depends on something said seconds
earlier.

**Track it directly — do not let it average away.** The eval reports **boundary-
localized WER** (errors within N words of a cut) as the *direct* tracker of context-loss
damage, separate from bulk WER, so a single averaged number can't hide it.

**The mitigation is eval-arbitrated, NOT default-on.** Seeding each chunk's prompt with
the **tail of the previous chunk's assembled transcript** (merged with the dictionary,
capped under the 224-token budget) restores some cross-chunk conditioning cheaply and
locally — but prior-text conditioning is itself a known hallucination/repetition vector,
so it ships **only if** boundary-localized WER shows a net win. Default build is **off**;
the eval decides.

### Eval-gate methodology (M3 — pinned; the threshold *value* stays TBD, the *method* does not)

- **Metric:** normalized **WER delta ≤ X%** of one-shot, on an **N-utterance corpus**.
  - **Normalization:** lowercase + strip punctuation + **NFC-normalize accents**
    (load-bearing for French/English mixed scoring).
  - **Code-switch scoring:** **foreign-span recall = 100%, pass/fail** (not averaged
    into WER, where a few foreign words would vanish).
  - **Boundary-localized WER:** errors **within N words of a cut**, reported
    **separately** from bulk WER — so a boundary regression can't hide in the average.
- **Corpus must include:** (a) a foreign span **embedded mid-chunk with no surrounding
  silence**, (b) an isolated foreign span that is itself **<1.5s**, (c) technical/code
  vocabulary (the case that motivates Accurate), (d) long continuous run-ons (force the
  cap), (e) natural pausing speech.
- **Baselines (M4 — the comparison that actually gates the user experience):**
  - **local-streamed @ Accurate vs local-one-shot @ Accurate** — isolates the *chunking
    delta* (the core unknown).
  - Because the default tier is now **uniformly Accurate** (= the cloud model), the old
    "small-vs-turbo downgrade" gate is **moot** — local and cloud run the same model, so
    there is no model-downgrade arm to test. (This is M4, dissolved by the Accurate-
    default decision.)
- **X% gets an owner + date placeholder**, not "agreed." Streaming does **not** ship if
  the chunking delta exceeds X% or any code-switch case fails. If forced-cut boundaries
  are the culprit, apply the targeted-overlap mitigation (§4.1) and re-measure.

### Other risks

- **Slow-machine headroom.** The 25–35× factor is M5-Pro-warm-only. Mitigated by the
  self-healing eligibility check (§4.3), the **per-tier RTF table** (publish measured
  RTF for base/small/large across ≥3 machine classes), the **3× margin**, and the
  **drain-locally** guard (worst case = today's latency, never worse). The §2 latency
  model should add a per-chunk fixed-overhead term `O_chunk × N` (base64 IPC ~5ms,
  Metal encoder setup, per-chunk auto-detect, dictionary re-tokenization) and tie it to
  the slow-tier latency-delta measurement.
- **Cross-chunk context loss** — **promoted to a headline risk; see the top of §8.**
  (It is the primary driver of the WER delta; tracked directly via boundary-localized
  WER; prev-tail prompt-seeding is the eval-arbitrated, default-off mitigation.)
- **Command-mode regression — do not let it break silently.** `runCommandPipeline`
  (`pipeline.ts:1085`) shares the capture rewrite (PCM) and the shared `transcribeCore`,
  but is **not** exercised by the dictation WER corpus. Add a dedicated **command-mode
  smoke/regression check** to the eval harness: a few "rewrite-my-selection" utterances
  run through the new PCM→WAV path, asserting correct non-empty output. If we choose
  not to build that check, the spec must **explicitly mark command mode as untested /
  known-risk** for this change — never leave it silently uncovered.
- **Cloud cost per chunk** — N/A under local (no per-chunk cloud calls; the only cloud
  request is the single LLM cleanup, billed once, exactly as today). The cloud path
  stays one-shot, so its billed audio is unchanged.
- **Tier selection under streaming (local).** Auto-elevation keys off full audio
  duration, unknowable mid-stream. Lock the tier at hold-start (press-time focused-app
  + prewarm). Refactor `selectedModel` to take an explicit `{lockedTier}` rather than
  re-reading the global cache + duration. Note: tier-lock (press-time) and the cleanup
  **category** (release-time refresh) intentionally diverge; that's fine. Confirm code
  auto-elevation still fires under the lock (it's focused-app-driven, so it should).

---

## 9. Decisions & open questions

**Resolved (2026-06-02 review + user decisions):**

- **No live transcript in the pill.** `listening` → `polishing` → `pasted`.
- **Cleanup stays a single cloud (or BYOK) call** on the full assembled transcript
  after release — never per chunk, never a local LLM.
- **Accurate (`large-v3-turbo`) is the uniform default local tier.** Streaming hides
  its cost, and it matches the cloud model → uniform accuracy, no downgrade arm in the
  eval (M4 dissolved).
- **Transcription is local-first; streaming is a local-only feature.** Cloud Groq stays
  the unchanged one-shot fallback for ineligible machines / pre-download. We minimize
  cloud transcription cost — the only cloud call in the streaming path is the single
  LLM cleanup (or **zero** for a local + no-key user).
- **New installs default to local; no existing users → no migration logic.** (M7 reduced
  to just the first-run download.)
- **Eligibility is self-healing**, never a hard one-shot disqualification (warm+best-of-N
  first-run, rolling re-estimate from real dictations, manual override, re-benchmark on
  update). (§4.3)
- **Adaptive cap** (function of measured RTF + locked tier, default ~8s, bounded ~4–15s).
- **Mid-stream slowness → drain locally, degrade to one-shot latency, demote next
  utterance, never re-upload mid-stream to cloud.** (§4.3)
- **Boundary mitigation:** pure Approach A first, eval measures boundary-localized WER,
  targeted overlap-around-forced-cuts ready as the first mitigation. (§4.1, §8)

**Monetization interaction (decided; full model in `docs/pricing-and-economics.md`):**

Local-default transcription removes the dominant COGS line item (cloud whisper minutes;
llama cleanup is rounding-error). The model is a **simple two-tier SaaS — no lifetime
license, no local LLM**:

- **Free:** unlimited local Accurate transcription + regex passes + a **cap on cloud LLM
  cleanup** (~2,000 words/week); **no context memory**. Over-cap degrades gracefully to
  local-transcript + regex (still usable), which is the upgrade incentive.
- **Pro ($10/mo):** unlimited cloud LLM cleanup at all strictness, **context memory**,
  command mode, emoji — everything.
- **The meter moves from transcription minutes → cloud-cleanup words** (transcription is
  now free/local for everyone), and context memory becomes the Pro feature gate. The
  managed proxy now carries only cheap cleanup traffic. `pricing-and-economics.md` must
  be updated to reflect this (its current model meters cloud transcription).

**Open — genuine empirical unknowns (need measurement, not opinion):**

- **Chunking WER delta** — how much accuracy silence-cut chunking costs vs one-shot at
  Accurate (primarily driven by **cross-chunk context loss** — see the §8 headline
  risk). Gates whether streaming ships; the §8 harness answers it.
- **Real-time-factor threshold + per-tier RTF table** — confirm the ~3× margin and
  publish measured RTF across representative hardware to set the eligibility line.
- **Eval threshold X%** — owner + date to be assigned.
- **First-run download UX** — local is default but the model (~547MB turbo) must download
  on first launch; run cloud-until-downloaded and size that interim window. Promote to
  its own phase.

---

## 10. Success criteria

- Post-release wait on long dictations (≥30s) drops by ≥50% on the reference machine.
- **Chunking WER delta** within the agreed X% of one-shot at Accurate (per the §8
  methodology: normalized + NFC accents; bulk **and** boundary-localized reported).
- **Code-switching test passes** (foreign-span recall = 100%, incl. the mid-chunk and
  <1.5s cases).
- No regression in cleanup, regex passes, paste, or history (they run unchanged on the
  assembled transcript). The assembly/join rule is correct **without** cleanup.
- **Command mode works through the capture / `transcribeCore` rewrite** — covered by a
  dedicated regression check, or explicitly flagged untested/known-risk if deferred
  (§8). It shares the PCM rewrite but is outside the dictation WER corpus.
- **No silent partial transcripts:** an unrecoverable chunk loss throws and falls back to
  one-shot, never pastes a truncated result.
- **Telemetry / measurable cost target:** log per-utterance streaming lag (backlog drain
  time, queue depth at release) and the local-eligible vs cloud-fallback population, so
  "minimize cloud transcription cost" is verifiable (e.g. ≥X% of dictations run local;
  cloud transcription minutes/active-user drop ≥Y%).
- Phase 0 prerequisites (0c) landed; 0a bugs fixed and verified before the eval baseline;
  dead weight (0b) removed.
