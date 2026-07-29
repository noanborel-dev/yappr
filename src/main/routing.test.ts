import { describe, it, expect } from 'vitest'
import { strictnessBucket, strictnessFor, registerFor } from './routing'
import type { FocusedApp } from './focused-app'
import type { Settings } from '../shared/types'

function app(bundleId: string, name: string, category: FocusedApp['category'] = 'messaging'): FocusedApp {
  return { bundleId, name, category }
}

const settings = {
  strictness: { personal: 1, work: 3, writing: 2 },
} as Settings

// Phase 0a (spec §5): the Discord bundle ID was wrong (`com.discord`
// instead of the real `com.hnc.Discord`), so Discord silently fell
// through the work-messaging branch and got personal strictness +
// iMessage register — lowercase casual output in a work chat.
describe('messaging bundle routing (spec 0a, MED)', () => {
  it('routes Discord to the work bucket by its real bundle ID', () => {
    expect(strictnessBucket(app('com.hnc.Discord', 'Discord'))).toBe('work')
  })

  it('gives Discord the sentence-case chat register', () => {
    expect(registerFor(app('com.hnc.Discord', 'Discord'), 'messaging')).toBe('chat')
  })

  it('applies the work strictness level to Discord', () => {
    expect(strictnessFor(app('com.hnc.Discord', 'Discord'), settings)).toBe(3)
  })

  it('routes Slack and Teams to work', () => {
    expect(strictnessBucket(app('com.tinyspeck.slackmacgap', 'Slack'))).toBe('work')
    expect(strictnessBucket(app('com.microsoft.teams2', 'Microsoft Teams'))).toBe('work')
  })

  it('routes iMessage and WhatsApp to personal', () => {
    expect(strictnessBucket(app('com.apple.MobileSMS', 'Messages'))).toBe('personal')
    expect(strictnessBucket(app('net.whatsapp.WhatsApp', 'WhatsApp'))).toBe('personal')
    expect(registerFor(app('com.apple.MobileSMS', 'Messages'), 'messaging')).toBe('imessage')
  })

  it('falls back to the app name for browser-routed messaging', () => {
    // Slack-in-Arc carries the browser's bundle ID, not Slack's.
    expect(strictnessBucket(app('company.thebrowser.Browser', 'Slack'))).toBe('work')
    expect(registerFor(app('company.thebrowser.Browser', 'Slack'), 'messaging')).toBe('chat')
  })
})

describe('non-messaging routing', () => {
  it('returns no bucket for code (always FAITHFUL)', () => {
    expect(strictnessBucket(app('com.microsoft.VSCode', 'VS Code', 'code'))).toBeNull()
  })

  it('routes email to work and docs to writing', () => {
    expect(strictnessBucket(app('com.apple.mail', 'Mail', 'email'))).toBe('work')
    expect(strictnessBucket(app('com.apple.Pages', 'Pages', 'docs'))).toBe('writing')
  })

  it('never applies a messaging register outside messaging', () => {
    expect(registerFor(app('com.apple.MobileSMS', 'Messages'), 'email')).toBe('default')
    expect(registerFor(app('com.microsoft.VSCode', 'VS Code', 'code'), 'code')).toBe('default')
  })
})
