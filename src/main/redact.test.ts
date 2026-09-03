import { describe, it, expect } from 'vitest'
import { redact, redactString } from './redact'

describe('redact — by field name', () => {
  // The leak this module exists to prevent: one logError('...', { settings })
  // would have written the provider key to userData/yappr.log, which users
  // mail to us when something breaks.
  it('blanks the provider key inside a whole settings object', () => {
    const settings = {
      provider: { provider: 'groq', groqKey: 'gsk_liveKeyMaterial0123456789abcd', transcriptionModel: 'whisper-large-v3-turbo' },
      licenseKey: 'YAPPR-BETA-1234-5678',
      hotkey: 'Fn',
    }
    const out = JSON.stringify(redact(settings))
    expect(out).not.toContain('gsk_liveKeyMaterial0123456789abcd')
    expect(out).not.toContain('YAPPR-BETA-1234-5678')
    // Everything non-secret must survive, or the logs stop being useful.
    expect(out).toContain('whisper-large-v3-turbo')
    expect(out).toContain('Fn')
  })

  it('matches names regardless of case and separators', () => {
    const out = redact({ api_key: 'a', 'API-KEY': 'b', apiKey: 'c', Authorization: 'd' }) as Record<string, string>
    expect(Object.values(out)).toEqual(['[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]'])
  })

  it('catches Supabase session fields', () => {
    const out = redact({ access_token: 'x', refresh_token: 'y', user: { email: 'a@b.com' } })
    const s = JSON.stringify(out)
    expect(s).not.toContain('"x"')
    expect(s).not.toContain('"y"')
    // The email is not a secret and is the useful part of a session log.
    expect(s).toContain('a@b.com')
  })

  it('leaves a bare `key` alone — React keys and cache keys are not secrets', () => {
    const out = redact({ key: 'row-7', modelKey: 'gpt-oss-20b' }) as Record<string, string>
    expect(out.key).toBe('row-7')
    expect(out.modelKey).toBe('gpt-oss-20b')
  })
})

describe('redact — by value shape', () => {
  // The case field-name matching cannot catch: an SDK error whose message
  // quotes the failing request, arriving as a plain string with no key name.
  it('blanks a Groq key embedded in free text', () => {
    const msg = 'request failed: Authorization: Bearer gsk_liveKeyMaterial0123456789abcd'
    expect(redactString(msg)).toBe('request failed: Authorization: Bearer [REDACTED]')
  })

  it('blanks a JWT anywhere in a string', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSMeKK'
    expect(redactString(`session=${jwt} expired`)).toBe('session=[REDACTED] expired')
  })

  it('reaches values nested in arrays and objects', () => {
    const out = JSON.stringify(redact({ attempts: [{ url: 'https://api.groq.com?k=gsk_liveKeyMaterial0123456789abcd' }] }))
    expect(out).not.toContain('gsk_liveKeyMaterial')
    expect(out).toContain('api.groq.com')
  })
})

describe('redact — hostile payloads', () => {
  // This runs on the error path, so the payload is by definition not
  // trusted to be a well-behaved plain object.
  it('survives a cycle', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(() => redact(a)).not.toThrow()
    expect(JSON.stringify(redact(a))).toContain('[CIRCULAR]')
  })

  it('caps depth rather than recursing forever', () => {
    let deep: Record<string, unknown> = { end: 'bottom' }
    for (let i = 0; i < 30; i++) deep = { next: deep }
    expect(JSON.stringify(redact(deep))).toContain('[TRUNCATED]')
  })

  it('passes through primitives untouched', () => {
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBe(null)
    expect(redact(undefined)).toBe(undefined)
    expect(redact(true)).toBe(true)
  })
})
