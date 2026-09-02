import { describe, it, expect } from 'vitest'
import { digitsForSpokenNumbers, evaluateRun } from './spoken-numbers'

const d = digitsForSpokenNumbers

describe('the case this exists for', () => {
  it('writes a spoken quantity as digits', () => {
    expect(d('make it twenty pixels')).toBe('make it 20 pixels')
    expect(d('set the timeout to thirty seconds')).toBe('set the timeout to 30 seconds')
  })

  // Under eight words skips the LLM entirely, which is exactly where bare
  // quantities live — so this pass has to carry them on its own.
  it('handles the short dictations that never reach cleanup', () => {
    expect(d('bump it to sixteen')).toBe('bump it to 16')
  })
})

describe('compounds', () => {
  it('joins tens and units', () => {
    expect(d('twenty five')).toBe('25')
    expect(d('twenty-five')).toBe('25')
    expect(d('ninety nine problems')).toBe('99 problems')
  })

  it('multiplies hundreds', () => {
    expect(d('three hundred')).toBe('300')
    expect(d('two hundred fifty')).toBe('250')
  })

  it('handles thousands and millions', () => {
    expect(d('three thousand')).toBe('3000')
    expect(d('port three thousand')).toBe('port 3000')
    expect(d('two million')).toBe('2000000')
  })

  // A bare scale word still means a number.
  it('reads a bare scale as one of it', () => {
    expect(d('hundred')).toBe('100')
    expect(d('thousand')).toBe('1000')
  })

  it('does not eat a longer word that starts with a number', () => {
    expect(d('seventeen')).toBe('17')
  })
})

// All three of these shipped broken. The transcripts are verbatim from
// yappr-history.json, alongside what was actually pasted.
describe('the three shapes seen live', () => {
  // Was: unchanged. The first parser summed a year to 19 + 60 + 4 = 103
  // and so refused the shape outright, which meant dictating a year did
  // nothing at all.
  it('reads a year in pairs', () => {
    expect(d('Nineteen sixty four.')).toBe('1964.')
    expect(d('Nineteen sixty five.')).toBe('1965.')
    expect(d('back in nineteen eighty four')).toBe('back in 1984')
  })

  it('reads a year in the twenty-somethings', () => {
    expect(d('twenty fifteen')).toBe('2015')
    expect(d('shipped in twenty twenty five')).toBe('shipped in 2025')
  })

  // Was: unchanged. Someone reading out a code wants the digits, not the
  // words, and certainly not their sum.
  it('joins a string of spoken digits', () => {
    expect(d('One two eight nine three four.')).toBe('128934.')
    expect(d('One zero three four five eight.')).toBe('103458.')
  })

  // Was: "One, 2, 3, 4, 5, 6, 7." — every number but the first, which
  // reads as broken rather than careful. The commas split the run, so the
  // leading number is judged alone and hits the pronoun guard.
  it('converts a leading "one" when counting', () => {
    expect(d('One, two, three, four, five, six, seven.')).toBe('1, 2, 3, 4, 5, 6, 7.')
  })
})

describe('sequences that are still refused', () => {
  // A scale word means the run is a cardinal or it is nothing — no year or
  // digit-string reading applies, so an impossible sequence aborts.
  it('refuses a malformed cardinal', () => {
    expect(d('nineteen eighty four thousand')).toBe('nineteen eighty four thousand')
  })

  // Three groups that are not all single digits have no safe reading.
  it('refuses three mixed groups', () => {
    expect(d('twenty thirty forty')).toBe('twenty thirty forty')
  })
})

describe('the pronoun guard', () => {
  // "one" is a pronoun far more often than a quantity. Getting these
  // wrong is visible; leaving a rare "one item" is not.
  it('leaves a lone "one" alone', () => {
    expect(d('one of them is broken')).toBe('one of them is broken')
    expect(d('no one has looked at it')).toBe('no one has looked at it')
    expect(d('the only one that matters')).toBe('the only one that matters')
    expect(d('which one do you want')).toBe('which one do you want')
  })

  it('leaves a hyphenated idiom alone', () => {
    expect(d('it was a one-off')).toBe('it was a one-off')
  })

  // The counting exception is narrow: a number has to come straight after.
  it('does not convert "one" before an ordinary word', () => {
    expect(d('one more time')).toBe('one more time')
  })

  // But inside a real number it converts like anything else.
  it('converts "one" inside a longer number', () => {
    expect(d('twenty one')).toBe('21')
    expect(d('one hundred')).toBe('100')
    expect(d('one thousand')).toBe('1000')
  })
})

describe('what it leaves alone', () => {
  it('ignores ordinals', () => {
    expect(d('the first thing')).toBe('the first thing')
    expect(d('second attempt')).toBe('second attempt')
  })

  it('ignores digits that are already digits', () => {
    expect(d('set it to 20')).toBe('set it to 20')
  })

  it('ignores ordinary prose', () => {
    const s = 'Ship the release after standup and tell the team.'
    expect(d(s)).toBe(s)
  })

  it('handles empty input', () => {
    expect(d('')).toBe('')
  })
})

describe('the "and" trade-off, recorded', () => {
  // Two separate numbers joined by "and" is much commoner in speech than
  // the British hundreds form, so runs deliberately stop at "and". This
  // is the case that benefits.
  it('keeps two numbers separate', () => {
    expect(d('five and six')).toBe('5 and 6')
  })

  // And this is the price, accepted knowingly. Each half is still right.
  it('splits the British hundreds form', () => {
    expect(d('one hundred and twenty')).toBe('100 and 20')
  })
})

describe('evaluateRun', () => {
  it('returns null for a lone pronoun', () => {
    expect(evaluateRun(['one'])).toBeNull()
  })

  it('returns null for nothing', () => {
    expect(evaluateRun([])).toBeNull()
  })

  it('returns null when a word is not a number', () => {
    expect(evaluateRun(['twenty', 'cats'])).toBeNull()
  })

  it('counts zero as a number', () => {
    expect(evaluateRun(['zero'])).toBe('0')
  })

  // A digit string keeps its leading zero, which is the whole point of
  // reading one out digit by digit.
  it('keeps a leading zero in a digit string', () => {
    expect(evaluateRun(['zero', 'four', 'seven'])).toBe('047')
  })
})
