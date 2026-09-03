import { describe, it, expect } from 'vitest'
import { composedEmailBodyChars } from './rewrite-prompt'

// Reported 2026-09-04, reproduced from the user's own history. The brief
//   "Write an email with all of the architecture of my app, plus asking
//    my friend Jeff if he wants to be an investor in the app."   (123 ch)
// came back as this complete string, 20 characters, pasted into Gmail:
const HOLLOW = 'Hi Jeff,\n\nBest,\nNoan'

// From the same day, same category, same context size — this one worked.
const REAL = [
  'Hi Jeff,',
  '',
  'I’m excited to share Yappr, a voice-dictation platform that turns spoken',
  'language into clean, editable text in real time.',
  '',
  'Best,',
  'Noan',
].join('\n')

describe('composedEmailBodyChars', () => {
  it('reports no body for the shell that shipped to Gmail', () => {
    expect(composedEmailBodyChars(HOLLOW)).toBe(0)
  })

  it('reports the real body for the email that worked', () => {
    expect(composedEmailBodyChars(REAL)).toBeGreaterThan(100)
  })

  it('separates a terse email from a hollow one', () => {
    // Both are short. Only one is a failure, which is why the guard counts
    // the body rather than the whole string.
    const terse = 'Hi Jeff,\n\nThursday at two works for me. See you then.\n\nBest,\nNoan'
    expect(composedEmailBodyChars(terse)).toBeGreaterThan(40)
    expect(composedEmailBodyChars(HOLLOW)).toBeLessThan(40)
  })

  it('handles a sign-off with no signature under it', () => {
    expect(composedEmailBodyChars('Hello,\n\nBest')).toBe(0)
  })

  it('handles a missing greeting', () => {
    expect(composedEmailBodyChars('Thursday works.\n\nBest,\nNoan')).toBe(15)
  })

  it('handles a missing sign-off', () => {
    expect(composedEmailBodyChars('Hi Jeff,\n\nThursday works.')).toBe(15)
  })

  it('does not strip a first sentence that opens like a greeting', () => {
    // "Hi Jeff, thanks for the note." is body, not a bare greeting — the
    // sentence punctuation is what tells them apart.
    const body = composedEmailBodyChars('Hi Jeff, thanks for the note.\n\nBest,\nNoan')
    expect(body).toBeGreaterThan(20)
  })

  it('survives an empty or whitespace reply', () => {
    expect(composedEmailBodyChars('')).toBe(0)
    expect(composedEmailBodyChars('\n\n  \n')).toBe(0)
  })

  it('handles CRLF line endings', () => {
    expect(composedEmailBodyChars('Hi Jeff,\r\n\r\nBest,\r\nNoan')).toBe(0)
  })
})
