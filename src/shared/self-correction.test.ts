import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'

// Self-correction is the differentiator: speech is full of mid-sentence
// retractions ("add it to the dashboard, no wait, the settings page") and
// a dictation tool that keeps the retracted item produces text the user
// then has to go edit by hand — which is the whole thing they were trying
// to avoid.
//
// The behaviour itself lives in an LLM and can't be asserted here. What
// CAN be asserted is that the rules reach the model at all, in every
// category, and that the two clauses that were actually load-bearing when
// this was fixed against live Groq are still present:
//
//   1. The override. Before it, SELF-CORRECTION lost a direct fight with
//      "preserve EVERY context detail the user spoke" and the retraction
//      came back as a negative constraint ("...not the dashboard").
//   2. The already-grammatical clause. "put it in the navbar, make that
//      the sidebar instead" is fluent English, so the model saw nothing
//      to clean and echoed the sentence back verbatim, retraction intact.
//
// Both regressed silently and neither was visible without a live call.

const CATEGORIES = ['messaging', 'email', 'ai_prompt', 'code', 'docs', 'other'] as const

const build = (category: (typeof CATEGORIES)[number]) =>
  buildCleanupPrompt(category, 'Cursor', undefined, 'vscode', 2, false, 'default', '', 'agentic')

describe('self-correction rules reach every category', () => {
  it.each(CATEGORIES)('%s carries the self-correction block', (category) => {
    expect(build(category)).toContain('SELF-CORRECTION')
  })

  // The override sentence. Without it the rule is one instruction among
  // many that all say "keep everything", and it loses.
  it.each(CATEGORIES)('%s says retraction outranks preservation', (category) => {
    const p = build(category)
    expect(p).toContain('RETRACTION BEATS PRESERVATION')
    expect(p).toContain('OVERRIDES')
  })
})

describe('trigger coverage', () => {
  const p = build('ai_prompt')

  // Each of these was observed in real dictation. A trigger missing from
  // the list is a retraction that silently survives into the output.
  it.each([
    'no wait',
    'wait',
    'actually',
    'scratch that',
    'I mean',
    'sorry',
    'make that',
    'or rather',
    'instead',
    'not X, Y',
  ])('lists %s as a replacement trigger', (trigger) => {
    expect(p).toContain(trigger)
  })

  // The mirror-image failure: treating an addition as a retraction, which
  // deletes something the user very much still wanted.
  it.each(['and also', 'plus', 'on top of that', 'as well as', 'and then'])(
    'lists %s as an addition trigger',
    (trigger) => {
      expect(p).toContain(trigger)
    },
  )

  it('tells the model additions never delete', () => {
    expect(p).toContain('these ADD, they never delete')
  })
})

describe('the two clauses that were load-bearing in the live fix', () => {
  const p = build('ai_prompt')

  // Failure mode 1: retraction survives as "not the dashboard".
  it('forbids keeping a retraction as a negative or a parenthetical', () => {
    expect(p).toContain('Do NOT keep it as a negative')
    expect(p).toContain('must not be able to tell it was ever said')
  })

  // Failure mode 2: fluent input reads as already-clean, model echoes it.
  it('warns that a retraction can be already grammatical', () => {
    expect(p).toContain('ALREADY GRAMMATICAL')
    expect(p).toContain('does not mean there is nothing to do')
  })

  // The distinction that makes this hard: "not a new one" is a real
  // constraint on something still being asked for, and must survive even
  // though it looks exactly like the negative we delete above.
  it('keeps a negative the user actually meant', () => {
    expect(p).toContain('A NEGATIVE THE USER ACTUALLY MEANT is kept')
    expect(p).toContain('not a new one')
  })

  // Guards against over-firing on words that merely contain a trigger.
  it('excludes phrases that only look like corrections', () => {
    expect(p).toContain('NOT corrections at all')
  })
})

// The Context section is where a retraction most often comes back from
// the dead: the model deletes it from the instruction, then helpfully
// records it as background ("the spinner goes on settings, not the
// dashboard"). Same failure, different heading.
describe('the context section cannot resurrect a retraction', () => {
  it('carves out an exception for retracted items', () => {
    const p = build('ai_prompt')
    expect(p).toContain('anything the user RETRACTED mid-sentence is not context')
    expect(p).toContain('Never reintroduce a retracted item here')
  })
})

// Separate guardrail, verified alongside self-correction because the two
// pull in opposite directions: self-correction deletes, and the fix for
// it must not turn into a licence to drop content generally.
describe('no-compression guardrail', () => {
  it.each(CATEGORIES)('%s forbids condensing the dictation', (category) => {
    const p = build(category)
    expect(p).toContain('LENGTH PRESERVATION (MANDATORY')
    expect(p).toContain('Do NOT condense, compress, or paraphrase the meaning down')
  })

  // The one place the prompt tells the model to compress anything must
  // always scope it to connectors. An unqualified "compress" would
  // license exactly the summarising the guardrail above forbids.
  //
  // Swept across every category AND strictness level because the block
  // that says it lives in the strictness prose, which the FAITHFUL
  // registers (code, ai_prompt) never include — checking a single prompt
  // matches nothing and passes without testing anything.
  it('only ever permits compressing connectors, never content', () => {
    let occurrences = 0
    for (const category of CATEGORIES) {
      for (const strictness of [1, 2, 3] as const) {
        const p = buildCleanupPrompt(category, 'Cursor', undefined, 'vscode', strictness, false, 'default', '', 'agentic')
        for (const match of p.matchAll(/Compress[\s\S]*?\./g)) {
          occurrences++
          expect(match[0]).toMatch(/not\s+content/)
        }
      }
    }
    // Non-vacuity: if the wording is ever reworded away, fail loudly
    // rather than quietly asserting over an empty set.
    expect(occurrences).toBeGreaterThan(0)
  })
})
