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

  it('makes constraints the section that matters', () => {
    // The preferences are the part an agent cannot infer from the code,
    // and they are what "remembering" means to the person dictating.
    expect(forDest('agentic')).toMatch(/## Constraints[\s\S]*This is the section that matters/)
  })

  it('lets Context be omitted entirely', () => {
    expect(forDest('agentic')).toMatch(/omit this section entirely/)
  })

  it('asks for length matched to the ask', () => {
    // "make this blue" should not produce a document.
    expect(forDest('agentic')).toMatch(/A one-line request produces a few lines/)
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
    expect(forDest(d)).toMatch(/Add NO tasks the user did not ask for/)
  })
})
