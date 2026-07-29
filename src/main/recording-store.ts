import { mkdirSync, promises as fsp } from 'fs'
import { join } from 'path'
import type { AppCategory } from '../shared/types'

// Durable storage for in-flight dictations.
//
// Why this exists: the audio buffer used to live ONLY in memory for the
// duration of one AUDIO_DONE handler. When the whisper worker died
// mid-transcription (18 times in the shipping log, `code: null` — killed,
// not a clean exit) the handler threw, the indicator flashed "Transcription
// failed — try again", and the recording was gone. A two-minute prompt
// vanished with it. Every recording now hits disk before the pipeline runs
// and is deleted only once its text has actually landed.
//
// Electron-free on purpose — the base directory is injected via
// initRecordingStore() so this module is fully vitest-covered, same
// pure-core/impure-shell split as proc-tree.ts vs terminal-ai-cli.ts.

// The focus context captured when the user PRESSED the hotkey. Replaying a
// recording must reuse this rather than re-deriving it: runDictationPipeline
// refreshes the focused-app cache on every run, so a retry 30 seconds later
// would otherwise classify against whatever app the user is in by then —
// wrong category, wrong strictness, wrong AI-CLI routing.
export interface RecordingContext {
  bundleId: string
  name: string
  category: AppCategory
  pid: number
  // Command/rewrite mode ran instead of plain dictation, and the selection
  // it was rewriting. Both are needed to replay the correct pipeline.
  commandMode: boolean
  selection: string
}

export interface RecordingMeta {
  id: string
  timestamp: number
  bytes: number
  // How many times the pipeline has been run against this audio and failed.
  // Drives the backoff schedule and the give-up threshold.
  attempts: number
  lastError?: string
  context: RecordingContext
}

// Retention. Mirrors the reasoning behind the 50-entry history cap: keep
// enough to recover from a bad afternoon, not enough to accumulate a
// permanent archive of everything the user has ever said.
export const MAX_KEPT = 20
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

let baseDir: string | null = null

// Called once at startup with `userData/recordings`. Tests pass a tmpdir.
export function initRecordingStore(dir: string): void {
  mkdirSync(dir, { recursive: true })
  baseDir = dir
}

function dir(): string {
  if (!baseDir) throw new Error('recording store not initialised')
  return baseDir
}

const audioPath = (id: string): string => join(dir(), `${id}.webm`)
const metaPath = (id: string): string => join(dir(), `${id}.json`)

// Persist audio + sidecar. Callers should NOT await this on the hot path —
// fire it alongside the pipeline. A 30s opus clip is ~90KB, so the write
// finishes long before transcription does.
export async function saveRecording(
  id: string,
  audio: Buffer,
  context: RecordingContext,
  timestamp: number,
): Promise<void> {
  const meta: RecordingMeta = { id, timestamp, bytes: audio.length, attempts: 0, context }
  // Audio first: a sidecar with no audio is an unrecoverable orphan that
  // listRecordings would keep handing back, whereas audio with no sidecar
  // is simply invisible and gets reaped by the retention sweep.
  await fsp.writeFile(audioPath(id), audio)
  await fsp.writeFile(metaPath(id), JSON.stringify(meta, null, 2))
}

export async function readRecordingAudio(id: string): Promise<Buffer | null> {
  try {
    return await fsp.readFile(audioPath(id))
  } catch {
    return null
  }
}

// Drop both files. Called on a successful paste, and on terminal failures
// (NO_SPEECH) where replaying the same audio can only produce the same
// empty result.
export async function deleteRecording(id: string): Promise<void> {
  await Promise.all([
    fsp.rm(audioPath(id), { force: true }),
    fsp.rm(metaPath(id), { force: true }),
  ])
}

// Every recording still on disk, oldest first — the order we want to
// replay orphans in after a crash.
export async function listRecordings(): Promise<RecordingMeta[]> {
  let names: string[]
  try {
    names = await fsp.readdir(dir())
  } catch {
    return []
  }
  const metas: RecordingMeta[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = await fsp.readFile(join(dir(), name), 'utf8')
      const parsed = JSON.parse(raw) as RecordingMeta
      // A sidecar whose audio has gone is unreplayable — skip it here and
      // let the sweep collect it.
      if (parsed && typeof parsed.id === 'string') metas.push(parsed)
    } catch {
      // Corrupt/half-written sidecar — ignore, the sweep reaps it.
    }
  }
  return metas.sort((a, b) => a.timestamp - b.timestamp)
}

// Record a failed attempt. Returns the updated meta, or null if the
// recording has since been deleted (a concurrent success, or a sweep).
export async function markAttempt(id: string, error: string): Promise<RecordingMeta | null> {
  try {
    const raw = await fsp.readFile(metaPath(id), 'utf8')
    const meta = JSON.parse(raw) as RecordingMeta
    meta.attempts += 1
    meta.lastError = error
    await fsp.writeFile(metaPath(id), JSON.stringify(meta, null, 2))
    return meta
  } catch {
    return null
  }
}

// Retention sweep: drop anything older than MAX_AGE_MS, then trim to the
// MAX_KEPT newest. Also collects orphaned audio files whose sidecar is
// missing or unparseable. Returns how many recordings were removed.
export async function sweepRecordings(now: number): Promise<number> {
  let names: string[]
  try {
    names = await fsp.readdir(dir())
  } catch {
    return 0
  }

  const metas = await listRecordings()
  const live = new Set(metas.map((m) => m.id))

  // Orphaned audio: a .webm with no readable sidecar can never be replayed
  // (we'd have no focus context), so it is pure disk cost.
  const orphans = names
    .filter((n) => n.endsWith('.webm'))
    .map((n) => n.slice(0, -'.webm'.length))
    .filter((id) => !live.has(id))

  const expired = metas.filter((m) => now - m.timestamp > MAX_AGE_MS).map((m) => m.id)
  const remaining = metas.filter((m) => now - m.timestamp <= MAX_AGE_MS)
  // listRecordings is oldest-first, so the overflow to trim is at the front.
  const overflow = remaining.slice(0, Math.max(0, remaining.length - MAX_KEPT)).map((m) => m.id)

  const doomed = [...new Set([...expired, ...overflow])]
  await Promise.all(doomed.map((id) => deleteRecording(id)))
  await Promise.all(orphans.map((id) => fsp.rm(join(dir(), `${id}.webm`), { force: true })))

  return doomed.length + orphans.length
}
