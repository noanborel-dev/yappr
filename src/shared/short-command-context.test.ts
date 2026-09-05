import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'

const CTX = '\n\nUSER CONTEXT — background on the user.\n\nAbout the user:\nNoan builds Yappr.\n'

function prompt(category: Parameters<typeof buildCleanupPrompt>[0], context: string) {
  return buildCleanupPrompt(category, 'Code', undefined, undefined, 2, false, 'default', context)
}

// Measured on a live dictation, 2026-09-04T10:50. "Please build me a
// sidebar within the app." routed to reformat, was handed 3,520
// characters of context, and came back as "Build a sidebar within the
// app." — 31 characters, no sections.
//
// The template did exactly what it was told: "For very short prompts (a
// single short question or single command), output flat prose with NO
// sections." No sections means nowhere for the context to go, which is
// why fixing the context block's framing alone could not have worked.

describe('short requests expand when there is context', () => {
  it('overrides the flat-prose rule for ai_prompt with context', () => {
    expect(prompt('ai_prompt', CTX)).toContain('does NOT apply when USER CONTEXT')
  })

  it('comes after the flat-prose rule it overrides', () => {
    const p = prompt('ai_prompt', CTX)
    expect(p.indexOf('OVERRIDE — short requests'))
      .toBeGreaterThan(p.indexOf('output flat prose with NO sections'))
  })

  it('but BEFORE the dictated text, not after it', () => {
    // Reversed 2026-09-05. Appending it landed the override at char
    // 12,760 against a {text} slot at 12,750 -- a rule amending the
    // section list, separated from that list by the whole dictation.
    const p = prompt('ai_prompt', CTX)
    expect(p.indexOf('OVERRIDE — short requests')).toBeLessThan(p.indexOf('{text}'))
  })

  it('puts the context beside the request it informs', () => {
    // It used to sit 25% in, with 9,394 characters of "DO NOT SUMMARIZE
    // / never add" after it.
    const p = prompt('ai_prompt', CTX)
    expect(p.indexOf('USER CONTEXT')).toBeGreaterThan(p.indexOf('THE OUTPUT TEMPLATE'))
    expect(p.indexOf('USER CONTEXT')).toBeLessThan(p.indexOf('{text}'))
  })

  it('names the three sections the context goes into', () => {
    const p = prompt('ai_prompt', CTX)
    expect(p).toContain('## Goal')
    expect(p).toContain('## Context')
    expect(p).toContain('## Constraints')
  })

  it('still forbids inventing work', () => {
    // The one place the model is told to ADD, against a template whose
    // core promise is that it never adds.
    expect(prompt('ai_prompt', CTX)).toMatch(/Add NO tasks the user did not ask for/)
  })
})

describe('the override stays out of every other case', () => {
  it('does not fire without context', () => {
    // Nothing to place, so "run the tests" keeps its flat prose.
    expect(prompt('ai_prompt', '')).not.toContain('OVERRIDE — short requests')
  })

  it('does not fire for whitespace-only context', () => {
    expect(prompt('ai_prompt', '   \n  ')).not.toContain('OVERRIDE — short requests')
  })

  it('does not fire for ordinary cleanup categories', () => {
    // Cleaning a message must not sprout markdown headings.
    for (const c of ['messaging', 'email', 'code', 'docs', 'other'] as const) {
      expect(prompt(c, CTX)).not.toContain('OVERRIDE — short requests')
    }
  })
})
