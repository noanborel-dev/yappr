import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'

// Prompt size is a COST, and until it was measured nobody was paying
// attention to it.
//
// On a real machine every cleanup charged Groq ~4,747 tokens against an
// 8,000-per-minute limit: roughly 3,870 for the system prompt and ~880
// reserved for the reply. Two dictations inside one minute exceeded the
// limit, the wait exceeded the retry cap, and the pipeline pasted the raw
// transcript — silently, since a rate-limited key is not an absent key.
// The user experienced that as "it left my ums in and kept the thing I
// retracted", which is what an unpolished transcript looks like.
//
// So the ceiling is not housekeeping. It is the difference between one
// dictation a minute and several.
const agentic = () =>
  buildCleanupPrompt('ai_prompt', 'Cursor', undefined, undefined, 2, false, 'default', '', 'agentic')

describe('cleanup prompt size', () => {
  // ~4 chars per token is the rule of thumb the token budget already uses.
  const asTokens = (chars: number) => Math.ceil(chars / 4)

  it('leaves room for more than one dictation per minute', () => {
    const chars = agentic().length
    const tokens = asTokens(chars)

    // The reply reservation is charged too — Groq bills input PLUS
    // max_tokens, which is why the log read "Requested 4747" for a
    // 741-character dictation rather than just the prompt size.
    //
    // 700 is cleanupMaxTokens() for a typical ~500-character dictation:
    // ceil(500/4)*3 + 120 + 200 reasoning headroom. A long dictation
    // reserves more and still only fits once a minute; that case is
    // bounded by Groq's tier, not by this file.
    const REPLY_RESERVE = 700
    expect((tokens + REPLY_RESERVE) * 2).toBeLessThan(8000)
  })

  // Kept as an absolute so a future edit that adds a block has to notice.
  // The previous ceiling was 15,500 and was raised, not defended, the last
  // time something grew into it.
  it('stays under the ceiling', () => {
    expect(agentic().length).toBeLessThan(12800)
  })
})
