import { describe, it, expect } from 'vitest'
import { compactionGate, shouldKeepRetrying, type GateInput } from './compaction-gate'

const base = (over: Partial<GateInput> = {}): GateInput => ({
  count: 60,
  threshold: 50,
  compacting: false,
  hasApiKey: true,
  msSinceDictation: 120_000,
  osIdleSeconds: 60,
  idleMs: 60_000,
  osIdleSeconds_threshold: 30,
  ...over,
})

describe('compactionGate', () => {
  it('runs when there is a backlog and the machine is genuinely idle', () => {
    expect(compactionGate(base())).toEqual({ run: true, reason: 'ok' })
  })

  // THE ORIGINAL BUG: the only automatic trigger fired ~0ms after a
  // dictation, so this is the state the gate was always evaluated in.
  it('refuses immediately after a dictation', () => {
    const d = compactionGate(base({ msSinceDictation: 0, osIdleSeconds: 0 }))
    expect(d.run).toBe(false)
    expect(d.reason).toBe('recent-dictation')
  })

  it('refuses while the user is still at the keyboard', () => {
    const d = compactionGate(base({ osIdleSeconds: 5 }))
    expect(d).toEqual({ run: false, reason: 'user-active' })
  })

  it('refuses below the threshold', () => {
    expect(compactionGate(base({ count: 49 })).reason).toBe('below-threshold')
  })

  it('refuses without an API key', () => {
    expect(compactionGate(base({ hasApiKey: false })).reason).toBe('no-key')
  })

  it('refuses while one is already running', () => {
    expect(compactionGate(base({ compacting: true })).reason).toBe('in-progress')
  })

  it('treats the idle boundaries as exclusive', () => {
    expect(compactionGate(base({ msSinceDictation: 60_000 })).reason).toBe('recent-dictation')
    expect(compactionGate(base({ msSinceDictation: 60_001 })).run).toBe(true)
    expect(compactionGate(base({ osIdleSeconds: 30 })).reason).toBe('user-active')
    expect(compactionGate(base({ osIdleSeconds: 31 })).run).toBe(true)
  })

  // A large real backlog (316 dictations) must still be reachable.
  it('runs for a long-accumulated backlog once idle', () => {
    expect(compactionGate(base({ count: 316 })).run).toBe(true)
  })
})

describe('shouldKeepRetrying', () => {
  it('keeps polling while a backlog remains', () => {
    expect(shouldKeepRetrying(base())).toBe(true)
  })

  it('stops once the backlog is cleared', () => {
    expect(shouldKeepRetrying(base({ count: 0 }))).toBe(false)
  })

  it('stops when there is no API key — a timer will not conjure one', () => {
    expect(shouldKeepRetrying(base({ hasApiKey: false }))).toBe(false)
  })

  it('keeps polling merely because the user is active', () => {
    expect(shouldKeepRetrying(base({ osIdleSeconds: 0, msSinceDictation: 0 }))).toBe(true)
  })
})
