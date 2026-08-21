import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'
// C5 from the agentic-prompt-shaping spec: make prompt edits MEASURABLE.
// Before this, `bench-groq-cleanup.mjs` compared models against a
// condensed copy of the prompt — it could not tell whether a shaping
// change improved anything, so edits to a ~3,400-token prompt shipped on
// judgement alone.
describe('ai_prompt destination shaping', () => {
  const agentic = () => buildCleanupPrompt('ai_prompt', 'Cursor', undefined, undefined, 2, false, 'default', '', 'agentic')
  const chat = () => buildCleanupPrompt('ai_prompt', 'ChatGPT', undefined, undefined, 2, false, 'default', '', 'chat')

  it('tells an agentic tool to use @file references', () => {
    // This is the payload of the whole feature: "@src/auth.tsx" makes the
    // tool LOAD the file; "auth.tsx" makes it guess.
    expect(agentic()).toContain('@path')
    expect(agentic()).toContain('@src/auth.tsx')
  })

  it('tells an agentic tool it can read and run things', () => {
    const p = agentic()
    expect(p).toContain('git history')
    expect(p).toContain('test suite')
    expect(p).toContain('## Verify')
  })

  it('does NOT tell a chat assistant to run commands or open files', () => {
    const p = chat()
    expect(p).toContain('no repository access')
    expect(p).not.toContain('@src/auth.tsx')
    expect(p).not.toContain('## Verify')
  })

  it('defaults to the conservative chat destination', () => {
    // Never instruct a receiving AI to do something it cannot do.
    const dflt = buildCleanupPrompt('ai_prompt', 'Something', undefined, undefined, 2, false, 'default', '')
    expect(dflt).toContain('no repository access')
  })

  // R7: shape may change, content may not. Both variants must keep it.
  it('keeps the no-invention rule in both destinations', () => {
    for (const p of [agentic(), chat()]) {
      expect(p).toContain('MAY NOT add requirements')
    }
  })

  it('keeps language preservation in both destinations', () => {
    for (const p of [agentic(), chat()]) {
      expect(p).toContain('NEVER translate')
    }
  })

  // Speed is the product (spec §5.1). The cleanup call is now ~100% of
  // post-release latency and competes for a 6,000 TPM budget.
  //
  // MEASURED, not assumed. The spec claimed the split would be
  // "token-neutral by construction"; it is not. Assembled sizes when
  // written: agentic 13,198 chars (~3,300 tok), chat 12,581 (~3,145),
  // versus ~12,351 for the single template it replaced. So agentic costs
  // about +7% per call and chat about +2%.
  //
  // Judged worth it because C4 removes whole reformat CALLS on three
  // routes that previously fired at any length — fewer calls at slightly
  // higher cost each. This is a CEILING to stop silent drift, not a target.
  //
  // Raised 14,000 → 15,500 when the self-correction rules were fixed.
  // The guard did its job: it caught a +1,622 char growth. That growth is
  // deliberate, not drift. Each piece of it was verified against live Groq
  // and removing any of them reintroduced a failure — the override clause,
  // the "already grammatical" clause, and the worked examples were each
  // load-bearing (see self-correction.test.ts for what and why). Cost is
  // ~+400 tokens on a cached prefix, so the per-call marginal cost is
  // small; correctness on retractions is the product's differentiator.
  it('keeps the agentic prompt under its size ceiling', () => {
    expect(agentic().length).toBeLessThan(15500)
  })

  it('keeps the chat prompt smaller than the agentic one', () => {
    expect(chat().length).toBeLessThan(agentic().length)
  })
})

// C2: the IDE addendum was gated on category === 'code', so the reformat
// route (which sets ai_prompt) could never emit @file syntax — the one
// register where it matters most.
describe('IDE addendum reaches the ai_prompt register', () => {
  it('includes the editor addendum for ai_prompt', () => {
    const withEditor = buildCleanupPrompt('ai_prompt', 'Cursor', undefined, 'cursor', 2, false, 'default', '', 'agentic')
    const without = buildCleanupPrompt('ai_prompt', 'Cursor', undefined, undefined, 2, false, 'default', '', 'agentic')
    expect(withEditor.length).toBeGreaterThan(without.length)
  })

  it('still includes it for the code category', () => {
    const withEditor = buildCleanupPrompt('code', 'Cursor', undefined, 'cursor', 2, false, 'default', '')
    const without = buildCleanupPrompt('code', 'Cursor', undefined, undefined, 2, false, 'default', '')
    expect(withEditor.length).toBeGreaterThan(without.length)
  })
})
