import { describe, it, expect } from 'vitest'
import { COMPACTION_SYSTEM } from './project-facts'

// Reported 2026-09-05: the "What Yappr Knows About You" box should hold
// facts about the user, and rules should live only in Remembered Rules.
//
// The live overview had become a changelog:
//
//   "...He is refactoring the preference system to keep only the latest
//    statement, adding a global 'never-do-this' rule store, and fixing
//    context-window handling so constraints, remembered rules..."
//
// plus "18-year-old Madrid-based", "BBA at IE University" — age and
// location, which the onboarding prompt already excludes.
//
// The cause was in the instruction, not the model: COMPACTION_SYSTEM
// asked for "who the user is AND WHAT THEY'VE BEEN WORKING ON" and for
// "ongoing projects". When every recent dictation is a bug report about
// Yappr, that is faithfully what it summarises.

describe('the overview describes a person, not a sprint', () => {
  it('asks for durable identity', () => {
    expect(COMPACTION_SYSTEM).toMatch(/describing WHO the user is/)
    expect(COMPACTION_SYSTEM).toMatch(/durable facts/)
  })

  it('no longer asks what they have been working on', () => {
    expect(COMPACTION_SYSTEM).not.toMatch(/what they've been working on/)
    expect(COMPACTION_SYSTEM).not.toMatch(/ongoing projects/)
  })

  it('excludes this week, and says why', () => {
    // "Not durable" is the testable reason; "avoid status" alone gives
    // the model nothing to classify against.
    expect(COMPACTION_SYSTEM).toMatch(/working on THIS WEEK/)
    expect(COMPACTION_SYSTEM).toMatch(/wrong a week later/)
  })

  it('keeps rules out of the box entirely', () => {
    // The user's ask: rules belong in Remembered Rules, and only there.
    expect(COMPACTION_SYSTEM).toMatch(/stored separately as remembered rules/)
  })

  it('excludes personal details, matching the onboarding prompt', () => {
    expect(COMPACTION_SYSTEM).toMatch(/age, location, family, health, finances/)
  })

  it('names the failure mode directly', () => {
    // A month of debugging dictations is exactly the input that produces
    // a progress report, so the rule says so in those words.
    expect(COMPACTION_SYSTEM).toMatch(/do NOT turn this into a progress report/)
  })
})

describe('what it still asks for', () => {
  it.each([
    ['the people they work with', /people they work with/],
    ['the tools they use', /tools and languages they use/],
    ['how they write', /how formally they write/],
  ])('%s', (_l, re) => expect(COMPACTION_SYSTEM).toMatch(re))

  it('keeps the output-format discipline intact', () => {
    expect(COMPACTION_SYSTEM).toMatch(/One single paragraph/)
    expect(COMPACTION_SYSTEM).toMatch(/DO NOT use bullets/)
  })
})
