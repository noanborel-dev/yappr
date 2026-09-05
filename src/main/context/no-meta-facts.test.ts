import { describe, it, expect } from 'vitest'
import { GLOBAL_PREFS_SYSTEM, PROJECT_FACTS_SYSTEM } from './project-facts'

// Found 2026-09-05 by printing the context block that a real "build a
// sidebar" dictation would carry. The eight newest global preferences
// were all of this shape:
//
//   "I want persistent context to be displayed in engineered prompts."
//   "I expect negative actions to be recognized and rules enforced."
//   "I prefer per-project rules remain active and applied."
//
// Every one is a bug report the user dictated INTO Claude Code while
// telling the assistant what Yappr was doing wrong. The miner read them
// as durable preferences about how the user works.
//
// They are worse than useless: capForInjection takes newest-first, so a
// week of debugging pushed out the preferences that actually shape work
// ("I want fluid animations", "I prefer red themes", "I require
// mobile-friendly designs") — which is why a sidebar request came back
// with no constraints even once the prompt was carrying context properly.

describe('the miners reject talk about the tool itself', () => {
  it.each([
    ['global preferences', GLOBAL_PREFS_SYSTEM],
    ['project facts', PROJECT_FACTS_SYSTEM],
  ])('%s', (_name, prompt) => {
    expect(prompt).toMatch(/DICTATION APP ITSELF/)
  })

  it('names the distinction, not just the category', () => {
    // "It is a bug report" is the part that makes the rule actionable —
    // a model can classify that, where "avoid meta-statements" gives it
    // nothing to test against.
    expect(GLOBAL_PREFS_SYSTEM).toMatch(/it is a bug report/)
  })

  it('gives the failing example verbatim', () => {
    expect(GLOBAL_PREFS_SYSTEM).toMatch(/context shown in engineered prompts/)
  })

  it('still asks for real durable preferences', () => {
    // The rule must not swallow the thing the miner is for.
    expect(GLOBAL_PREFS_SYSTEM).toMatch(/durable preference/i)
  })
})
