// Two-tier context storage (spec §1.2).
//
// Reads are on the dictation hot path, so the per-project result is
// cached in memory and invalidated on write. A cold read is one indexed
// query over a table that holds tens of rows.
//
// Queries only — the rules about what is storable, how much may be
// injected and how it is framed live in facts-format.ts, which is pure
// and tested.

import { getDb } from './store'
import { logError, logInfo } from '../log'
import type { FactScope, StoredFact, FactBucket } from '../../shared/types'
import { normalizeFactText, MAX_FACTS_PER_BUCKET } from './facts-format'
import { GLOBAL_SCOPE, UNSORTED_BUCKET } from './project-key'
import { planFactMove } from './fact-move'

interface FactRow {
  id: number
  scope: string
  project_key: string
  text: string
  created_at: number
}

const toFact = (r: FactRow): StoredFact => ({
  id: r.id,
  scope: r.scope === 'global' ? 'global' : 'project',
  projectKey: r.project_key,
  text: r.text,
  createdAt: r.created_at,
})

// Keyed by project key; the global tier is cached under GLOBAL_SCOPE.
let cache = new Map<string, StoredFact[]>()

function invalidate(): void {
  cache = new Map()
}

/**
 * Store a fact. Returns false when it was rejected (unstorable text, a
 * duplicate, or the store being unavailable) — none of which is an error
 * the user needs to see.
 */
export function addFact(opts: { scope: FactScope; projectKey?: string | null; text: string }): boolean {
  const db = getDb()
  if (!db) return false
  const text = normalizeFactText(opts.text)
  if (!text) return false
  // Global facts are not scoped to a project, so they must not carry a
  // key — otherwise the same preference could be stored once per project.
  const projectKey = opts.scope === 'global' ? '' : (opts.projectKey || UNSORTED_BUCKET)

  try {
    const result = db
      .prepare(
        `INSERT INTO context_facts (scope, project_key, text, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (scope, project_key, text) DO NOTHING`,
      )
      .run(opts.scope, projectKey, text, Date.now())
    if (result.changes === 0) return false // already known
    pruneBucket(opts.scope, projectKey)
    invalidate()
    logInfo('[context/facts] stored', { scope: opts.scope, projectKey, chars: text.length })
    return true
  } catch (err) {
    logError('[context/facts] write failed', err)
    return false
  }
}

// Keep a bucket bounded. Oldest first, because a superseded convention is
// the one most likely to be stale.
function pruneBucket(scope: FactScope, projectKey: string): void {
  const db = getDb()
  if (!db) return
  try {
    db.prepare(
      `DELETE FROM context_facts
        WHERE scope = ? AND project_key = ?
          AND id NOT IN (
            SELECT id FROM context_facts
             WHERE scope = ? AND project_key = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
          )`,
    ).run(scope, projectKey, scope, projectKey, MAX_FACTS_PER_BUCKET)
  } catch (err) {
    logError('[context/facts] prune failed', err)
  }
}

function readBucket(scope: FactScope, projectKey: string): StoredFact[] {
  const cacheKey = scope === 'global' ? GLOBAL_SCOPE : `project:${projectKey}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const db = getDb()
  if (!db) return []
  try {
    const rows = db
      .prepare<[string, string], FactRow>(
        `SELECT id, scope, project_key, text, created_at
           FROM context_facts
          WHERE scope = ? AND project_key = ?
          ORDER BY created_at DESC, id DESC`,
      )
      .all(scope, projectKey)
    const facts = rows.map(toFact)
    cache.set(cacheKey, facts)
    return facts
  } catch (err) {
    logError('[context/facts] read failed', err)
    return []
  }
}

/**
 * The facts that apply to a dictation: global preferences plus the
 * current project's, and nothing else. Loading other projects' facts is
 * the exact thing this tier split exists to prevent.
 */
export function getFactsFor(projectKey: string | null): { global: StoredFact[]; project: StoredFact[] } {
  return {
    global: readBucket('global', ''),
    project: projectKey ? readBucket('project', projectKey) : [],
  }
}

/**
 * Every bucket, for the project-cards UI (spec §1.4). This is the trust
 * surface — the user has to be able to see everything Yappr stored.
 */
export function listBuckets(): FactBucket[] {
  const db = getDb()
  if (!db) return []
  try {
    const rows = db
      .prepare<[], FactRow>(
        `SELECT id, scope, project_key, text, created_at
           FROM context_facts
          ORDER BY created_at DESC, id DESC`,
      )
      .all()
    const byKey = new Map<string, FactBucket>()
    for (const row of rows) {
      const fact = toFact(row)
      const key = fact.scope === 'global' ? GLOBAL_SCOPE : fact.projectKey
      let bucket = byKey.get(key)
      if (!bucket) {
        bucket = { key, scope: fact.scope, facts: [] }
        byKey.set(key, bucket)
      }
      bucket.facts.push(fact)
    }
    // Global first, then unsorted last, projects alphabetical between.
    return [...byKey.values()].sort((a, b) => {
      if (a.key === GLOBAL_SCOPE) return -1
      if (b.key === GLOBAL_SCOPE) return 1
      if (a.key === UNSORTED_BUCKET) return 1
      if (b.key === UNSORTED_BUCKET) return -1
      return a.key.localeCompare(b.key)
    })
  } catch (err) {
    logError('[context/facts] listBuckets failed', err)
    return []
  }
}

/** Whether anything has ever been stored. Cheap: one indexed count. */
export function hasAnyFacts(): boolean {
  const db = getDb()
  if (!db) return false
  try {
    const row = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM context_facts').get()
    return (row?.n ?? 0) > 0
  } catch (err) {
    logError('[context/facts] count failed', err)
    // Assume populated on error: the bootstrap below is a one-off nicety,
    // and re-running it on every launch would be worse than skipping it.
    return true
  }
}

/**
 * Rename a project bucket, moving every fact in it.
 *
 * The cards were deliberately read-and-delete only: the store shows what
 * you actually said, and an editor invites rewriting it. That reasoning
 * held while the only way in was your own words. It stopped holding once
 * the KEY could be wrong — a Claude conversation title filed as a
 * codebase is not something the user said, and deleting the whole card
 * to fix a name throws away correct facts to correct a label.
 *
 * INSERT OR IGNORE then delete the stragglers: the unique index is
 * (scope, project_key, text), so moving a fact whose text already exists
 * in the destination would throw. Merging two cards is a legitimate
 * thing to want and should not fail on a duplicate.
 */
export function renameBucket(from: string, to: string): boolean {
  const db = getDb()
  if (!db) return false
  const target = to.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!target || target === from) return false
  try {
    db.prepare(
      `INSERT OR IGNORE INTO context_facts (scope, project_key, text, created_at)
       SELECT scope, ?, text, created_at FROM context_facts
        WHERE scope = 'project' AND project_key = ?`,
    ).run(target, from)
    db.prepare("DELETE FROM context_facts WHERE scope = 'project' AND project_key = ?").run(from)
    invalidate()
    logInfo('[context/facts] bucket renamed', { from, to: target })
    return true
  } catch (err) {
    logError('[context/facts] rename failed', err)
    return false
  }
}

/**
 * Move a selection of facts into another bucket. Returns how many rows
 * actually left the bucket they were in.
 *
 * The same correction renameBucket exists for, one row at a time: a
 * wrong KEY is fixable by typing, but a rule filed under the wrong
 * project — or a personal preference that landed in a project card
 * instead of Everywhere — could previously only be fixed by deleting it
 * and saying it again. Multi-select because misfiling happens in runs:
 * a whole session's facts go to the same wrong card.
 *
 * INSERT OR IGNORE then delete, exactly as renameBucket does: the unique
 * index is (scope, project_key, text), so moving a fact whose text
 * already exists in the destination would throw. The insert is ignored
 * and the source row is deleted, which is the right outcome — the user
 * asked for the fact to be in the destination and it is; keeping a
 * second copy in the source would be a move that did not move.
 *
 * COUNTING: a deduped fact counts as moved. From the card's point of
 * view it left the source and the destination now states it, which is
 * exactly what was asked for; counting only fresh inserts would report
 * "2 of 5 moved" for a merge that fully succeeded.
 *
 * The delete skips rows ALREADY at the destination. Their insert
 * conflicts with themselves and is ignored, so an unguarded delete
 * would remove the only copy and the fact would disappear instead of
 * staying put. Those rows are correctly not counted: nothing moved.
 *
 * Deliberately does NOT prune to MAX_FACTS_PER_BUCKET. The cap bounds
 * unattended capture; dropping facts the user just deliberately moved —
 * oldest first, and moved rows keep their original created_at — would
 * silently destroy the intent. renameBucket does not prune either.
 */
export function moveFacts(ids: number[], toKey: string): number {
  const db = getDb()
  if (!db) return 0
  const plan = planFactMove(ids, toKey)
  if (!plan) return 0
  const holes = plan.ids.map(() => '?').join(',')
  const { scope, projectKey } = plan.target
  try {
    // One transaction: insert-then-delete is only a move if both halves
    // land. A failure between them would either duplicate every fact or
    // lose it.
    const run = db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO context_facts (scope, project_key, text, created_at)
         SELECT ?, ?, text, created_at FROM context_facts WHERE id IN (${holes})`,
      ).run(scope, projectKey, ...plan.ids)
      return db
        .prepare(
          `DELETE FROM context_facts
            WHERE id IN (${holes}) AND NOT (scope = ? AND project_key = ?)`,
        )
        .run(...plan.ids, scope, projectKey).changes
    })
    const moved = run()
    // Without this the next dictation is built from the pre-move
    // buckets — the fact would still be injected into the project it was
    // just taken out of.
    invalidate()
    logInfo('[context/facts] facts moved', { to: toKey, selected: plan.ids.length, moved })
    return moved
  } catch (err) {
    // The transaction rolled back, so nothing changed and the cache is
    // still true.
    logError('[context/facts] move failed', err)
    return 0
  }
}

/**
 * Edit one fact's text.
 *
 * Returns false when the text is not storable, or when the edit collides
 * with a fact already in that bucket. Refusing the collision is right:
 * silently merging would make a row vanish under the user's cursor.
 */
export function updateFact(id: number, text: string): boolean {
  const db = getDb()
  if (!db) return false
  const next = normalizeFactText(text)
  if (!next) return false
  try {
    const result = db.prepare('UPDATE context_facts SET text = ? WHERE id = ?').run(next, id)
    invalidate()
    return result.changes > 0
  } catch (err) {
    logError('[context/facts] update failed', err)
    return false
  }
}

/** Delete one fact. */
export function deleteFact(id: number): boolean {
  const db = getDb()
  if (!db) return false
  try {
    const result = db.prepare('DELETE FROM context_facts WHERE id = ?').run(id)
    invalidate()
    return result.changes > 0
  } catch (err) {
    logError('[context/facts] delete failed', err)
    return false
  }
}

/** Delete a whole bucket — "forget everything about this project". */
export function deleteBucket(key: string): number {
  const db = getDb()
  if (!db) return 0
  try {
    const result =
      key === GLOBAL_SCOPE
        ? db.prepare("DELETE FROM context_facts WHERE scope = 'global'").run()
        : db.prepare("DELETE FROM context_facts WHERE scope = 'project' AND project_key = ?").run(key)
    invalidate()
    logInfo('[context/facts] bucket deleted', { key, removed: result.changes })
    return result.changes
  } catch (err) {
    logError('[context/facts] deleteBucket failed', err)
    return 0
  }
}

/** Drop the in-memory cache — used after an external wipe. */
export function invalidateFactsCache(): void {
  invalidate()
}
