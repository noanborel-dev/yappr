import { describe, it, expect } from 'vitest'
import { asksForEmailComposition } from './rewrite-prompt'
import { buildCleanupPrompt } from './prompts'

// Dictating "please write an email about X" into Gmail produced a tidied
// version of that sentence — no greeting, no sign-off, no name. The email
// category is a CLEANER: it is told to preserve what was dictated and not
// invent openings. The rules that mandate a greeting lived only in
// select-and-rewrite.
describe('asksForEmailComposition', () => {
  it('recognises a request to write one', () => {
    for (const t of [
      'Please write an email explaining what project I am working on',
      'write me an email to Sam about the launch date',
      'can you draft an email to the team about Thursday',
      'reply to this email and say we will ship Friday',
    ]) expect(asksForEmailComposition(t), t).toBe(true)
  })

  // Critical: dictating an email must still be CLEANED, not rewritten.
  // Compose mode on real dictated content would replace the user's words.
  it('does not fire on an email the user is dictating', () => {
    for (const t of [
      'Hi Sam, just confirming Thursday works for the review',
      'I replied to his email yesterday about the invoice',
      'the email bounced so I had to resend it manually',
    ]) expect(asksForEmailComposition(t), t).toBe(false)
  })
})

describe('email compose mode', () => {
  const cleaner = buildCleanupPrompt('email', 'Gmail', undefined, undefined, 3, false, 'default', '')
  const composer = buildCleanupPrompt('email', 'Gmail', undefined, undefined, 3, false, 'default', '', 'chat', true)

  it('adds composing instructions only when asked', () => {
    expect(composer).toContain('COMPOSE MODE')
    expect(cleaner).not.toContain('COMPOSE MODE')
  })

  it('mandates the parts that were missing', () => {
    expect(composer).toContain('greeting')
    expect(composer).toContain('sign-off')
    expect(composer).toContain('Subject:')
  })

  it('forbids the placeholder names an LLM reaches for', () => {
    expect(composer).toContain('[Your Name]')   // named so it is banned
  })

  it('does not turn other categories into composers', () => {
    const code = buildCleanupPrompt('code', 'Code', undefined, undefined, 2, false, 'default', '', 'chat', true)
    expect(code).not.toContain('COMPOSE MODE')
  })
})
