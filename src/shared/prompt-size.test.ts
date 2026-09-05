import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'

// Prompt size is a COST, and until it was measured nobody was paying
// attention to it.
//
// On a real machine every cleanup charges Groq thousands of tokens
// against an 8,000-per-minute limit. When it does not fit, the wait
// exceeds the retry cap and the pipeline pastes the raw transcript —
// silently, since a rate-limited key is not an absent key. The user
// experiences that as "it left my ums in and kept the thing I
// retracted", which is what an unpolished transcript looks like.
//
// So the ceiling is not housekeeping. It is the difference between one
// dictation a minute and none.

// The prompt TEMPLATE, with no context attached. This is what the
// ceiling below defends, and it is NOT what ships — see the second suite.
const template = () =>
  buildCleanupPrompt('ai_prompt', 'Cursor', undefined, undefined, 2, false, 'default', '', 'agentic')

// What actually goes out. 3,432 characters is the context block measured
// on the live reformat that produced "## Goal" and nothing else; blocks
// in the 3,400-3,750 range are ordinary.
const LIVE_CONTEXT_CHARS = 3432
const shipped = () =>
  buildCleanupPrompt(
    'ai_prompt', 'Cursor', undefined, undefined, 2, false, 'default',
    'x'.repeat(LIVE_CONTEXT_CHARS), 'agentic',
  )

// ~4 chars per token is the rule of thumb the token budget already uses.
const asTokens = (chars: number) => Math.ceil(chars / 4)

// 700 is cleanupMaxTokens() for a typical ~500-character dictation:
// ceil(500/4)*3 + 120 + 200 reasoning headroom. Groq bills input PLUS
// max_tokens, which is why the log reads "Requested 4772" rather than
// just the prompt size.
const REPLY_RESERVE = 700
const TPM_LIMIT = 8000

describe('cleanup prompt template', () => {
  // Kept as an absolute so a future edit that adds a block has to notice.
  // The previous ceiling was 15,500 and was raised, not defended, the last
  // time something grew into it.
  it('stays under the ceiling', () => {
    expect(template().length).toBeLessThan(12800)
  })
})

// This suite exists because the one above was measuring a prompt that is
// never sent. It passed contextBlock: '' and then asserted that two such
// calls fit inside a minute — but the reformat path always carries a
// context block, and with one attached the same arithmetic gives ~10,000
// tokens for two calls, so the assertion would have failed.
//
// It was defending 70 characters of headroom on a shape that does not
// ship, which is the one thing CLAUDE.md says a test must not do. The
// numbers below are measured against the real one, 2026-09-05.
describe('cleanup prompt as actually sent', () => {
  it('a single call fits inside the per-minute limit', () => {
    // Measured: 17,248 chars, 4,312 tokens, plus the 700 reserve.
    expect(asTokens(shipped().length) + REPLY_RESERVE).toBeLessThan(TPM_LIMIT)
  })

  // Not an aspiration — a statement of the measured position, pinned so
  // that changing it has to be deliberate. Two shaped dictations inside
  // one minute cannot both succeed on an 8,000 TPM key, and the log
  // agrees: 636 rate-limited requests, median 4,139 tokens, p90 7,188,
  // max 8,547 — six of them larger than the whole per-minute budget on
  // their own, and so unable to succeed at any pacing.
  //
  // No prompt edit closes that gap; the tier does. Recording it here is
  // meant to stop the next session shaving words off the template in the
  // belief that it will help.
  it('two calls in one minute do not, and that is the tier not the prompt', () => {
    const perCall = asTokens(shipped().length) + REPLY_RESERVE
    expect(perCall * 2).toBeGreaterThan(TPM_LIMIT)
  })

  it('the context block is the larger half of the growth', () => {
    // 12,730 -> 17,248. Trimming the template cannot pay for the block.
    expect(shipped().length - template().length).toBeGreaterThan(4000)
  })
})
