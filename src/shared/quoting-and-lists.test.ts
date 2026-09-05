import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'

type Cat = Parameters<typeof buildCleanupPrompt>[0]
const build = (c: Cat) =>
  buildCleanupPrompt(c, 'App', undefined, undefined, 2, false, 'default', '')

// Reported 2026-09-05: "Yappr never puts things in quotes for some
// reason... And then there's a bunch of times where I would need it to
// add bullet points or make it a numbered list."

describe('quoting rules reach every category', () => {
  // ai_prompt is deliberately excluded: it is the largest template and
  // sits against the TPM ceiling in prompt-size.test.ts, and its own
  // ## Examples section already asks for quoted examples.
  it.each(['messaging', 'email', 'code', 'docs', 'other'] as const)(
    '%s asks for quotes around a referenced phrase', (c) => {
      // Before this, NOTHING in the file asked for quotation marks. The
      // only mentions were OUTPUT_GUARD's "do not wrap the output in
      // quotes", so the model had every reason to avoid them entirely.
      expect(build(c)).toContain('Quoting and parentheses:')
    })

  it('names the spoken cue and the referring case', () => {
    expect(build('email')).toMatch(/quote \.\.\. unquote/)
    expect(build('email')).toMatch(/the button that says/)
  })

  it('guards against over-punctuating', () => {
    // A rule that only says "add quotes" produces quotes around every
    // noun, and one that only says "use parentheses" brackets half the
    // sentence. Both are worse than leaving it alone.
    expect(build('email')).toMatch(/Over-punctuating reads worse than none/)
  })

  it('asks for parentheses around a clarifying aside', () => {
    expect(build('email')).toMatch(/parentheses read better than commas/)
  })

  it('does not bracket something the sentence needs', () => {
    // Parentheses demote what is inside them. Applied to the subject or
    // the object, that changes the meaning rather than clarifying it.
    expect(build('email')).toMatch(/do not bracket something the sentence needs/)
  })

  it('reconciles with the whole-output rule instead of contradicting it', () => {
    // Both instructions live in the same prompt. Without this clause they
    // read as a contradiction, and the safe reading of a contradiction is
    // to do nothing -- which is the bug being fixed.
    const p = build('email')
    expect(p).toContain('DO NOT wrap the output in quotes')
    expect(p).toMatch(/never wrap the whole output in quotes/)
  })

  it('stays small, because every character is charged per call', () => {
    // prompt-size.test.ts holds the real ceiling; this keeps the block
    // itself from drifting back up.
    // ai_prompt has ~73 characters of headroom against the ceiling in
    // prompt-size.test.ts, so this block is deliberately absent there.
    expect(build('other')).toContain('Quoting and parentheses:')
    expect(build('ai_prompt')).not.toContain('Quoting and parentheses:')
  })
})

describe('list rules', () => {
  it.each(['messaging', 'email', 'code', 'docs', 'other'] as const)(
    '%s carries the list-formatting rules', (c) => {
      expect(build(c)).toContain('List formatting:')
    })

  it('the casual register no longer narrows them to "explicitly dictated"', () => {
    // iMessage said "no bullets unless the user explicitly dictated a
    // list", which is tighter than LIST_FORMATTING's own trigger
    // (enumerations, "first/second/third", comma lists) and suppressed it.
    // The narrowing lived in the casual iMessage register block.
    expect(build('messaging')).not.toMatch(/unless the user explicitly dictated a list/)
  })

  it('still refuses to force a list onto continuous prose', () => {
    expect(build('other')).toMatch(/Do NOT force a list onto a single idea/)
  })

  it('leaves ai_prompt to its own structure', () => {
    // ## Tasks and ## Constraints already produce lists there;
    // LIST_FORMATTING's prose rules would compete with the template, and
    // it has no size budget to spare.
    expect(build('ai_prompt')).not.toContain('List formatting:')
    expect(build('ai_prompt')).toMatch(/## Tasks/)
  })
})
