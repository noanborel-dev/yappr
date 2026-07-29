import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  initRecordingStore,
  saveRecording,
  readRecordingAudio,
  deleteRecording,
  listRecordings,
  markAttempt,
  sweepRecordings,
  MAX_KEPT,
  MAX_AGE_MS,
  type RecordingContext,
} from './recording-store'

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
  dir = mkdtempSync(join(tmpdir(), 'yappr-rec-'))
  initRecordingStore(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('saveRecording / readRecordingAudio', () => {
  it('round-trips audio bytes', async () => {
    const audio = Buffer.from([1, 2, 3, 4, 5])
    await saveRecording('a1', audio, ctx, 1000)
    const back = await readRecordingAudio('a1')
    expect(back).toEqual(audio)
  })

  it('persists the focus context so a retry can replay it', async () => {
    await saveRecording('a1', Buffer.from('x'), ctx, 1000)
    const [meta] = await listRecordings()
    expect(meta.context).toEqual(ctx)
    expect(meta.attempts).toBe(0)
    expect(meta.bytes).toBe(1)
  })

  it('returns null for audio that does not exist', async () => {
    expect(await readRecordingAudio('nope')).toBeNull()
  })
})

describe('deleteRecording', () => {
  it('removes both audio and sidecar', async () => {
    await saveRecording('a1', Buffer.from('x'), ctx, 1000)
    await deleteRecording('a1')
    expect(await listRecordings()).toEqual([])
    expect(await readRecordingAudio('a1')).toBeNull()
  })

  it('is a no-op for an unknown id', async () => {
    await expect(deleteRecording('ghost')).resolves.toBeUndefined()
  })
})

describe('listRecordings', () => {
  it('returns oldest first so orphans replay in order', async () => {
    await saveRecording('newer', Buffer.from('x'), ctx, 5000)
    await saveRecording('older', Buffer.from('x'), ctx, 1000)
    expect((await listRecordings()).map((m) => m.id)).toEqual(['older', 'newer'])
  })

  it('ignores a corrupt sidecar rather than throwing', async () => {
    await saveRecording('good', Buffer.from('x'), ctx, 1000)
    writeFileSync(join(dir, 'bad.json'), '{ not json')
    expect((await listRecordings()).map((m) => m.id)).toEqual(['good'])
  })
})

describe('markAttempt', () => {
  it('increments the counter and stores the error', async () => {
    await saveRecording('a1', Buffer.from('x'), ctx, 1000)
    const first = await markAttempt('a1', 'worker exited')
    expect(first?.attempts).toBe(1)
    expect(first?.lastError).toBe('worker exited')

    const second = await markAttempt('a1', 'timed out')
    expect(second?.attempts).toBe(2)
    expect(second?.lastError).toBe('timed out')

    // Survives a reload — the retry scheduler reads it back after a restart.
    const [reloaded] = await listRecordings()
    expect(reloaded.attempts).toBe(2)
  })

  it('returns null when the recording was already deleted', async () => {
    expect(await markAttempt('ghost', 'boom')).toBeNull()
  })
})

describe('sweepRecordings', () => {
  const now = 1_000_000_000

  it('drops recordings older than the age cap', async () => {
    await saveRecording('stale', Buffer.from('x'), ctx, now - MAX_AGE_MS - 1)
    await saveRecording('fresh', Buffer.from('x'), ctx, now - 1000)
    const removed = await sweepRecordings(now)
    expect(removed).toBe(1)
    expect((await listRecordings()).map((m) => m.id)).toEqual(['fresh'])
  })

  it('trims to the newest MAX_KEPT, evicting oldest first', async () => {
    for (let i = 0; i < MAX_KEPT + 3; i++) {
      await saveRecording(`r${i}`, Buffer.from('x'), ctx, now - (MAX_KEPT + 3 - i) * 1000)
    }
    const removed = await sweepRecordings(now)
    expect(removed).toBe(3)
    const kept = await listRecordings()
    expect(kept).toHaveLength(MAX_KEPT)
    expect(kept.map((m) => m.id)).not.toContain('r0')
    expect(kept.map((m) => m.id)).toContain(`r${MAX_KEPT + 2}`)
  })

  it('collects orphaned audio whose sidecar is gone', async () => {
    writeFileSync(join(dir, 'orphan.webm'), 'x')
    const removed = await sweepRecordings(now)
    expect(removed).toBe(1)
    expect(existsSync(join(dir, 'orphan.webm'))).toBe(false)
  })

  it('keeps a healthy set untouched', async () => {
    await saveRecording('a1', Buffer.from('x'), ctx, now - 1000)
    expect(await sweepRecordings(now)).toBe(0)
    expect((await listRecordings()).map((m) => m.id)).toEqual(['a1'])
  })
})
