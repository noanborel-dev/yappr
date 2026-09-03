import type { ProviderSettings, LocalModelId } from '../shared/types'

// Pins transcription on-device, overriding whatever an install persisted.
//
// Extracted from getSettings() in store.ts so it can be tested at all —
// store.ts imports electron-store and cannot load under vitest.
//
// This is not a preference, it is the load-bearing half of a claim the
// marketing site makes: "your voice never leaves your Mac"
// (docs/ARCHITECTURE.md, decided 2026-08-30). The cloud-transcription
// branch in buildProviders() is unreachable ONLY because every read of
// getSettings() passes through here. Remove this and
// createGroqTranscriptionProvider starts uploading audio with no other
// code change and nothing on screen to say so — which is precisely the
// trap ARCHITECTURE.md flags. Hence the tests next door.
//
// `defaultLocalModel` is passed in rather than imported because
// DEFAULT_LOCAL_MODEL lives in local-models.ts, which imports electron.
export function lockTranscriptionLocal(
  provider: ProviderSettings,
  defaultLocalModel: LocalModelId,
): ProviderSettings {
  return { ...provider, provider: 'local', localModel: defaultLocalModel }
}
