import { describe, it, expect } from 'vitest'
import {
  classifyFactScope,
  extractStandingPreferences,
  containsStandingPreference,
} from './fact-scope'

describe('classifyFactScope', () => {
  // The spec's own examples.
  it('files a first-person preference as global', () => {
    expect(classifyFactScope('I always use TypeScript')).toBe('global')
    expect(classifyFactScope('I prefer functional components')).toBe('global')
  })

  it('files a fact about a codebase or product as project', () => {
    expect(classifyFactScope('Yappr uses Groq')).toBe('project')
    expect(classifyFactScope('this project uses Tailwind')).toBe('project')
  })

  it('treats a team convention as project scope, not personal', () => {
    // "we" is the codebase talking, not the speaker's own habit.
    expect(classifyFactScope('we always use zod for validation')).toBe('project')
    expect(classifyFactScope('we use 2-space indent here')).toBe('project')
  })

  // An explicit project reference beats the personal phrasing that wraps
  // it, otherwise "on this project" would leak everywhere.
  it('scopes a personal preference that names this project', () => {
    expect(classifyFactScope('I always use Tailwind on this project')).toBe('project')
    expect(classifyFactScope('I prefer tabs in this repo')).toBe('project')
  })

  it('recognises "my convention" phrasing as global', () => {
    expect(classifyFactScope('my convention is camelCase for helpers')).toBe('global')
  })

  // Ambiguity resolves narrow: a stray global is harmless, a stray
  // project fact contaminates every other project.
  it('defaults to project when nothing signals otherwise', () => {
    expect(classifyFactScope('the API returns snake_case')).toBe('project')
    expect(classifyFactScope('')).toBe('project')
  })
})

describe('extractStandingPreferences', () => {
  it('finds the durable rules the spec names', () => {
    expect(extractStandingPreferences('we always use zod for validation')).toEqual([
      { text: 'we always use zod for validation', scope: 'project' },
    ])
    expect(extractStandingPreferences('we use 2-space indent here')).toEqual([
      { text: 'we use 2-space indent here', scope: 'project' },
    ])
  })

  it('assigns the right tier to each rule it finds', () => {
    expect(extractStandingPreferences('I always use TypeScript')).toEqual([
      { text: 'I always use TypeScript', scope: 'global' },
    ])
  })

  it('finds more than one rule in a single dictation', () => {
    const found = extractStandingPreferences(
      'I always use TypeScript. we use tailwind in this project.',
    )
    expect(found).toHaveLength(2)
    expect(found[0].scope).toBe('global')
    expect(found[1].scope).toBe('project')
  })

  // The whole point of the strict detector: an ordinary instruction must
  // not become a permanent rule that steers every future prompt.
  it('ignores ordinary one-off instructions', () => {
    expect(extractStandingPreferences('add a loading spinner to the settings page')).toEqual([])
    expect(extractStandingPreferences('fix the login bug')).toEqual([])
    expect(extractStandingPreferences('can you refactor this into a hook')).toEqual([])
  })

  // "always" appears constantly in complaints. Requiring a convention
  // verb is not enough on its own — "get" has to disqualify it.
  it('ignores a complaint that happens to say "always"', () => {
    expect(extractStandingPreferences('I always get an error when I click save')).toEqual([])
    expect(extractStandingPreferences('this always breaks when I run the tests')).toEqual([])
  })

  it('ignores a question about a convention', () => {
    expect(extractStandingPreferences('do we always use zod for validation?')).toEqual([])
  })

  // A durability marker with no convention verb is not a rule.
  it('ignores a durable-sounding statement with no convention', () => {
    expect(extractStandingPreferences('I never remember the shortcut')).toEqual([])
  })

  it('returns nothing for empty input', () => {
    expect(extractStandingPreferences('')).toEqual([])
  })
})

describe('containsStandingPreference', () => {
  it('answers yes only when a rule was actually found', () => {
    expect(containsStandingPreference('we always use zod for validation')).toBe(true)
    expect(containsStandingPreference('add a spinner to the settings page')).toBe(false)
  })
})
