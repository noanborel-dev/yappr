import { describe, it, expect } from 'vitest'
import { PROJECT_IMPORT_PROMPT, parseOnboardingImport } from './onboarding-import'
import { MAX_FACT_CHARS, normalizeFactText } from '../main/context/facts-format'

// The idea: ask the agent that has READ THE REPO, not a chat assistant
// that has only heard about it.
//
// The live store makes the case. Mined from speech, the "yappr" project
// facts include "Onboarding accessibility originally includes a Yaprican
// type and an 'on' element" -- a garbled transcription -- and three
// near-identical bullets about an onboarding demo, while saying nothing
// about the app being Electron, or TypeScript, or transcription running
// locally while cleanup goes to Groq. All of which is written down in the
// repo's own CLAUDE.md.

describe('the prompt asks the right source for the right thing', () => {
  it('addresses an agent working in the repo', () => {
    expect(PROJECT_IMPORT_PROMPT).toMatch(/You are working in this repository/)
  })

  it('sends it to the repo’s own docs first', () => {
    // Those encode decisions the code cannot explain, and are exactly
    // what a chat model has never seen.
    expect(PROJECT_IMPORT_PROMPT).toMatch(/CLAUDE\.md/)
    expect(PROJECT_IMPORT_PROMPT).toMatch(/encode decisions that the code alone does not explain/)
  })

  it('prefers a stated rule over an inferred one', () => {
    expect(PROJECT_IMPORT_PROMPT).toMatch(/Prefer a rule the repo states about itself/)
  })

  it('asks for architecture and hard rules, not just stack', () => {
    expect(PROJECT_IMPORT_PROMPT).toMatch(/what runs where/)
    expect(PROJECT_IMPORT_PROMPT).toMatch(/must never be done/)
  })

  it('keeps the project out of the personal store', () => {
    expect(PROJECT_IMPORT_PROMPT).toMatch(/Nothing about me personally/)
  })
})

describe('it obeys the limits the store actually enforces', () => {
  it('asks for under 20 words, matching MAX_FACT_CHARS', () => {
    // The onboarding prompt once asked for 25 words (~153 chars) against
    // a 130-char cap, so long bullets were generated and silently
    // discarded. Same trap, avoided here.
    expect(PROJECT_IMPORT_PROMPT).toMatch(/UNDER 20 WORDS/)
    expect(MAX_FACT_CHARS).toBe(130)
  })

  it('tells the model what happens if it runs long', () => {
    expect(PROJECT_IMPORT_PROMPT).toMatch(/a long bullet is a lost bullet/)
  })
})

describe('the existing parser already handles the answer', () => {
  // Deliberately no new parsing: PROJECT: is the heading parseOnboardingImport
  // already reads, so this is a prompt and a button, not a subsystem.
  const answer = [
    'PROJECT: Yappr',
    '- Push-to-talk dictation for macOS, built with Electron and React.',
    '- Transcription runs on-device; only cleanup goes to a cloud model.',
    '- Pure logic is extracted so it can be tested without Electron.',
    '- The notch indicator centre must stay true black.',
  ].join('\n')

  it('files the bullets under the project the agent named', () => {
    const parsed = parseOnboardingImport(answer)
    expect(parsed.projects['yappr']).toHaveLength(4)
    expect(parsed.projects['yappr'][0]).toMatch(/Electron and React/)
  })

  it('puts nothing in the global tier', () => {
    // A project import must not contaminate preferences that apply
    // everywhere — that is the asymmetry fact-scope.ts is built on.
    expect(parseOnboardingImport(answer).global).toEqual([])
  })

  it('produces bullets the store will actually accept', () => {
    for (const fact of parseOnboardingImport(answer).projects['yappr']) {
      expect(normalizeFactText(fact)).not.toBeNull()
    }
  })
})
