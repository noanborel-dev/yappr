import { describe, it, expect } from 'vitest'
import { buildCleanupPrompt } from './prompts'
import type { AppCategory } from './types'

const ALL_CATEGORIES: AppCategory[] = [
  'messaging',
  'email',
  'code',
  'ai_prompt',
  'docs',
  'other',
]

// Phase 0a (spec §5): code-switching had zero prompt-level protection.
// The 8B cleanup model otherwise "helpfully" translates a dictated
// foreign phrase into English. Bilingual dictation — an English sentence
// containing a French clause — is a feature the user relies on, so the
// instruction must reach the model on EVERY path, including the
// custom-prompt override which bypasses the category templates.
describe('buildCleanupPrompt — language preservation (spec 0a, MED)', () => {
  for (const category of ALL_CATEGORIES) {
    it(`forbids translation for the "${category}" category`, () => {
      const prompt = buildCleanupPrompt(category, 'TestApp')
      expect(prompt).toContain('NEVER translate')
      expect(prompt).toContain('code-switches')
    })
  }

  it('keeps the instruction on the custom-prompt path', () => {
    const prompt = buildCleanupPrompt('other', 'TestApp', 'Just fix typos in {app_name}.')
    expect(prompt).toContain('NEVER translate')
    expect(prompt).toContain('code-switches')
  })

  it('places the language rule ahead of the category template', () => {
    // It has to be read before the per-category instructions, which are
    // written in English and otherwise bias the model toward English out.
    const prompt = buildCleanupPrompt('messaging', 'Messages')
    const languageAt = prompt.indexOf('NEVER translate')
    const categoryAt = prompt.indexOf('dictation cleanup assistant')
    expect(languageAt).toBeGreaterThanOrEqual(0)
    expect(categoryAt).toBeGreaterThanOrEqual(0)
    expect(languageAt).toBeLessThan(categoryAt)
  })
})
