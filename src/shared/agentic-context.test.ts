import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'

const CTX = '\n\nKNOWN CONTEXT — standing preferences.\n- I want fluid animations in interfaces.\n'

function forDest(destination: 'agentic' | 'chat') {
  return buildCleanupPrompt(
    'ai_prompt', 'Code', undefined, undefined, 2, false, 'default', CTX, destination,
  )
}

// Reported 2026-09-04: "every time you give it any sort of ask, it just
// tells you the exact app architecture, which is redundant because Claude
// Code already understands the architecture."
//
// Live output for "Please build me a sidebar." was:
//   ## Context  The Yappr project is a React application written in
//   TypeScript, styled with Tailwind CSS, and packaged as an Electron
//   desktop app...
// which is the project-profile feature reading package.json — precisely
// the file the agent can open itself.

describe('agentic destinations are not told what they can read', () => {
  it('forbids restating the stack', () => {
    expect(forDest('agentic')).toMatch(/CAN READ THE REPOSITORY/)
    expect(forDest('agentic')).toMatch(/Do NOT restate/)
  })

  it('makes Constraints REQUIRED, not a judgement call', () => {
    // Reversed 2026-09-05. It used to say "the preferences that apply to
    // THIS request", and the model resolved that as "none": six
    // consecutive reformats carrying 3,432 characters of context produced
    // 77-289 characters mentioning none of it.
    expect(forDest('agentic')).toMatch(/## Constraints — REQUIRED/)
    expect(forDest('agentic')).toMatch(/Do not judge whether they asked for them/)
  })

  it('no longer offers a licence to omit the context', () => {
    // "omit this section entirely" was an explicit permission slip, and
    // it got used every time.
    expect(forDest('agentic')).not.toMatch(/omit this section entirely/)
  })

  it('names omission as the failure', () => {
    expect(forDest('agentic')).toMatch(/Omitting them is the failure/)
  })
})

describe('chat destinations still get the stack', () => {
  it('says the assistant cannot see the project', () => {
    // The opposite case, and the reason this is a split rather than a
    // blanket removal: a chat assistant has no repo to read.
    expect(forDest('chat')).toMatch(/CANNOT see the project/)
  })

  it('asks for the stack in Context', () => {
    expect(forDest('chat')).toMatch(/## Context — the stack, framework and conventions/)
  })

  it('does not carry the agentic prohibition', () => {
    expect(forDest('chat')).not.toMatch(/CAN READ THE REPOSITORY/)
  })
})

describe('both keep the no-invention guard', () => {
  it.each(['agentic', 'chat'] as const)('%s', (d) => {
    expect(forDest(d)).toMatch(/Add NO tasks/)
  })
})
