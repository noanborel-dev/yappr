import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  initRecordingStore,
  saveRecording,
  readRecordingAudio,
  deleteRecording,
  listRecordings,
  markAttempt,
  type RecordingContext,
} from './recording-store'
import { retryDelayMs, shouldAutoPaste } from './recording-recovery'
import { toUserError, NoSpeechError } from './errors'

// Integration test over the three modules that together make a dictation
// survivable. This mirrors handleRecordingFailure() in index.ts — if that
// flow is ever restructured, these are the behaviours that must hold.

const ctx: RecordingContext = {
  bundleId: 'com.microsoft.VSCode',
  name: 'Code',
  category: 'code',
  pid: 4242,
  commandMode: false,
  selection: '',
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'yappr-dur-'))
  initRecordingStore(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// Mirrors index.ts handleRecordingFailure: returns the retry delay that
// would be scheduled, or null for "no timer" (dropped, parked, exhausted).
async function applyFailure(id: string, err: unknown): Promise<number | null> {
  const userErr = toUserError(err)
  if (userErr.disposition === 'drop') {
    await deleteRecording(id)
    return null
  }
  const meta = await markAttempt(id, userErr.code)
  if (!meta) return null
  if (userErr.disposition === 'park') return null
  return retryDelayMs(meta.attempts)
}

const workerDied = () => new Error('Whisper worker exited (code null)')

describe('a dictation that fails is never lost', () => {
  it('keeps the audio and schedules a fast retry when the whisper worker dies', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)

    const delay = await applyFailure('r1', workerDied())

    expect(delay).toBe(2000)
    expect(await readRecordingAudio('r1')).toEqual(Buffer.from('audio'))
    const [meta] = await listRecordings()
    expect(meta.attempts).toBe(1)
    expect(meta.lastError).toBe('TRANSCRIBE_FAILED')
    // The context needed to replay it correctly survived too.
    expect(meta.context.bundleId).toBe('com.microsoft.VSCode')
  })

  it('backs off across repeated failures, then stops scheduling but keeps the audio', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)

    expect(await applyFailure('r1', workerDied())).toBe(2000)
    expect(await applyFailure('r1', workerDied())).toBe(10000)
    expect(await applyFailure('r1', workerDied())).toBe(30000)
    // Schedule exhausted — no more timers, but the recording is still
    // there for the next launch to try.
    expect(await applyFailure('r1', workerDied())).toBeNull()

    expect(await readRecordingAudio('r1')).not.toBeNull()
    expect((await listRecordings())[0].attempts).toBe(4)
  })

  it('parks on a bad key instead of spinning, and keeps the audio', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)

    const delay = await applyFailure('r1', new Error('401 Invalid API Key'))

    expect(delay).toBeNull()
    expect(await readRecordingAudio('r1')).not.toBeNull()
    expect((await listRecordings())[0].lastError).toBe('AUTH')
  })

  it('drops silence — replaying it can only produce the same nothing', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)

    const delay = await applyFailure('r1', new NoSpeechError())

    expect(delay).toBeNull()
    expect(await readRecordingAudio('r1')).toBeNull()
    expect(await listRecordings()).toEqual([])
  })

  it('deletes the audio once the text is delivered', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)
    await applyFailure('r1', workerDied())

    // …retry succeeds …
    await deleteRecording('r1')

    expect(await listRecordings()).toEqual([])
  })
})

describe('recovered text never lands in the wrong window', () => {
  it('pastes straight back when the retry is fast and the user has not moved', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)
    await applyFailure('r1', workerDied())
    const [meta] = await listRecordings()

    // 2s backoff elapsed, still in VS Code.
    expect(shouldAutoPaste(meta.context.bundleId, 'com.microsoft.VSCode', 2000)).toBe(true)
  })

  it('falls back to click-to-insert when the user has switched to Slack', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)
    const [meta] = await listRecordings()

    expect(shouldAutoPaste(meta.context.bundleId, 'com.tinyspeck.slackmacgap', 2000)).toBe(false)
  })

  it('never auto-pastes a recording recovered after a restart', async () => {
    await saveRecording('r1', Buffer.from('audio'), ctx, 1000)
    const [meta] = await listRecordings()

    // Startup recovery: elapsed is hours, so the gate always refuses.
    expect(shouldAutoPaste(meta.context.bundleId, 'com.microsoft.VSCode', 3 * 60 * 60 * 1000)).toBe(false)
  })
})
