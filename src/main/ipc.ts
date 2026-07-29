import { app, ipcMain, systemPreferences, shell } from 'electron'
import { IPC } from '../shared/types'
import type { DictationResult, LocalModelId } from '../shared/types'
import { localModelDownloaded, localModelPath, LOCAL_MODELS } from './local-models'
import { prewarmWhisper } from './whisper-host'
import { prewarmModelId } from './providers/local'
import { getSettings, setSettings } from './store'
import { testGroqKey } from './providers/groq'
import { localWhisperReadiness, freeLocalWhisper } from './providers/local'
import {
  downloadWhisperModel,
  cancelDownload,
  uninstallWhisperModel,
  getLocalModelProgress,
} from './local-download'
import { HISTORY_LIMIT } from '../shared/constants'
import {
  loadPersistedHistory,
  persistHistoryEntry,
  clearPersistedHistory,
} from './history-store'
import { getUserOverview, setUserOverview } from './context/store'
import { forceCompaction, getCompactionStatus } from './context/compactor'

// Hot in-memory cache for paste-last + indicator lookups. Always
// reflects the most recent N entries (N = HISTORY_LIMIT). On startup
// we hydrate this from the persistent store so paste-last works
// immediately even before the dashboard is opened.
const history: DictationResult[] = loadPersistedHistory().slice(0, HISTORY_LIMIT)

export function addToHistory(result: DictationResult): void {
  history.unshift(result)
  if (history.length > HISTORY_LIMIT) history.splice(HISTORY_LIMIT)
  // Persist asynchronously so cleanup pipeline never blocks on disk I/O.
  // electron-store is sync but very fast (~1ms); fire-and-forget keeps
  // the contract simple.
  try {
    persistHistoryEntry(result)
  } catch {
    // Disk failure shouldn't break dictation. Swallow.
  }
}

export function getHistory(): DictationResult[] {
  return [...history]
}

// Full persisted history — used by the Settings dashboard tab.
export function getPersistedHistory(): DictationResult[] {
  return loadPersistedHistory()
}

export function clearHistory(): void {
  history.length = 0
  clearPersistedHistory()
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET, (_e, partial) => {
    setSettings(partial)
    // If the user just switched to Local or changed model tier, kick
    // off a worker spawn + model load now so the next dictation hits
    // the warm path instead of paying the cold-start tax. Fire-and-
    // forget; failures fall back to the transcribe-time error.
    const next = getSettings()
    if (next.provider.provider === 'local') {
      const id = prewarmModelId()
      if (localModelDownloaded(id)) {
        prewarmWhisper(localModelPath(id))
      }
    }
  })

  ipcMain.handle(IPC.PROVIDER_TEST, async (_e, { provider, key }) => {
    try {
      if (provider === 'groq') await testGroqKey(key)
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(IPC.HISTORY_GET, () => getHistory())
  ipcMain.handle(IPC.HISTORY_GET_ALL, () => getPersistedHistory())
  ipcMain.handle(IPC.HISTORY_CLEAR, () => clearHistory())

  ipcMain.handle(IPC.CONTEXT_OVERVIEW_GET, () => getUserOverview())
  ipcMain.handle(IPC.CONTEXT_OVERVIEW_SET, (_e, text: string) => {
    setUserOverview(typeof text === 'string' ? text : '')
  })
  ipcMain.handle(IPC.CONTEXT_REFRESH_NOW, () => forceCompaction())
  ipcMain.handle(IPC.CONTEXT_STATUS_GET, () => getCompactionStatus())

  ipcMain.handle(IPC.MIC_PERMISSION, async () => {
    if (process.platform === 'darwin') {
      const status = await systemPreferences.askForMediaAccess('microphone')
      return status
    }
    return true
  })

  ipcMain.handle(IPC.ACCESSIBILITY_OPEN, () => {
    if (process.platform === 'darwin') {
      // isTrustedAccessibilityClient(true) prompts macOS to add this process
      // to the Accessibility list automatically — no manual search needed.
      systemPreferences.isTrustedAccessibilityClient(true)
    }
  })

  // Status checks for the onboarding UI. Mic returns 'granted' | 'denied'
  // | 'not-determined' so we can decide whether to show "Allow" vs
  // "Open Settings". Accessibility just returns trusted-or-not — the
  // onboarding polls this every ~750ms to detect when the user actually
  // flips the toggle in System Settings.
  ipcMain.handle(IPC.MIC_PERMISSION_STATUS, () => {
    if (process.platform !== 'darwin') return 'granted'
    return systemPreferences.getMediaAccessStatus('microphone')
  })

  ipcMain.handle(IPC.ACCESSIBILITY_CHECK, () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(false)
  })

  // Launch at login. setLoginItemSettings is a no-op on Linux but works
  // on macOS + Windows. We expose both get + set so the UI can render
  // the current state without persisting it ourselves — the OS is the
  // source of truth.
  ipcMain.handle(IPC.LAUNCH_AT_LOGIN_GET, () => {
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle(IPC.LAUNCH_AT_LOGIN_SET, (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
  })

  // Local model management. Status returns readiness for the
  // currently-selected model + last-known progress for every model
  // that's ever started downloading, so the Settings UI can render
  // every tier card with its actual state on mount.
  ipcMain.handle(IPC.LOCAL_MODEL_STATUS, () => ({
    readiness: localWhisperReadiness(),
    // getLocalModelProgress() with no arg returns the array of all
    // known per-model progress entries.
    progress: getLocalModelProgress(),
    // Derived from the registry, NOT hand-listed. The hand-written
    // version silently omitted any newly added tier, so its card sat at
    // "Download" forever no matter how many times the file downloaded
    // successfully — the file was on disk, the UI just had no key for it.
    downloaded: Object.fromEntries(
      (Object.keys(LOCAL_MODELS) as LocalModelId[])
        .map(id => [id, localModelDownloaded(id)]),
    ) as Record<LocalModelId, boolean>,
  }))

  ipcMain.handle(IPC.LOCAL_MODEL_DOWNLOAD, async (_e, modelId: LocalModelId) => {
    try {
      await downloadWhisperModel(modelId)
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(IPC.LOCAL_MODEL_CANCEL, () => {
    cancelDownload()
  })

  ipcMain.handle(IPC.LOCAL_MODEL_UNINSTALL, async (_e, modelId: LocalModelId) => {
    // Release the in-memory whisper instance before deleting the
    // model file — keeping the file open across unlink would orphan
    // RAM and (on Windows) fail the delete with EBUSY. The provider
    // will reload on next dictation.
    await freeLocalWhisper()
    await uninstallWhisperModel(modelId)
  })
}
