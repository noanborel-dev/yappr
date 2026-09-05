/**
 * Turn a spoken email address into a written one.
 *
 *   "Noan dot Borel at gmail dot com"  ->  noan.borel@gmail.com
 *
 * Deterministic on purpose. Nine of the user's 355 stored dictations
 * carry a spoken address and not one of them came out as an address —
 * including the ones where cleanup succeeded, so this is not something
 * the LLM does when it is available. Living here means it also survives
 * the two states where there is no LLM at all: the short-utterance fast
 * path (an address is usually under eight words) and a rate-limited key,
 * which on 2026-09-05 was one attempt in five.
 *
 * Pure — no electron, no imports. See CLAUDE.md on why that matters.
 *
 * ---
 *
 * THIS PASS REQUIRES POSITIVE EVIDENCE OF AN ADDRESS.
 *
 * The first version worked the other way round: it fired on anything
 * shaped like `<word> at <domain>` and kept a stoplist of words that
 * were never a local part. That list cannot be finished. English has an
 * unbounded supply of nouns that sit in front of "at", and every one of
 * them was corruption waiting to happen:
 *
 *   "You can find the docs at yappr.com" -> "You can find the docs@yappr.com"
 *   "See the README at github dot com"   -> "See the readme@github.com"
 *   "we track issues at linear dot app"  -> "we track issues@linear.app"
 *
 * It survived a run over all 710 stored transcripts and outputs only
 * because the user had not happened to dictate that shape. Absence from
 * one corpus is not a guard.
 *
 * So the question is no longer "can I rule this out" but "what tells me
 * this IS an address". Any one of these will do:
 *
 *   1. a dotted local part      "noan dot borel at ..."
 *   2. an explicit at sign      "noan at sign ..."
 *   3. a mail provider domain   "... at gmail dot com"
 *   4. a cue word in front      "email noan at ..."
 *
 * and in every case the word in front of the local part must be one that
 * can precede a name rather than be part of one — which is what stops
 * "hey noan borel at gmail dot com" becoming "hey noan borel@gmail.com",
 * stranding the first half of the name exactly as the ambiguity guard
 * was written to prevent.
 *
 * The cost is real and accepted: "noan at yappr dot co dot uk", a bare
 * name at a custom domain with nothing else to go on, is left alone. It
 * is indistinguishable from "the docs at yappr dot com", and this pass
 * rewrites the user's words before anyone sees them, so leaving a
 * sentence untouched is always cheaper than corrupting one.
 */

// Bounded deliberately. An open `[a-z]{2,6}` would read "the report at
// section dot subsection" as an address; this list cannot.
const TLDS = [
  'com', 'net', 'org', 'io', 'co', 'me', 'dev', 'app', 'ai', 'edu', 'gov', 'mil',
  'info', 'biz', 'xyz', 'online', 'site', 'tech', 'email', 'cloud',
  'uk', 'fr', 'de', 'es', 'it', 'nl', 'be', 'ch', 'at', 'se', 'no', 'dk', 'fi',
  'pl', 'pt', 'ie', 'ca', 'us', 'eu', 'au', 'nz', 'jp', 'cn', 'in', 'br', 'mx',
]

// Evidence #3. A domain whose first label is one of these is somewhere
// people have mailboxes, not somewhere they have documentation.
const MAIL_PROVIDERS = new Set([
  'gmail', 'googlemail', 'icloud', 'mac', 'outlook', 'hotmail', 'live', 'msn',
  'yahoo', 'ymail', 'rocketmail', 'proton', 'protonmail', 'pm', 'aol', 'gmx',
  'fastmail', 'zoho', 'hey', 'tutanota', 'tuta', 'yandex', 'mail', 'email',
  'qq', 'naver', 'comcast', 'verizon', 'att', 'sbcglobal', 'btinternet',
  'orange', 'laposte', 'wanadoo', 'sfr', 'free', 'web',
])

// Evidence #4. A word that announces an address is coming. Also counts
// as a word that may sit in front of a local part.
const ADDRESS_CUES = new Set([
  'email', 'e-mail', 'emailing', 'mail', 'mailing', 'send', 'sent', 'sends',
  'contact', 'contacts', 'message', 'msg', 'write', 'wrote', 'tell', 'ask',
  'reach', 'ping', 'cc', 'bcc', 'invite', 'invited', 'forward', 'forwarded',
  'copy', 'notify', 'address', 'addresses', 'reachable', 'inbox',
])

/**
 * Words that may sit in front of a local part WITHOUT being part of it.
 *
 * Anything outside this list is read as a word the local part belongs
 * to, and the match is abandoned. That is what separates
 *
 *   "logged in to useyapper at gmail.com"   ("to" — a preposition)
 *   "hey noan borel at gmail dot com"       ("noan" — the other half of
 *                                            the name)
 *
 * and it does not depend on capitalisation, which the previous version
 * did. Parakeet does not reliably capitalise mid-utterance, so a rule
 * keyed on a capital letter protected "Noan Borel" and missed
 * "noan borel".
 */
const MAY_PRECEDE_A_LOCAL_PART = new Set([
  ...ADDRESS_CUES,
  'to', 'the', 'a', 'an', 'and', 'or', 'at', 'is', 'are', 'was', 'were', 'be',
  'it', 'its', 'that', 'this', 'for', 'from', 'of', 'in', 'on', 'with', 'via',
  'my', 'your', 'his', 'her', 'their', 'our', 'i', 'we', 'they', 'he', 'she',
  'hi', 'hey', 'hello', 'please', 'also', 'then', 'so', 'but', 'use', 'using',
  'try', 'name', 'names', 'account', 'login', 'user', 'username', 'as',
])

/**
 * Words that are never somebody's local part.
 *
 * No longer load-bearing on its own — the evidence rules above do that
 * work — but it cheaply rules out the pronoun cases ("meet me at
 * gmail.com") that would otherwise satisfy the provider rule.
 */
const NEVER_A_LOCAL_PART = new Set([
  'me', 'you', 'us', 'them', 'him', 'her', 'it', 'we', 'they', 'he', 'she', 'i',
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'then', 'than', 'that',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'to', 'of', 'in', 'on', 'for', 'with', 'from', 'by', 'as', 'up',
  'look', 'looked', 'looking', 'meet', 'meeting', 'met', 'see', 'saw', 'seen',
  'here', 'there', 'now', 'today', 'tomorrow', 'yesterday', 'home', 'work',
  'available', 'live', 'hosted', 'posted', 'published', 'found', 'docs',
])

// A single label of a name or a domain.
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?'

// The separator between labels, spoken or already written. The spoken
// form must be the whole word — "the dotted line" is not a separator.
const DOT = '(?:\\s+dot\\s+|\\.)'

// The separator between the local part and the domain. "at sign" first,
// so the longer form wins over the bare "at" inside it.
const AT = '(?:\\s+at\\s+sign\\s+|\\s+at\\s+|\\s*@\\s*)'

const LOCAL = `${LABEL}(?:${DOT}${LABEL})*`
const DOMAIN = `${LABEL}(?:${DOT}${LABEL})*${DOT}(?:${TLDS.join('|')})`

// The tail guard has to reject a PARTIAL domain ("gmail.com" inside
// "gmail.community") while still allowing the sentence period that ends
// most dictated addresses ("…at gmail dot com."). So: not followed by a
// word character, and not followed by a dot that itself continues the
// domain.
const ADDRESS_RE = new RegExp(
  `(${LOCAL})(${AT})(${DOMAIN})(?![A-Za-z0-9_-])(?!\\.[A-Za-z0-9])`,
  'gi',
)

const PRECEDING_WORD_RE = /([A-Za-z][A-Za-z'’-]*)\s+$/

/** Collapse a spoken run of labels into its written form. */
function collapse(part: string): string {
  return part.replace(/\s+dot\s+/gi, '.').toLowerCase()
}

/** The word immediately before `offset`, lowercased, or null if none. */
function precedingWord(text: string, offset: number): string | null {
  const m = text.slice(0, offset).match(PRECEDING_WORD_RE)
  return m ? m[1].toLowerCase() : null
}

export function applySpokenEmails(text: string): string {
  if (!text) return text ?? ''
  // Every address needs a dot in its domain, written or spoken. With
  // neither there is nothing here to find.
  if (!text.includes('.') && !/\bdot\b/i.test(text)) return text

  return text.replace(
    ADDRESS_RE,
    (match, rawLocal: string, rawAt: string, rawDomain: string, offset: number) => {
      // Only ever rewrite something that was SPOKEN. An address the model
      // or the user already wrote out is left byte-for-byte alone, which
      // keeps this pass off an existing address in a config file or a
      // test fixture, and off a decorator or a scoped package name.
      if (!/\s(?:at|dot)\s/i.test(match)) return match

      const local = collapse(rawLocal)
      const domain = collapse(rawDomain)
      const before = precedingWord(text, offset)

      // The word in front must be one that can precede a name rather
      // than be part of one.
      if (before !== null && !MAY_PRECEDE_A_LOCAL_PART.has(before)) return match
      if (NEVER_A_LOCAL_PART.has(local)) return match

      // Positive evidence that this is an address at all.
      const dottedLocal = local.includes('.')
      const explicitAtSign = /\bat\s+sign\b/i.test(rawAt)
      const providerDomain = MAIL_PROVIDERS.has(domain.split('.')[0])
      const cuedByContext = before !== null && ADDRESS_CUES.has(before)
      if (!dottedLocal && !explicitAtSign && !providerDomain && !cuedByContext) {
        return match
      }

      return `${local}@${domain}`
    },
  )
}
