# Handoff — state of play, 2026-09-05

Written for a fresh session. **Read `docs/ARCHITECTURE.md` first** — it is
the source of truth for the product, the business model and where data
travels, and it wins over this file.

---

## The one thing to understand before debugging anything

**28% of cleanup attempts currently fail and paste the raw transcript.**

    289 failed / 1,026 attempts
      253 × HTTP 429   (Groq rate limit)
       26 × HTTP 404   (historical, decommissioned llama model)
        3 × HTTP 413

Measured from `~/Library/Application Support/yappr/yappr.log`.

This presents as *every* other bug. "It left my ums in", "it kept both
halves of my correction", "it didn't format the email", "it ignored my
context" — all of those are what an unpolished transcript looks like, and
a rate-limited key is not an absent key, so nothing on screen says so.

**Before concluding a prompt is wrong, check the log for a 429 on that
dictation.** Several fixes this session chased prompt behaviour for
failures that were partly rate limits.

The arithmetic: the `ai_prompt` system prompt is ~12,700 characters
(~3,180 tokens) and the reply reserve is ~700, so ~3,900 tokens per call
against an 8,000/minute limit. **Two dictations inside a minute exceed
it.** `src/shared/prompt-size.test.ts` holds a ceiling for this reason and
its comment explains the failure in detail.

**The fix is a Groq tier upgrade, and it is the user's to make.** No
prompt change competes with it. Also worth checking whether Groq caches
identical system prefixes — this one is byte-identical on every call.

---

## How to debug this app

Almost every question here is answerable from data on the machine. Do
that before theorising.

**The log** — `~/Library/Application Support/yappr/yappr.log`. Every
dictation writes `Transcribed`, `Routed to …`, `Cleaned` (with
`contextChars`, `category`, `register`) and `Pasted`. Errors write the
HTTP status. This is how every diagnosis below was made.

**The context store** — `~/Library/Application Support/yappr/context.db`,
SQLite. `context_facts` holds the remembered rules in two tiers
(`scope='global'`, or `scope='project'` with a `project_key`).
`context_kv` holds the overview paragraph.

**History** — `~/Library/Application Support/yappr/yappr-history.json`,
capped at 1000 entries. Transcript AND output for each dictation, which
is how you compare what was said with what was pasted.

**Building a prompt to look at it.** The most useful technique found this
session: write a throwaway vitest that calls `buildCleanupPrompt(...)`
with the real stored facts and throws the result, then delete it. It
shows exactly what the model receives, including ordering. Two real bugs
were found that way and one was found *in a fix* before it shipped.

**Timezones bite.** The log is UTC; `ps lstart` and `git log` are local.
Comparing them directly produced a wrong conclusion twice.

**Check the build is the one you think.** `out/main/index.js` is the
running bundle; `grep` it for a string from your change. The user tested
"is it fixed" three times on a build that predated the fix.

---

## Open issues

### 1. Context in shaped prompts — just fixed, UNVERIFIED

The long-running one. "Build me a sidebar" produced `## Goal` and nothing
else, with 3,432 characters of context attached to the call.

Five prompt-level attempts failed (`ba9f214`, `bd5961c`, `8b29606` —
rewording, a prompt-specific framing, a destination split, "REQUIRED" in
capitals, moving the block to sit beside the transcript). The model
reliably drops the judgement step.

`6e5a6b3` stops asking. `src/shared/constraints-block.ts` selects
build-relevant preferences and the pipeline appends a `## Constraints`
section deterministically after a reformat. **Not yet observed working on
a live dictation.**

### 2. The remembered-rules store is polluted

The compactor mined the user's own bug reports as durable preferences —
"I always want prompts to include both context and constraints" is a
complaint about Yappr, stored as a preference about how the user works.
`5ca7b5a` stops the miner doing it; the existing rows are still there.

Because `capForInjection` is newest-first, a week of debugging notes fills
the 600-character global budget while "I want fluid animations in
interfaces" sits below the cut. `6e5a6b3` scores on build-relevance
instead, which mitigates it, but the store still wants pruning.

Cleanup SQL was handed to the user and not yet run (a sandbox classifier
blocks the assistant from mutating that database).

### 3. Spoken email addresses are not formatted

"name at gmail.com" should become `name@gmail.com`. Not built. It belongs
with the deterministic passes (brand names, dictionary) so it runs even
when the LLM is skipped or rate-limited. Needs care not to mangle "meet me
at Gmail's office".

### 4. Select-and-rewrite is unobservable and unguarded

`runCommandPipeline` logs `Command pipeline` when it starts and **nothing
afterwards** — no result, no error. It is the one path that cannot be
diagnosed from the log.

It also lacks the hollow-email guard. A live rewrite returned
`"Subject: Shipping address for mouse delivery\n\nHi,"` and nothing
caught it; `composedEmailBodyChars` is only checked on the dictation path.

### 5. Email composition — fixed, worth knowing the shape

Three separate bugs, all shipped:
- Compose fired on LENGTH alone (12+ words in Gmail), so dictating an
  email was treated as a brief for one. Now needs an instruction verb
  ("tell Sam...", "ask Jeff if...") — `b64cf01`.
- A composed email with a greeting and sign-off and no body was pasted.
  Guarded — `2e01df7`.
- Cleanup correctly added nothing to a dictated email, leaving it
  unsigned. `completeEmailSignoff` finishes it — `0e8c6e5`.

### 6. Beta backend is live; the client is not cut over

Supabase project `nagrmlfkuubeipamxhoe` has the schema, the usage RPC and
the `cleanup` Edge Function deployed (`7aa1c84`). **10 files still
reference `groqKey`** and `@supabase/supabase-js` is not a dependency.
The cutover — `baseURL` swap, email-OTP sign-in, removing the key field —
has deliberately not been started. See `supabase/README.md`.

Still on the user: enable the Email auth provider (and switch the
template to `{{ .Token }}` for OTP), set `GROQ_API_KEY` as a function
secret, add tester emails, Apple Developer enrolment, and the Groq tier.

### 7. Not built, asked for

- A UI to multi-select remembered rules and move them between projects.
  Needs a new `CONTEXT_FACT_MOVE` IPC; the existing ones only cover
  delete, update and rename-bucket.
- History: 12-month retention with a date-grouped scrolling view was
  specced and **declined** — see the spec in `docs/superpowers/specs/`,
  which records the measurements and why.

---

## Conventions that matter here

Read `CLAUDE.md`. The two that catch people:

**Pure logic goes in its own module, and tests must cover shipped code.**
`pipeline.ts`, the worker and anything importing electron or
`better-sqlite3` cannot load under vitest — `better-sqlite3` is built for
Electron's ABI. That is why prompts live in `src/shared/` and
`src/main/context/project-facts.ts` rather than beside their callers.

**Comments explain why, and cite the measurement.** Nearly every constant
in this codebase came from a real log line or benchmark. Say which.

**Prompt size is a cost.** `src/shared/prompt-size.test.ts` will fail if
you add a block to `ai_prompt`, which currently has ~70 characters of
headroom. That is deliberate.
