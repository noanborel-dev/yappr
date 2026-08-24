import type { Settings, LocalModelId, DictationResult, FactBucket } from '../shared/types'
import type { OnboardingImport } from '../shared/onboarding-import'
import type { StatRecord } from '../shared/dictation-stats'

export interface LocalModelReadiness {
  ready: boolean
  whisperCli: boolean
  ffmpeg: boolean
  modelDownloaded: boolean
}

export interface LocalModelProgress {
  modelId: LocalModelId
  status: 'starting' | 'downloading' | 'done' | 'error' | 'idle'
  receivedBytes: number
  totalBytes: number
  error?: string
}

export interface LocalModelStatus {
  readiness: LocalModelReadiness
  progress: LocalModelProgress[]
  downloaded: Record<LocalModelId, boolean>
}

export interface AppInfo {
  version: string
  arch: string
  electron: string
  packaged: boolean
}

/** Notch dimensions for the display the indicator currently sits on. */
export interface NotchGeometry {
  hasNotch: boolean
  width: number
  height: number
  displayWidth: number
  noNotchIndicator?: 'hidden' | 'placeholder'
  placeholderWidth?: number | null
}

declare global {
  interface Window {
    yappr: {
      getSettings: () => Promise<Settings>
      setSettings: (p: Partial<Settings>) => Promise<void>
      testProvider: (provider: string, key: string) => Promise<{ ok: boolean; error?: string }>
      getHistory: () => Promise<DictationResult[]>
      getAllHistory: () => Promise<DictationResult[]>
      clearHistory: () => Promise<void>
      getDictationStats: () => Promise<StatRecord[]>
      clearDictationStats: () => Promise<void>
      getContextOverview: () => Promise<string>
      setContextOverview: (text: string) => Promise<void>
      refreshContextNow: () => Promise<{ ok: boolean; error?: string }>
      // Spec §1.4 — read + delete only. There is deliberately no edit or
      // merge call: the cards show what the user actually said, and the
      // only correction offered is removal.
      listContextFacts: () => Promise<FactBucket[]>
      deleteContextFact: (id: number) => Promise<boolean>
      deleteContextBucket: (key: string) => Promise<number>
      renameContextBucket: (from: string, to: string) => Promise<boolean>
      updateContextFact: (id: number, text: string) => Promise<boolean>
      importContext: (payload: OnboardingImport) => Promise<{ stored: number }>
      setIndicatorPreview: (on: boolean) => Promise<void>
      generateContext: (seed: string) => Promise<{ ok: boolean; error?: string; stored: number; overview?: string }>
      getContextStatus: () => Promise<{
        count: number
        threshold: number
        lastCompactionAt: number
        compacting: boolean
      }>
      requestMicPermission: () => Promise<boolean>
      getMicPermissionStatus: () => Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'>
      openAccessibilitySettings: () => Promise<void>
      isAccessibilityTrusted: () => Promise<boolean>
      revealLog: () => Promise<void>
      getAppInfo: () => Promise<AppInfo>
      getNotchGeometry: () => Promise<NotchGeometry>
      reloadHotkeys: () => void
      openOnboarding: () => void
      getLaunchAtLogin: () => Promise<boolean>
      setLaunchAtLogin: (enabled: boolean) => Promise<void>
      onStateChange: (cb: (state: string) => void) => () => void
      getLocalModelStatus: () => Promise<LocalModelStatus>
      getOrphanedModels: () => Promise<{ count: number; bytes: number }>
      removeOrphanedModels: () => Promise<{ removed: number; bytes: number }>
      downloadLocalModel: (modelId: LocalModelId) => Promise<{ ok: boolean; error?: string }>
      cancelLocalModel: () => Promise<void>
      uninstallLocalModel: (modelId: LocalModelId) => Promise<void>
      onLocalModelProgress: (cb: (progress: LocalModelProgress) => void) => () => void
    }
  }
}

export {}
