# Spec: shape dictation into *good agent prompts*, not just structured ones

**Status:** proposed, not started. One open decision (§6).
**Extends:** `docs/superpowers/plans/2026-06-03-ai-prompt-detection-in-code.md` (Phases 1–3, 5 shipped).
**Origin:** user watched Boris Cherny's Claude Code best-practices talk and asked that Yappr apply those principles when shaping a dictation aimed at an agentic coding tool.

## 1. One-paragraph summary

Detection already works: when an AI CLI is running in the focused app's process subtree, Yappr routes the dictation to the `ai_prompt` register, which restructures rambling speech into `## Goal / ## Context / ## Tasks / ## Constraints / ## Examples / ## Done when`. That template is good at *preserving structure*. It knows nothing about what makes a prompt effective **for an agentic coding tool specifically** — a tool that has a repo, git history, bash, tests, and the ability to iterate. This spec closes that gap, and fixes two defects found while grounding it.

## 2. Current state (verified 2026-07-31)

| Fact | Location |
|---|---|
| Three-way routing: `reformat` / `faithful_ai` / `code` | `src/main/ai-intent.ts` → `classifyCodeSurface` |
| AI-CLI route requires ≥12 words to reformat | `ai-intent.ts` → `MIN_REFORMAT_WORDS`, `hasPromptSubstance` |
| Under 8 words → no LLM call at all, every category | `src/main/cleanup-policy.ts` → `SHORT_UTTERANCE_MAX_WORDS` |
| Disfluency ("um", "the the", "actually") overrides the 8-word skip | `cleanup-policy.ts` → `hasDisfluency`, checked first |
| `ai_prompt` template (~3,400 tokens) | `src/shared/prompts.ts:419-547` |
| R7 — "You MAY NOT add requirements … the user did not dictate" | `src/shared/prompts.ts:489-490` |
| Detected CLI name captured | `src/main/pipeline.ts:845` |
| Prompt assembled | `src/main/pipeline.ts:944-953` |

## 3. Defects found

**D1 — the detected CLI name is discarded.** `terminalAiCli.cli` is captured at `pipeline.ts:845` and logged on the `faithful_ai` branch (`:868`), but the `reformat` branch (`:860-864`) neither logs nor threads it. A prompt bound for Claude Code is therefore shaped identically to one bound for Perplexity, despite Yappr knowing the difference.

**D2 — `@file` tagging is switched off in the one register that needs it.** `prompts.ts:177` gates `buildIdeAddendum` on `category === 'code'`. The reformat route sets `effectiveCategory = 'ai_prompt'`, so the addendum never fires — even though `editor` is passed in at `:948`. Net effect: the register aimed at AI chat surfaces cannot emit `@auth.tsx`.

**D3 — the word floor guards only one of four reformat routes.** `MIN_REFORMAT_WORDS` is checked in rule 1b (AI CLI) only. `isPrimaryAiBundle`, `browserAiRouted`, and `readable-chat-textarea` return `reformat` at any length. Consequence today: a 9-word question in the ChatGPT desktop app gets the full markdown-section treatment, and a sub-8-word one containing "um" gets there too via the `hasDisfluency` override.

## 4. Changes

**C1 — split `ai_prompt` by destination.** Two variants over one shared spine:
- `agentic` — Claude Code, Codex, Aider, etc. Assumes repo access, git, bash, tests, MCP tools.
- `chat` — ChatGPT, Perplexity, Claude desktop. Assumes none of that.

Thread `cli` from `classifyCodeSurface` through `pipeline.ts` into `buildCleanupPrompt`. **Token-neutral by construction:** the agentic block *replaces* the generic "(Claude Code chat, Cursor AI chat, ChatGPT, Claude desktop, Perplexity, etc.)" hedging and the chat-irrelevant guidance rather than appending to it. Total prompt size must not grow — see §5.

**C2 — fix D2.** Apply the IDE addendum on the `ai_prompt` route, not just `code`.

**C3 — sharpen what the user actually said** (no invention; R7 stays intact). In the `agentic` variant only:
- named files → `@auth.tsx`; identifiers → backticks
- a named tool becomes an explicit directive: "use the barley CLI" → ``Use `barley --help` to learn the interface before calling it``
- "check the git history" / "look at the issue" get promoted to their own task lines instead of staying buried mid-paragraph
- a stated verification wish ("make sure it still works") becomes a `## Verify` section naming the check — this is the talk's "give it a feedback loop and it iterates" principle
- "commit push PR" survives as a discrete task

**C4 — fix D3.** Apply the ≥12-word floor to every route into `reformat`, not just the AI-CLI one. This makes the product strictly more conservative than today and removes LLM calls that currently fire.

**C5 — fixture tests.** `scripts/bench-groq-cleanup.mjs` benches *models* against a condensed copy of the prompt; it cannot tell whether a shaping edit improved anything. Add fixture rambles with assertions on detail-survival, section correctness, and no-invention, so changes to `prompts.ts` are measurable.

## 5. Invariants — do not break these

1. **Speed is the product.** Routing everything through reformat once took paste latency from ~1.4s to 3–7s: the heavy prompt on every clip exhausts the 6,000 TPM Groq budget and starts 429ing. Any change that grows the `ai_prompt` prompt must be justified against that. Target: net token change ≤ 0.
2. **Short input is never restructured.** ≥12 words to reach reformat (after C4, on every route); <8 words takes no LLM call at all.
3. **Detection stays free.** Pure process-tree / bundle-ID / AX signals, hard-capped at 80ms, fired at key-press so it overlaps recording. Never an LLM call to decide routing.
4. **Spoken words alone still cannot reach reformat.** Test-enforced in `ai-intent.test.ts` ("SURVIVING INVARIANT"). The AI-CLI exception (Option C, 2026-07-29) is the single deliberate relaxation and must remain the only one.
5. **No summarization.** Reformat changes shape, never content. Every file, error, number, condition, qualifier, and negative constraint survives.

## 6. OPEN DECISION — may Yappr add words the user did not say?

The talk's single most-repeated tip is *"before you write code, make a plan, run it by me"* — the fix for "the agent built 3,000 lines of the wrong thing." R7 (`prompts.ts:489`) currently forbids Yappr from ever producing that line.

**Proposal:** allow at most two added blocks, `## Plan first` and `## Verify` — gated to the `agentic` variant, only on substantial multi-task build requests, always rendered as their own labelled sections so they are obviously scaffolding and deletable at a glance. Never woven into sections the user dictated. Off for the `chat` variant, off for short prompts, off for questions.

**Cost if approved:** ~15 extra output tokens, a few dozen ms.

**Status: awaiting the user's call.** Everything else in §4 is safe without it. Do not implement this half unless the user has said go.

## 7. Verification

- `npm run test` — `ai-intent.test.ts` and `cleanup-policy.test.ts` must stay green, including the SURVIVING INVARIANT test.
- New fixture suite from C5 must pass before and after any `prompts.ts` edit.
- `npm run typecheck`.
- Manual: dictate a long build request into Claude Code, into Cursor's chat, and into ChatGPT desktop; confirm the agentic/chat split fires correctly and that a 9-word aside is untouched in all three.
