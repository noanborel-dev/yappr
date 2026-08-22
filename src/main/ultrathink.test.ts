import { describe, it, expect } from 'vitest'
import { applyUltrathink, isUltrathinkSurface, warrantsDeepReasoning, ULTRATHINK_KEYWORD } from './ultrathink'

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
      trigger: 'explicit',
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
  // Length is deliberately not an input. This one is long and lists a
  // lot, but every item is ordinary implementation work.
  it('never fires on length or requirement count alone', () => {
    const long =
      'add a spinner to the settings page, add a toast when saving, update the ' +
      'copy on the pricing page, bump the version number, and fix the typo in the readme'
    expect(on(long).applied).toBe(false)
  })

  it('leaves an ordinary instruction untouched', () => {
    const text = 'add a loading spinner to the settings page'
    expect(on(text)).toEqual({ text, applied: false, trigger: null })
  })
})

describe('the surface gate', () => {
  // The word is meaningless outside Claude Code — injecting it anywhere
  // else is just noise in the user's prompt.
  it('does nothing when disabled', () => {
    const text = 'think really hard about this'
    expect(applyUltrathink(text, { enabled: false })).toEqual({ text, applied: false, trigger: null })
  })
})


// The user's ask: firing only on the spoken phrase misses the case that
// matters most — handing Claude Code something genuinely hard and
// getting default-effort reasoning because no magic phrase was said.
describe('reasoning depth', () => {
  it('fires on planning a stack — the case that prompted this', () => {
    const out = on('draft a plan for moving us off this tech stack')
    expect(out.applied).toBe(true)
    expect(out.trigger).toBe('reasoning')
  })

  it('fires on architecture and data modelling', () => {
    expect(warrantsDeepReasoning('rework the architecture of the sync layer')).toBe(true)
    expect(warrantsDeepReasoning('come up with a data model for teams and permissions')).toBe(true)
  })

  it('fires on hard diagnosis', () => {
    expect(warrantsDeepReasoning('find the root cause of the dropped events')).toBe(true)
    expect(warrantsDeepReasoning('this test is flaky, work out why')).toBe(true)
    expect(warrantsDeepReasoning('why does the paste fail when the app is backgrounded')).toBe(true)
  })

  it('fires when weighing options rather than executing one', () => {
    expect(warrantsDeepReasoning('what are the trade-offs between polling and a websocket')).toBe(true)
    expect(warrantsDeepReasoning('compare the two approaches for offline sync')).toBe(true)
  })

  // Ordinary verbs need a broad target before they imply depth.
  it('needs scope before an ordinary verb counts', () => {
    expect(warrantsDeepReasoning('design a button')).toBe(false)
    expect(warrantsDeepReasoning('refactor this function')).toBe(false)
    expect(warrantsDeepReasoning('refactor the whole codebase to use hooks')).toBe(true)
    expect(warrantsDeepReasoning('migrate every service off the old client')).toBe(true)
  })

  it('leaves ordinary implementation work alone', () => {
    expect(warrantsDeepReasoning('add a loading spinner to the settings page')).toBe(false)
    expect(warrantsDeepReasoning('fix the typo in the readme')).toBe(false)
    expect(warrantsDeepReasoning('')).toBe(false)
  })

  // No phrase to replace, so the keyword goes in front and the user's
  // own wording survives untouched below it.
  it('prepends the keyword and preserves the dictation', () => {
    const out = on('plan out the migration across every service')
    expect(out.text.startsWith(ULTRATHINK_KEYWORD)).toBe(true)
    expect(out.text).toContain('plan out the migration across every service')
  })

  it('does not stack a second keyword', () => {
    const out = on(`${ULTRATHINK_KEYWORD} plan out the whole migration across every service`)
    expect(out.text.match(new RegExp(ULTRATHINK_KEYWORD, 'gi'))).toHaveLength(1)
  })

  // Explicit phrasing still wins, and still substitutes in place rather
  // than prepending.
  it('prefers the explicit route when both would fire', () => {
    const out = on('think really hard about the architecture here')
    expect(out.trigger).toBe('explicit')
    expect(out.text).toBe('ultrathink about the architecture here')
  })

  it('stays off entirely on the wrong surface', () => {
    const text = 'draft a plan for moving off this tech stack'
    expect(applyUltrathink(text, { enabled: false })).toEqual({ text, applied: false, trigger: null })
  })
})
