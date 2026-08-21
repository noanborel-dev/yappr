import ElectronStore from 'electron-store'
import type { Settings, Strictness } from '../shared/types'
import { DEFAULT_HOTKEYS, DEFAULT_DEV_MODE_APPS, MODELS } from '../shared/constants'
import { DEFAULT_LOCAL_MODEL } from './local-models'

const defaults: Settings = {
  firstRun: true,
  provider: {
    // Transcription runs on-device on parakeet; cleanup goes to Groq.
    // Neither is user-facing — see the coercion in getSettings().
    provider: 'local',
    groqKey: '',
    transcriptionModel: MODELS.local.transcription,
    cleanupModel: MODELS.groq.cleanup,
    localModel: DEFAULT_LOCAL_MODEL,
  },
  hotkeys: DEFAULT_HOTKEYS,
  perAppRules: [],
  devModeApps: DEFAULT_DEV_MODE_APPS,
  indicatorPosition: null,
  userDictionary: [],
  // Defaults reflect what most users actually want: personal stays
  // loose, work gets polished, writing leans balanced.
  strictness: {
    personal: 1,
    work: 3,
    writing: 2,
  },
  inputDeviceId: null,
  audioCues: true,
  pauseMediaWhileDictating: true,
  emojiInMessages: false,
  pauseCleanup: false,
  licenseKey: '',
  useContextMemory: false,
  autoContextUpdate: true,
  notchWidthOverride: null,
  noNotchIndicator: 'hidden',
  placeholderWidth: null,
}

export const store = new ElectronStore<Settings>({ defaults, name: 'yappr-settings' })

// Old default cleanup models that we now want to migrate off of for
// latency reasons. Any user whose persisted setting is in this list
// gets force-upgraded to the current MODELS.<provider>.cleanup default.
const STALE_CLEANUP_MODELS: Record<string, string> = {
  'llama-3.3-70b-versatile': MODELS.groq.cleanup,
  // Decommissioned by Groq — returns 404, so cleanup silently fell back
  // to the raw transcript on every dictation. Anyone with it persisted
  // must be moved off it or they stay broken.
  'llama-3.1-8b-instant': MODELS.groq.cleanup,
  'llama-3.1-70b-versatile': MODELS.groq.cleanup,
}

// Same idea for transcription: users persisted from when we used
// whisper-large-v3. Turbo is 2.78x cheaper and effectively same
// accuracy on dictation audio. Force-upgrade.
const STALE_TRANSCRIPTION_MODELS: Record<string, string> = {
  'whisper-large-v3': MODELS.groq.transcription,
}

export function getSettings(): Settings {
  // Backfill missing fields for users upgrading from older versions whose
  // persisted store predates these defaults.
  const raw = store.store as Settings
  // Strictness has gone through two prior shapes: a flat number, then
  // a 4-bucket object (messaging/email/docs/other). Migrate both into
  // the current 3-bucket shape (personal/work/writing).
  const persistedStrictness = (raw as unknown as { strictness?: unknown }).strictness
  const strictness: Settings['strictness'] = (() => {
    if (typeof persistedStrictness === 'number') {
      // Flat number: apply to all buckets.
      const lvl = persistedStrictness as Strictness
      return { personal: lvl, work: lvl, writing: lvl }
    }
    if (persistedStrictness && typeof persistedStrictness === 'object') {
      const p = persistedStrictness as Record<string, Strictness | undefined>
      // If the new keys exist, take them. Otherwise map old buckets:
      //   messaging → personal; email → work; docs → writing.
      return {
        personal: p.personal ?? p.messaging ?? defaults.strictness.personal,
        work: p.work ?? p.email ?? defaults.strictness.work,
        writing: p.writing ?? p.docs ?? defaults.strictness.writing,
      }
    }
    return defaults.strictness
  })()

  const merged: Settings = {
    ...defaults,
    ...raw,
    hotkeys: { ...defaults.hotkeys, ...raw.hotkeys },
    provider: { ...defaults.provider, ...raw.provider },
    strictness,
  }

  // Transcription is no longer a setting. The app runs parakeet
  // on-device and sends cleanup to Groq, and neither is exposed or
  // configurable — so whatever an older install persisted (a Whisper
  // tier, cloud Groq transcription, a legacy `small.en` id) is coerced
  // here rather than being honoured. This is the single point where that
  // is enforced; every read of getSettings() goes through it.
  //
  // Deliberately not persisted back: leaving the user's old values in the
  // file costs nothing, and rewriting them would make this irreversible
  // for anyone we later hand a build with the picker restored.
  merged.provider.provider = 'local'
  merged.provider.localModel = DEFAULT_LOCAL_MODEL

  // Merge in any new devModeApps bundle IDs that didn't exist when the
  // user first persisted their settings. Without this, users upgrading
  // from a prior build wouldn't get auto-switch-to-Accurate in newer
  // code apps (Antigravity, Warp, etc.) until they manually edit the
  // setting. Preserve their existing entries (custom additions) and
  // append any new defaults they're missing.
  const existing = new Set(merged.devModeApps)
  for (const bundle of DEFAULT_DEV_MODE_APPS) {
    if (!existing.has(bundle)) merged.devModeApps.push(bundle)
  }

  // Migrate stale cleanup model. Persist the new value so the next
  // read sees it without re-running this branch.
  // A BLANK value is stale too. The map only rewrites ids we know are
  // dead, so an empty string — which is what some installs persisted —
  // passed straight through and then hit whatever fallback the caller
  // happened to hardcode. That is exactly how compaction ended up
  // calling a decommissioned llama model every 60 seconds.
  const persisted = merged.provider.cleanupModel
  const replacement = !persisted || !persisted.trim()
    ? MODELS.groq.cleanup
    : STALE_CLEANUP_MODELS[persisted]
  if (replacement && replacement !== persisted) {
    merged.provider.cleanupModel = replacement
    store.set('provider', merged.provider)
  }

  // Same migration for stale transcription model. Force-upgrade
  // whisper-large-v3 → whisper-large-v3-turbo. Run scripts/bench-
  // groq-whisper.mjs if you want to verify the swap is a net win.
  const persistedTrans = merged.provider.transcriptionModel
  const transReplacement = STALE_TRANSCRIPTION_MODELS[persistedTrans]
  if (transReplacement) {
    merged.provider.transcriptionModel = transReplacement
    store.set('provider', merged.provider)
  }

  return merged
}

export function setSettings(partial: Partial<Settings>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key, value)
  }
}
