import { describe, it, expect } from 'vitest'
import { completeEmailSignoff } from './rewrite-prompt'

// Reported 2026-09-05: "it just did the greeting. It did not say the
// goodbye or anything."
//
// The real cleanup output from that dictation, which kept every word and
// therefore added no ending:
const CLEANED = "Hey Bobo,\n\nI’ve attached my address below. Let me know if you can send the package. Please make sure to include the last extension of my room number."

describe('finishing an email the user dictated whole', () => {
  it('adds the sign-off that was missing', () => {
    const out = completeEmailSignoff(CLEANED, 'Noan')
    expect(out.endsWith('\n\nBest,\nNoan')).toBe(true)
  })

  it('does not touch a single word of what they said', () => {
    // The whole point. Compose added an ending but rewrote "Hey Bobo,"
    // into a generic "Hi," and lost the recipient's name.
    expect(completeEmailSignoff(CLEANED, 'Noan')).toContain(CLEANED)
    expect(completeEmailSignoff(CLEANED, 'Noan')).toContain('Hey Bobo,')
  })
})

describe('what it must leave alone', () => {
  it('a fragment with no greeting', () => {
    // An inline reply or a sentence added to an existing draft. Signing
    // half a sentence is worse than leaving it unsigned.
    const frag = 'the room number is 412 and the entrance is on the north side'
    expect(completeEmailSignoff(frag, 'Noan')).toBe(frag)
  })

  it('an email that already ends with a sign-off', () => {
    const signed = 'Hi Sam,\n\nThursday works.\n\nBest,\nNoan'
    expect(completeEmailSignoff(signed, 'Noan')).toBe(signed)
  })

  it('a sign-off sitting above a signature block', () => {
    const signed = 'Hi Sam,\n\nThursday works.\n\nThanks,\nNoan\nYappr'
    expect(completeEmailSignoff(signed, 'Noan')).toBe(signed)
  })

  it('anything, when we do not know the user’s name', () => {
    // "Best," with nothing under it reads as an email that stopped
    // mid-signature — worse than no sign-off at all.
    expect(completeEmailSignoff(CLEANED, null)).toBe(CLEANED)
    expect(completeEmailSignoff(CLEANED, '  ')).toBe(CLEANED)
  })

  it('an empty or whitespace reply', () => {
    expect(completeEmailSignoff('', 'Noan')).toBe('')
    expect(completeEmailSignoff('   \n', 'Noan')).toBe('   \n')
  })
})

describe('greeting detection is not fooled', () => {
  it('treats a first sentence that opens like a greeting as body', () => {
    // "Hi Jeff, thanks for the note." is prose, not a bare greeting line,
    // so this is a fragment and stays unsigned.
    const prose = 'Hi Jeff, thanks for the note. I will look at it tomorrow.'
    expect(completeEmailSignoff(prose, 'Noan')).toBe(prose)
  })

  it.each(['Hey Bobo,', 'Hi,', 'Hello Sam,', 'Dear Dr Patel,'])('accepts %s', (g) => {
    expect(completeEmailSignoff(`${g}\n\nThe thing is ready.`, 'Noan'))
      .toContain('Best,\nNoan')
  })
})
