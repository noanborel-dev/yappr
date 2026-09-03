# Dictation history: retention and browsing — requirements

**Date:** 2026-09-04
**Status:** requirements draft. Open questions at the end must be
answered before implementation.

## Why this is being rewritten

The brief said history "only keeps the most recent 50". That was true
until 2026-08-22 (`22e51f6` raised `HISTORY_PERSIST_LIMIT` 50 -> 1000)
and the running build picked it up around 08-28. Measured on this
machine today:

| day | dictations (stats) | transcripts kept |
|---|---|---|
| 2026-08-22 | 56 | 0 |
| 2026-08-24 | 28 | 0 |
| 2026-08-27 | 76 | 0 |
| 2026-08-28 | 73 | 36 |
| 2026-08-30 | 2 | 3 |
| 2026-08-31 | 30 | 35 |
| 2026-09-02 | 20 | 25 |
| 2026-09-03 | 41 | 42 |

326 dictations recorded, 141 transcripts retained. **The text of ~186
dictations is already gone and is not recoverable** — `electron-store`
rewrote the JSON in place with no backup. Counts survive in
`yappr-stats.json`, which stores no text.

So the display was never the problem. `HistoryTab.tsx:24` already calls
`getAllHistory()`, already renders every filtered item with no slice, and
already has a search bar. **The problem is retention, and it is not
fixed — 1000 is roughly a fortnight at the observed 40-75/day.**

## The constraint that forces an architecture change

`persistHistoryEntry` reads the whole store, unshifts, and writes the
whole store, on every dictation. Measured at 653 bytes/entry:

- 1000 entries -> **638 KB rewritten per dictation**
- 10,000 entries -> **6.2 MB rewritten per dictation**

That write sits immediately after paste, on the one path this codebase
optimises above all others. Unbounded retention on a
rewrite-the-world store is not a tuning problem; it is the wrong store.

`better-sqlite3` is already a dependency, already used synchronously in
`context/store.ts`, and already in `asarUnpack`. The move is cheap.

## Requirements

### R1 — Retention

- **R1.1** Every dictation's text is retained. No count-based pruning.
- **R1.2** History moves from `electron-store` JSON to SQLite. Appending
  one row must not rewrite existing rows. (Rationale above.)
- **R1.3** The existing entries migrate on first launch with no loss, and
  the migration is idempotent.
- **R1.4** The ~186 already-lost dictations are **out of scope**. They
  cannot be recovered. Their counts remain in `yappr-stats.json`.
- **R1.5** Retention-forever is not no-delete. A user-initiated delete
  must remain.

### R2 — Browsing

- **R2.1** The dashboard lists all retained dictations, newest first,
  scrollable.
- **R2.2** Render cost must not grow with the store. Today
  `filtered.map` renders every row unvirtualized — fine at 141, not at
  10,000. Windowing or paging required.
- **R2.3** The renderer must not pull the entire store over IPC to show
  one screen. `HISTORY_GET_ALL` returns everything today; at unbounded
  retention that becomes a multi-MB IPC payload on tab open.

### R3 — Search

- **R3.1** Existing search over cleaned text, raw transcript and app name
  is preserved.
- **R3.2** Search must cover the **whole store**, not just loaded rows.
  Today it filters an in-memory array; once R2.3 lands, search has to
  move into the query or it silently starts missing results.

### R4 — Date selector

- **R4.1** A date control sits **below the search input, right-aligned**.
- **R4.2** Selecting a date shows that date's dictations.
- **R4.3** Days with no dictations are visibly distinguishable. This is
  not cosmetic: the measured data has real gaps (08-23, 08-25, 08-26,
  08-29, 09-01), so a picker that offers every date invites dead ends.
- **R4.4** Clearing the selection restores the full list.

## Constraints

- **C1** No truncation of dictation text.
- **C2** Date selector bottom-right, under the search bar.
- **C3** Scrolling past 50 entries.
- **C4** No added latency after paste. The history write is on that path.
- **C5 — privacy.** The original 50-cap comment cited "keeping everything
  ever said in userData is a privacy surface", and that reason was never
  wrong. Indefinite retention makes the surface permanent, on an app whose
  FAQ leans on privacy. This needs an explicit decision and a line in the
  notice (see `docs/decisions/2026-09-03-privacy-notice-beta.md`).

## Out of scope

Recovering lost dictations; cloud sync or cross-device history; editing
stored transcripts.

## Open questions — must be answered before implementation

1. **Retention bound.** Truly forever, or a large ceiling (50k rows, or
   12 months)? "Forever" is simplest to build and hardest to defend on
   C5. A time bound is easier to disclose than a count bound.
2. **"Display a certain number of transcriptions."** Which number, and is
   it a page size, an initial render count before scrolling loads more,
   or a user-facing preference?
3. **Date selector: single date or range?** The brief says "a specific
   date", which reads as single.
4. **Date + search together.** Does picking a date search within that
   date (AND), or clear the search?
5. **Filter or jump?** Does a date replace the list with that day's
   entries, or scroll a continuous list to that day?
6. **Delete granularity.** Only "Clear all" exists. With permanent
   retention, is per-entry or per-day delete needed?
7. **Search scope.** Should it also cover `projectKey`?
8. **Stats/history divergence.** Some days hold more transcripts than
   stats records (08-31: 35 vs 30; 09-02: 25 vs 20). The two are written
   on different paths and disagree. Worth understanding before either
   becomes load-bearing for billing or the dashboard.
