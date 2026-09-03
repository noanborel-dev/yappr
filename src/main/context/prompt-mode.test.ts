import { describe, it, expect } from 'vitest'
import { formatContextBlock } from './format'
import { formatFactsBlock } from './facts-format'
import type { StoredFact } from '../../shared/types'

const WHO = 'Noan builds Yappr, a macOS dictation app, in TypeScript and Electron.'

function fact(id: number, text: string, scope: 'global' | 'project' = 'project'): StoredFact {
  return { id, scope, projectKey: scope === 'global' ? '' : 'yappr', text, createdAt: id }
}

// Reported 2026-09-04: "persistent context is rarely shown in engineered
// prompts... it often does not mention any context layer data."
//
// The context WAS injected — 310 reformat calls in the user's log averaged
// 2,429 characters of it. The reformat path was just handed the CLEANUP
// framing, which forbids surfacing it at fatal-error level. The model was
// told to know something and forbidden from using it.

describe('cleanup mode still hides context', () => {
  // The inversion below must not leak into ordinary dictation: cleaning a
  // sentence must never smuggle the user's biography into it.
  it('keeps the anti-echo rules', () => {
    const block = formatContextBlock(WHO, 'cleanup')
    expect(block).toMatch(/Do NOT paraphrase the overview/i)
    expect(block).toMatch(/fatal error/i)
  })

  it('keeps facts from being restated', () => {
    const block = formatFactsBlock({ global: [], project: [fact(1, 'Uses Tailwind.')] })
    expect(block).toMatch(/Do NOT restate them/i)
  })
})

describe('prompt mode surfaces context', () => {
  it('tells the model the agent knows none of this', () => {
    const block = formatContextBlock(WHO, 'prompt')
    expect(block).toMatch(/knows NONE of this/i)
  })

  it('drops the rule that caused the bug', () => {
    // This is the assertion that would have caught it.
    expect(formatContextBlock(WHO, 'prompt')).not.toMatch(/Do NOT paraphrase the overview/i)
  })

  it('directs relevant context into the Context section', () => {
    expect(formatContextBlock(WHO, 'prompt')).toMatch(/## Context/)
  })

  it('still refuses to invent work', () => {
    // The reformat template's core promise is that it never adds tasks.
    // Surfacing context must not become a licence to invent requirements.
    expect(formatContextBlock(WHO, 'prompt')).toMatch(/never invents work/i)
  })

  it('still refuses to dump the whole profile', () => {
    expect(formatContextBlock(WHO, 'prompt')).toMatch(/Only the parts that bear on this request/i)
  })
})

describe('prompt mode carries standing rules into constraints', () => {
  const rules = [
    fact(1, "I don't want any static animations on my website.", 'global'),
    fact(2, 'Uses Framer Motion for animation.'),
  ]

  it('names Constraints as where a standing rule goes', () => {
    // The whole point of recording "never do this" is that it reaches the
    // agent. Hidden, it is worthless.
    const block = formatFactsBlock({ global: [rules[0]], project: [rules[1]], mode: 'prompt' })
    expect(block).toMatch(/## Constraints/)
  })

  it('no longer tells the model to hide them', () => {
    const block = formatFactsBlock({ global: [rules[0]], project: [rules[1]], mode: 'prompt' })
    expect(block).not.toMatch(/Do NOT restate them/i)
  })

  it('still includes the facts themselves', () => {
    const block = formatFactsBlock({ global: [rules[0]], project: [rules[1]], mode: 'prompt' })
    expect(block).toContain('static animations')
    expect(block).toContain('Framer Motion')
  })

  it('warns against dumping unrelated facts', () => {
    const block = formatFactsBlock({ global: rules, project: [], mode: 'prompt' })
    expect(block).toMatch(/Leave out anything unrelated/i)
  })

  it('is empty when there is nothing stored, in every mode', () => {
    expect(formatFactsBlock({ global: [], project: [], mode: 'prompt' })).toBe('')
    expect(formatFactsBlock({ global: [], project: [] })).toBe('')
  })
})

describe('the three modes are actually different', () => {
  it('produces three distinct framings', () => {
    const blocks = [
      formatContextBlock(WHO, 'cleanup'),
      formatContextBlock(WHO, 'command'),
      formatContextBlock(WHO, 'prompt'),
    ]
    expect(new Set(blocks).size).toBe(3)
  })

  it('includes the overview in all of them', () => {
    for (const mode of ['cleanup', 'command', 'prompt'] as const) {
      expect(formatContextBlock(WHO, mode)).toContain(WHO)
    }
  })
})
