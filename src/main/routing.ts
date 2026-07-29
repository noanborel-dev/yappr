// Pure focused-app routing.
//
// Maps the focused app to (a) the strictness bucket whose level the
// cleanup prompt should use and (b) the register hint that overrides
// capitalization at the end of the system prompt. No Electron, no I/O —
// only type imports — so the bundle-ID tables are covered by tests
// (see routing.test.ts). A wrong bundle ID here is silent: the app
// simply falls through to the wrong register, which is exactly how the
// Discord entry was wrong for several releases.

import type { AppCategory, Settings, Strictness } from '../shared/types'
import type { FocusedApp } from './focused-app'
import type { Register } from '../shared/prompts'

// Map the focused app to a strictness bucket so we know which level
// (settings.strictness.personal | .work | .writing) to apply.
//   - code → null (always FAITHFUL, no level)
//   - email → 'work'
//   - docs → 'writing'
//   - other → 'writing' (conservative default)
//   - messaging → split: iMessage/WhatsApp/Telegram → personal,
//                        Slack/Discord/Teams → work
export const PERSONAL_MESSAGING_BUNDLES = new Set([
  'com.apple.MobileSMS',
  'net.whatsapp.WhatsApp',
  'ru.keepcoder.Telegram',
  'org.telegram.desktop',
  'com.facebook.archon',  // Messenger
])
export const WORK_MESSAGING_BUNDLES = new Set([
  'com.tinyspeck.slackmacgap',
  // Discord's real bundle ID is com.hnc.Discord — NOT com.discord, which
  // is what we shipped originally and which never matched anything.
  'com.hnc.Discord',
  'com.microsoft.teams',
  'com.microsoft.teams2',
])

export function strictnessBucket(focused: FocusedApp): 'personal' | 'work' | 'writing' | null {
  switch (focused.category) {
    case 'code': return null
    // ai_prompt isn't a raw focused-app category (it's derived at
    // pipeline time from code apps with chat AX roles), so this is
    // mostly dead — but TS still needs the case for exhaustiveness.
    case 'ai_prompt': return 'writing'
    case 'email': return 'work'
    case 'docs': return 'writing'
    case 'other': return 'writing'
    case 'messaging': {
      if (PERSONAL_MESSAGING_BUNDLES.has(focused.bundleId)) return 'personal'
      if (WORK_MESSAGING_BUNDLES.has(focused.bundleId)) return 'work'
      // Browser-routed messaging (e.g. Slack-in-Arc) keeps the browser's
      // bundleId — fall back to the resolved app name.
      const n = focused.name.toLowerCase()
      if (['slack', 'discord', 'microsoft teams'].includes(n)) return 'work'
      if (['imessage', 'whatsapp', 'telegram', 'messenger'].includes(n)) return 'personal'
      return 'personal'
    }
  }
}

export function strictnessFor(focused: FocusedApp, settings: Settings): Strictness {
  const bucket = strictnessBucket(focused)
  if (!bucket) return 2  // unused for code (FAITHFUL ignores level)
  return settings.strictness[bucket]
}

// Register hint for the cleanup LLM. Computed from the focused app:
//   - iMessage / WhatsApp / Telegram / Messenger → 'imessage' (lowercase casual)
//   - Slack / Discord / Teams → 'chat' (sentence-case casual)
//   - everything else → 'default' (whatever strictness block dictates)
// This drives a HARD final override at the end of the system prompt
// so the LLM doesn't default to "proper" capitalization in iMessage.
export function registerFor(focused: FocusedApp, category: AppCategory): Register {
  if (category !== 'messaging') return 'default'
  if (PERSONAL_MESSAGING_BUNDLES.has(focused.bundleId)) return 'imessage'
  if (WORK_MESSAGING_BUNDLES.has(focused.bundleId)) return 'chat'
  // Browser-routed (Slack-in-Arc etc) — fall back to app name.
  const n = focused.name.toLowerCase()
  if (['imessage', 'messages', 'whatsapp', 'telegram', 'messenger'].includes(n)) return 'imessage'
  if (['slack', 'discord', 'microsoft teams'].includes(n)) return 'chat'
  // Unknown messaging app — default to iMessage casing (safer for personal).
  return 'imessage'
}
