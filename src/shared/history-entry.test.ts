import { describe, it, expect } from 'vitest'
import {
  isRewriteEntry,
  spokenText,
  canRepolish,
  LEGACY_REWRITE_PLACEHOLDER,
} from './history-entry'
import type { DictationResult } from './types'

const base = {
  id: 'x',
  cleaned: 'out',
  appName: 'Code',
  appCategory: 'code' as const,
  timestamp: 0,
}

const dictation = (transcript: string): DictationResult => ({ ...base, transcript })

const rewrite = (transcript: string, selection = 'the old text'): DictationResult => ({
  ...base,
  transcript,
  rewrite: { selection },
})

// The entry shape written before the fix: the instruction was thrown away
// and replaced with a marker. Every existing install still has these.
const legacy = (): DictationResult => ({ ...base, transcript: LEGACY_REWRITE_PLACEHOLDER })

describe('isRewriteEntry', () => {
  it('recognises a rewrite by its selection', () => {
    expect(isRewriteEntry(rewrite('make it shorter'))).toBe(true)
  })

  it('still recognises the legacy placeholder', () => {
    expect(isRewriteEntry(legacy())).toBe(true)
  })

  it('does not treat a plain dictation as a rewrite', () => {
    expect(isRewriteEntry(dictation('fix the login bug'))).toBe(false)
  })

  // The whole point of the fix: a rewrite now stores real words, so
  // anything testing `transcript !== '(rewrite)'` would wave it through.
  // The compactor did exactly that, and would have started mining
  // "make it shorter" as if it were a fact about the user's project.
  it('recognises a rewrite even though its transcript is real speech', () => {
    const entry = rewrite('turn this into an email and ask about timing')
    expect(entry.transcript).not.toBe(LEGACY_REWRITE_PLACEHOLDER)
    expect(isRewriteEntry(entry)).toBe(true)
  })
})

describe('spokenText', () => {
  it('returns what the user said', () => {
    expect(spokenText(dictation('fix the login bug'))).toBe('fix the login bug')
    expect(spokenText(rewrite('make it shorter'))).toBe('make it shorter')
  })

  // Showing '(rewrite)' would be worse than showing nothing: it looks
  // like the words were recovered when they were never stored.
  it('returns empty for a legacy entry rather than the placeholder', () => {
    expect(spokenText(legacy())).toBe('')
  })
})

describe('canRepolish', () => {
  it('allows an entry that has words', () => {
    expect(canRepolish(dictation('fix the login bug'))).toBe(true)
    expect(canRepolish(rewrite('make it shorter'))).toBe(true)
  })

  // A short utterance skips the LLM on the way out (cleanup-policy's
  // 8-word fast path), but its transcript is intact — re-running it is a
  // legitimate thing to want.
  it('allows an entry whose cleanup was skipped', () => {
    expect(canRepolish(dictation('my name is Noan'))).toBe(true)
  })

  it('refuses a legacy rewrite, which has nothing to run on', () => {
    expect(canRepolish(legacy())).toBe(false)
  })

  it('refuses whitespace', () => {
    expect(canRepolish(dictation('   '))).toBe(false)
    expect(canRepolish(dictation(''))).toBe(false)
  })
})
