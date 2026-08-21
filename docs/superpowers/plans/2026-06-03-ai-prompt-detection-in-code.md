# Plan: detect "user is prompting an AI" in code editors → run faithful LLM cleanup

**Status:** Phases 1–3 + 5 shipped. Phase 4 (faithful prompt/token wiring) and Phase 6 (browser-AI URL, JetBrains/Sublime/Nova) pending.

> **Superseded 2026-07-29 — Option C.** A detected AI CLI now routes to **REFORMAT**, not FAITHFUL_AI. User decision: "when Claude Code is detected, it should start writing things in a clear way." This is a deliberate, scoped exception to the load-bearing invariant below — a process signal may now reach reformat; spoken words alone still may not, and that half remains enforced by test (`ai-intent.test.ts`, "SURVIVING INVARIANT"). Accepted cost: dictating into the editor pane while an agent runs in the integrated terminal gets restructured, since a process scan cannot see the caret. Revisit by gating on caret position if that becomes common. FAITHFUL_AI still exists and now serves the spoken-cue-only case.
**Origin:** multi-agent design workflow `detect-ai-prompting-in-code` (run `wf_188a5906-b42`, 8 agents: map → design → adversarial-verify → synthesize). Adversarial review caught and fixed four blocking flaws in the first-draft design.

## Problem

Whisper mishears "Claude" → "cloud"/"clawed" even on `large-v3-turbo`. The Groq LLM cleanup reliably fixes it — but `canSkipCleanup()` takes a "fast path" and **skips the LLM for `code`-category dictations** (`pipeline.ts:238-243` → `:935`). Code editors are exactly where the user prompts AIs (Claude Code, Cursor…), so the mistranscription reaches them uncorrected. Existing `ai_prompt` detection under-fires because:

- the integrated-terminal AI-CLI scan is gated on **standalone** terminal bundleIds (`pipeline.ts:872`, `terminal-ai-cli.ts:5-15`) — VSCode/Cursor/Antigravity integrated terminals carry the *editor* bundleId, so it never runs;
- the four target editors are **AX-opaque** (Electron), so the `AXTextArea` role signal mostly fails;
- `CODE_APP_AI_CHAT_ROLES` is a single role; `applyQuickFixes` has no `clawed` rule.

## Core design: a third cleanup register

Today: **REFORMAT** (`ai_prompt`, aggressively restructures → markdown prompt, 3× tokens, length-guard exempt) vs **SKIP** (`code`, raw/fast/verbatim). Add a middle register:

**FAITHFUL_AI** — *run the LLM, fix brand names/mishears, but NEVER restructure or paraphrase.* ~1.5× tokens, length-guard active, post-LLM destructive passes suppressed.

## THE load-bearing invariant

A focus-**DECOUPLED** signal (an AI CLI in a background terminal tab; words the user merely spoke) can **NEVER** reach the destructive REFORMAT path — it only ever escalates to FAITHFUL_AI. REFORMAT requires a focus-**LOCALIZED** signal (user is literally in a known AI chat surface).

### Routing — `classifyCodeSurface(input)`, first match wins
1. **REFORMAT** — `isPrimaryAiBundle` OR `browserAiRouted` OR (`category==='code'` AND `axRole==='AXTextArea'` AND `isAxReadable`).
2. **FAITHFUL_AI** — STRONG spoken cue (regardless of category); OR `weakCueSettingOn` AND WEAK cue AND a process/AX corroborator (AI-CLI). CLI alone is never sufficient; WEAK alone never leaves SKIP.
3. **CODE** — verbatim, skip-eligible. Fast path preserved.

### Cue tiers — `detectAiAddressing(transcript)`
- **STRONG**: explicit AI name as addressee, or `cloud`/`clawed` adjacent to a tech word. Suppressed inside dictated quote/comment spans (string-literal guard, FP1).
- **WEAK**: hard coding-request verbs (refactor/implement/…), or generic verb + coding noun, or politeness + verb. OFF by default; low precision (collides with comments/commits).

## Phased TDD plan

1. **Pure classifier** `src/main/ai-intent.ts` (+test) — `detectAiAddressing` + `classifyCodeSurface`. Electron-free, vitest-covered, **zero behavior change**. ✅ SHIPPED.
2. **Generalize ps-tree scan** — match AI tokens in **argv** (`ps -axo args=`, catches `npx`/`bunx`/wrappers), tmux/screen fallback, BFS depth cap, exclude multiplexer servers; derive `EDITOR_TERMINAL_HOST_BUNDLES` = code keys − terminals; capture `rootPid` + `activeUrl` at press time (`focused-app.ts`), fire scan as press-time promise hard-capped 80ms.
3. **Wire into `pipeline.ts`** (replaces `:865-882`) — overlapped probes; set `effectiveCategory='ai_prompt'` for reformat, keep `code` + `runFaithfulAi` flag for faithful; thread the flag into `canSkipCleanup` (force no-skip) + `buildCleanupPrompt`. First real behavior change.
4. **`CODE_AI_FAITHFUL` prompt + token/guard wiring + post-LLM pass suppression** — faithful prompt = FAITHFUL block + brand-fix (Cloud/Clawed→Claude) + IDE addendum, NO scaffolding; groq 1.5×+80 budget; length-guard active; suppress `applyQuestionMarks` + `applySpelledNameCollapse` whenever `effectiveCategory==='code'`.
5. **QUICK_FIXES guarded `clawed`→Claude** backstop (mirrors the guarded `cloud` lookahead exactly). Keep `CODE_APP_AI_CHAT_ROLES = {AXTextArea}` only.
6. **Widen category map + browser-AI URL/host detection** — add JetBrains/Sublime/Nova to `APP_CATEGORY_MAP`; URL/host AI detection (chat.openai.com, claude.ai, …).

## Risk register (high/medium)
- **FP1 (high):** decoupled signal → destructive reformat. → REFORMAT requires focus-localized signal; CLI+STRONG caps at FAITHFUL_AI; string-literal guard. *(Phase 1, locked by test.)*
- **FP2/FP3 (high):** weak cues / CLI-alone flip code-comment/commit dictation to LLM; question-mark/spelled-name passes mutate comments. → WEAK off by default + needs corroborator; CLI-alone stays SKIP; suppress destructive passes for code. *(Phases 1, 4.)*
- **FN (high):** JetBrains/unlisted editors/browser-AI never enter classifier; CLI scan defeated by npx/tmux/in-process agents. → STRONG cue rescues regardless of category; argv matching + tmux fallback; widen category map + URL detection. *(Phases 1, 2, 6.)*
- **Latency (high):** generalized ps-scan on the critical path. → press-time capture overlapping transcription, 80ms cap, gate on editor bundleId, timeout downgrades only SKIP. *(Phases 2, 3.)*
- **FP4/5/6 (med):** comm collisions (gh/go/goose/codex); window-title cue on files named `claude.ts`; single-line roles misfiring reformat. → argv-qualify CLIs; **drop** window-title cue; keep `AXTextArea`-only.

## Open product tuning (decide at Phase 3)
Default routes FAITHFUL_AI only on a STRONG cue (conservative). User intent ("in code we want the LLM since we're usually prompting AI") may warrant a more liberal default — e.g., default `code`-editor dictation to FAITHFUL_AI since it's non-destructive — traded against ~500-700ms latency + Groq cost on every code clip. Resolve with logging once Phase 3 lands.
