import { describe, it, expect } from 'vitest'
import {
  groupByProject,
  eligibleProjects,
  buildProjectFactsPrompt,
  parseProjectFacts,
  MIN_DICTATIONS_PER_PROJECT,
  MAX_FACTS_PER_RUN,
} from './project-facts'
import type { DictationResult } from '../../shared/types'

let n = 0
const d = (projectKey: string | null | undefined, cleaned = 'we use zod for validation'): DictationResult => ({
  id: String(++n), transcript: cleaned, cleaned,
  appName: 'Cursor', appCategory: 'code', timestamp: n, projectKey,
})

describe('groupByProject', () => {
  it('groups by key', () => {
    const groups = groupByProject([d('yappr'), d('landing'), d('yappr')])
    expect(groups.get('yappr')).toHaveLength(2)
    expect(groups.get('landing')).toHaveLength(1)
  })

  it('drops dictations with no project', () => {
    expect(groupByProject([d(null), d(undefined), d('')]).size).toBe(0)
  })

  // Unsorted dictations have no project in common. Generalising across
  // them would invent a relationship — the same guessing project-key
  // extraction refuses to do.
  it('excludes the unsorted bucket', () => {
    expect(groupByProject([d('unsorted'), d('unsorted'), d('unsorted')]).size).toBe(0)
  })
})

describe('eligibleProjects', () => {
  it('needs enough material to generalise from', () => {
    const groups = groupByProject([
      ...Array.from({ length: MIN_DICTATIONS_PER_PROJECT }, () => d('yappr')),
      d('thin'),
    ])
    expect(eligibleProjects(groups)).toEqual(['yappr'])
  })

  it('is empty when nothing qualifies', () => {
    expect(eligibleProjects(groupByProject([d('a'), d('b')]))).toEqual([])
  })
})

describe('buildProjectFactsPrompt', () => {
  it('names the project and lists the dictations', () => {
    const p = buildProjectFactsPrompt('yappr', [d('yappr', 'we use groq for cleanup')])
    expect(p).toContain('"yappr"')
    expect(p).toContain('we use groq for cleanup')
  })

  it('prefers cleaned text but falls back to the transcript', () => {
    const raw: DictationResult = { ...d('yappr'), cleaned: '', transcript: 'raw words here' }
    expect(buildProjectFactsPrompt('yappr', [raw])).toContain('raw words here')
  })
})

describe('parseProjectFacts', () => {
  it('reads a bullet list', () => {
    expect(parseProjectFacts('- Yappr uses Groq for cleanup\n- Transcription runs locally'))
      .toEqual(['Yappr uses Groq for cleanup', 'Transcription runs locally'])
  })

  it('tolerates numbered lists and other glyphs', () => {
    expect(parseProjectFacts('1. Yappr uses Groq for cleanup\n• Transcription runs locally'))
      .toHaveLength(2)
  })

  // A preamble line becoming a stored "fact" means the user has to go
  // find and delete it.
  it('ignores non-bullet prose', () => {
    expect(parseProjectFacts('Here are the facts I found:\n- Yappr uses Groq for cleanup'))
      .toEqual(['Yappr uses Groq for cleanup'])
  })

  it('drops fragments and over-long lines', () => {
    expect(parseProjectFacts(`- zod\n- ${'a '.repeat(150)}\n- Yappr uses Groq for cleanup`))
      .toEqual(['Yappr uses Groq for cleanup'])
  })

  // The model is told to output nothing; some say so in prose instead.
  it('ignores a stated absence of facts', () => {
    expect(parseProjectFacts('- No durable facts were found here')).toEqual([])
    expect(parseProjectFacts('- none of these are durable facts')).toEqual([])
  })

  it('caps how much one run can add', () => {
    const many = Array.from({ length: 20 }, (_, i) => `- fact number ${i} about the project`).join('\n')
    expect(parseProjectFacts(many)).toHaveLength(MAX_FACTS_PER_RUN)
  })

  it('returns nothing for empty output', () => {
    expect(parseProjectFacts('')).toEqual([])
  })
})
