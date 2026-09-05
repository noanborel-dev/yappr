// What "move these rules to that card" actually means, decided before
// anything touches the database.
//
// Pure — no electron, no sqlite — so the two decisions worth getting
// right are unit-testable: which tier a destination key names, and which
// of the ids arriving over IPC are usable. facts.ts owns the two
// statements that carry the plan out.

import type { FactScope } from '../../shared/types'
import { GLOBAL_SCOPE } from './project-key'

export interface FactMoveTarget {
  scope: FactScope
  /** Always '' for the global tier — see resolveMoveTarget. */
  projectKey: string
}

export interface FactMovePlan {
  ids: number[]
  target: FactMoveTarget
}

// Upper bound on one move. MAX_FACTS_PER_BUCKET is 50, so 500 is ten
// full cards selected at once — unreachable on a real store, where the
// whole table holds tens of rows. It exists so a malformed renderer
// payload cannot build a statement with more bound parameters than
// SQLite will take (999 on older builds).
export const MAX_MOVE_IDS = 500

/**
 * Canonical form of a destination bucket key.
 *
 * The same normalisation renameBucket applies to a typed name: bucket
 * keys are minted by normalizeProjectKey, which already lowercases and
 * collapses whitespace, so re-applying it here means "Yappr " and
 * "yappr" can never address two different cards.
 */
export function normalizeBucketKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Which (scope, project_key) pair a destination key names, or null when
 * the key is unusable.
 *
 * The global tier is the pair, not the scope alone: a global row carries
 * scope 'global' AND an empty project_key, exactly as addFact writes it.
 * Splitting them would let the same preference be stored once per
 * project, which is the thing the empty key prevents.
 *
 * 'unsorted' is deliberately NOT special-cased. It is a real project
 * bucket — the one addFact files unkeyed facts into — so moving a rule
 * into it is a legitimate "I don't know where this goes", the same
 * statement Yappr makes when it refuses to guess a key.
 */
export function resolveMoveTarget(toKey: unknown): FactMoveTarget | null {
  if (typeof toKey !== 'string') return null
  const key = normalizeBucketKey(toKey)
  if (!key) return null
  if (key === GLOBAL_SCOPE) return { scope: 'global', projectKey: '' }
  return { scope: 'project', projectKey: key }
}

/**
 * The ids that can name a row: positive integers, deduped, order kept.
 *
 * Row ids come from INTEGER PRIMARY KEY AUTOINCREMENT, so anything
 * non-integer or ≤ 0 names nothing and is dropped rather than sent to
 * the database. Duplicates matter because the delete counts rows, and
 * the same id listed twice must not read as two facts moved.
 */
export function sanitizeFactIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  for (const value of raw) {
    if (typeof value !== 'number') continue
    if (!Number.isInteger(value) || value <= 0) continue
    seen.add(value)
  }
  return [...seen]
}

/**
 * The whole decision: what to move and where, or null when there is
 * nothing legitimate to do. Refusing an oversized selection outright
 * beats truncating it — a partial move the user did not ask for is
 * indistinguishable from a bug.
 */
export function planFactMove(ids: unknown, toKey: unknown): FactMovePlan | null {
  const target = resolveMoveTarget(toKey)
  if (!target) return null
  const clean = sanitizeFactIds(ids)
  if (clean.length === 0) return null
  if (clean.length > MAX_MOVE_IDS) return null
  return { ids: clean, target }
}

/**
 * Is this move a no-op for a fact already sitting at the destination?
 *
 * The move is INSERT OR IGNORE + DELETE (the unique index on
 * (scope, project_key, text) would otherwise throw on a collision). For
 * a row already at the destination the insert conflicts with the row
 * ITSELF and is ignored, so an unguarded delete would remove the only
 * copy: the fact would vanish instead of staying put. facts.ts excludes
 * these rows from the delete; this predicate is the same rule, testable.
 */
export function isAlreadyAtTarget(
  fact: { scope: FactScope; projectKey: string },
  target: FactMoveTarget,
): boolean {
  return fact.scope === target.scope && fact.projectKey === target.projectKey
}
