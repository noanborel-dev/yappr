import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lockTranscriptionLocal } from './provider-lock'
import type { ProviderSettings } from '../shared/types'

const PARAKEET = 'parakeet-tdt-0.6b-v3' as const

function persisted(over: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    provider: 'local',
    groqKey: '',
    transcriptionModel: 'parakeet-tdt-0.6b-v3',
    cleanupModel: 'openai/gpt-oss-20b',
    localModel: PARAKEET,
    ...over,
  }
}

describe('lockTranscriptionLocal', () => {
  // The symptom this prevents: an install that persisted cloud
  // transcription back when the picker existed would, on upgrade, start
  // uploading audio to a cloud provider — silently falsifying
  // "your voice never leaves your Mac".
  it('coerces a persisted cloud provider back to local', () => {
    const out = lockTranscriptionLocal(persisted({ provider: 'groq' }), PARAKEET)
    expect(out.provider).toBe('local')
  })

  it('coerces a legacy whisper tier back to parakeet', () => {
    // 'small.en' is a real id from before the tiers were retired; the
    // files may still be on disk, which is why the union keeps the names.
    const out = lockTranscriptionLocal(
      persisted({ localModel: 'small.en' as never }),
      PARAKEET,
    )
    expect(out.localModel).toBe(PARAKEET)
  })

  it('leaves cleanup configuration alone', () => {
    // Cleanup IS a cloud call by design. A lock that clobbered it would
    // break polish for everyone while looking like a privacy fix.
    const out = lockTranscriptionLocal(
      persisted({ provider: 'groq', cleanupModel: 'openai/gpt-oss-120b' }),
      PARAKEET,
    )
    expect(out.cleanupModel).toBe('openai/gpt-oss-120b')
  })

  it('does not mutate its input', () => {
    // store.ts documents that the user's persisted values are
    // deliberately NOT written back, so the lock must stay a copy.
    const input = persisted({ provider: 'groq' })
    lockTranscriptionLocal(input, PARAKEET)
    expect(input.provider).toBe('groq')
  })
})

describe('store.ts still applies the lock', () => {
  // A unit test of a pure function cannot notice that the SHIPPED reader
  // stopped calling it, and "delete one line and audio starts uploading"
  // is the exact failure ARCHITECTURE.md warns about. store.ts imports
  // electron-store so it cannot be imported here — asserting on its
  // source is the only way to catch the deletion.
  it('calls lockTranscriptionLocal in getSettings', () => {
    const src = readFileSync(join(__dirname, 'store.ts'), 'utf8')
    expect(src).toContain('lockTranscriptionLocal')
  })
})
