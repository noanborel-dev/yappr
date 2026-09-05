import { describe, it, expect } from 'vitest'
import { isActionableRequest, classifyCodeSurface } from './ai-intent'

// Reported 2026-09-05, and reproduced from the user's own history.
// Dictated into VS Code with Claude Code running:
const CHECK = "So now you're saying that essentially it will give me a greeting an actual email and then a sign off every single time Even if there's like words and stuff like it should be good"

// It became:
//   ## Goal
//   Generate a greeting, an actual email, and a sign off every time...
//
// Which inverts the meaning. The user was ASKING whether that is what
// happens; the output reads as an instruction to make it happen.

describe('a comprehension check is not an assignment', () => {
  it('leaves the reported dictation alone', () => {
    expect(isActionableRequest(CHECK)).toBe(false)
  })

  it('routes it to cleanup, not shaping', () => {
    expect(classifyCodeSurface({
      category: 'code', transcript: CHECK, terminalAiCli: { isAiCli: true, cli: 'claude' },
    }).register).toBe('faithful_ai')
  })

  it.each([
    "so you're saying it will add a sign off every time",
    'are you saying the context layer is already doing that',
    'you mean it only fires when there is a greeting',
  ])('leaves "%s" alone', (t) => {
    expect(isActionableRequest(t)).toBe(false)
  })
})

describe('evaluative should is not required should', () => {
  it.each([
    'if it does that then it should be good',
    'leave it as it is, should be fine',
    'that should be okay for now',
  ])('leaves "%s" alone', (t) => {
    expect(isActionableRequest(t)).toBe(false)
  })

  it('still treats a real requirement as one', () => {
    // The rule this must not swallow, and the reason "any subject +
    // should" exists at all.
    expect(isActionableRequest('the empty state should say something friendlier')).toBe(true)
    expect(isActionableRequest('the sidebar should collapse on mobile')).toBe(true)
  })
})

describe('nothing that worked before stops working', () => {
  it('an explicit ask, from the same session', () => {
    expect(isActionableRequest('Also, I know that it might be hard, but I want emails to be correctly spoken')).toBe(true)
  })

  it('an imperative, even after a comprehension-check phrase', () => {
    // The disqualifier must veto a weak `should`, never a real
    // instruction that happens to sit in the same dictation.
    expect(isActionableRequest('build me a sidebar')).toBe(true)
    expect(isActionableRequest("you're saying it is broken. Fix the login redirect")).toBe(true)
  })

  it('does not yet catch an imperative introduced by "so"', () => {
    // Pre-existing and unrelated to this fix: CLAUSE_OPENER_RE allows
    // "please" and "just" before the verb but not "so", so ", so fix X"
    // reads as description. Recorded rather than widened, because
    // loosening the imperative matcher is the aggressive direction and
    // nobody has reported it.
    expect(isActionableRequest('the redirect loops, so fix the login page')).toBe(false)
  })
})
