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
 * THE GUARD IS THE DOMAIN. docs/HANDOFF.md §3 names the risk as
 * "meet me at Gmail's office", and everything here is built around it: a
 * provider name is an ordinary word, and only a name followed by a real
 * top-level domain is an address. "I work at Google" has no domain and
 * is never touched.
 */

// Bounded deliberately. An open `[a-z]{2,6}` would read "the report at
// section dot subsection" as an address; this list cannot.
const TLDS = [
  'com', 'net', 'org', 'io', 'co', 'me', 'dev', 'app', 'ai', 'edu', 'gov', 'mil',
  'info', 'biz', 'xyz', 'online', 'site', 'tech', 'email', 'cloud',
  'uk', 'fr', 'de', 'es', 'it', 'nl', 'be', 'ch', 'at', 'se', 'no', 'dk', 'fi',
  'pl', 'pt', 'ie', 'ca', 'us', 'eu', 'au', 'nz', 'jp', 'cn', 'in', 'br', 'mx',
]

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
  `(${LOCAL})${AT}(${DOMAIN})(?![A-Za-z0-9_-])(?!\\.[A-Za-z0-9])`,
  'gi',
)

/**
 * Words that are never somebody's local part.
 *
 * Only consulted when the local part is a single bare word, because that
 * is the only shape prose can accidentally produce: "meet me at
 * gmail.com" is a sentence about a website, not an address for the user
 * "me". A dotted local part ("noan dot borel") has no such ambiguity —
 * nobody writes that by accident — so it is accepted whatever the words.
 */
const NEVER_A_LOCAL_PART = new Set([
  'me', 'you', 'us', 'them', 'him', 'her', 'it', 'we', 'they', 'he', 'she', 'i',
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'then', 'than', 'that',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'to', 'of', 'in', 'on', 'for', 'with', 'from', 'by', 'as', 'up',
  'look', 'looked', 'looking', 'meet', 'meeting', 'met', 'see', 'saw', 'seen',
  'here', 'there', 'now', 'today', 'tomorrow', 'yesterday', 'home', 'work',
  'available', 'live', 'hosted', 'posted', 'published', 'found',
])

/**
 * Words that may sit in front of a local part without being part of it.
 *
 * Only consulted when the preceding word is CAPITALISED, which is the
 * only case that is ambiguous. A lowercase word before the local part is
 * ordinary prose ("logged in to useyapper at gmail.com") and never part
 * of a name; a capitalised one might be a first name ("Noan Borel at
 * iCloud dot com") or might be the verb that opens the sentence ("Email
 * Sam at gmail dot com"). This list is what tells those two apart.
 */
const MAY_PRECEDE_A_LOCAL_PART = new Set([
  'email', 'e-mail', 'mail', 'send', 'sent', 'contact', 'message', 'msg',
  'write', 'wrote', 'tell', 'ask', 'reach', 'ping', 'cc', 'bcc', 'invite',
  'add', 'added', 'forward', 'call', 'try', 'use', 'using', 'copy', 'notify',
  'my', 'his', 'her', 'their', 'our', 'your', 'its',
  'the', 'a', 'an', 'to', 'and', 'or', 'at', 'is', 'it', 'from', 'for', 'i',
])

const PRECEDING_WORD_RE = /([A-Za-z][A-Za-z'’-]*)\s+$/

/**
 * Is a single bare local part too ambiguous to touch?
 *
 * "Noan Borel at iCloud dot com" could mean noanborel@, noan.borel@ or
 * borel@ — and the one answer that is certainly wrong is to take "Borel"
 * and leave "Noan" stranded in front of it, which is what this pass did
 * to two of the user's real dictations before this guard existed. A
 * half-formed address reads as broken; the untouched words read as
 * dictation. So when the shape is ambiguous, nothing is changed.
 */
function precededByAName(text: string, offset: number): boolean {
  const m = text.slice(0, offset).match(PRECEDING_WORD_RE)
  if (!m) return false
  const word = m[1]
  if (word[0] !== word[0].toUpperCase() || word[0] === word[0].toLowerCase()) return false
  return !MAY_PRECEDE_A_LOCAL_PART.has(word.toLowerCase())
}

/** Collapse a spoken run of labels into its written form. */
function collapse(part: string): string {
  return part.replace(/\s+dot\s+/gi, '.').toLowerCase()
}

export function applySpokenEmails(text: string): string {
  if (!text || !text.includes('.')) {
    // Every address needs a written or spoken dot somewhere in its
    // domain. The spoken form contains one too, once "dot" is a word —
    // so bail only when neither a period nor the word appears at all.
    if (!/\bdot\b/i.test(text ?? '')) return text ?? ''
  }

  return text.replace(ADDRESS_RE, (match, rawLocal: string, rawDomain: string, offset: number) => {
    // Only ever rewrite something that was SPOKEN. An address the model
    // or the user already wrote out is left byte-for-byte alone, which
    // is what makes this pass safe to run on a code surface: it cannot
    // touch an existing address in a config file or a test fixture, and
    // it has nothing to say about a decorator or a scoped package.
    if (!/\s(?:at|dot)\s/i.test(match)) return match

    const local = collapse(rawLocal)
    const domain = collapse(rawDomain)

    // A single bare word before "at" is the one shape ordinary prose can
    // produce by accident. Anything with an internal dot is not.
    if (!local.includes('.')) {
      if (NEVER_A_LOCAL_PART.has(local)) return match
      if (precededByAName(text, offset)) return match
    }

    // Don't rewrite the tail of a URL: "https://news.ycombinator.com"
    // has no "at", but "reddit.com/r/x" style text around a match could
    // still put a scheme or a slash immediately before the local part.
    const before = text.slice(Math.max(0, offset - 3), offset)
    if (/[/:@]$/.test(before)) return match

    return `${local}@${domain}`
  })
}
