import { describe, it, expect } from 'vitest'
import { soundex, editDistance, isNearMiss, applyNearMissTerms } from './near-miss'

describe('the case this exists for', () => {
  // A user with "Noan" in their dictionary said their own name and got
  // "Noen" pasted, repeatedly. It is one vowel from a term they had
  // explicitly told the app about.
  it('corrects a misheard name to the dictionary spelling', () => {
    expect(applyNearMissTerms('My name is Noen.', ['Noan'])).toBe('My name is Noan.')
  })

  it('corrects it mid-sentence and keeps the rest', () => {
    expect(applyNearMissTerms('tell Noen I said hi', ['Noan', 'Daniel']))
      .toBe('tell Noan I said hi')
  })
})

describe('the cases that would make it a liability', () => {
  // Same phonetic key (D540) and only two edits apart. Silently turning
  // someone's "denial" into "Daniel" is worse than leaving a mishearing.
  it('does not turn denial into Daniel', () => {
    expect(applyNearMissTerms('a state of denial', ['Daniel'])).toBe('a state of denial')
  })

  // One edit from "Noan", but it does not sound like it — and Noah is a
  // real name someone might actually be dictating.
  it('does not turn Noah into Noan', () => {
    expect(applyNearMissTerms('ask Noah about it', ['Noan'])).toBe('ask Noah about it')
  })

  // Two edits. Far enough away to be its own word.
  it('leaves words two edits away alone', () => {
    expect(applyNearMissTerms('the notion of it', ['Noan'])).toBe('the notion of it')
  })

  it('leaves an already-correct term untouched', () => {
    expect(applyNearMissTerms('Noan is here', ['Noan'])).toBe('Noan is here')
  })

  // Under four letters everything is one edit from everything else.
  it('refuses to work with very short terms', () => {
    expect(isNearMiss('cot', 'cat')).toBe(false)
    expect(applyNearMissTerms('the cat sat', ['cot'])).toBe('the cat sat')
  })

  it('does nothing with an empty dictionary', () => {
    expect(applyNearMissTerms('anything at all', [])).toBe('anything at all')
  })

  // Alignment across token boundaries is a different problem, and no
  // reported failure needs it.
  it('ignores multi-word terms', () => {
    expect(applyNearMissTerms('claude cod is here', ['Claude Code']))
      .toBe('claude cod is here')
  })
})

describe('soundex', () => {
  it('gives matching keys to homophone spellings', () => {
    expect(soundex('Noan')).toBe(soundex('Noen'))
  })

  it('separates Noan from Noah', () => {
    expect(soundex('Noan')).not.toBe(soundex('Noah'))
  })

  it('codes the classic example', () => {
    expect(soundex('Robert')).toBe('R163')
    expect(soundex('Rupert')).toBe('R163')
    expect(soundex('Tymczak')).toBe('T522')
  })

  it('survives empty and non-letter input', () => {
    expect(soundex('')).toBe('')
    expect(soundex('123')).toBe('')
  })
})

describe('editDistance', () => {
  it('counts substitutions', () => {
    expect(editDistance('Noen', 'Noan')).toBe(1)
  })

  it('counts a transposition as one, not two', () => {
    expect(editDistance('Nona', 'Noan')).toBe(1)
  })

  it('is zero for the same word regardless of case', () => {
    expect(editDistance('YAPPR', 'yappr')).toBe(0)
  })

  it('bails out early when the lengths are too far apart', () => {
    expect(editDistance('a', 'abcdefgh', 2)).toBeGreaterThan(2)
  })
})
