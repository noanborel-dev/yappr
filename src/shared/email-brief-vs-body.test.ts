import { describe, it, expect } from 'vitest'
import { instructsMessageComposition, asksForEmailComposition } from './rewrite-prompt'

// Live failure 2026-09-05, from the user's own history. Twenty-three
// words dictated into a Gmail compose box:
const BODY = 'Hey, I just copied my address below. That way you can send the mouse. Make sure that you include the room number specification.'

// Compose fired on LENGTH alone (>= 12 words in an email surface), the
// model was asked to write an email from an email, and returned
// "Hi,\n\nBest,\nNoan" — a greeting and a sign-off around nothing.

describe('the message is not a brief', () => {
  it('does not treat the reported dictation as an instruction', () => {
    expect(instructsMessageComposition(BODY)).toBe(false)
    expect(asksForEmailComposition(BODY)).toBe(false)
  })

  it.each([
    'Hey Robo, I just added my apartment number so the delivery gets to the right place',
    'Just wanted to check the shipping address is right before you send it out',
    'Thanks for getting back to me so quickly, Thursday works on my end',
  ])('leaves a dictated message alone: %s', (t) => {
    expect(instructsMessageComposition(t)).toBe(false)
  })
})

describe('a brief still composes', () => {
  it.each([
    'tell Sam that I am running late and will be there by four',
    'let Danielle know the invoice went out this morning',
    'ask Jeff if Thursday afternoon works for the demo',
    'reply saying we will take the larger unit if it is still available',
    'thank Priya for the introduction and say I will follow up next week',
  ])('recognises the instruction: %s', (t) => {
    expect(instructsMessageComposition(t)).toBe(true)
  })

  it('still catches the explicit forms through the other door', () => {
    // asksForEmailComposition is checked first and is untouched, so
    // nothing that worked before stops working.
    expect(asksForEmailComposition('Please write an email to my friend Jeff explaining what my app does')).toBe(true)
    expect(asksForEmailComposition('email Sam I am running late')).toBe(true)
  })
})

describe('the asymmetry that sets the default', () => {
  it('refuses to compose from an ambiguous long dictation', () => {
    // Wrongly composing DESTROYS the dictation — the user gets a hollow
    // shell, or the raw transcript once the body guard catches it.
    // Wrongly cleaning just leaves a brief tidied up, which is legible
    // and can be re-said. So absent evidence, do not compose.
    const ambiguous = 'the room number is 412 and the building entrance is on the north side of the street'
    expect(instructsMessageComposition(ambiguous)).toBe(false)
  })
})
