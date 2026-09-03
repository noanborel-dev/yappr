import { describe, it, expect } from 'vitest'
import { classifyCodeSurface, hasImperativeOpener, MIN_ACTIONABLE_REFORMAT_WORDS } from './ai-intent'
import { cleanupSkipReason } from './cleanup-policy'

// Reported 2026-09-04: saying "build a landing page about my app" to Claude
// Code in VS Code's integrated terminal pasted those words literally instead
// of shaping them into a prompt.
//
// It was never a detection failure — the user's log carried "cli":"claude"
// 405 times and "no-ai-signal" zero times. It was a cliff at
// MIN_REFORMAT_WORDS: the phrase is 7 words, and inserting the semantically
// empty "me" made it 8 and made it work.

function surfaceFor(transcript: string) {
  return classifyCodeSurface({
    category: 'code',
    transcript,
    terminalAiCli: { isAiCli: true, cli: 'claude' },
  })
}

describe('short prompts to a detected AI CLI', () => {
  it('shapes the reported phrase', () => {
    expect(surfaceFor('build a landing page about my app').register).toBe('reformat')
  })

  it('shapes it the same with or without the meaningless "me"', () => {
    // The whole bug in one assertion: these must not diverge.
    expect(surfaceFor('build a landing page about my app').register)
      .toBe(surfaceFor('build me a landing page about my app').register)
  })

  it('recognises design work as a request', () => {
    // 'design' was absent from IMPERATIVE_VERBS, so an identical ask read
    // as prose depending only on which verb the user reached for.
    expect(surfaceFor('design a landing page about my app').register).toBe('reformat')
  })

  it('still refuses to shape a short aside', () => {
    // THE regression this must never cause. cleanup-policy.ts records that
    // this exact phrase went to the LLM, 429'd and took 6.5s. It satisfies
    // isActionableRequest (via "let's"), which is why the lower floor keys
    // on hasImperativeOpener instead.
    expect(surfaceFor("let's see how quick this is").register).toBe('faithful_ai')
  })

  it('leaves a description alone however long', () => {
    expect(surfaceFor('just wanted to see how quick this thing works').register)
      .toBe('faithful_ai')
  })

  it('does not shape below the reduced floor', () => {
    // "fix the login bug" is already clear; shaping invents structure.
    expect(surfaceFor('fix the login bug').register).toBe('faithful_ai')
    expect('fix the login bug'.split(' ').length).toBeLessThan(MIN_ACTIONABLE_REFORMAT_WORDS)
  })
})

describe('hasImperativeOpener', () => {
  it('fires on a verb in the opening position', () => {
    expect(hasImperativeOpener('build a landing page')).toBe(true)
    expect(hasImperativeOpener('design the onboarding')).toBe(true)
  })

  it('does not fire on the softer cues isActionableRequest accepts', () => {
    // These are requests, but not evidence that six words are a prompt.
    expect(hasImperativeOpener("let's see how quick this is")).toBe(false)
    expect(hasImperativeOpener('can you take a look')).toBe(false)
  })

  it('does not fire on the same words used as nouns', () => {
    expect(hasImperativeOpener('the design is wrong')).toBe(false)
    expect(hasImperativeOpener('I plan to rewrite it later')).toBe(false)
  })
})

describe('cleanupSkipReason honours a shaping-bound transcript', () => {
  const SHORT = 'build a landing page about my app'   // 7 words

  it('would otherwise skip it for being short', () => {
    // Without the flag the fix above is dead code: classifyCodeSurface says
    // reformat, then the short-utterance bypass skips the LLM anyway and
    // the brief gets pasted.
    expect(cleanupSkipReason(SHORT, 'code')).toBe('short-utterance')
  })

  it('runs the LLM when the surface routed to reformat', () => {
    expect(cleanupSkipReason(SHORT, 'ai_prompt', { willReformat: true })).toBe('none')
  })

  it('does not let the flag leak into ordinary short dictation', () => {
    expect(cleanupSkipReason('okay sounds good to me', 'other')).toBe('short-utterance')
  })
})
