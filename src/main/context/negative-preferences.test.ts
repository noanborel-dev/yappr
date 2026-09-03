import { describe, it, expect } from 'vitest'
import { extractStandingPreferences } from './fact-scope'

// Reported 2026-09-04: "I don't want any static animations on my website"
// was never stored as a rule. It carried NEITHER gate the detector
// required — no durability word ("always"/"never"/"from now on") and no
// convention verb ("use"/"prefer"/"write") — so the most natural way to
// state a negative rule was the one shape it could not see.

function rules(t: string) {
  return extractStandingPreferences(t)
}

describe('prohibitions are standing rules', () => {
  it('captures the reported phrasing', () => {
    const [rule] = rules("I don't want any static animations on my website")
    expect(rule).toBeDefined()
    expect(rule.text).toContain('static animations')
  })

  it('files a personal prohibition globally', () => {
    // "never do this" is about the user unless they say otherwise, which
    // is what makes it worth carrying between projects.
    expect(rules("I don't want any static animations on my website")[0].scope)
      .toBe('global')
  })

  it('still lets an explicit project reference win', () => {
    // The asymmetry this file is built on: a project fact wrongly filed
    // as global contaminates every other project's prompt.
    expect(rules("I don't want static animations on this project")[0].scope)
      .toBe('project')
  })

  it.each([
    'no more inline styles',
    'stop using static animations',
    'get rid of the drop shadows',
  ])('captures %s', (t) => {
    expect(rules(t)).toHaveLength(1)
  })
})

describe('prohibitions that are NOT rules', () => {
  // The risk this widening introduces. The module's own warning applies:
  // a missed rule costs one re-statement, a wrong rule is invisible and
  // steers every future prompt.

  it('ignores an intention about the speaker, not the work', () => {
    expect(rules("I don't want to finish this today")).toHaveLength(0)
  })

  it('ignores a complaint about behaviour', () => {
    // 'crash' and 'see' are already NOT_A_RULE_RE; prohibitions must
    // still be subject to it.
    expect(rules("I don't want it to crash on startup")).toHaveLength(0)
    expect(rules("I don't want to see that error again")).toHaveLength(0)
  })

  it('keeps a prohibition that names a convention verb', () => {
    // "want to" alone disqualifies, but "want to USE" is a rule again.
    expect(rules("I don't want to use static animations")).toHaveLength(1)
  })

  it('ignores a question', () => {
    expect(rules("don't you want static animations?")).toHaveLength(0)
  })
})

describe('existing behaviour is unchanged', () => {
  it.each([
    ['I always use Framer Motion for animations', 'global'],
    ['we use Tailwind on this project', 'project'],
    ['I never use static animations on this project', 'project'],
  ])('%s -> %s', (t, scope) => {
    expect(rules(t)[0]?.scope).toBe(scope)
  })

  it('still ignores a symptom that carries a durability word', () => {
    expect(rules('I always get an error when I click save')).toHaveLength(0)
  })
})
