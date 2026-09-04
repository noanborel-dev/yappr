import { describe, it, expect } from 'vitest'
import { isActionableRequest } from './ai-intent'

// Reported 2026-09-04: "sometimes I'll just be describing something or
// asking a question and it will give a full prompt."

describe('a hedged musing is not an assignment', () => {
  it('leaves the reported phrase alone', () => {
    // Live: this became ## Goal / ## Context / ## Tasks. It matched on
    // `should`, and "any subject + should is a requirement" is a good
    // rule that "probably" undoes.
    expect(isActionableRequest('We should probably make sure the animation stays smooth')).toBe(false)
  })

  it.each([
    'maybe we should add a dark mode',
    'I was thinking the sidebar could be wider',
    'it might be worth caching that',
    'we should look at this at some point',
  ])('leaves "%s" alone', (t) => {
    expect(isActionableRequest(t)).toBe(false)
  })
})

describe('what a hedge must NOT cancel', () => {
  it('keeps a plain requirement actionable', () => {
    // The rule the hedge guard must not swallow — this is a real request
    // and the reason "any subject + should" exists.
    expect(isActionableRequest('the empty state should say something friendlier')).toBe(true)
  })

  it('keeps a politely hedged explicit ask actionable', () => {
    // "maybe" here is manners, not uncertainty.
    expect(isActionableRequest('can you maybe take a look at the login bug')).toBe(true)
    expect(isActionableRequest('please could you probably check the logs')).toBe(true)
  })

  it('keeps a hedged imperative actionable', () => {
    // Someone still told you to fix the thing.
    expect(isActionableRequest('just fix the sidebar, maybe')).toBe(true)
    expect(isActionableRequest('build me a sidebar at some point')).toBe(true)
  })

  it('keeps an unhedged wish actionable', () => {
    expect(isActionableRequest('I want the notch to be blue')).toBe(true)
  })
})
