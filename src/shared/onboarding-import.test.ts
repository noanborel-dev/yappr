import { describe, it, expect } from 'vitest'
import {
  parseOnboardingImport,
  isOverviewOnly,
  ONBOARDING_CONTEXT_PROMPT,
} from './onboarding-import'

describe('bucketed responses', () => {
  const paste = `
Noan works on Yappr, a Mac dictation app, and talks a lot about prompts and Groq.

GLOBAL
- I always use TypeScript for new projects
- I prefer functional React components

PROJECT: yappr
- Yappr uses Groq for LLM cleanup
- transcription runs locally with Parakeet

PROJECT: landing-site
- the landing site is plain HTML and Tailwind

UNSORTED
- something about a side project I could not place
`

  it('separates the overview paragraph from the sections', () => {
    const parsed = parseOnboardingImport(paste)
    expect(parsed.overview).toContain('Noan works on Yappr')
    expect(parsed.overview).not.toContain('GLOBAL')
    expect(parsed.overview).not.toContain('TypeScript')
  })

  it('collects global preferences', () => {
    expect(parseOnboardingImport(paste).global).toEqual([
      'I always use TypeScript for new projects',
      'I prefer functional React components',
    ])
  })

  it('collects one bucket per project', () => {
    const { projects } = parseOnboardingImport(paste)
    expect(Object.keys(projects).sort()).toEqual(['landing-site', 'yappr'])
    expect(projects['yappr']).toHaveLength(2)
    expect(projects['landing-site']).toEqual(['the landing site is plain HTML and Tailwind'])
  })

  it('keeps what it could not attribute', () => {
    expect(parseOnboardingImport(paste).unsorted).toEqual([
      'something about a side project I could not place',
    ])
  })
})

describe('tolerating how models actually format', () => {
  // A heading that fails to match silently drops its whole section, so
  // these are worth being lenient about.
  it('accepts markdown headings and bold markers', () => {
    const parsed = parseOnboardingImport(`
## Global
- I prefer tabs over spaces

**Project: yappr**
* Yappr ships as an Electron app
`)
    expect(parsed.global).toEqual(['I prefer tabs over spaces'])
    expect(parsed.projects['yappr']).toEqual(['Yappr ships as an Electron app'])
  })

  it('accepts numbered lists and different bullet glyphs', () => {
    const parsed = parseOnboardingImport(`
GLOBAL:
1. I always write tests first
• I prefer small pull requests
`)
    expect(parsed.global).toEqual(['I always write tests first', 'I prefer small pull requests'])
  })

  it('normalises project keys to match the ones derived at dictation time', () => {
    const parsed = parseOnboardingImport('PROJECT: **Yappr**\n- Yappr uses Groq for cleanup')
    expect(Object.keys(parsed.projects)).toEqual(['yappr'])
  })

  it('ignores the model editorialising inside a section', () => {
    const parsed = parseOnboardingImport(`
GLOBAL
Here are the preferences I could find:
- I always use TypeScript for new projects
`)
    expect(parsed.global).toEqual(['I always use TypeScript for new projects'])
  })

  it('drops fragments and over-long lines', () => {
    const parsed = parseOnboardingImport(`
GLOBAL
- typescript
- ${'a '.repeat(150)}
- I always use TypeScript for new projects
`)
    expect(parsed.global).toEqual(['I always use TypeScript for new projects'])
  })
})

describe('the old single-paragraph paste', () => {
  // Users may still have the previous prompt open in a chat window, or
  // paste a paragraph of their own. That has to keep working.
  const paragraph =
    'Noan builds Yappr, a Mac dictation app, works in TypeScript and Electron, ' +
    'and is casual in iMessage but professional in email.'

  it('is kept whole as the overview', () => {
    const parsed = parseOnboardingImport(paragraph)
    expect(parsed.overview).toBe(paragraph)
  })

  it('produces no facts', () => {
    expect(isOverviewOnly(parseOnboardingImport(paragraph))).toBe(true)
  })

  it('does not lose a multi-line paragraph', () => {
    const parsed = parseOnboardingImport('First line about me.\nSecond line about me.')
    expect(parsed.overview).toContain('First line')
    expect(parsed.overview).toContain('Second line')
  })
})

describe('empty input', () => {
  it('produces an empty result', () => {
    const parsed = parseOnboardingImport('')
    expect(parsed).toEqual({ overview: '', global: [], projects: {}, unsorted: [] })
    expect(isOverviewOnly(parsed)).toBe(true)
  })
})

// The prompt and the parser are one contract split across two files: the
// headings the prompt asks for are the headings the parser matches. They
// used to live apart (prompt in a React component), where renaming a
// heading would silently break the import with nothing failing.
describe('the copied prompt and the parser agree', () => {
  it('asks for exactly the headings the parser understands', () => {
    expect(ONBOARDING_CONTEXT_PROMPT).toContain('GLOBAL')
    expect(ONBOARDING_CONTEXT_PROMPT).toContain('PROJECT: <name>')
    expect(ONBOARDING_CONTEXT_PROMPT).toContain('UNSORTED')
  })

  it('round-trips a response in the shape it specifies', () => {
    // Written to the prompt's letter: paragraph first, then the three
    // headings with one fact per bullet.
    const response = `Noan builds Yappr, a Mac dictation app, and works mostly in TypeScript and Electron.

GLOBAL
- I always use TypeScript for new projects
- I prefer small pull requests over large ones

PROJECT: yappr
- Yappr uses Groq for LLM cleanup
- transcription runs locally with Parakeet

UNSORTED
- something I could not attribute to a project`

    const parsed = parseOnboardingImport(response)
    expect(isOverviewOnly(parsed)).toBe(false)
    expect(parsed.overview).toContain('Noan builds Yappr')
    expect(parsed.overview).not.toContain('TypeScript for new projects')
    expect(parsed.global).toHaveLength(2)
    expect(parsed.projects['yappr']).toHaveLength(2)
    expect(parsed.unsorted).toHaveLength(1)
  })

  // The prompt tells the model to skip headings it has nothing for, so
  // a partial response has to parse too.
  it('handles a response that skips headings, as the prompt permits', () => {
    const parsed = parseOnboardingImport(`I write mostly TypeScript.

GLOBAL
- I always use TypeScript for new projects`)
    expect(parsed.global).toHaveLength(1)
    expect(parsed.unsorted).toEqual([])
    expect(Object.keys(parsed.projects)).toEqual([])
  })
})
