import { describe, it, expect } from 'vitest'
import { applySpokenEmails } from './spoken-email'

// Every input in this first block is lifted verbatim from
// ~/Library/Application Support/yappr/yappr-history.json. The `cleaned`
// column beside each one shows what was actually pasted, which is the
// same words with the spelling corrected — no address was ever formed,
// including on the dictations where cleanup succeeded. Nine of the
// user's 355 stored dictations carry a spoken address.
describe('real dictations that should have produced an address', () => {
  it('forms an address from a dotted local part', () => {
    expect(applySpokenEmails('Noan dot Borel at gmail dot com')).toBe('noan.borel@gmail.com')
  })

  it('keeps the trailing sentence punctuation outside the address', () => {
    expect(applySpokenEmails('Noan dot borell at gmail dot com.')).toBe('noan.borell@gmail.com.')
  })

  it('handles a domain the transcriber already wrote with a dot', () => {
    expect(
      applySpokenEmails('It’s funny you say that because I already logged in to useyapper at gmail.com.'),
    ).toBe('It’s funny you say that because I already logged in to useyapper@gmail.com.')
  })

  it('handles a capitalised provider name', () => {
    expect(applySpokenEmails('Noan dot Borel at iCloud dot com.')).toBe('noan.borel@icloud.com.')
  })

  it('leaves the rest of the sentence alone', () => {
    expect(applySpokenEmails('I actually already logged in to useapper at gmail.com Supabase.')).toBe(
      'I actually already logged in to useapper@gmail.com Supabase.',
    )
  })
})

// The named risk in docs/HANDOFF.md §3: "Needs care not to mangle
// 'meet me at Gmail's office'." The domain is what carries the whole
// guard — a provider name on its own is a word, not an address.
describe('prose that merely says "at"', () => {
  it('does not touch the sentence the handoff warned about', () => {
    const s = "meet me at Gmail's office"
    expect(applySpokenEmails(s)).toBe(s)
  })

  it('leaves a provider name with no domain alone', () => {
    for (const s of [
      'I work at Google.',
      'Send it at gmail, not at proton.',
      'We looked at outlook and at icloud.',
      'She is at home.',
      'Ship it at noon.',
    ]) {
      expect(applySpokenEmails(s)).toBe(s)
    }
  })

  it('does not treat a bare function word as a local part', () => {
    // "meet me at gmail.com" is prose about a site, not an address for
    // the user "me".
    for (const s of [
      'meet me at gmail.com',
      'look at example.com',
      'it is at reddit.com',
      'I saw it at github.com',
    ]) {
      expect(applySpokenEmails(s)).toBe(s)
    }
  })

  it('does not form an address out of a URL', () => {
    const s = 'Read https://openai.com and https://news.ycombinator.com for context.'
    expect(applySpokenEmails(s)).toBe(s)
  })

  it('leaves a sentence with "dot" but no address alone', () => {
    const s = 'Connect the dot to the line.'
    expect(applySpokenEmails(s)).toBe(s)
  })
})

describe('shapes', () => {
  it('accepts a spoken "at sign"', () => {
    expect(applySpokenEmails('noan at sign gmail dot com')).toBe('noan@gmail.com')
  })

  it('leaves an already-written address byte-for-byte alone', () => {
    // Only spoken forms are rewritten. This is what makes the pass safe
    // to run on a code surface — it cannot relabel an address sitting in
    // a config file or a test fixture.
    for (const s of ['Noan.Borel@Gmail.com', 'a@b.co', 'CI@Example.com']) {
      expect(applySpokenEmails(s)).toBe(s)
    }
  })

  it('handles a multi-label domain when something says it is an address', () => {
    expect(applySpokenEmails('Email noan at yappr dot co dot uk')).toBe('Email noan@yappr.co.uk')
    expect(applySpokenEmails('noan dot borel at yappr dot co dot uk')).toBe('noan.borel@yappr.co.uk')
  })

  it('handles more than one address in a sentence', () => {
    expect(applySpokenEmails('Email noan at gmail dot com or sam at proton dot me today.')).toBe(
      'Email noan@gmail.com or sam@proton.me today.',
    )
  })

  it('keeps digits and hyphens in the local part', () => {
    expect(applySpokenEmails('noan-borel2 at gmail dot com')).toBe('noan-borel2@gmail.com')
  })

  it('is idempotent', () => {
    const once = applySpokenEmails('Noan dot Borel at gmail dot com')
    expect(applySpokenEmails(once)).toBe(once)
  })

  it('survives empty and whitespace input', () => {
    expect(applySpokenEmails('')).toBe('')
    expect(applySpokenEmails('   ')).toBe('   ')
  })

  it('does not span a sentence boundary', () => {
    // The local part must sit next to the "at", not across a full stop.
    expect(applySpokenEmails('That is Noan. At gmail dot com is where.')).toBe(
      'That is Noan. At gmail dot com is where.',
    )
  })

  it('does not fire on an unknown top-level domain', () => {
    // Bounded to a known TLD list so "the meeting at four dot thirty"
    // and similar cannot form an address.
    const s = 'the report at section dot subsection'
    expect(applySpokenEmails(s)).toBe(s)
  })
})

// Found by running this pass over all 355 stored dictations and reading
// every one of the 14 strings it changed. Five were right; two were
// half-transformed, and a half-transformed address is worse than an
// untouched one — it reads as broken rather than as dictation.
//
// Both are the same shape: two bare name words with no "dot" between
// them, where there is no way to know whether the user means
// noanborel@, noan.borel@, or just borel@. Taking the last word and
// leaving the first stranded is the one answer that is certainly wrong.
describe('two bare name words are ambiguous, so nothing is changed', () => {
  it('leaves a spoken full name alone rather than stranding half of it', () => {
    // Was becoming "Noan borel@icloud.com."
    expect(applySpokenEmails('Noan Borel at iCloud dot com.')).toBe('Noan Borel at iCloud dot com.')
  })

  it('leaves a garbled multi-word local part alone', () => {
    // Was becoming "Carmen sl dot Sworn translator@gmail.com."
    const s = 'Carmen sl dot Sworn Translator at gmail dot com.'
    expect(applySpokenEmails(s)).toBe(s)
  })

  // The rule must not swallow the common instruction phrasings, which
  // also put a capitalised word before the local part.
  it('still forms an address after an instruction verb', () => {
    expect(applySpokenEmails('Email Sam at gmail dot com')).toBe('Email sam@gmail.com')
    expect(applySpokenEmails('Contact Sam at proton dot me')).toBe('Contact sam@proton.me')
    expect(applySpokenEmails('Send it to Sam at gmail dot com')).toBe('Send it to sam@gmail.com')
  })

  it('still forms an address after an ordinary lowercase word', () => {
    expect(applySpokenEmails('I already logged in to useyapper at gmail.com.')).toBe(
      'I already logged in to useyapper@gmail.com.',
    )
    expect(applySpokenEmails('something like a name at gmail.com')).toBe(
      'something like a name@gmail.com',
    )
  })

  it('still forms an address when the local part opens the sentence', () => {
    expect(applySpokenEmails('Sam at gmail dot com is the address.')).toBe(
      'sam@gmail.com is the address.',
    )
  })

  // A dotted local part is never ambiguous, whatever precedes it.
  it('is unaffected when the local part carries its own dots', () => {
    expect(applySpokenEmails('Noan dot Borel at gmail dot com')).toBe('noan.borel@gmail.com')
  })
})

// Adversarial review, 2026-09-05. The pass shipped as "fire unless a
// stoplist says otherwise", and the stoplist was a closed set of ~60
// function words. English supplies content nouns in front of "at"
// without limit, and every one of them was corruption:
//
//   "You can find the docs at yappr.com" -> "You can find the docs@yappr.com"
//
// All nine of these were measured against the shipped module. They
// passed the run over the user's 710 stored transcripts only because he
// had not happened to dictate that shape — absence from one corpus is
// not a guard.
describe('prose that names a website, not a mailbox', () => {
  const UNTOUCHED = [
    'You can find the docs at yappr.com',
    'See the README at github dot com',
    'put the invoice at stripe dot com',
    'we track issues at linear dot app',
    'read the thread at twitter dot com',
    'the pricing is listed at stripe dot com',
    'The repo lives at github dot com',
    'Everything is documented at yappr dot dev',
    'point the webhook at api dot yappr dot com',
    'set the base url at cdn dot yappr dot io',
    'mount the volume at data dot local dot io',
  ]

  it('leaves every one of them exactly as dictated', () => {
    for (const s of UNTOUCHED) expect(applySpokenEmails(s)).toBe(s)
  })

  it('does not lowercase a word it decided not to touch', () => {
    // collapse() lowercases, so a wrong match damaged more than the @.
    expect(applySpokenEmails('See the README at github dot com')).toContain('README')
  })
})

// The ambiguity guard used to key on a capital letter, so it protected
// "Noan Borel" and missed "noan borel". Parakeet does not reliably
// capitalise mid-utterance, which made that the common case rather than
// the rare one.
describe('a spoken full name is left alone whatever its case', () => {
  it('does not strand the first half of a lowercase name', () => {
    for (const s of [
      'hey noan borel at gmail dot com',
      'tell sam smith at proton dot me',
      'cc jane doe at company dot com',
    ]) {
      expect(applySpokenEmails(s)).toBe(s)
    }
  })

  it('still forms the address when the name carries its own dots', () => {
    expect(applySpokenEmails('hey noan dot borel at gmail dot com')).toBe(
      'hey noan.borel@gmail.com',
    )
  })
})

// What the pass now requires before it will touch anything.
describe('positive evidence', () => {
  it('1. a dotted local part is enough on its own', () => {
    expect(applySpokenEmails('noan dot borel at anywhere dot com')).toBe('noan.borel@anywhere.com')
  })

  it('2. an explicit at sign is enough on its own', () => {
    expect(applySpokenEmails('noan at sign anywhere dot com')).toBe('noan@anywhere.com')
  })

  it('3. a mail provider domain is enough on its own', () => {
    expect(applySpokenEmails('useyapper at gmail.com')).toBe('useyapper@gmail.com')
    expect(applySpokenEmails('sam at proton dot me')).toBe('sam@proton.me')
  })

  it('4. a cue word in front is enough on its own', () => {
    expect(applySpokenEmails('email sam at anywhere dot com')).toBe('email sam@anywhere.com')
    expect(applySpokenEmails('cc sam at anywhere dot com')).toBe('cc sam@anywhere.com')
  })

  it('with none of the four, nothing happens', () => {
    // The accepted cost: a bare name at a custom domain is
    // indistinguishable from prose about a website.
    const s = 'noan at yappr dot co dot uk'
    expect(applySpokenEmails(s)).toBe(s)
  })
})
