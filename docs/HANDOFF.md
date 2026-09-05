# Handoff — state of play, 2026-09-05 (evening)

Written for a fresh session. **Read `docs/ARCHITECTURE.md` first** — it is
the source of truth for the product, the business model and where data
travels, and it wins over this file.

---

## The one thing to understand before debugging anything

**Cleanup fails often, and every failure pastes the raw transcript.**

This presents as *every* other bug. "It left my ums in", "it kept both
halves of my correction", "it didn't format the email", "it ignored my
context" — all of those are what an unpolished transcript looks like, and
a rate-limited key is not an absent key, so nothing on screen says so.

**Before concluding a prompt is wrong, check the log for a 429 on that
dictation.** Several fixes have chased prompt behaviour for failures that
were rate limits.

### The limit that actually binds is the DAILY one

The earlier version of this file said the problem was the per-minute
limit and did the arithmetic against it. That was wrong, and it mattered,
because it pointed at prompt size as the lever. Measured over the whole
of `yappr.log`:

| | limit | 429s |
|---|---|---|
| tokens per day (TPD) | 200,000 | **366** |
| tokens per minute (TPM) | 8,000 | 264 |

and on the heaviest recent days TPD outnumbers TPM 48:3, 76:3, 14:9. A
TPD window is reported in minutes or hours, and clears only when the
rolling day does. **No amount of prompt trimming buys another dictation
once the day's 200,000 is spent.**

The real per-call cost, measured rather than estimated:

- the `ai_prompt` template alone is 12,730 chars / 3,183 tokens
- **as actually sent**, with a live context block, 17,248 chars / 4,312
  tokens — plus a ~700-token reply reserve, so ~5,000 a call
- across 636 rate-limited requests: median 4,139 tokens, p90 7,188, max
  8,547 — six of them larger than the entire per-minute budget, so
  unable to succeed at any pacing

200,000 ÷ ~5,000 is **about forty shaped dictations a day.** That is the
ceiling, and `src/shared/prompt-size.test.ts` now pins these numbers so
the next session does not re-derive them from the wrong shape (it used to
measure the prompt with an empty context block — a shape the reformat
path never sends).

**The fix is a Groq tier upgrade, and it is the user's to make.** No
prompt change competes with it. Also still worth checking whether Groq
caches identical system prefixes — this one is byte-identical per call.

**What was fixed in code:** the retry hint parser only understood a
bare-seconds window, so `18m38.016s` and `1h12m10s` fell through to
"not a rate limit" and were answered with a 250ms retry that could not
possibly succeed. 360 of 624 hints were affected; the log shows 62
dictations paying for a guaranteed-to-fail second attempt. The wait cap
was effectively unreachable on the failure mode that fires most.

---

## How to debug this app

Almost every question here is answerable from data on the machine. Do
that before theorising.

**The log** — `~/Library/Application Support/yappr/yappr.log`. Every
dictation writes `Transcribed`, `Routed to …`, `Cleaned` (with
`contextChars`, `category`, `register`), `Constraints` and `Pasted`.
Errors write the HTTP status.

Select-and-rewrite used to write one line at the start and nothing
afterwards — it was the only path that could not be diagnosed here. It
now writes `Transcribed (rewrite)`, `Rewritten`, `Rewrite complete`, and
logs its failures.

**The context store** — `~/Library/Application Support/yappr/context.db`,
SQLite, WAL. `context_facts` holds the remembered rules in two tiers
(`scope='global'`, or `scope='project'` with a `project_key`).
`context_kv` holds the overview paragraph.

Two traps when reading it from outside the app: **quit Yappr first**
(the store keeps an in-process cache that only drops on a write through
the app, so external deletes appear to do nothing until a restart), and
**never back it up with `cp`** — the `-wal` routinely holds more than the
main file (210KB against 57KB, measured), so `cp context.db` captures the
smaller half. Use `sqlite3 "$DB" ".backup out.db"`.
`scripts/prune-context.sh` does both correctly.

**History** — `~/Library/Application Support/yappr/yappr-history.json`,
capped at 1000 entries. Transcript AND output for each dictation, which
is how you compare what was said with what was pasted. It is also the
best regression corpus in the project: running a new text pass over all
of it and reading every string it changes catches things unit tests do
not. That is how the spoken-email pass lost two mangles before shipping.

**Building a prompt to look at it.** Write a throwaway vitest that calls
`buildCleanupPrompt(...)` with the real stored facts and prints the
result, then delete it. It shows exactly what the model receives,
including ordering. The same trick against `selectConstraints` with the
real `context.db` rows is how the `ui`-substring scoring bug was found.

**Timezones bite.** The log is UTC; `ps lstart` and `git log` are local.
Comparing them directly produced a wrong conclusion twice.

**Check the build is the one you think.** `out/main/index.js` is the
running bundle; `grep` it for a string from your change. The user tested
"is it fixed" three times on a build that predated the fix.

---

## Open issues

### 1. Context in shaped prompts — still not observed on a live dictation

`src/shared/constraints-block.ts` selects build-relevant preferences and
the pipeline appends a `## Constraints` section deterministically after a
reformat. The unit tests are good and the code is in the running bundle.

**What was blocking verification is now fixed:** nothing logged that
constraints had been attached, so a success and a failure looked
identical in the log — which is how five prompt-level attempts were each
believed to have shipped. There is now a `Constraints` line carrying
`shaped`, `candidates`, `selected`, `changed` and `addedChars`.

Scoring also had a real bug: keywords matched as bare substrings, so the
two-letter `ui` fired inside req**ui**re, b**ui**lt, fl**ui**d, g**ui**ded
and liq**ui**d. Against the user's own 71 facts that inflated six scores
and admitted one on nothing else — *"I always require prompts to include
all relevant context and constraints"*, a bug report about Yappr, i.e.
exactly what the module exists to keep out. It stayed out of the top six
by luck of the other scores. Keywords now match at word starts.

**To close this:** say "build me a sidebar" in VS Code with `claude`
running, on a key that is not rate-limited, then read the `Constraints`
line. Both live attempts on 2026-09-05 hit the daily limit before
reaching the code.

### 2. The remembered-rules store is polluted

The compactor mined the user's own bug reports as durable preferences.
`f68552c` stops it doing that; the existing rows are still there — 44
global facts, of which 22 are meta-statements about Yappr, many
near-duplicates of each other.

`scripts/prune-context.sh` is now tracked (it was an untracked working-copy
file, one `git clean` from gone) and its two data-loss defects are fixed —
see the backup and running-app traps above. Its classification was checked
by hand against the store: 22 out, 22 real preferences kept.

**Still on the user:** quit Yappr, run `./scripts/prune-context.sh` to
review the dry run, then `--apply`. Not run here — deleting from a live
store is theirs to trigger.

### 3. Spoken email addresses — built

`src/shared/spoken-email.ts`. "noan dot borel at gmail dot com" becomes
`noan.borel@gmail.com`, deterministically, so it survives the
short-utterance fast path and a rate-limited key.

**It requires POSITIVE EVIDENCE of an address**, and that is the whole
design. The first version fired on anything shaped `<word> at <domain>`
and kept a stoplist of words that were never a local part. English
supplies content nouns in front of "at" without limit, so that list
could not be finished:

    "You can find the docs at yappr.com" -> "the docs@yappr.com"
    "See the README at github dot com"   -> "the readme@github.com"

It passed a run over all 710 stored transcripts only because the user
had not happened to dictate that shape. **Absence from one corpus is not
a guard** — that is the lesson worth keeping from this one.

Now one of four things must say it is an address: a dotted local part, an
explicit "at sign", a known mail-provider domain, or a cue word in front
("email noan at …"). And the word before the local part must be one that
can precede a name rather than be part of one, which is what leaves
"hey noan borel at gmail dot com" alone instead of stranding "noan".

Accepted cost: "noan at yappr dot co dot uk" — a bare name at a custom
domain — is left alone, because nothing distinguishes it from prose about
a website.

### 4. Select-and-rewrite — observable and guarded

Logging as described above. The hollow-email guard now runs on this path
too.

Porting it verbatim would not have worked: a leading `Subject:` line was
counted as body AND shielded the greeting behind it from being stripped,
so the reported failure — `"Subject: Shipping address for mouse
delivery\n\nHi,"` — scored 49 against a floor of 40 and sailed through.
`composedEmailBodyChars` now skips a leading subject line, which fixes
the same latent blindness on the compose path.

The rewrite path uses a stricter rule than the compose path's floor: a
body of exactly zero. "Shorten this email" legitimately returns very
little, and discarding a terse success would undo what was asked.

Two follow-on corrections, both found by reviewing the branch rather than
by a test. `GREETING_RE` matched any line without sentence punctuation,
so the whole of "Hi Jeff, sounds good to me" counted as a greeting and a
real one-line reply measured zero — silently discarded. And
`COMPOSED_EMAIL_MIN_BODY_CHARS` was 40, calibrated when the subject line
still counted toward the body; with subject lines now stripped the same
number cut into real terse emails, so it is 12.

### 5. Email composition — fixed, worth knowing the shape

Three separate bugs, all shipped: compose fired on LENGTH alone
(`b64cf01`); a greeting-and-signoff shell was pasted (`2e01df7`); a
dictated email was left unsigned (`0e8c6e5`).

### 6. Beta backend is live; the client is not cut over

Supabase project `nagrmlfkuubeipamxhoe` has the schema, the usage RPC and
the `cleanup` Edge Function deployed (`7aa1c84`). **10 files still
reference `groqKey`** and `@supabase/supabase-js` is not a dependency.
The cutover — `baseURL` swap, email-OTP sign-in, removing the key field —
has deliberately not been started. See `supabase/README.md`.

Still on the user: enable the Email auth provider (and switch the
template to `{{ .Token }}` for OTP), set `GROQ_API_KEY` as a function
secret, add tester emails, Apple Developer enrolment, and the Groq tier.

### 7. Moving remembered rules between cards — built

`CONTEXT_FACT_MOVE`, with the move decision in the pure, tested
`src/main/context/fact-move.ts`. Multi-select checkboxes on the cards,
selection spanning cards, "Move to…" including the global tier.

Note the guard worth remembering if you touch it: a selected fact already
sitting in the destination has its `INSERT OR IGNORE` skipped by
colliding with itself, so an unguarded `DELETE` destroys the only copy.

### 8. The deterministic chain does not fully reach two paths

`runCommandPipeline` and `repolishEntry` ran **none** of it until
2026-09-05. The vocabulary passes — brand names, dictionary aliases and
the user dictionary — now run on all three paths, because they are
correct on any text.

Near-miss is the exception among them. It is the only fuzzy pass, a
phonetic match within one edit, so it runs only where a transcriber
could have been wrong: not on `code` surfaces, and never on
select-and-rewrite. With "Noan" in the dictionary it turns
`const nan = NaN;` into `const Noan = Noan;`.

The rest stay on the speech paths deliberately: self-correction, spoken
numbers, spoken email addresses, spelled-name collapse and question marks
all read their input AS SPEECH, and a rewritten selection is the user's
own writing. If that line ever needs moving, move it deliberately.

### 9. Not built, asked for

History: 12-month retention with a date-grouped scrolling view was
specced and **declined** — see the spec in `docs/superpowers/specs/`,
which records the measurements and why.

---

## Conventions that matter here

Read `CLAUDE.md`. The three that catch people:

**Pure logic goes in its own module, and tests must cover shipped code.**
`pipeline.ts`, the worker and anything importing electron or
`better-sqlite3` cannot load under vitest. That is why prompts live in
`src/shared/` and why `fact-move.ts` exists separately from `facts.ts`.

Note the standing debt: **five of the nine deterministic passes are
private functions inside `pipeline.ts` and have no tests at all.** There
is no `text-passes.ts` — this file and `ARCHITECTURE.md` claimed there was
until 2026-09-05. An extraction exists on the unmerged branch
`worktree-phase0a-correctness-bugs` (`1c91c29`), written 2026-07-29
against a pipeline that has moved a long way since: a starting point, not
a patch to apply.

**Comments explain why, and cite the measurement.** Nearly every constant
in this codebase came from a real log line or benchmark. Say which.

**Regression tests use the real failing input**, verbatim, with a comment
naming the symptom.
