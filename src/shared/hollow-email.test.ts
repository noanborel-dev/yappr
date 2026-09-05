import { describe, it, expect } from 'vitest'
import {
  COMPOSED_EMAIL_MIN_BODY_CHARS,
  composedEmailBodyChars,
  isHollowEmail,
} from './rewrite-prompt'

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

// Reported 2026-09-04 on the select-and-rewrite path, found still live on
// 2026-09-05. A rewrite returned this complete string and nothing caught
// it:
const HOLLOW_WITH_SUBJECT = 'Subject: Shipping address for mouse delivery\n\nHi,'
//
// It is the same failure as HOLLOW above — a greeting and nothing else —
// but it scored 49, sailing past the 40-character floor. Two things went
// wrong at once: the subject line was counted AS body (44 of those 49
// characters), and, because the greeting test only looks at the first
// non-blank line, the subject line also SHIELDED the "Hi," behind it from
// being stripped. A subject line is metadata, never body.
//
// Measured over the user's 355 stored dictations, exactly two outputs
// carry a subject line: this one, which must fire, and a real 909-char
// email, which drops to 846 and must not.
describe('composedEmailBodyChars ignores a leading subject line', () => {
  it('reports no body for the shell that shipped from a rewrite', () => {
    expect(composedEmailBodyChars(HOLLOW_WITH_SUBJECT)).toBe(0)
  })

  it('strips the subject before testing for a greeting', () => {
    expect(composedEmailBodyChars('Subject: Quick question\n\nHi Jeff,\n\nBest,\nNoan')).toBe(0)
  })

  it('handles the markdown subject shapes the model emits', () => {
    expect(composedEmailBodyChars('**Subject:** Quick question\n\nHi,')).toBe(0)
    expect(composedEmailBodyChars('### Subject: Quick question\n\nHi,')).toBe(0)
    expect(composedEmailBodyChars('Subject - Quick question\n\nHi,')).toBe(0)
  })

  it('still counts the body of a real email that carries a subject', () => {
    const real = [
      'Subject: Shipping address',
      '',
      'Hi Jeff,',
      '',
      'My address is 12 Rue de la Paix, 75002 Paris. Any courier is fine.',
      '',
      'Best,',
      'Noan',
    ].join('\n')
    expect(composedEmailBodyChars(real)).toBeGreaterThan(40)
  })

  it('does not mistake a sentence opening with "Subject" for metadata', () => {
    // "Subject to approval" has no colon or dash after the word, so the
    // subject pattern must not claim it.
    const body = composedEmailBodyChars(
      'Hi Jeff,\n\nSubject to approval, we can ship on Friday.\n\nBest,\nNoan',
    )
    expect(body).toBeGreaterThan(40)
  })

  it('strips only one subject line, not a body that repeats the word', () => {
    expect(
      composedEmailBodyChars('Subject: Re: budget\n\nSubject: is what we should discuss at length here.'),
    ).toBeGreaterThan(40)
  })
})

// The select-and-rewrite path had no output guard at all. It is the one
// path that cannot be diagnosed from the log, and on 2026-09-05 a live
// rewrite replaced a user's selection with HOLLOW_WITH_SUBJECT above.
describe('isHollowEmail', () => {
  it('fires on the scaffolding that replaced a live selection', () => {
    expect(isHollowEmail(HOLLOW_WITH_SUBJECT)).toBe(true)
  })

  it('fires on a greeting and a sign-off with nothing between them', () => {
    expect(isHollowEmail('Hi Jeff,\n\nBest,\nNoan')).toBe(true)
  })

  // The reason this is stricter than the compose-path floor: "shorten
  // this email" legitimately returns very little, and keeping the long
  // original instead would be the opposite of what was asked.
  it('does NOT fire on a terse but real rewrite', () => {
    const terse = 'Hi Jeff,\n\nThursday works.\n\nBest,\nNoan'
    expect(composedEmailBodyChars(terse)).toBeLessThan(COMPOSED_EMAIL_MIN_BODY_CHARS)
    expect(isHollowEmail(terse)).toBe(false)
  })

  it('does not fire on prose that is not an email at all', () => {
    expect(isHollowEmail('Ship it on Friday.')).toBe(false)
  })

  it('does not fire on empty output', () => {
    // An empty completion is already replaced with the selection upstream.
    expect(isHollowEmail('')).toBe(false)
    expect(isHollowEmail('   \n ')).toBe(false)
  })

  it('pins the shared compose-path floor', () => {
    expect(COMPOSED_EMAIL_MIN_BODY_CHARS).toBe(40)
  })
})
