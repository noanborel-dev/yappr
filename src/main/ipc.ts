import { app, ipcMain, systemPreferences, shell } from 'electron'
import { IPC } from '../shared/types'
import type { DictationResult, LocalModelId } from '../shared/types'
import { localModelDownloaded, localModelPath, LOCAL_MODELS, listOrphanedModels, removeOrphanedModels } from './local-models'
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
import { loadDictationStats, clearDictationStats } from './stats-store'
import { renameBucket, updateFact, moveFacts } from './context/facts'
import {
  loadPersistedHistory,
  persistHistoryEntry,
  clearPersistedHistory,
} from './history-store'
import { getUserOverview, setUserOverview } from './context/store'
import { forceCompaction, getCompactionStatus } from './context/compactor'
import { listBuckets, deleteFact, deleteBucket, addFact } from './context/facts'
import type { OnboardingImport } from '../shared/onboarding-import'
import { generateContext } from './context/generate'
import { logInfo, logError } from './log'
import { repolishEntry } from './pipeline'

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

/**
 * Side effects the handlers need but that belong to the window layer.
 * Passed in rather than imported so ipc.ts stays free of window state.
 */
export interface IpcHooks {
  onNotchGeometryChanged?: () => void
  onIndicatorPreview?: (on: boolean) => void
}

export function registerIpcHandlers(hooks: IpcHooks = {}): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())

  // Hold the indicator in a visible state while the user calibrates
  // against it. Without this the thing being adjusted is invisible: the
  // shape is fully transparent at idle, which is why the onboarding step
  // ended up calibrating a drawing of the notch instead of the notch.
  ipcMain.handle(IPC.INDICATOR_PREVIEW, (_e, on: boolean) => {
    hooks.onIndicatorPreview?.(on === true)
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_e, partial) => {
    // Every setting that changes the SHAPE, not just the notch width.
    // placeholderWidth and noNotchIndicator drive the same live geometry
    // on a machine with no cutout, and they were not watched — so on
    // those machines the calibration slider moved nothing on screen.
    const b = getSettings()
    const before = [b.notchWidthOverride, b.placeholderWidth, b.noNotchIndicator].join('|')
    setSettings(partial)
    const a = getSettings()
    // The indicator reads geometry on mount and on display change, so a
    // calibration change would otherwise sit dormant until relaunch.
    if ([a.notchWidthOverride, a.placeholderWidth, a.noNotchIndicator].join('|') !== before) {
      hooks.onNotchGeometryChanged?.()
    }
    // Keep the worker warm. There is no tier to switch any more, but a
    // settings write is still a cheap moment to make sure the model is
    // loaded before the next dictation asks for it.
    const id = prewarmModelId()
    if (localModelDownloaded(id)) {
      prewarmWhisper(localModelPath(id))
    }
  })

  ipcMain.handle(IPC.APP_INFO, () => ({
    version: app.getVersion(),
    arch: process.arch,
    electron: process.versions.electron,
    // packaged tells About whether "check for updates" is even meaningful
    // — in dev it always points at a download page for a build you're not
    // running.
    packaged: app.isPackaged,
  }))

  ipcMain.handle(IPC.PROVIDER_TEST, async (_e, { provider, key }) => {
    try {
      if (provider === 'groq') await testGroqKey(key)
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(IPC.STATS_GET, () => loadDictationStats())
  ipcMain.handle(IPC.STATS_CLEAR, () => clearDictationStats())

  ipcMain.handle(IPC.HISTORY_GET, () => getHistory())
  ipcMain.handle(IPC.HISTORY_GET_ALL, () => getPersistedHistory())
  ipcMain.handle(IPC.HISTORY_CLEAR, () => clearHistory())

  // Re-run the AI pass on one stored entry.
  //
  // Looks the entry up by id in the PERSISTED store rather than trusting
  // the renderer's copy: the transcript is what gets sent to the cleanup
  // provider, and a renderer that has been sitting open for a day should
  // not be able to decide what that is.
  //
  // Errors are returned, not thrown. A rejected invoke() surfaces in the
  // renderer as an Error whose message is prefixed with the IPC channel
  // and handler frame, which is not a sentence to show someone trying to
  // recover their words.
  ipcMain.handle(IPC.HISTORY_REPOLISH, async (_e, id: string) => {
    const entry = loadPersistedHistory().find((h) => h.id === id)
    if (!entry) return { ok: false as const, error: 'That entry is no longer in your history.' }
    try {
      const text = await repolishEntry(entry, getSettings())
      return { ok: true as const, text }
    } catch (err) {
      logError('Re-polish failed', err)
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'The AI pass failed. Try again in a moment.',
      }
    }
  })

  ipcMain.handle(IPC.CONTEXT_OVERVIEW_GET, () => getUserOverview())
  ipcMain.handle(IPC.CONTEXT_OVERVIEW_SET, (_e, text: string) => {
    setUserOverview(typeof text === 'string' ? text : '')
  })
  ipcMain.handle(IPC.CONTEXT_REFRESH_NOW, () => forceCompaction())
  ipcMain.handle(IPC.CONTEXT_STATUS_GET, () => getCompactionStatus())

  // Spec §1.4. The cards started read + delete only, on the reasoning
  // that an editor turns a mirror into a rewrite of what the user said.
  // That held while the only way in was their own words; it stopped
  // holding once the KEY could be wrong, so rename, edit and move
  // followed. Each still shows exactly what will be sent.
  ipcMain.handle(IPC.CONTEXT_FACTS_LIST, () => listBuckets())
  ipcMain.handle(IPC.CONTEXT_FACT_DELETE, (_e, id: number) =>
    typeof id === 'number' ? deleteFact(id) : false)
  ipcMain.handle(IPC.CONTEXT_BUCKET_RENAME, (_e, from: string, to: string) =>
    typeof from === 'string' && typeof to === 'string' ? renameBucket(from, to) : false)
  ipcMain.handle(IPC.CONTEXT_FACT_UPDATE, (_e, id: number, text: string) =>
    typeof id === 'number' && typeof text === 'string' ? updateFact(id, text) : false)
  // Per-element validation is planFactMove's job (fact-move.ts, pure and
  // tested); this only checks the shapes, as the handlers above do.
  ipcMain.handle(IPC.CONTEXT_FACT_MOVE, (_e, ids: number[], toKey: string) =>
    Array.isArray(ids) && typeof toKey === 'string' ? moveFacts(ids, toKey) : 0)

  ipcMain.handle(IPC.CONTEXT_BUCKET_DELETE, (_e, key: string) =>
    typeof key === 'string' ? deleteBucket(key) : 0)

  // Spec §1.3. The renderer parses the paste (the parser is shared and
  // tested); this just files the result. addFact already rejects
  // unstorable text and duplicates, so re-importing is idempotent rather
  // than accumulating a second copy of everything.
  // Generate, then store through the SAME path the paste flow used, so the
  // two differ only in where the text came from.
  ipcMain.handle(IPC.CONTEXT_GENERATE, async (_e, seed: string) => {
    const res = await generateContext(typeof seed === 'string' ? seed : '')
    if (!res.ok || !res.parsed) return { ok: false, error: res.error, stored: 0 }
    const p = res.parsed
    let stored = 0
    if (p.overview.trim()) setUserOverview(p.overview)
    for (const text of p.global) if (addFact({ scope: 'global', text })) stored++
    for (const [projectKey, facts] of Object.entries(p.projects)) {
      for (const text of facts) if (addFact({ scope: 'project', projectKey, text })) stored++
    }
    for (const text of p.unsorted) {
      if (addFact({ scope: 'project', projectKey: 'unsorted', text })) stored++
    }
    return { ok: true, stored, overview: p.overview }
  })

  ipcMain.handle(IPC.CONTEXT_IMPORT, (_e, payload: OnboardingImport) => {
    if (!payload || typeof payload !== 'object') return { stored: 0 }
    let stored = 0
    if (typeof payload.overview === 'string' && payload.overview.trim()) {
      setUserOverview(payload.overview)
    }
    for (const text of payload.global ?? []) {
      if (addFact({ scope: 'global', text })) stored++
    }
    for (const [projectKey, facts] of Object.entries(payload.projects ?? {})) {
      for (const text of facts) {
        if (addFact({ scope: 'project', projectKey, text })) stored++
      }
    }
    // Unsorted is a real bucket, not a discard pile: the user can see it
    // in the cards and delete what does not belong.
    for (const text of payload.unsorted ?? []) {
      if (addFact({ scope: 'project', projectKey: 'unsorted', text })) stored++
    }
    return { stored }
  })

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
    // Which model the app actually runs. Sent so a renderer can report on
    // it — onboarding shows its download progress — without hardcoding an
    // id that only main is entitled to decide.
    active: prewarmModelId(),
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

  // Weights left behind by retired model tiers. Reported rather than
  // swept automatically: they are large, re-downloadable, and deleting
  // hundreds of megabytes without being asked is not ours to decide.
  ipcMain.handle(IPC.ORPHANED_MODELS_GET, () => {
    const files = listOrphanedModels()
    return { count: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }
  })

  ipcMain.handle(IPC.ORPHANED_MODELS_REMOVE, () => {
    const result = removeOrphanedModels()
    logInfo('Removed orphaned model weights', result)
    return result
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
