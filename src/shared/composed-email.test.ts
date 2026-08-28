import { describe, it, expect } from 'vitest'
import {
  normalizeComposedEmail,
  senderNameFromOverview,
  asksForEmailComposition,
  looksLikeSignoff,
  looksLikeMetaReply,
} from './rewrite-prompt'

// These are enforced in CODE as well as in the prompt because the live
// model produced both failures WITH the prohibitions already written into
// the prompt. A prompt rule is a request; this is the guarantee.
describe('asksForEmailComposition — mentioning an email is not asking for one', () => {
  // Both verbatim from history, both dictated into VS Code, both composed
  // as emails and returned with "Best," appended to a bug report.
  it('ignores a passing mention deep in a longer dictation', () => {
    expect(
      asksForEmailComposition(
        "I'm a bit confused about why it doesn't know more about Yapper given how much I've told it " +
          'and also given how much context it has about what Yapper does. I literally just ask it to ' +
          "write an email to my friend explaining what it does and ask if they'd want to invest.",
      ),
    ).toBe(false)
  })

  it('ignores a bug report about email composition', () => {
    expect(
      asksForEmailComposition(
        "So one additional issue I have currently is sometimes when I'll do like write an email or " +
          'something, it will add random things. Like sometimes now it wrote a perfect email and then ' +
          'at the end it said best and then it added a comma then said my name.',
      ),
    ).toBe(false)
  })

  // The real asks, also verbatim. These must keep working — the window
  // exists to separate them from the two above, not to disable compose.
  it('still catches an ask that opens the dictation', () => {
    expect(
      asksForEmailComposition(
        'Please write an email to Danielle, explain him the main features of my App Yapr, and also ' +
          "ask him if he'd like to be an investor.",
      ),
    ).toBe(true)
    expect(asksForEmailComposition('Could you please write an email to Daniel explaining what my app does')).toBe(true)
    expect(asksForEmailComposition("email Sam I'm running late")).toBe(true)
  })

  it('allows a short lead-in before the ask', () => {
    expect(asksForEmailComposition('Hey, can you draft an email to Sam about the launch please')).toBe(true)
  })
})

describe('looksLikeMetaReply', () => {
  // Reported: "I said a whole sentence and it just pasted the word
  // identical". No prompt asks for that word — the model volunteered a
  // verdict about the selection and the pipeline pasted the verdict over
  // the user's text.
  it('catches a one-word verdict standing in for a sentence', () => {
    const sentence = 'The pipeline drops chunks when Groq rate limits, so we fall back to local.'
    expect(looksLikeMetaReply(sentence, 'identical')).toBe(true)
    expect(looksLikeMetaReply(sentence, 'unchanged')).toBe(true)
    expect(looksLikeMetaReply(sentence, 'No changes needed.')).toBe(true)
  })

  // The length ratio is what makes this safe. A short selection
  // legitimately rewrites to a short result, and "same" may be the real
  // answer when the user selected one word.
  it('leaves short selections alone', () => {
    expect(looksLikeMetaReply('same', 'identical')).toBe(false)
    expect(looksLikeMetaReply('ok', 'okay')).toBe(false)
  })

  it('never fires on a real rewrite', () => {
    const sentence = 'we should ship the new pricing tomorrow, what do you think'
    expect(looksLikeMetaReply(sentence, 'We should ship the new pricing tomorrow. What do you think?')).toBe(false)
    expect(looksLikeMetaReply(sentence, 'Ship the new pricing tomorrow?')).toBe(false)
  })

  it('ignores empty input on either side', () => {
    expect(looksLikeMetaReply('', 'identical')).toBe(false)
    expect(looksLikeMetaReply('a long sentence that goes on a while', '')).toBe(false)
  })
})

describe('normalizeComposedEmail — the duplicated sign-off', () => {
  // Reported verbatim: it writes "best,", then the name, then another
  // "best,". The trigger is context NOT knowing the user's first name —
  // the old check could only recognise a signature by matching it against
  // a known name, so a correctly signed email looked unsigned.
  it('does not append a second sign-off when the name is unknown', () => {
    const out = normalizeComposedEmail('Hi Jeff,\n\nThe launch slipped.\n\nBest,\nNoan', null)
    expect(out).toBe('Hi Jeff,\n\nThe launch slipped.\n\nBest,\nNoan')
    expect(out.toLowerCase().match(/^best,$/gm)?.length).toBe(1)
  })

  it('still recognises the signature when the name IS known', () => {
    const out = normalizeComposedEmail('Hi Jeff,\n\nThe launch slipped.\n\nBest,\nNoan', 'Noan')
    expect(out.toLowerCase().match(/^best,$/gm)?.length).toBe(1)
  })

  it('accepts a multi-line signature under the sign-off', () => {
    const out = normalizeComposedEmail(
      'Hi Jeff,\n\nShipping Friday.\n\nBest,\nNoan Borel\nYappr Labs',
      null,
    )
    expect(out.toLowerCase().match(/^best,$/gm)?.length).toBe(1)
    expect(out.endsWith('Yappr Labs')).toBe(true)
  })

  it('normalises the punctuation of a sign-off that already has a name under it', () => {
    // "Best regards." reads as the end of a sentence, not the start of a
    // signature — same rule that already applied when it was the last line.
    const out = normalizeComposedEmail('Hi Jeff,\n\nThanks for this.\n\nBest regards.\nNoan', null)
    expect(out).toContain('Best regards,\nNoan')
  })

  // The guard: "Best" can open a sentence. A long line under it is prose,
  // so the email genuinely has no ending and still needs one.
  it('still adds a sign-off when the word appears mid-prose', () => {
    const out = normalizeComposedEmail(
      'Hi Jeff,\n\nBest\nwould be to ship on Friday and tell the design partner on Monday morning.',
      'Noan',
    )
    expect(out.endsWith('Best,\nNoan')).toBe(true)
  })
})

describe('normalizeComposedEmail', () => {
  const NAME = 'Noan'

  // Observed verbatim from gpt-oss-20b, with "NEVER write bracketed
  // placeholders. No [Your Name]" in the system prompt at the time.
  it('strips the [Your Name] placeholder the prompt already forbids', () => {
    const out = normalizeComposedEmail('Hi Jeff,\n\nThe launch slipped.\n\nThanks,\n[Your Name]', null)
    expect(out).not.toContain('[')
    // No trailing comma with nothing under it — see the sign-off tests
    // below for why that changed.
    expect(out).toMatch(/Thanks$/)
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
    expect(out.endsWith('Best')).toBe(true)
  })

  // THE DANGLING COMMA. Reported from a real composed email that ended
  // "Best," with nothing beneath it, which reads as an email cut off
  // mid-signature. A comma after a sign-off is punctuation whose only job
  // is to introduce the line below; with no name to introduce, it is a
  // promise the email does not keep.
  it('drops the sign-off comma when there is no name to put under it', () => {
    expect(normalizeComposedEmail("Hi Sam,\n\nLate.\n\nBest,", null))
      .toMatch(/Best$/)
  })

  it('keeps the comma when a name follows', () => {
    expect(normalizeComposedEmail("Hi Sam,\n\nLate.", NAME).endsWith('Best,\nNoan')).toBe(true)
  })

  // "Best regards." — a full stop after a sign-off reads as the end of a
  // sentence rather than the start of a signature. It still gets
  // normalised; it just does not gain a comma it has no use for.
  it('strips a full stop from a sign-off', () => {
    expect(normalizeComposedEmail("Hi Sam,\n\nLate.\n\nBest regards.", null))
      .toMatch(/Best regards$/)
    expect(normalizeComposedEmail("Hi Sam,\n\nLate.\n\nBest regards.", NAME))
      .toMatch(/Best regards,\nNoan$/)
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
  })

  // THE OVERVIEW THE COMPACTOR ACTUALLY WROTE, verbatim from a live
  // install. The old pattern demanded the verb immediately after the
  // first word, so a surname and an appositive defeated it — which is
  // why composed emails were signing off "Best," with nothing under it.
  it('reads the name past a surname and an appositive', () => {
    expect(senderNameFromOverview(
      'Noan Borel, 18, is a Madrid-based entrepreneur-student who will begin a BBA.',
    )).toBe('Noan')
  })

  it('reads the name past a surname alone', () => {
    expect(senderNameFromOverview('Noan Borel is building Yappr.')).toBe('Noan')
    expect(senderNameFromOverview('Noan Borel builds Yappr.')).toBe('Noan')
    expect(senderNameFromOverview('Sarah is a product designer in Berlin.')).toBe('Sarah')
  })

  // The widening must not swallow a whole clause looking for a verb. An
  // overview that opens on something other than the person still has to
  // come back null rather than signing the email "Yesterday".
  it('still refuses a sentence that does not open on a person', () => {
    expect(senderNameFromOverview('Yesterday the build broke again.')).toBeNull()
    expect(senderNameFromOverview('Everything about the project is late.')).toBeNull()
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
