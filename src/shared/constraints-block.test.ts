import { describe, it, expect } from 'vitest'
import { appendConstraints, selectConstraints, MAX_CONSTRAINTS } from './constraints-block'
import type { StoredFact } from './types'

const f = (id: number, text: string): StoredFact =>
  ({ id, scope: 'global', projectKey: '', text, createdAt: id })

// The user's real store, after five prompt-level attempts failed to get
// any of it into a shaped prompt.
const REAL = [
  f(1, 'I want fluid animations in interfaces.'),
  f(2, 'I require mobile-friendly designs.'),
  f(3, 'I like the landing page to use a blue color scheme.'),
  f(4, 'I dislike outlines around UI components and prefer them removed.'),
  f(5, 'Wants direct, critical feedback, not validation.'),
  f(6, 'I always enforce rate limiting at least per minute or per hour.'),
  f(7, 'I always want prompts to include both context and constraints.'),
]

// The measured failure, verbatim, on the build containing every prompt fix.
const SHAPED = '## Goal\nBuild a landing page with a sidebar that includes all features of the app.'

describe('selectConstraints', () => {
  it('picks the preferences that change how something is built', () => {
    const picked = selectConstraints(REAL).map((x) => x.id)
    expect(picked).toContain(1) // animations
    expect(picked).toContain(2) // mobile
    expect(picked).toContain(3) // colour
  })

  it('leaves out how to talk to the user', () => {
    // "Wants direct, critical feedback" describes conversation, not
    // construction, and belongs nowhere near a prompt for an agent.
    expect(selectConstraints(REAL).map((x) => x.id)).not.toContain(5)
  })

  it('ranks build-relevance above recency', () => {
    // Recency alone is how a week of debugging notes filled the budget
    // while "fluid animations" sat below the cut.
    const noise = f(99, 'I always want prompts to include context.')
    const picked = selectConstraints([...REAL, noise])
    expect(picked[0].id).not.toBe(99)
  })

  it('is capped', () => {
    const many = Array.from({ length: 40 }, (_, i) => f(i + 100, `I prefer animation style ${i}.`))
    expect(selectConstraints(many)).toHaveLength(MAX_CONSTRAINTS)
  })

  it('returns nothing when nothing is relevant', () => {
    expect(selectConstraints([f(1, 'Plain tone, short answers, no em dashes.')])).toEqual([])
  })
})

describe('appendConstraints', () => {
  it('adds the section the model omitted', () => {
    // THE bug. This exact output, with this exact store, produced nothing.
    const out = appendConstraints(SHAPED, REAL)
    expect(out).toContain('## Constraints')
    expect(out).toContain('fluid animations')
    expect(out).toContain('mobile-friendly')
  })

  it('keeps the model’s own Goal intact', () => {
    expect(appendConstraints(SHAPED, REAL)).toContain(SHAPED)
  })

  it('merges into a Constraints section the model already wrote', () => {
    const withSection = '## Goal\nBuild it.\n\n## Constraints\n- Use TypeScript.'
    const out = appendConstraints(withSection, REAL)
    expect(out.match(/## Constraints/g)).toHaveLength(1)
    expect(out).toContain('- Use TypeScript.')
    expect(out).toContain('fluid animations')
  })

  it('inserts before the following heading, not at the end', () => {
    const doc = '## Goal\nBuild it.\n\n## Constraints\n- Use TypeScript.\n\n## Done when\n- It ships.'
    const out = appendConstraints(doc, REAL)
    expect(out.indexOf('fluid animations')).toBeLessThan(out.indexOf('## Done when'))
  })

  it('does not repeat a bullet the model already wrote', () => {
    const dup = '## Goal\nBuild it.\n\n## Constraints\n- I require mobile-friendly designs.'
    const out = appendConstraints(dup, REAL)
    expect(out.match(/mobile-friendly/gi)).toHaveLength(1)
  })

  it('leaves flat prose alone', () => {
    // A short request that came back as a sentence stays a sentence.
    // Turning "run the tests" into a document would be its own bug.
    const flat = 'Run the tests.'
    expect(appendConstraints(flat, REAL)).toBe(flat)
  })

  it('leaves the output alone when nothing is relevant', () => {
    expect(appendConstraints(SHAPED, [f(1, 'Plain tone, short answers.')])).toBe(SHAPED)
  })

  it('survives an empty store and empty output', () => {
    expect(appendConstraints(SHAPED, [])).toBe(SHAPED)
    expect(appendConstraints('', REAL)).toBe('')
  })
})

// Regression, 2026-09-05. score() used raw substring matching, so the
// two-letter 'ui' keyword fired inside req-UI-re, b-UI-lt, fl-UI-d,
// g-UI-ded and liq-UI-d. Measured against the user's own store (71
// facts), six were affected and one scored ONLY on a spurious match:
//
//   "I always require prompts to include all relevant context and
//    constraints."
//
// which is a bug report about Yappr — the exact thing this module's
// doc comment says it exists to keep out of a build prompt. It stayed
// out of the top six only because five other facts happened to score
// higher, which is a property of today's store and not of the design.
describe('keywords match at word starts, not anywhere', () => {
  it('does not admit a bug report on "ui" inside "require"', () => {
    const bugReport = f(1, 'I always require prompts to include all relevant context and constraints.')
    expect(selectConstraints([bugReport])).toEqual([])
  })

  it('does not score "ui" inside built, fluid, guided or liquid', () => {
    // Each of these still scores, but on its REAL keyword only.
    expect(selectConstraints([f(1, 'Built with a guided flow.')])).toEqual([])
  })

  it('still matches a keyword that opens a word', () => {
    // anim -> animations, design -> designs, style -> styled,
    // outline -> outlines, component -> components. Prefix matching is
    // the point of the shorter entries and must survive.
    for (const text of [
      'I want fluid animations in interfaces.',
      'I require mobile-friendly designs.',
      'Styled with Tailwind CSS.',
      'I dislike outlines around UI components and prefer them removed.',
      'Accessibility matters to me.',
      'I care about typography.',
    ]) {
      expect(selectConstraints([f(1, text)])).toHaveLength(1)
    }
  })

  it('still matches "ui" as a word of its own', () => {
    expect(selectConstraints([f(1, 'The onboarding UI displays a slider.')])).toHaveLength(1)
  })

  it('keeps the real store\'s top pick above the bug report', () => {
    const picked = selectConstraints([
      f(1, 'I always require prompts to include all relevant context and constraints.'),
      f(2, 'I want fluid animations in interfaces.'),
    ])
    expect(picked.map((f) => f.id)).toEqual([2])
  })
})

// Word-start matching (see above) dropped five real hits that bare
// substring matching had caught by accident. Four are worth keeping.
describe('keywords whose match sits mid-word', () => {
  it('scores the tool names this codebase uses', () => {
    for (const text of ['eslint must pass', 'vitest config needs updating', 'pytest for python']) {
      expect(selectConstraints([f(1, text)])).toHaveLength(1)
    }
  })

  it('scores a redesign', () => {
    expect(selectConstraints([f(1, 'redesign it')])).toHaveLength(1)
  })

  it('still refuses the false positives the change was made for', () => {
    for (const text of [
      'the latest build',
      'built to require guided fluid liquid',
      'a unanimous decision',
      'lifestyle brand',
    ]) {
      expect(selectConstraints([f(1, text)])).toEqual([])
    }
  })
})
