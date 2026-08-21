import { describe, it, expect } from 'vitest'
import { parsePlayingApps } from './media-apps'

describe('parsePlayingApps', () => {
  it('returns nothing when no player is playing', () => {
    expect(parsePlayingApps('')).toEqual([])
    expect(parsePlayingApps('\n')).toEqual([])
  })

  it('parses a single playing app', () => {
    expect(parsePlayingApps('Spotify,')).toEqual(['Spotify'])
  })

  it('parses both players', () => {
    expect(parsePlayingApps('Spotify,Music,')).toEqual(['Spotify', 'Music'])
  })

  it('tolerates the trailing newline osascript adds', () => {
    expect(parsePlayingApps('Spotify,\n')).toEqual(['Spotify'])
  })

  it('ignores anything that is not a supported player', () => {
    // Guards against an AppleScript error string being treated as an app
    // name and then "resumed" later.
    expect(parsePlayingApps('Finder,VLC,')).toEqual([])
    expect(parsePlayingApps('execution error: Not authorised')).toEqual([])
  })
})
