import { describe, it, expect } from 'vitest'
import { classifyCodeSurface } from './ai-intent'

// Reported 2026-09-04: "I was just talking about some random thing with
// Claude in the web asking him questions and it made a whole vibe-coded
// prompt for no reason... when you're in Claude Code or Lovable and
// you're actually building a full project, that's when it should
// reformat."
//
// The line is whether the reader BUILDS from the text. An agent opens
// files, runs commands and is held to ## Constraints. An assistant is
// having a conversation, and ## Goal / ## Tasks / ## Done when is a work
// order — turning half someone's chat into one is the failure.

const ASK = 'can you go through the auth module and fix the login redirect so it stops looping'
const base = { category: 'other' as const, transcript: ASK }

describe('surfaces that BUILD get shaped', () => {
  it('an AI CLI in the terminal', () => {
    expect(classifyCodeSurface({
      ...base, category: 'code', terminalAiCli: { isAiCli: true, cli: 'claude' },
    }).register).toBe('reformat')
  })

  it('a builder in the browser — Lovable, v0, Bolt', () => {
    expect(classifyCodeSurface({
      ...base, category: 'ai_prompt', browserAiRouted: true, browserIsAgentic: true,
    }).register).toBe('reformat')
  })

  it('a chat pane inside a code editor', () => {
    expect(classifyCodeSurface({
      ...base, category: 'code', axRole: 'AXTextArea', isAxReadable: true,
    }).register).toBe('reformat')
  })

  it('sends builders the agentic framing, not the chat one', () => {
    // Decides whether the prompt restates the stack. A builder can read
    // its own project; a chat assistant cannot.
    expect(classifyCodeSurface({
      ...base, category: 'ai_prompt', browserAiRouted: true, browserIsAgentic: true,
    }).destination).toBe('agentic')
  })
})

describe('surfaces that CONVERSE do not', () => {
  it('the Claude or ChatGPT desktop app', () => {
    expect(classifyCodeSurface({ ...base, isPrimaryAiBundle: true }).register).toBe('faithful_ai')
  })

  it('claude.ai in a browser tab', () => {
    expect(classifyCodeSurface({
      ...base, category: 'ai_prompt', browserAiRouted: true, browserIsAgentic: false,
    }).register).toBe('faithful_ai')
  })

  it('treats an unknown browser AI surface as chat', () => {
    // Absent evidence that it builds, the safe default is not to shape:
    // an unwanted work order is worse than an unshaped sentence.
    expect(classifyCodeSurface({
      ...base, category: 'ai_prompt', browserAiRouted: true,
    }).register).toBe('faithful_ai')
  })
})

describe('an explicit ask still overrides the surface', () => {
  it('shapes in a chat app when the user asked for a prompt', () => {
    // "make me a prompt to..." is the user asking for the thing, in as
    // many words. Refusing there would be refusing an explicit request.
    expect(classifyCodeSurface({
      ...base,
      transcript: 'make me a prompt to turn the landing page into a waitlist',
      isPrimaryAiBundle: true,
    }).register).toBe('reformat')
  })
})
