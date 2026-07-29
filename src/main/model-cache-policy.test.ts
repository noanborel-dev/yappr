import { describe, it, expect } from 'vitest'
import { chooseEvictionVictim, type ResidentModel } from './model-cache-policy'

const m = (path: string, lastUsed: number, loading = false): ResidentModel =>
  ({ path, lastUsed, loading })

const ctx = (over: Partial<Parameters<typeof chooseEvictionVictim>[1]> = {}) => ({
  keepPath: 'large',
  activePath: null,
  inFlightPath: null,
  maxResident: 2,
  ...over,
})

describe('chooseEvictionVictim', () => {
  it('evicts nothing while under the cap', () => {
    expect(chooseEvictionVictim([m('base', 1)], ctx())).toBeNull()
  })

  it('evicts the least recently used once at the cap', () => {
    const residents = [m('base', 10), m('small', 5)]
    expect(chooseEvictionVictim(residents, ctx())).toBe('small')
  })

  it('never evicts the model being loaded', () => {
    const residents = [m('large', 1), m('base', 99)]
    // 'large' is oldest but is keepPath, so 'base' goes instead.
    expect(chooseEvictionVictim(residents, ctx({ keepPath: 'large' }))).toBe('base')
  })

  it('never evicts the active model', () => {
    const residents = [m('base', 1), m('small', 99)]
    const out = chooseEvictionVictim(residents, ctx({ activePath: 'base' }))
    expect(out).toBe('small')
  })

  it('never evicts a model with a transcribe in flight', () => {
    const residents = [m('base', 1), m('small', 99)]
    const out = chooseEvictionVictim(residents, ctx({ inFlightPath: 'base' }))
    expect(out).toBe('small')
  })

  it('never evicts an entry whose load has not settled', () => {
    const residents = [m('base', 1, /* loading */ true), m('small', 99)]
    expect(chooseEvictionVictim(residents, ctx())).toBe('small')
  })

  it('returns null rather than evicting something unsafe', () => {
    // Both residents are protected — better to exceed the cap than to
    // release a context someone is awaiting.
    const residents = [m('base', 1), m('small', 2)]
    const out = chooseEvictionVictim(residents, ctx({
      keepPath: 'base',
      inFlightPath: 'small',
    }))
    expect(out).toBeNull()
  })

  it('is stable when timestamps tie', () => {
    const residents = [m('base', 7), m('small', 7)]
    const out = chooseEvictionVictim(residents, ctx())
    expect(out).toBe('base')
  })

  it('evicts the LRU when a THIRD distinct model is loaded', () => {
    // Note this function is only consulted on a cache MISS. Steady-state
    // base<->large alternation is a HIT and returns before eviction is
    // ever considered, which is the whole point of the 2-model cache.
    const residents = [m('base', 1), m('large', 2)]
    expect(chooseEvictionVictim(residents, ctx({ keepPath: 'small' }))).toBe('base')
  })
})
