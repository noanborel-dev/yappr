import { describe, it, expect } from 'vitest'
import {
  applyQuickFixes,
  applySelfCorrection,
  applySpelledNameCollapse,
  applyQuestionMarks,
  applyDictionaryReplacements,
} from './text-passes'

// Regression suite for the Phase 0a correctness bugs listed in
// docs/superpowers/specs/2026-06-02-streaming-transcription-design.md §5.
//
// These passes run on EVERY dictation — including the local/no-LLM path
// and the code fast path — so a regression here corrupts output with no
// LLM downstream to catch it. The spec requires them correct before the
// §8 streaming eval baseline is captured, otherwise the WER comparison
// measures these bugs instead of the chunking.
//
// Each `spec 0a` test below encodes a reported corruption verbatim. The
// surrounding tests lock the intended behavior, so a "fix" that simply
// neuters the pass fails the suite.

describe('applyQuestionMarks — intra-token periods (spec 0a, HIGH)', () => {
  it('does not split "app.tsx" into a sentence boundary', () => {
    // Reported: "open app.tsx" → "open app?tsx"
    expect(applyQuestionMarks('how do I open app.tsx')).toBe('how do I open app.tsx?')
  })

  it('does not split a decimal version number', () => {
    // Reported: "version 3.2" → "version 3?2"
    expect(applyQuestionMarks('what is version 3.2')).toBe('what is version 3.2?')
  })

  it('leaves a non-question containing a filename completely alone', () => {
    expect(applyQuestionMarks('open app.tsx')).toBe('open app.tsx')
  })

  it('preserves several dotted tokens in one question', () => {
    expect(applyQuestionMarks('can you diff v1.1 against app.tsx')).toBe(
      'can you diff v1.1 against app.tsx?'
    )
  })

  it('does not treat a title abbreviation as a sentence boundary', () => {
    // "Dr." + "Who is coming" — the fragment looks wh-shaped, but it is a
    // continuation, not a question.
    expect(applyQuestionMarks('Dr. Who is coming')).toBe('Dr. Who is coming')
  })

  it('still marks a real question after a sentence ending in "no"', () => {
    // Guards against over-suppressing: "no." must NOT count as an abbreviation.
    expect(applyQuestionMarks('I said no. What do you want')).toBe(
      'I said no. What do you want?'
    )
  })

  // --- intended behavior, so the pass can't be neutered ---

  it('marks a question that ends the text with no terminator', () => {
    expect(applyQuestionMarks('hey, are you free tonight')).toBe('hey, are you free tonight?')
  })

  it('marks a question in the second of two sentences', () => {
    expect(applyQuestionMarks('lets go to the beach. do you wanna come')).toBe(
      'lets go to the beach. do you wanna come?'
    )
  })

  it('rewrites a period into a question mark and keeps the spacing', () => {
    expect(applyQuestionMarks('do you want to go. yes')).toBe('do you want to go? yes')
  })

  it('marks a tag question', () => {
    expect(applyQuestionMarks('you are coming, right')).toBe('you are coming, right?')
  })

  it('leaves an already-punctuated question untouched', () => {
    expect(applyQuestionMarks('are you free?')).toBe('are you free?')
  })

  it('marks a question opening with a vocative + name', () => {
    expect(applyQuestionMarks('hey Bob, can you send it over')).toBe(
      'hey Bob, can you send it over?'
    )
  })

  it('marks a question opening with a discourse marker', () => {
    expect(applyQuestionMarks('so, what do you think')).toBe('so, what do you think?')
  })

  it('does not mark a statement that opens with a vocative', () => {
    expect(applyQuestionMarks('hey, I know what you mean')).toBe('hey, I know what you mean')
  })

  it('does not mark a relative-pronoun statement', () => {
    expect(applyQuestionMarks('I know what you mean')).toBe('I know what you mean')
  })
})

describe('applySelfCorrection — contrastive "actually" (spec 0a, HIGH)', () => {
  it('does not delete a real clause after a contrastive "actually"', () => {
    // Reported: "I love Paris, actually Rome is better" → "I love Rome is better"
    expect(applySelfCorrection('I love Paris, actually Rome is better')).toBe(
      'I love Paris, actually Rome is better'
    )
  })

  it('leaves a name-vs-name "actually" pivot intact', () => {
    expect(applySelfCorrection('ask Alice, actually Bob knows this better')).toBe(
      'ask Alice, actually Bob knows this better'
    )
  })

  // --- intended behavior: numeric/path corrections must still collapse ---

  it('still collapses a numeric time correction', () => {
    expect(applySelfCorrection('lets meet at 6, actually 7')).toBe('lets meet at 7')
  })

  it('still collapses a port-number correction', () => {
    expect(applySelfCorrection('use port 3000, actually 8080')).toBe('use port 8080')
  })

  it('still collapses a name correction behind an unambiguous marker', () => {
    expect(applySelfCorrection('send it to Alice, I mean Bob')).toBe('send it to Bob')
  })

  it('does not rewrite a sentence-opening "I mean" hedge', () => {
    expect(applySelfCorrection('I mean, it is fast')).toBe('I mean, it is fast')
  })
})

describe('applyQuickFixes — "GPT for" preposition (spec 0a, MED)', () => {
  it('does not eat the preposition in "GPT for"', () => {
    // Reported: "use GPT for coding" → "use GPT-4 coding"
    expect(applyQuickFixes('use GPT for coding')).toBe('use GPT for coding')
  })

  // --- intended behavior: the real GPT-N normalizations still fire ---

  it('normalizes a spelled-out GPT version', () => {
    expect(applyQuickFixes('GPT four is out')).toBe('GPT-4 is out')
  })

  it('normalizes a digit GPT version', () => {
    expect(applyQuickFixes('GPT 5 is out')).toBe('GPT-5 is out')
  })

  it('fixes the "cloud" → "Claude" mishear in a Claude-y context', () => {
    expect(applyQuickFixes('run cloud code on this')).toBe('run Claude Code on this')
  })

  it('leaves genuine uses of "cloud" alone', () => {
    expect(applyQuickFixes('migrate to cloud computing')).toBe('migrate to cloud computing')
  })

  it('fixes split brand bigrams', () => {
    expect(applyQuickFixes('type script and java script')).toBe('TypeScript and JavaScript')
  })
})

// The remaining passes are not 0a items, but they run in the same chain
// and had no coverage at all. These lock current behavior so the
// upcoming streaming refactor can't silently change assembled output.
describe('applySpelledNameCollapse — baseline coverage', () => {
  it('drops a redundant spelling after the name', () => {
    expect(applySpelledNameCollapse('text Julia, J-U-L-I-A')).toBe('text Julia')
  })

  it('collapses a standalone spelled name', () => {
    expect(applySpelledNameCollapse('text me J-U-L-I-A')).toBe('text me Julia')
  })

  it('leaves ordinary hyphenated words alone', () => {
    expect(applySpelledNameCollapse('a well-known problem')).toBe('a well-known problem')
  })
})

describe('applyDictionaryReplacements — baseline coverage', () => {
  it('restores a term Whisper split into two words', () => {
    expect(applyDictionaryReplacements('we use type script here', ['TypeScript'])).toBe(
      'we use TypeScript here'
    )
  })

  it('does not touch text when the dictionary is empty', () => {
    expect(applyDictionaryReplacements('leave this alone', [])).toBe('leave this alone')
  })
})
