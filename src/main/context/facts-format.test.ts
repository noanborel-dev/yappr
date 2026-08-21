import { describe, it, expect } from 'vitest'
import {
  normalizeFactText,
  factDedupeKey,
  capForInjection,
  formatFactsBlock,
  MAX_FACT_CHARS,
  type StoredFact,
} from './facts-format'

let nextId = 1
const fact = (text: string, createdAt = nextId, scope: 'global' | 'project' = 'project'): StoredFact => ({
  id: nextId++,
  scope,
  projectKey: scope === 'global' ? '' : 'yappr',
  text,
  createdAt,
})

describe('normalizeFactText', () => {
  it('collapses whitespace', () => {
    expect(normalizeFactText('  we   use    zod for validation ')).toBe('we use zod for validation')
  })

  it('rejects a paragraph', () => {
    // Long text here means a chunk of dictation was misrouted, and it
    // would cost budget on every future prompt in the project.
    expect(normalizeFactText('a '.repeat(MAX_FACT_CHARS))).toBeNull()
  })

  it('rejects a fragment too short to be a fact', () => {
    expect(normalizeFactText('typescript')).toBeNull()
    expect(normalizeFactText('use zod')).toBeNull()
  })

  it('rejects empty and nullish input', () => {
    expect(normalizeFactText('')).toBeNull()
    expect(normalizeFactText('   ')).toBeNull()
    expect(normalizeFactText(null)).toBeNull()
    expect(normalizeFactText(undefined)).toBeNull()
  })
})

describe('factDedupeKey', () => {
  // The same rule said twice must not accumulate — a repeated preference
  // would slowly crowd out everything else in the budget.
  it('ignores case and whitespace', () => {
    expect(factDedupeKey('project', 'yappr', 'We  Use Zod')).toBe(
      factDedupeKey('project', 'yappr', 'we use zod'),
    )
  })

  it('separates the tiers and the projects', () => {
    expect(factDedupeKey('global', '', 'we use zod')).not.toBe(factDedupeKey('project', 'yappr', 'we use zod'))
    expect(factDedupeKey('project', 'yappr', 'we use zod')).not.toBe(
      factDedupeKey('project', 'other', 'we use zod'),
    )
  })
})

describe('capForInjection', () => {
  it('keeps everything when it fits', () => {
    const facts = [fact('we use zod for validation'), fact('we use tailwind for styling')]
    expect(capForInjection(facts, 1000)).toHaveLength(2)
  })

  // Newest-first: if the user changed their mind, the surviving rule
  // should be the current one, not the superseded one.
  it('drops the oldest first when over budget', () => {
    const old = { ...fact('old rule about indentation here'), createdAt: 1 }
    const recent = { ...fact('new rule about indentation here'), createdAt: 999 }
    const kept = capForInjection([old, recent], 40)
    expect(kept).toHaveLength(1)
    expect(kept[0].text).toContain('new rule')
  })

  it('returns nothing for an empty bucket', () => {
    expect(capForInjection([], 500)).toEqual([])
  })
})

describe('formatFactsBlock', () => {
  it('is empty when there is nothing to inject', () => {
    // Callers concatenate unconditionally, so this has to be "".
    expect(formatFactsBlock({ global: [], project: [] })).toBe('')
  })

  it('labels the two tiers distinctly', () => {
    const block = formatFactsBlock({
      global: [fact('I always use TypeScript everywhere', 1, 'global')],
      project: [fact('this project uses Groq for cleanup')],
      projectKey: 'yappr',
    })
    expect(block).toContain('applies everywhere')
    expect(block).toContain('I always use TypeScript everywhere')
    expect(block).toContain('About the project for "yappr"')
    expect(block).toContain('this project uses Groq for cleanup')
  })

  it('omits a tier that has no facts', () => {
    const block = formatFactsBlock({ global: [], project: [fact('this project uses Groq for cleanup')] })
    expect(block).not.toContain('applies everywhere')
    expect(block).toContain('About the project')
  })

  // A small model handed background facts will otherwise summarise them
  // back into the output instead of using them.
  it('carries anti-echo rules', () => {
    const block = formatFactsBlock({ global: [fact('I always use TypeScript everywhere', 1, 'global')], project: [] })
    expect(block).toContain('Do NOT restate them')
    expect(block).toContain('do NOT let them change what the user actually asked for')
  })
})
