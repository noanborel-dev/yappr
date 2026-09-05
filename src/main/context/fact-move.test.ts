import { describe, it, expect } from 'vitest'
import {
  MAX_MOVE_IDS,
  normalizeBucketKey,
  resolveMoveTarget,
  sanitizeFactIds,
  planFactMove,
  isAlreadyAtTarget,
} from './fact-move'

describe('resolveMoveTarget', () => {
  // The invariant the whole tier split rests on: a global row is scope
  // AND empty key together. Returning scope 'global' with the key
  // 'global' would file one preference once per project.
  it('pairs the global scope with an empty project key', () => {
    expect(resolveMoveTarget('global')).toEqual({ scope: 'global', projectKey: '' })
  })

  it('files any other key as a project bucket', () => {
    expect(resolveMoveTarget('yappr')).toEqual({ scope: 'project', projectKey: 'yappr' })
  })

  // Unsorted is a real bucket — the one addFact writes unkeyed facts
  // into — not a pseudo-scope. Moving into it has to work.
  it('treats unsorted as an ordinary project bucket', () => {
    expect(resolveMoveTarget('unsorted')).toEqual({ scope: 'project', projectKey: 'unsorted' })
  })

  it('normalises the key the way bucket keys are minted', () => {
    expect(resolveMoveTarget('  Yappr  Landing ')).toEqual({
      scope: 'project',
      projectKey: 'yappr landing',
    })
    // Case alone must not mint a second card for the same project.
    expect(resolveMoveTarget('YAPPR')).toEqual(resolveMoveTarget('yappr'))
  })

  it('resolves the global tier however it is cased or padded', () => {
    expect(resolveMoveTarget('  GLOBAL ')).toEqual({ scope: 'global', projectKey: '' })
  })

  it('refuses a key that names nothing', () => {
    expect(resolveMoveTarget('')).toBeNull()
    expect(resolveMoveTarget('   ')).toBeNull()
  })

  // The handler guards with typeof, but the resolver is the thing that
  // must not hand facts.ts a project_key of "undefined".
  it('refuses a non-string key', () => {
    expect(resolveMoveTarget(undefined)).toBeNull()
    expect(resolveMoveTarget(null)).toBeNull()
    expect(resolveMoveTarget(7)).toBeNull()
    expect(resolveMoveTarget(['yappr'])).toBeNull()
  })
})

describe('normalizeBucketKey', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeBucketKey(' My   Project ')).toBe('my project')
  })
})

describe('sanitizeFactIds', () => {
  it('keeps positive integers in order', () => {
    expect(sanitizeFactIds([3, 1, 2])).toEqual([3, 1, 2])
  })

  // Row ids are INTEGER PRIMARY KEY AUTOINCREMENT: nothing else names a
  // row, so nothing else reaches the database.
  it('drops anything that cannot be a row id', () => {
    expect(sanitizeFactIds([0, -1, 1.5, NaN, Infinity, '2', null, undefined, {}])).toEqual([])
  })

  it('dedupes, so one id listed twice is not two facts moved', () => {
    expect(sanitizeFactIds([4, 4, 4])).toEqual([4])
  })

  it('returns empty for anything that is not an array', () => {
    expect(sanitizeFactIds(undefined)).toEqual([])
    expect(sanitizeFactIds('1,2')).toEqual([])
    expect(sanitizeFactIds({ 0: 1, length: 1 })).toEqual([])
  })
})

describe('planFactMove', () => {
  it('plans a project-to-project move', () => {
    expect(planFactMove([1, 2], 'yappr')).toEqual({
      ids: [1, 2],
      target: { scope: 'project', projectKey: 'yappr' },
    })
  })

  it('plans a move up to the global tier', () => {
    expect(planFactMove([9], 'global')).toEqual({
      ids: [9],
      target: { scope: 'global', projectKey: '' },
    })
  })

  it('refuses an empty selection', () => {
    expect(planFactMove([], 'yappr')).toBeNull()
    // Every id was junk, so there is nothing to move even though the
    // array was not empty.
    expect(planFactMove([0, -3], 'yappr')).toBeNull()
  })

  it('refuses when the destination is unusable', () => {
    expect(planFactMove([1], '')).toBeNull()
  })

  // Refusing beats truncating: a partial move nobody asked for looks
  // exactly like a bug.
  it('refuses a selection larger than the cap rather than truncating it', () => {
    const tooMany = Array.from({ length: MAX_MOVE_IDS + 1 }, (_, i) => i + 1)
    expect(planFactMove(tooMany, 'yappr')).toBeNull()
    const atCap = Array.from({ length: MAX_MOVE_IDS }, (_, i) => i + 1)
    expect(planFactMove(atCap, 'yappr')?.ids).toHaveLength(MAX_MOVE_IDS)
  })
})

describe('isAlreadyAtTarget', () => {
  // The guard that stops a fact vanishing: INSERT OR IGNORE skips a row
  // that conflicts with itself, so deleting it unconditionally would
  // remove the only copy.
  it('recognises a fact already sitting in the destination bucket', () => {
    expect(
      isAlreadyAtTarget({ scope: 'project', projectKey: 'yappr' }, { scope: 'project', projectKey: 'yappr' }),
    ).toBe(true)
    expect(
      isAlreadyAtTarget({ scope: 'global', projectKey: '' }, { scope: 'global', projectKey: '' }),
    ).toBe(true)
  })

  it('does not confuse a global fact with a project bucket named global', () => {
    // A bucket the user renamed to "global" is scope 'project'; the
    // global tier is scope 'global' with no key. Same word, different row.
    expect(
      isAlreadyAtTarget({ scope: 'project', projectKey: 'global' }, { scope: 'global', projectKey: '' }),
    ).toBe(false)
  })

  it('is false for a fact in another bucket', () => {
    expect(
      isAlreadyAtTarget({ scope: 'project', projectKey: 'unsorted' }, { scope: 'project', projectKey: 'yappr' }),
    ).toBe(false)
  })
})
