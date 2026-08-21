// 'code' = actual code editor / terminal — dictation is treated as
//          verbatim because the user might be typing identifiers,
//          commands, or technical instructions.
// 'ai_prompt' = AI chat surface (Claude Code chat, Cursor AI chat,
//               ChatGPT, Claude desktop, Gemini, Perplexity) — the
//               user is composing a prompt and wants their rambling
//               restructured into a clear, well-engineered request.
//               Same apps as 'code' often, distinguished by AX role
//               + bundle ID inside pipeline.ts.
export type AppCategory = 'messaging' | 'email' | 'code' | 'ai_prompt' | 'docs' | 'other'

export type DictationState = 'idle' | 'recording' | 'processing' | 'done' | 'error'

export type Provider = 'groq' | 'local'

// On-device model ids. The product runs `parakeet-tdt-0.6b-v3` and
// nothing else — see DEFAULT_LOCAL_MODEL in src/main/local-models.ts.
// The three Whisper tiers remain named because installs from before the
// picker was removed may still have those files on disk, and the
// uninstall path has to be able to address them.
export type LocalModelId = 'parakeet-tdt-0.6b-v3'

export interface ProviderSettings {
  provider: Provider
  groqKey: string
  transcriptionModel: string
  cleanupModel: string
  // Always DEFAULT_LOCAL_MODEL. Kept in the shape because the download
  // and uninstall paths still address models by id; coerced on every
  // read in store.ts, so a persisted value from an older install can't
  // change which engine runs.
  localModel: LocalModelId
}

export interface HotkeySettings {
  pushToTalk: string   // single-key name matching node-global-key-listener (e.g. "CTRL").
                       // Behaviors on this one key:
                       //   tap        => toggle recording on (next tap stops)
                       //   hold       => record while held; release stops
                       //   double-tap => paste last transcription
}

export interface PerAppRule {
  bundleId: string     // e.g. "com.tinyspeck.slackmacgap"
  appName: string
  category: AppCategory
  customPrompt?: string
}

// Cleanup strictness per app category. 1 = light (only fillers stripped),
// 2 = balanced (filler + polish), 3 = strict (full restructure into clean
// prose). Asked per-use-case in onboarding because users want different
// polish for chat vs email vs docs — a single global default would push
// everyone to L3 even when they want their iMessages to stay loose.
// 'code' is intentionally not user-adjustable; it's always faithful so
// dictating commands / identifiers can't have words dropped.
export type Strictness = 1 | 2 | 3

// Three contextual buckets the user configures during onboarding. The
// runtime maps focused apps into these buckets: iMessage / WhatsApp →
// personal; Slack / Discord / Gmail / Outlook → work; Notion / Docs /
// Cursor / Claude / ChatGPT → writing. 'code' (Terminal, IDE editor
// view) bypasses strictness entirely — code is always faithful.
export interface CategoryStrictness {
  personal: Strictness   // casual chat with friends/family
  work: Strictness       // colleagues — chat AND email
  writing: Strictness    // longform docs + AI prompts
}

export interface Settings {
  firstRun: boolean
  provider: ProviderSettings
  hotkeys: HotkeySettings
  perAppRules: PerAppRule[]
  devModeApps: string[]   // bundle IDs that force dev/code mode
  indicatorPosition: { x: number; y: number } | null
  userDictionary: string[]   // user-added terms biased into Whisper transcription
  strictness: CategoryStrictness
  inputDeviceId: string | null   // mic deviceId picked by the user; null = system default
  audioCues: boolean   // play a subtle blip when recording starts and ends
  // Pause Music.app / Spotify while dictating, resume afterwards. Keeps
  // speakers out of the microphone, which matters more now that browser
  // noise suppression is off.
  pauseMediaWhileDictating: boolean
  // When true, the cleanup prompt for the 'messaging' category gets
  // an instruction to append at most ONE relevant emoji when the
  // message has an obvious concrete noun or feeling (food, plans,
  // celebrations, apologies). Off by default — users opt in during
  // onboarding or in Settings. Other categories ignore this flag.
  emojiInMessages: boolean
  // When true, the cleanup pipeline skips the LLM polish pass entirely
  // and pastes the raw Whisper transcript (after the deterministic
  // regex passes — brand-name normalization, dictionary auto-replace,
  // self-correction, spelled-name collapse, question marks). Use this
  // when you want maximum speed or want voice-faithful output without
  // any LLM restyling. Per-app rules still override category routing,
  // but cleanup itself is bypassed.
  pauseCleanup: boolean
  // Lifetime license key. Stored locally only — validation will be
  // wired up when the Stripe SKU launches. For now the field exists
  // so the user-facing surface is real and the persistence path is
  // ready; nothing in the app is gated by this value yet.
  licenseKey: string
  // Phase 1 of Feature 4 (context memory): when true AND the user
  // has written a user_overview in Settings, the cleanup system prompt
  // gets a "Who you are" background block. Default off — users opt in
  // after writing their overview. The overview itself is NOT stored
  // in Settings; it lives in userData/context.db so Phase 3's
  // auto-compaction loop can update it without going through the
  // electron-store layer. See:
  //   docs/superpowers/plans/2026-05-18-feature-4-context-memory-plan.md
  useContextMemory: boolean
  // Phase 3 of Feature 4 (context memory): when true, the compactor
  // auto-refreshes user_overview every 50 dictations using the last
  // 50 transcripts. Default true (gated by useContextMemory being on
  // AND a Groq key being configured). Toggle off to freeze the
  // overview at its current hand-edited value.
  autoContextUpdate: boolean
  // Notch width in points, overriding the estimate in
  // shared/notch-geometry.ts. Electron exposes neither
  // NSScreen.safeAreaInsets nor auxiliaryTopLeftArea, so the width is
  // derived from display metrics and calibrated against one machine.
  // Null uses the estimate; set a value if the indicator's centre band
  // doesn't line up with the physical notch on your Mac.
  notchWidthOverride: number | null
}

// Two-tier context (spec §1.2). Shared because the project-cards UI in
// the renderer reads the same shapes the main process stores.
//
//   global  — about the USER, loaded for every dictation
//   project — about one codebase, loaded only for its own project
export type FactScope = 'global' | 'project'

export interface StoredFact {
  id: number
  scope: FactScope
  /** Empty string for global facts. */
  projectKey: string
  /** The rule, in the user's own words. */
  text: string
  createdAt: number
}

export interface FactBucket {
  /** 'global', a project key, or 'unsorted'. */
  key: string
  scope: FactScope
  facts: StoredFact[]
}

export interface DictationResult {
  id: string
  transcript: string
  cleaned: string
  appName: string
  appCategory: AppCategory
  timestamp: number
  // True when "think really hard" was mapped onto Claude Code's
  // `ultrathink` keyword (spec §2). Surfaced in the UI in one word so the
  // user learns the mapping exists rather than wondering why their
  // wording changed.
  ultrathink?: boolean
}

// IPC channel names — kept in shared so renderer and main stay in sync
export const IPC = {
  STATE_CHANGE: 'state-change',
  AUDIO_CHUNK: 'audio-chunk',
  AUDIO_DONE: 'audio-done',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  PROVIDER_TEST: 'provider:test',
  HISTORY_GET: 'history:get',
  HISTORY_GET_ALL: 'history:get-all',
  HISTORY_CLEAR: 'history:clear',
  // Feature 4 Phase 1: read/write the user_overview paragraph used as
  // background context in cleanup prompts. Backed by SQLite, not the
  // electron-store Settings file, so Phase 3's auto-compaction can
  // update it without touching the Settings layer.
  CONTEXT_OVERVIEW_GET: 'context:overview:get',
  CONTEXT_OVERVIEW_SET: 'context:overview:set',
  // Phase 3: force-compaction trigger + status read for the UI.
  CONTEXT_REFRESH_NOW: 'context:refresh-now',
  CONTEXT_STATUS_GET: 'context:status:get',
  // Spec §1.4 — the project-cards trust surface. The user has to be able
  // to see everything Yappr stored and remove anything wrong, so this is
  // read + delete only: no editing, no merging, no manual creation.
  CONTEXT_FACTS_LIST: 'context:facts:list',
  CONTEXT_FACT_DELETE: 'context:fact:delete',
  CONTEXT_BUCKET_DELETE: 'context:bucket:delete',
  // Version / build / arch, read from the running app rather than
  // hardcoded in the About tab — which shipped "Build 218 · arm64" as
  // string literals that were wrong the moment either changed.
  APP_INFO: 'app:info',
  OPEN_SETTINGS: 'open-settings',
  OPEN_ONBOARDING: 'open-onboarding',
  MIC_PERMISSION: 'mic:permission',
  MIC_PERMISSION_STATUS: 'mic:permission:status',
  ACCESSIBILITY_OPEN: 'accessibility:open',
  ACCESSIBILITY_CHECK: 'accessibility:check',
  HOTKEYS_RELOAD: 'hotkeys:reload',
  REVEAL_LOG: 'reveal:log',
  LAUNCH_AT_LOGIN_GET: 'app:launch-at-login:get',
  LAUNCH_AT_LOGIN_SET: 'app:launch-at-login:set',
  PASTE_FALLBACK_SHOW: 'paste-fallback:show',
  PASTE_FALLBACK_RETRY: 'paste-fallback:retry',
  PASTE_FALLBACK_DISMISS: 'paste-fallback:dismiss',
  LOCAL_MODEL_STATUS: 'local-model:status',
  LOCAL_MODEL_DOWNLOAD: 'local-model:download',
  LOCAL_MODEL_CANCEL: 'local-model:cancel',
  ORPHANED_MODELS_GET: 'orphaned-models:get',
  ORPHANED_MODELS_REMOVE: 'orphaned-models:remove',
  LOCAL_MODEL_UNINSTALL: 'local-model:uninstall',
  LOCAL_MODEL_PROGRESS: 'local-model:progress',
  // Idle-pill quick actions — fired from the persistent pill at the
  // bottom of the screen. These mirror what hotkeys do, so the indicator
  // can act as a clickable shortcut without rebinding hotkeys.
  INDICATOR_TOGGLE_RECORD: 'indicator:toggle-record',
  INDICATOR_PASTE_LAST: 'indicator:paste-last',
  INDICATOR_POLISH_SELECTION: 'indicator:polish-selection',
  // Notch indicator. Geometry is per-display, so the renderer re-reads it
  // whenever the window moves; recent/copy back the peek state's
  // click-to-copy transcript.
  INDICATOR_NOTCH_GEOMETRY: 'indicator:notch-geometry',
  // Pushed when a setting that changes the shape lands — today only
  // notchWidthOverride. The indicator otherwise re-reads geometry on
  // mount and on display change, so a calibration slider would appear
  // to do nothing until the next launch.
  INDICATOR_GEOMETRY_CHANGED: 'indicator:geometry-changed',
  INDICATOR_RECENT: 'indicator:recent',
  INDICATOR_COPY_RECENT: 'indicator:copy-recent',
} as const
