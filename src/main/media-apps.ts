// Pure helpers for media-control.ts: the AppleScript source and the
// parsing of its output. Split out because media-control.ts imports the
// logger, which imports Electron, and cannot be loaded under vitest —
// while parsing an app list is exactly the part worth testing.

export type MediaApp = 'Spotify' | 'Music'

// Ask which supported players are CURRENTLY playing.
//
// Checking the System Events process list first is load-bearing: talking
// to `application "Music"` directly will LAUNCH Music.app if it isn't
// running. Opening iTunes because someone dictated a sentence would be a
// spectacular bug.
export const QUERY_SCRIPT = `
tell application "System Events" to set procs to name of every process
set out to ""
if procs contains "Spotify" then
  try
    tell application "Spotify" to if player state is playing then set out to out & "Spotify,"
  end try
end if
if procs contains "Music" then
  try
    tell application "Music" to if player state is playing then set out to out & "Music,"
  end try
end if
return out
`

export function parsePlayingApps(stdout: string): MediaApp[] {
  return stdout
    .split(',')
    .map(s => s.trim())
    .filter((s): s is MediaApp => s === 'Spotify' || s === 'Music')
}

export function controlScript(apps: MediaApp[], command: 'pause' | 'play'): string {
  // Guarded by the process list again — the app may have quit between
  // pausing and resuming, and we must not relaunch it to press play.
  return `
tell application "System Events" to set procs to name of every process
${apps.map(a => `if procs contains "${a}" then
  try
    tell application "${a}" to ${command}
  end try
end if`).join('\n')}
`
}

