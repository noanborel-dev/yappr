import { describe, it, expect } from 'vitest'
import {
  normalizeComposedEmail,
  senderNameFromOverview,
  asksForEmailComposition,
  looksLikeSignoff,
} from './rewrite-prompt'

// These are enforced in CODE as well as in the prompt because the live
// model produced both failures WITH the prohibitions already written into
// the prompt. A prompt rule is a request; this is the guarantee.
describe('normalizeComposedEmail', () => {
  const NAME = 'Noan'

  // Observed verbatim from gpt-oss-20b, with "NEVER write bracketed
  // placeholders. No [Your Name]" in the system prompt at the time.
  it('strips the [Your Name] placeholder the prompt already forbids', () => {
    const out = normalizeComposedEmail('Hi Jeff,\n\nThe launch slipped.\n\nThanks,\n[Your Name]', null)
    expect(out).not.toContain('[')
    expect(out).toMatch(/Thanks,$/)
  })

  it('replaces the placeholder with the real name when one is known', () => {
    const out = normalizeComposedEmail('Hi Jeff,\n\nThe launch slipped.\n\nThanks,\n[Your Name]', NAME)
    expect(out).not.toContain('[')
    expect(out.endsWith('Thanks,\nNoan')).toBe(true)
  })

  it('strips other placeholder shapes too', () => {
    expect(normalizeComposedEmail('Hi,\n\nOK.\n\nBest,\n[Signature]', null)).not.toContain('[')
    expect(normalizeComposedEmail('Hi,\n\nOK.\n\nBest,\n<Your Name>', null)).not.toContain('<')
  })

  // The other observed failure: the body simply stopped. In a compose
  // window that reads as truncated, and it gets sent that way.
  it('adds a sign-off when the model left none', () => {
    const out = normalizeComposedEmail("Hi Sam,\n\nI'm running late.", NAME)
    expect(out).toContain('Best,')
    expect(out.endsWith('Noan')).toBe(true)
  })

  it('adds the sign-off word alone when no name is known', () => {
    const out = normalizeComposedEmail("Hi Sam,\n\nI'm running late.", null)
    expect(out.endsWith('Best,')).toBe(true)
  })

  // "Best regards." — a full stop after a sign-off reads as the end of a
  // sentence rather than the start of a signature.
  it('normalises a full-stopped sign-off to a comma', () => {
    expect(normalizeComposedEmail("Hi Sam,\n\nLate.\n\nBest regards.", null))
      .toMatch(/Best regards,$/)
  })

  it('appends the name under an existing sign-off', () => {
    expect(normalizeComposedEmail('Hi Sam,\n\nLate.\n\nBest,', NAME).endsWith('Best,\nNoan')).toBe(true)
  })

  // Already correct output must survive untouched — no doubled name, no
  // second sign-off.
  it('leaves a well-formed email alone', () => {
    const good = 'Hi Sam,\n\nRunning late.\n\nBest,\nNoan'
    expect(normalizeComposedEmail(good, NAME)).toBe(good)
  })

  it('handles empty input without inventing an email', () => {
    expect(normalizeComposedEmail('', NAME)).toBe('')
    expect(normalizeComposedEmail('   \n  ', NAME)).toBe('')
  })
})

describe('senderNameFromOverview', () => {
  it('reads the name from the shape the compactor writes', () => {
    expect(senderNameFromOverview('Noan builds Yappr, a Mac dictation app.')).toBe('Noan')
    expect(senderNameFromOverview('Sarah is a product designer in Berlin.')).toBe('Sarah')
  })

  // A wrong name under a sign-off is worse than none: it is signed by
  // somebody who is not the sender.
  it('refuses pronouns and articles that fit the shape', () => {
    expect(senderNameFromOverview('They build software for hospitals.')).toBeNull()
    expect(senderNameFromOverview('The user is a developer.')).toBeNull()
  })

  it('returns null rather than guessing from prose it does not recognise', () => {
    expect(senderNameFromOverview('Works mostly in TypeScript and Electron.')).toBeNull()
    expect(senderNameFromOverview('')).toBeNull()
    expect(senderNameFromOverview(null)).toBeNull()
  })
})

describe('asksForEmailComposition — email as a verb', () => {
  // The gap that caused the report. The regex required a composition verb
  // BEFORE the noun, so this phrasing fell through to ordinary cleanup and,
  // being short, was skipped: the request itself got pasted.
  it('catches email used as the verb', () => {
    expect(asksForEmailComposition("email Sam I'm running late")).toBe(true)
    expect(asksForEmailComposition('email the team about Friday')).toBe(true)
    expect(asksForEmailComposition('please email Jeff the numbers')).toBe(true)
  })

  it('still catches the original shape', () => {
    expect(asksForEmailComposition('write an email to Sam')).toBe(true)
    expect(asksForEmailComposition('draft a quick email about Friday')).toBe(true)
  })

  // Anchoring the verb form to the start is what keeps these quiet.
  it('is not fooled by email as a noun', () => {
    expect(asksForEmailComposition('the email bounced')).toBe(false)
    expect(asksForEmailComposition('check my email')).toBe(false)
    expect(asksForEmailComposition('his email address is wrong')).toBe(false)
  })
})

describe('looksLikeSignoff', () => {
  it('recognises the endings people actually use', () => {
    expect(looksLikeSignoff('Best,')).toBe(true)
    expect(looksLikeSignoff('Thanks')).toBe(true)
    expect(looksLikeSignoff('Kind regards,')).toBe(true)
  })

  it('does not mistake a sentence for a sign-off', () => {
    expect(looksLikeSignoff('Thanks for sending the deck over.')).toBe(false)
    expect(looksLikeSignoff('Best case we ship Friday.')).toBe(false)
  })
})
