import { describe, it, expect } from 'vitest'
import { applySelfCorrection } from './correction-pass'

// The regex safety net, not the prompt rules — those are in
// self-correction.test.ts. This pass exists because the 8B cleanup model
// keeps both halves of a correction about 40% of the time, and local-only
// mode has no model at all.

describe('the case this was reported for', () => {
  // Said out loud, and both colours arrived in the prompt. Every rule in
  // this pass needed a number, a capitalised name or a path, so the most
  // common shape a correction takes was the one shape it could not see.
  it('corrects one ordinary word to another', () => {
    expect(applySelfCorrection('Please make the landing page blue, I mean red.'))
      .toBe('Please make the landing page red.')
  })

  it('corrects a noun mid-sentence', () => {
    expect(applySelfCorrection('put it in the sidebar, I mean footer'))
      .toBe('put it in the footer')
  })

  // The article is consumed with the word it belongs to, or the
  // replacement leaves "to the the shop".
  it('does not double an article', () => {
    expect(applySelfCorrection('go to the store, I mean the shop'))
      .toBe('go to the shop')
  })
})

describe('what it must not touch', () => {
  // The hedging phrase the cleanup prompt explicitly calls out as not a
  // correction.
  it('leaves "I mean it" alone', () => {
    expect(applySelfCorrection('it is fast, I mean it'))
      .toBe('it is fast, I mean it')
  })

  it('leaves an emphatic follow-on alone', () => {
    expect(applySelfCorrection('we need speed, I mean really'))
      .toBe('we need speed, I mean really')
  })

  // No comma, no pivot — a sentence-opening hedge is not a correction.
  it('needs the comma', () => {
    expect(applySelfCorrection('I mean red')).toBe('I mean red')
  })

  // Only "I mean" got the plain-word treatment. "actually" in front of an
  // adjective is usually emphasis, not a correction.
  it('does not extend plain words to the other markers', () => {
    expect(applySelfCorrection('the build is slow, actually fine'))
      .toBe('the build is slow, actually fine')
  })

  it('leaves a two-letter word alone', () => {
    expect(applySelfCorrection('set it to go, I mean up'))
      .toBe('set it to go, I mean up')
  })
})

describe('the rules that already worked still work', () => {
  it('corrects a number', () => {
    expect(applySelfCorrection('meet at 6, I mean 7')).toBe('meet at 7')
  })

  it('corrects a spelled-out number', () => {
    expect(applySelfCorrection('at six, I mean seven')).toBe('at seven')
  })

  it('corrects a name', () => {
    expect(applySelfCorrection('ask Julia, sorry, Jane')).toBe('ask Jane')
  })

  it('corrects a path', () => {
    expect(applySelfCorrection('open src/main.ts, I mean src/index.ts'))
      .toBe('open src/index.ts')
  })

  // "actually" stays restricted to numbers, times and paths — with names
  // it deletes real clauses ("I love Paris, actually Rome is better").
  it('keeps "actually" away from names', () => {
    const s = 'I love Paris, actually Rome is better'
    expect(applySelfCorrection(s)).toBe(s)
  })

  it('corrects a port with "actually"', () => {
    expect(applySelfCorrection('port 3000, actually 8080')).toBe('port 8080')
  })

  it('leaves ordinary text untouched', () => {
    const s = 'Ship the release after standup and tell the team.'
    expect(applySelfCorrection(s)).toBe(s)
  })
})
