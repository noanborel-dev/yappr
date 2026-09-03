// Scrubs secrets out of anything on its way to the log file.
//
// The log lives at userData/yappr.log and users send it to us when
// something breaks, so whatever lands there is effectively shared. Before
// this module, log.ts JSON.stringify'd arbitrary data — safe only because
// no call site happened to pass a key-bearing object. That is discipline,
// not structure, and a single `logError('req failed', { settings })` would
// have written the provider key to disk.
//
// Two independent nets, because either alone has a hole:
//
//   1. By KEY NAME — catches a secret whose value has no recognisable
//      shape (a bare license code, an opaque session id).
//   2. By VALUE SHAPE — catches a secret that arrives with no key name at
//      all, which is the common case: an SDK error whose *message* quotes
//      the failing request, or a stack frame with a URL query param.
//
// Over-redacting a log line is cheap. Leaking a key is not.

const REDACTED = '[REDACTED]'

// Matched against the field name lowercased with -/_ stripped, so
// 'groqKey', 'groq_key' and 'GROQ-KEY' all normalise to 'groqkey', and
// 'refresh_token' contains 'token'.
//
// Deliberately NOT here: a bare 'key'. React keys, cache keys and model
// keys are all innocuous and all common, and blanking them would gut the
// logs' usefulness. Real secrets are covered by their full names below,
// and by the value-shape net regardless of what they are called.
const SECRET_NAME_PARTS = [
  'apikey', 'secret', 'token', 'password', 'passwd', 'authorization',
  'bearer', 'credential', 'groqkey', 'licensekey', 'cookie', 'jwt',
  'signature', 'privatekey',
]

// Provider key formats we could plausibly handle, plus JWTs (Supabase
// sessions are JWTs, and a leaked refresh token is as good as a password).
const SECRET_VALUE_RE = new RegExp(
  [
    'gsk_[A-Za-z0-9]{20,}',                                  // Groq
    'sk-ant-[A-Za-z0-9_-]{20,}',                             // Anthropic
    'sk-[A-Za-z0-9]{20,}',                                   // OpenAI-style
    'xox[baprs]-[A-Za-z0-9-]{10,}',                          // Slack
    'AIza[A-Za-z0-9_-]{30,}',                                // Google
    'eyJ[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}', // JWT
  ].join('|'),
  'g',
)

function isSecretName(name: string): boolean {
  const flat = name.toLowerCase().replace(/[-_\s]/g, '')
  return SECRET_NAME_PARTS.some((part) => flat.includes(part))
}

/** Blanks key-shaped substrings anywhere in a free-form string. */
export function redactString(s: string): string {
  return s.replace(SECRET_VALUE_RE, REDACTED)
}

/**
 * Deep-copies `value`, blanking any field whose NAME looks secret and any
 * substring that looks like a key. Depth-capped and cycle-safe: this runs
 * on an error path, where the payload is by definition not trusted to be
 * a well-behaved plain object.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value
  if (depth > 8) return '[TRUNCATED]'
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSecretName(k) ? REDACTED : redact(v, depth + 1, seen)
  }
  return out
}
