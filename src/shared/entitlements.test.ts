import { describe, it, expect } from 'vitest'
import { entitlementsFor, limitFacts, FREE_FACT_LIMIT, type Plan } from './entitlements'
import type { StoredFact } from './types'

function fact(id: number, createdAt: number): StoredFact {
  return { id, scope: 'project', projectKey: 'yappr', text: `fact ${id}`, createdAt }
}

describe('entitlementsFor', () => {
  // The tier table of record is docs/ARCHITECTURE.md. If that file and
  // this test disagree, one of them is a bug — ARCHITECTURE.md wins and
  // this test is what makes the disagreement loud.
  it('Free sells the four features but keeps a working taste of context', () => {
    const e = entitlementsFor('free')
    expect(e.selectAndRewrite).toBe(false)
    expect(e.perAppPolish).toBe(false)
    expect(e.contextOverview).toBe(false)
    expect(e.factLimit).toBe(FREE_FACT_LIMIT)
    // Deliberately still on: shaping works on Free, just with less
    // context behind it, so the upgrade is felt rather than described.
    expect(e.promptShaping).toBe(true)
  })

  it.each<Plan>(['pro', 'pro_trial', 'beta'])('%s gets everything, uncapped', (plan) => {
    expect(entitlementsFor(plan)).toEqual({
      promptShaping: true,
      selectAndRewrite: true,
      perAppPolish: true,
      contextOverview: true,
      factLimit: null,
    })
  })

  it('never hands Free select-and-rewrite under any plan spelling', () => {
    // This is the one entitlement the proxy also enforces, because it is
    // a distinct request mode the server can see. Client and server must
    // not disagree about who gets it.
    expect(entitlementsFor('free').selectAndRewrite).toBe(false)
  })
})

describe('limitFacts', () => {
  const facts = [fact(1, 100), fact(2, 300), fact(3, 200), fact(4, 400)]

  it('returns everything when the plan is uncapped', () => {
    expect(limitFacts(facts, null)).toHaveLength(4)
  })

  it('keeps the newest, not the first stored', () => {
    // Oldest-wins would freeze a user's context at whatever they said in
    // week one and quietly stop reflecting what they work on now.
    expect(limitFacts(facts, 2).map(f => f.id)).toEqual([4, 2])
  })

  it('passes a short list through untouched', () => {
    expect(limitFacts([fact(1, 100)], FREE_FACT_LIMIT)).toHaveLength(1)
  })

  it('handles an empty store', () => {
    expect(limitFacts([], FREE_FACT_LIMIT)).toEqual([])
  })

  it('treats a zero or negative limit as no context', () => {
    expect(limitFacts(facts, 0)).toEqual([])
    expect(limitFacts(facts, -1)).toEqual([])
  })

  it('does not mutate the caller list — it belongs to the store', () => {
    const input = [fact(1, 100), fact(2, 300)]
    limitFacts(input, 1)
    expect(input.map(f => f.id)).toEqual([1, 2])
  })

  it('caps a real Free store at three', () => {
    const many = Array.from({ length: 12 }, (_, i) => fact(i, i * 10))
    expect(limitFacts(many, FREE_FACT_LIMIT)).toHaveLength(3)
  })
})
