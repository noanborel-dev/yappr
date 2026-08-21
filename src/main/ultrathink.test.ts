import { describe, it, expect } from 'vitest'
import { applyUltrathink, isUltrathinkSurface, ULTRATHINK_KEYWORD } from './ultrathink'

const on = (text: string) => applyUltrathink(text, { enabled: true })

describe('isUltrathinkSurface', () => {
  // proc-tree normalises 'claude-code' to 'claude'.
  it('is true only for Claude Code', () => {
    expect(isUltrathinkSurface('claude')).toBe(true)
    expect(isUltrathinkSurface('cursor-agent')).toBe(false)
    expect(isUltrathinkSurface('aider')).toBe(false)
    expect(isUltrathinkSurface(null)).toBe(false)
    expect(isUltrathinkSurface(undefined)).toBe(false)
  })
})

describe('the spoken forms the spec names', () => {
  it('maps "think really hard"', () => {
    expect(on('think really hard about this and fix the bug')).toEqual({
      text: 'ultrathink about this and fix the bug',
      applied: true,
    })
  })

  it('maps "think hard about this"', () => {
    expect(on('think hard about this refactor').text).toBe('ultrathink about this refactor')
  })

  it('maps "think carefully"', () => {
    expect(on('think carefully before you change the schema').text)
      .toBe('ultrathink before you change the schema')
  })

  it('maps the other natural variants', () => {
    expect(on('think harder about the edge cases').applied).toBe(true)
    expect(on('think deeply about the data model').applied).toBe(true)
    expect(on('think this through before writing code').applied).toBe(true)
    expect(on('really think hard about the migration').applied).toBe(true)
  })

  it('emits the keyword exactly, in lowercase', () => {
    // A magic token is worth more matched than capitalised.
    expect(on('Think really hard about this').text).toBe(`${ULTRATHINK_KEYWORD} about this`)
  })

  it('fires once even if the user says it twice', () => {
    const out = on('think hard about it, and think carefully about the tests')
    expect(out.text.match(/ultrathink/g)).toHaveLength(1)
  })
})

describe('what must NOT fire', () => {
  // The single most common word in the list. Mapping bare "think" would
  // fire on ordinary speech constantly.
  it('ignores "think" on its own', () => {
    expect(on('I think we should ship it').applied).toBe(false)
    expect(on('think about the user here').applied).toBe(false)
  })

  it('ignores a declarative statement about thinking', () => {
    expect(on('I think carefully about naming things').applied).toBe(false)
    expect(on('you think hard about this stuff already').applied).toBe(false)
  })

  it('ignores a negated request', () => {
    expect(on("don't think too hard about it").applied).toBe(false)
    expect(on('do not think hard about the styling').applied).toBe(false)
  })

  // The spec's explicit prohibition: never infer it from how big the
  // request looks.
  it('never fires on a long or complex prompt by itself', () => {
    const long =
      'refactor the auth module, add tests for every branch, update the docs, ' +
      'migrate the database schema, and make sure the CI pipeline still passes'
    expect(on(long).applied).toBe(false)
  })

  it('leaves an ordinary instruction untouched', () => {
    const text = 'add a loading spinner to the settings page'
    expect(on(text)).toEqual({ text, applied: false })
  })
})

describe('the surface gate', () => {
  // The word is meaningless outside Claude Code — injecting it anywhere
  // else is just noise in the user's prompt.
  it('does nothing when disabled', () => {
    const text = 'think really hard about this'
    expect(applyUltrathink(text, { enabled: false })).toEqual({ text, applied: false })
  })
})
