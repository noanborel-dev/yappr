import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { Settings } from '../shared/types'

contextBridge.exposeInMainWorld('yappr', {
  getSettings: (): Promise<Settings> =>
    ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (partial: Partial<Settings>): Promise<void> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, partial),
  testProvider: (
    provider: string,
    key: string
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.PROVIDER_TEST, { provider, key }),
  getHistory: () => ipcRenderer.invoke(IPC.HISTORY_GET),
  getAllHistory: () => ipcRenderer.invoke(IPC.HISTORY_GET_ALL),
  clearHistory: () => ipcRenderer.invoke(IPC.HISTORY_CLEAR),
  getContextOverview: (): Promise<string> =>
    ipcRenderer.invoke(IPC.CONTEXT_OVERVIEW_GET),
  setContextOverview: (text: string): Promise<void> =>
    ipcRenderer.invoke(IPC.CONTEXT_OVERVIEW_SET, text),
  refreshContextNow: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.CONTEXT_REFRESH_NOW),
  getContextStatus: (): Promise<{
    count: number
    threshold: number
    lastCompactionAt: number
    compacting: boolean
  }> =>
    ipcRenderer.invoke(IPC.CONTEXT_STATUS_GET),
  requestMicPermission: () => ipcRenderer.invoke(IPC.MIC_PERMISSION),
  getMicPermissionStatus: (): Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'> =>
    ipcRenderer.invoke(IPC.MIC_PERMISSION_STATUS),
  openAccessibilitySettings: () => ipcRenderer.invoke(IPC.ACCESSIBILITY_OPEN),
  isAccessibilityTrusted: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.ACCESSIBILITY_CHECK),
  revealLog: () => ipcRenderer.invoke(IPC.REVEAL_LOG),
  // Notch dimensions as the app currently resolves them, so the
  // calibration control in General can show what it's correcting and
  // whether the value came from the estimate or an override.
  getNotchGeometry: (): Promise<{
    hasNotch: boolean
    width: number
    height: number
    displayWidth: number
  }> => ipcRenderer.invoke(IPC.INDICATOR_NOTCH_GEOMETRY),
  reloadHotkeys: () => ipcRenderer.send(IPC.HOTKEYS_RELOAD),
  openOnboarding: () => ipcRenderer.send(IPC.OPEN_ONBOARDING),
  getLaunchAtLogin: (): Promise<boolean> => ipcRenderer.invoke(IPC.LAUNCH_AT_LOGIN_GET),
  setLaunchAtLogin: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.LAUNCH_AT_LOGIN_SET, enabled),
  onStateChange: (cb: (state: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: string) => cb(state)
    ipcRenderer.on(IPC.STATE_CHANGE, handler)
    return () => ipcRenderer.removeListener(IPC.STATE_CHANGE, handler)
  },

  // Local Whisper model management.
  getLocalModelStatus: () => ipcRenderer.invoke(IPC.LOCAL_MODEL_STATUS),
  downloadLocalModel: (modelId: string) => ipcRenderer.invoke(IPC.LOCAL_MODEL_DOWNLOAD, modelId),
  cancelLocalModel: () => ipcRenderer.invoke(IPC.LOCAL_MODEL_CANCEL),
  uninstallLocalModel: (modelId: string) => ipcRenderer.invoke(IPC.LOCAL_MODEL_UNINSTALL, modelId),
  onLocalModelProgress: (cb: (progress: {
    modelId: string
    status: 'starting' | 'downloading' | 'done' | 'error' | 'idle'
    receivedBytes: number
    totalBytes: number
    error?: string
  }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: Parameters<typeof cb>[0]) => cb(progress)
    ipcRenderer.on(IPC.LOCAL_MODEL_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.LOCAL_MODEL_PROGRESS, handler)
  },
})
