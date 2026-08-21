import { describe, it, expect } from 'vitest'
import { toUserError, NoSpeechError } from './errors'

describe('toUserError disposition', () => {
  it('drops no-speech — replaying identical audio yields identical nothing', () => {
    const e = toUserError(new NoSpeechError())
    expect(e.code).toBe('NO_SPEECH')
    expect(e.disposition).toBe('drop')
  })

  it('retries a dead whisper worker (the dominant real-world failure)', () => {
    const e = toUserError(new Error('Whisper worker exited (code null)'))
    expect(e.code).toBe('TRANSCRIBE_FAILED')
    expect(e.disposition).toBe('retry')
  })

  it('retries a request timeout', () => {
    expect(toUserError(new Error('Request timed out.')).disposition).toBe('retry')
  })

  it('retries a Groq rate limit rather than treating it as auth failure', () => {
    const raw = '429 {"error":{"message":"Rate limit reached for model `llama-3.1-8b-instant`","code":"rate_limit_exceeded"}}'
    const e = toUserError(new Error(raw))
    expect(e.code).toBe('RATE_LIMIT')
    expect(e.disposition).toBe('retry')
  })

  it('retries network failures', () => {
    expect(toUserError(new Error('fetch failed ECONNREFUSED')).disposition).toBe('retry')
  })

  it('parks a missing key — spinning cannot help until the user acts', () => {
    const e = toUserError(new Error('No API key configured'))
    expect(e.code).toBe('NO_KEY')
    expect(e.disposition).toBe('park')
  })

  it('parks a rejected key', () => {
    const e = toUserError(new Error('401 Invalid API Key'))
    expect(e.code).toBe('AUTH')
    expect(e.disposition).toBe('park')
  })
})
