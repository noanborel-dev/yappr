// Pause music while dictating, resume afterwards.
//
// Two reasons this matters, one obvious and one not:
//   1. You can hear yourself think.
//   2. Music playing out of the speakers lands in the microphone, and
//      background music is exactly the kind of signal that degrades ASR
//      accuracy — especially now that we've disabled Chrome's noise
//      suppression to protect quiet consonants (see Indicator.tsx).
//
// Scope: Music.app and Spotify, the two players scriptable over Apple
// Events. Audio from a browser tab (YouTube, SoundCloud) is NOT covered —
// there is no way to query or control it per-tab. A global media-key
// press would reach those, but it's a blind toggle with no state query,
// so it would just as often START playback as stop it. Deliberately not
// doing that.
//
// We only ever resume what WE paused. If a track was already paused
// before dictation, or the user pressed pause themselves mid-dictation,
// it stays paused.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { logInfo, logError } from './log'
import { parsePlayingApps, controlScript, QUERY_SCRIPT, type MediaApp } from './media-apps'
export type { MediaApp } from './media-apps'

const exec = promisify(execFile)

// Apps this module paused, awaiting resume. Module-level because the
// pause and resume happen on different IPC events.
let pausedApps: MediaApp[] = []

export function getPausedApps(): MediaApp[] {
  return [...pausedApps]
}

// Fire-and-forget: never block the recording path on an Apple Event.
export async function pausePlayingMedia(): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    const { stdout } = await exec('osascript', ['-e', QUERY_SCRIPT])
    const playing = parsePlayingApps(stdout)
    if (playing.length === 0) return
    await exec('osascript', ['-e', controlScript(playing, 'pause')])
    // Record only AFTER a successful pause, so a failure can't leave us
    // "resuming" something we never stopped.
    pausedApps = playing
    logInfo('Paused media for dictation', { apps: playing })
  } catch (err) {
    // Most likely cause is the user denying the Automation permission
    // prompt. Dictation must not care.
    logError('Media pause failed (continuing)', err)
  }
}

export async function resumePausedMedia(): Promise<void> {
  if (process.platform !== 'darwin') return
  const apps = pausedApps
  pausedApps = []
  if (apps.length === 0) return
  try {
    await exec('osascript', ['-e', controlScript(apps, 'play')])
    logInfo('Resumed media after dictation', { apps })
  } catch (err) {
    logError('Media resume failed', err)
  }
}
