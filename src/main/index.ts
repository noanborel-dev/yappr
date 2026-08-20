import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  shell,
  clipboard,
} from 'electron'

// Chromium switches that affect on-device whisper inference. Set
// BEFORE app.whenReady() — they're parsed by Chromium at startup.
//   - force-high-performance-gpu: tells macOS to use the high-perf
//     GPU partition for this process (no-op on M-series single-GPU
//     SoCs but documented good practice for cross-arch builds).
//   - disable-features=MacUtilityProcessQoSPolicy: prevents Chromium
//     from applying its utility-process QoS downgrade to our whisper
//     worker. Without this the worker inherits THREAD_QOS_UTILITY
//     which lands on E-cores, halving whisper.cpp throughput on
//     M-series (4 threads can hit 2x E-cores instead of all P-cores).
app.commandLine.appendSwitch('force-high-performance-gpu')
app.commandLine.appendSwitch('disable-features', 'MacUtilityProcessQoSPolicy')
import { join } from 'path'
import { registerIpcHandlers, addToHistory, getHistory } from './ipc'
import { notifyDictationCompleted, markDictationActive, startCompactionRetries } from './context/compactor'
import { closeContextStore } from './context/store'
import { registerHotkey, unregisterAll } from './hotkeys'
import { getSettings, setSettings } from './store'
import { runCommandPipeline, runDictationPipeline } from './pipeline'
import { captureFocusedApp, getFocusedApp } from './focused-app'
import type { FocusedApp } from './focused-app'
import {
  initRecordingStore,
  saveRecording,
  readRecordingAudio,
  deleteRecording,
  listRecordings,
  markAttempt,
  sweepRecordings,
  type RecordingContext,
  type RecordingMeta,
} from './recording-store'
import {
  retryDelayMs,
  shouldAutoPaste,
  MAX_STARTUP_RECOVERIES,
} from './recording-recovery'
import { captureSelectedText, clearSelectedText, getSelectedText } from './selection'
import { pausePlayingMedia, resumePausedMedia } from './media-control'
import { pasteText, prewarmPasteHelper, shutdownPasteHelper, captureAXRoleAtPress, getPressTimeAXRolePromise } from './paste'
import { prewarmWhisper } from './whisper-host'
import { localModelDownloaded, localModelPath } from './local-models'
import { downloadWhisperModel } from './local-download'
import { prewarmModelId } from './providers/local'
import { toUserError } from './errors'
import { logError, logInfo, getLogPath } from './log'
import { IPC } from '../shared/types'
import { readNotchGeometry } from '../shared/notch-geometry'

let indicatorWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let onboardingWindow: BrowserWindow | null = null
let pasteFallbackWindow: BrowserWindow | null = null
let tray: Tray | null = null

// When paste falls back to clipboard, remember the cleaned text so the
// fallback window's Insert button can retry the same paste. Cleared on
// dismiss + on every successful paste.
let lastUnpastedText: string | null = null

const audioChunks: Buffer[] = []
// Session ID bumped on every new recording start. Async hide/cleanup
// callbacks check this against the ID they captured; if it has changed,
// a newer session is in progress and the callback skips its hide.
let sessionId = 0
// The last sessionId whose audio has already been consumed by AUDIO_DONE.
//
// stillLatest() only rejects audio from a session OLDER than the current
// one — two AUDIO_DONE messages for the SAME session both passed it, ran
// the whole pipeline twice, and pasted twice. Observed in the wild: one
// dictation produced two transcriptions 8ms apart ("Awesome looks great."
// and "Awesome, looks great."), both pasted.
//
// Guarding here rather than chasing the duplicate upstream, because this
// is the last point where "one dictation = one insertion" can be enforced
// no matter which layer double-fires.
let consumedSessionId = -1

// Mirrors the last state broadcast to the indicator. Lets external
// action triggers (idle-pill clicks, future MCP hooks) know whether to
// start or stop without polling the renderer.
let currentState: 'idle' | 'recording' | 'stopping' | 'processing' | 'done' | 'clipboard' | 'error' = 'idle'

// Vertical room for the shape: a 36px wing row, the expanded panel
// beneath it, and the drop shadow / ambient glow that bleed below both.
const INDICATOR_WINDOW_HEIGHT = 260

/**
 * Minimum time the paste drawer stays open on a double-tap. A local paste
 * can finish in under 200ms — faster than the drawer's own open
 * animation — so without a floor the gesture produces a flicker instead
 * of a readable result.
 */
const PASTING_MIN_MS = 1100

/**
 * How long the clipboard-fallback drawer stays up.
 *
 * This is the one outcome that asks the user to do something, and the
 * drawer teaches the gesture with a 2.6s animation loop. The pipeline
 * used to dismiss it after 2200ms — shorter than a single cycle, so the
 * double-tap never played through even once and the whole instruction
 * went by unread. Long enough here for three cycles plus reading time.
 *
 * The state it replaced was a popup that stayed until dismissed, so
 * erring long is the right direction.
 */
const CLIPBOARD_HOLD_MS = 10000

/** Success needs only an acknowledgement, not reading time. */
const DONE_HOLD_MS = 1500

function createIndicatorWindow(): BrowserWindow {
  const { x: dx, y: dy, width } = screen.getPrimaryDisplay().bounds
  // Initial bounds: pinned to the top edge of the primary display,
  // spanning its full width. positionIndicatorOnActiveDisplay() moves it
  // to whichever display the cursor is on at recording start.
  //
  // Note this uses `bounds`, not `workArea`: the notch shape has to sit
  // OVER the menu bar, so the window must start at the true top of the
  // display rather than below the bar.

  const win = new BrowserWindow({
    // Full display width so the shape can be centred on the notch and
    // its wings can extend toward the menu bar's edges without the
    // window itself ever needing to resize.
    width: width,
    height: INDICATOR_WINDOW_HEIGHT,
    x: dx,
    y: dy,
    frame: false,
    transparent: true,
    // hasShadow: false eliminates the macOS native rectangular window
    // shadow that traces the BrowserWindow bounds and produces a faint
    // outline around the rounded pill. Our pill renders its own
    // drop-shadow that follows its actual shape.
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    // movable: false locks the window in place. Without it, macOS lets
    // BrowserWindow content act as a drag handle when the underlying
    // surface is transparent and the cursor lands on a non-interactive
    // region — which is exactly what was making the pill drift.
    movable: false,
    // THIS is what lets the window cover the menu bar. Without it macOS
    // constrains window bounds to the display's visible frame — the work
    // area — so a window asked for y = 0 is silently pushed down to
    // y = menuBarHeight and the shape lands just under the notch instead
    // of inside it. Nothing about the window level fixes that; the
    // clamp happens before layering is considered.
    enableLargerThanScreen: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/indicator.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setIgnoreMouseEvents(true, { forward: true })

  // Re-assert the bounds after construction. The constructor's x/y are
  // advisory on macOS — setBounds on a window that already exists is what
  // reliably lands it over the menu bar.
  win.setBounds({ x: dx, y: dy, width, height: INDICATOR_WINDOW_HEIGHT })
  logInfo('Indicator window bounds', {
    requested: { x: dx, y: dy, width, height: INDICATOR_WINDOW_HEIGHT },
    actual: win.getBounds(),
  })

  // Keep the overlay out of screen shares and screenshots. Without this
  // the notch shape appears in every recording the user makes, which
  // reads as a rendering artifact to anyone watching.
  if (process.platform === 'darwin') {
    win.setContentProtection(true)
  }

  // Show the indicator on every macOS Space — including fullscreen apps.
  // Without this the window is pinned to the Space it was created on, so
  // swiping to another desktop loses sight of it. setAlwaysOnTop with the
  // 'screen-saver' level pierces fullscreen-app layering as well.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'screen-saver')
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/indicator/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/indicator/index.html'))
  }

  return win
}

// Move the indicator to the display the cursor is currently on, pinned to
// its top edge. Called each time recording starts so the shape follows the
// user across monitors/spaces.
function positionIndicatorOnActiveDisplay(): void {
  if (!indicatorWindow) return
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  // `bounds`, not `workArea` — the shape sits over the menu bar, so the
  // window has to start at the true top of the display. Spanning the full
  // width keeps the window's centre aligned with the display's, which is
  // what the renderer centres the notch band on.
  const { x, y, width } = display.bounds
  indicatorWindow.setBounds({ x, y, width, height: INDICATOR_WINDOW_HEIGHT })

  // Verify the clamp didn't win. If actual.y is below the requested y the
  // window got pushed under the menu bar and the shape will render below
  // the notch rather than inside it — the single failure mode that makes
  // this whole feature look broken, so it is worth a log line.
  const actual = indicatorWindow.getBounds()
  if (actual.y > y) {
    logError('Indicator window clamped below the menu bar', {
      requestedY: y,
      actualY: actual.y,
      display: display.id,
    })
  }

  // Re-assert visibility-on-all-spaces every show. macOS occasionally
  // loses the collectionBehavior flag after a window has been hidden,
  // moved, or after Spaces are added/removed — without re-asserting,
  // the pill ends up pinned to the Space it was last shown on.
  // setAlwaysOnTop with the 'screen-saver' level pierces fullscreen-app
  // layering as well.
  indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (process.platform === 'darwin') {
    indicatorWindow.setAlwaysOnTop(true, 'screen-saver')
  }
}

function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }

  const win = new BrowserWindow({
    // Sized to fit the redesigned hero cards comfortably without
    // forcing scroll on the most common tabs (Provider, Polish, About).
    width: 980,
    height: 740,
    minWidth: 820,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    // Inset the traffic lights so they sit centered in our 30px drag
    // strip — without this they collide with the Yappr wordmark in
    // the sidebar.
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#F6F2E7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/settings/index.html'))
  }

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { settingsWindow = null })
  settingsWindow = win
  return win
}

function createOnboardingWindow(): BrowserWindow {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus()
    return onboardingWindow
  }

  const win = new BrowserWindow({
    width: 880,
    height: 680,
    resizable: false,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#F6F2E7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/onboarding/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/onboarding/index.html'))
  }

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    setSettings({ firstRun: false })
    onboardingWindow = null
  })
  onboardingWindow = win
  return win
}

// Small bottom-right popup that appears whenever paste falls back to
// clipboard — usually because Accessibility was denied, the focused app
// doesn't accept simulated keystrokes, or focus changed mid-pipeline.
// Created on demand, kept around until dismissed.
function createPasteFallbackWindow(): BrowserWindow {
  if (pasteFallbackWindow && !pasteFallbackWindow.isDestroyed()) {
    return pasteFallbackWindow
  }

  // Position near the bottom-right of the active display so it sits out
  // of the way of the user's text field but stays in the same screen
  // they're typing in.
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x: dx, y: dy, width, height } = display.workArea
  const W = 360
  const H = 240
  const x = Math.round(dx + width - W - 24)
  const y = Math.round(dy + height - H - 80)

  const win = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,   // user needs to click the Insert button
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/paste-fallback.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Same Spaces / fullscreen behavior as the indicator — the fallback
  // shouldn't be lost when the user is on a non-primary Space.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'floating')
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/paste-fallback/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/paste-fallback/index.html'))
  }

  win.on('closed', () => { pasteFallbackWindow = null })
  pasteFallbackWindow = win
  return win
}

// Paste fell back to the clipboard. The notch carries this now: the
// pipeline already broadcasts the `clipboard` state, which shows
// "copied — ⌘V" and offers Insert, so we only need to hold the text for
// the retry handler.
//
// The bottom-right popup is deliberately not opened. One event should
// produce one notification, and having it appear in the opposite corner
// from the indicator meant the user's attention was split between two
// places for the same outcome. Keeping it in the notch also avoids the
// popup's focus problem — the indicator window is focusable: false, so
// clicking Insert never takes focus off the user's text field, which is
// what the retry handler's AX gate and focus-restore delay existed to
// work around.
function showPasteFallback(text: string): void {
  lastUnpastedText = text
}

function dismissPasteFallback(): void {
  lastUnpastedText = null
  if (pasteFallbackWindow && !pasteFallbackWindow.isDestroyed()) {
    pasteFallbackWindow.hide()
  }
}

function updateTrayMenu(): void {
  if (!tray) return

  const history = getHistory()
  const historyItems: Electron.MenuItemConstructorOptions[] = history.slice(0, 5).map(item => ({
    label: item.cleaned.length > 50 ? item.cleaned.slice(0, 50) + '…' : item.cleaned,
    click: () => pasteText(item.cleaned, { skipAxGate: true }),
  }))

  const menu = Menu.buildFromTemplate([
    { label: 'Yappr', enabled: false },
    { type: 'separator' },
    { label: 'Settings…', click: () => createSettingsWindow() },
    { label: 'Reopen Onboarding…', click: () => createOnboardingWindow() },
    { type: 'separator' },
    ...(historyItems.length > 0
      ? [{ label: 'Recent Dictations', enabled: false } as Electron.MenuItemConstructorOptions, ...historyItems]
      : [{ label: 'No dictations yet', enabled: false } as Electron.MenuItemConstructorOptions]),
    { type: 'separator' },
    { label: 'Quit Yappr', role: 'quit' },
  ])

  tray.setContextMenu(menu)
}

function setupTray(): void {
  const iconPath = join(__dirname, '../../assets/tray.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
    icon = nativeImage.createEmpty()
  }

  // Full-color tray icon — the Yappr pill with red dot + cobalt
  // bars. NOT a template image (template mode would strip the colors
  // and only render the silhouette). The pill is already dark, so it
  // reads fine on both light and dark menubars. assets/tray.png +
  // assets/tray@2x.png are produced by scripts/generate-tray-icon.sh;
  // Electron picks the @2x variant on retina displays.

  tray = new Tray(icon)
  tray.setToolTip('Yappr')
  tray.on('click', () => createSettingsWindow())
  updateTrayMenu()
}

function broadcastState(state: string): void {
  // Track non-error states so idle-pill click handlers can decide
  // whether to toggle into or out of recording. Error states keep the
  // previous "tracked" state since they're transient banners.
  if (state === 'idle' || state === 'recording' || state === 'stopping' ||
      state === 'processing' || state === 'done' || state === 'clipboard') {
    currentState = state
  }
  // Resume music from the single place every dictation ends up, rather
  // than from each call site — that way aborts, paste failures and error
  // banners all restore playback too. resumePausedMedia() is a no-op when
  // we didn't pause anything, so the extra calls cost nothing.
  if (state === 'done' || state === 'clipboard' || state === 'idle' || state.startsWith('error')) {
    void resumePausedMedia()
  }
  indicatorWindow?.webContents.send(IPC.STATE_CHANGE, state)
}

// Shared action handlers — invoked from both global hotkeys and from
// the idle-pill's click menu. Keeps the two entry points consistent.
function actionStartRecording(): void {
  sessionId++
  // Fire-and-forget so the Apple Event round-trip never delays capture.
  // Music already in the buffer can't be un-recorded, but every millisecond
  // earlier is less of it landing in the microphone.
  if (getSettings().pauseMediaWhileDictating) {
    void pausePlayingMedia()
  }
  audioChunks.length = 0
  captureFocusedApp()
  captureSelectedText()
  captureAXRoleAtPress()
  positionIndicatorOnActiveDisplay()
  markDictationActive()
  broadcastState('recording')
}

function actionStopRecording(): void {
  broadcastState('stopping')
}

function actionAbortRecording(): void {
  sessionId++
  audioChunks.length = 0
  broadcastState('stopping')
}

function actionPasteLast(): void {
  const last = getHistory()[0]
  logInfo('Paste-last triggered', { hasHistory: Boolean(last) })
  if (!last) {
    broadcastState('error:nothing to paste')
    positionIndicatorOnActiveDisplay()
    setTimeout(() => broadcastState('idle'), 1800)
    return
  }
  // Explicit user action (double-tap hotkey or Insert in indicator
  // menu) — skip the AX-role gate. At the moment of paste-last, focus
  // may briefly be on the indicator pill or have just shifted away
  // from the user's target text field; the gate would incorrectly
  // route to the clipboard fallback. The keystroke fires against
  // whatever the OS considers focused when it actually runs, which
  // settles back on the user's target.
  // Drop the notch's drawer immediately, before the paste resolves, so
  // the double-tap has a visible result showing WHAT is going in. Held a
  // minimum time because the paste itself is often faster than the
  // animation — without the floor the drawer opens and shuts in one
  // frame, which reads as a glitch rather than as feedback.
  positionIndicatorOnActiveDisplay()
  broadcastState('pasting')
  const shownAt = Date.now()

  pasteText(last.cleaned, { skipAxGate: true })
    .then(({ method }) => {
      const remaining = Math.max(0, PASTING_MIN_MS - (Date.now() - shownAt))
      setTimeout(() => {
        positionIndicatorOnActiveDisplay()
        broadcastState(method === 'clipboard' ? 'clipboard' : 'done')
        setTimeout(() => broadcastState('idle'), method === 'clipboard' ? CLIPBOARD_HOLD_MS : DONE_HOLD_MS)
      }, remaining)
    })
    .catch(err => {
      logError('Paste-last failed', err)
      broadcastState('idle')
    })
}

function setupHotkeys(): void {
  const settings = getSettings()
  unregisterAll()

  registerHotkey(settings.hotkeys.pushToTalk, {
    onStart: actionStartRecording,
    // Renderer transitions recording → stopping → (flush) → sends AUDIO_DONE
    onStop: actionStopRecording,
    // Double-tap arrived while a recording was live — discard the
    // pending audio. Bumping sessionId makes the eventual AUDIO_DONE
    // skip its work via stillLatest(). onPasteLast fires immediately
    // after and owns the visible state transition.
    onAbort: actionAbortRecording,
    onPasteLast: actionPasteLast,
  })
}

function setupAudioIpc(): void {
  ipcMain.on(IPC.AUDIO_CHUNK, (_e, chunk: ArrayBuffer) => {
    audioChunks.push(Buffer.from(chunk))
  })

  ipcMain.on(IPC.AUDIO_DONE, async () => {
    const mySession = sessionId
    if (mySession === consumedSessionId) {
      logInfo('Ignoring duplicate AUDIO_DONE', { sessionId: mySession })
      return
    }
    consumedSessionId = mySession
    const audioBuffer = Buffer.concat(audioChunks)
    audioChunks.length = 0

    // Skip all further work if a newer recording has begun since this
    // AUDIO_DONE was queued — otherwise we'd hide the active indicator.
    const stillLatest = () => mySession === sessionId

    if (audioBuffer.length < 500) {
      if (stillLatest()) broadcastState('idle')
      return
    }

    // Decide between modes based on whether the user had a meaningful
    // selection when they pressed the hotkey. The threshold (≥5 chars)
    // protects against accidental tiny selections like a single
    // highlighted comma triggering rewrite mode.
    const selection = getSelectedText()
    const commandMode = selection.trim().length >= 5
    clearSelectedText()

    // Persist BEFORE running the pipeline. Until this landed, a dead
    // whisper worker — the single most common failure in the wild — took
    // the recording with it and there was nothing left to retry from.
    // Fired alongside the pipeline rather than awaited: a 30s opus clip is
    // ~90KB and finishes writing long before transcription does.
    //
    // The context saved here is the PRESS-time focus. The pipeline also
    // refreshes focus at release (to catch "started in iMessage, finished
    // in Gmail"), but that value doesn't exist yet, and press-time is the
    // right answer for a replay anyway — it's the app the user was looking
    // at when they started talking.
    const recordingId = crypto.randomUUID()
    const pressFocus = getFocusedApp()
    const context: RecordingContext = {
      bundleId: pressFocus.bundleId,
      name: pressFocus.name,
      category: pressFocus.category,
      pid: pressFocus.pid,
      commandMode,
      selection,
    }
    const saved = saveRecording(recordingId, audioBuffer, context, Date.now())
      .catch((err) => { logError('Failed to persist recording', err) })

    try {
      if (commandMode) {
        broadcastState('processing')
        const rewritten = await runCommandPipeline(audioBuffer, selection, getSettings())
        // Use the press-time AX-role probe — same as dictate mode.
        // Command mode involves no UI interaction during the call, so
        // the user's original focus is still the intended target.
        const { method } = await pasteText(rewritten, { rolePromise: getPressTimeAXRolePromise() ?? undefined })
        const focused = getFocusedApp()
        addToHistory({
          id: crypto.randomUUID(),
          transcript: '(rewrite)',
          cleaned: rewritten,
          appName: focused.name,
          appCategory: focused.category,
          timestamp: Date.now(),
        })
        // Rewrite/command-mode bumps the activity timestamp so the
        // compactor's idle gate doesn't fire mid-session, but we don't
        // count it toward the threshold — the compactor itself filters
        // '(rewrite)' entries from its input list.
        markDictationActive()
        updateTrayMenu()
        // Text delivered (a clipboard fallback still counts — it's on the
        // clipboard, in history, and in the popup), so the audio has done
        // its job. Await the write first so we can't race a half-written
        // file into an undeletable orphan.
        await saved
        await deleteRecording(recordingId)

        if (stillLatest()) {
          const isClipboard = method === 'clipboard'
          broadcastState(isClipboard ? 'clipboard' : 'done')
          if (isClipboard) showPasteFallback(rewritten)
          const dismissAfter = isClipboard ? CLIPBOARD_HOLD_MS : DONE_HOLD_MS
          setTimeout(() => {
            if (stillLatest()) broadcastState('idle')
          }, dismissAfter)
        }
        return
      }

      const result = await runDictationPipeline(
        audioBuffer,
        getSettings(),
        (s) => { if (stillLatest()) broadcastState(s) },
        // Streaming partial transcript — sent as `partial:<text>` so
        // the indicator can show words appearing while inference is
        // still running. Falls back silently for cloud providers that
        // don't stream. Critically, we DON'T promote partial to the
        // tracked state in broadcastState (it's not a state); the
        // pill's renderer just paints the latest partial text when
        // in 'processing' state.
        (text) => { if (stillLatest()) broadcastState(`partial:${text}`) }
      )

      addToHistory(result)
      // Only count toward the 50-dictation threshold when both toggles
      // are on. Counter increments otherwise would tick forever in the
      // background even when the user has the feature off.
      const s = getSettings()
      if (s.useContextMemory && s.autoContextUpdate) {
        notifyDictationCompleted()
      } else {
        markDictationActive()
      }
      updateTrayMenu()
      await saved
      await deleteRecording(recordingId)

      if (stillLatest()) {
        const isClipboard = result.pasteMethod === 'clipboard'
        broadcastState(isClipboard ? 'clipboard' : 'done')
        // Clipboard fallback (Accessibility denied or paste failed) gets
        // a dedicated popup window with a click-to-insert affordance.
        // The pill itself dismisses on its normal short timer; the
        // popup hangs around for 15s on its own clock.
        if (isClipboard) {
          showPasteFallback(result.cleaned)
        }
        const dismissAfter = isClipboard ? CLIPBOARD_HOLD_MS : DONE_HOLD_MS
        setTimeout(() => {
          if (stillLatest()) broadcastState('idle')
        }, dismissAfter)
      }
    } catch (err) {
      const userErr = toUserError(err)
      // NO_SPEECH is expected user behavior (held the key, didn't talk),
      // not a true error — log info-level and dismiss faster than a real
      // pipeline failure.
      if (userErr.code !== 'NO_SPEECH') {
        logError('Pipeline error', err)
      }
      // The audio survives this. Hand it to the retry machinery before
      // touching the indicator so the recording is durable even if the
      // window work throws.
      await saved
      await handleRecordingFailure(recordingId, err)

      if (stillLatest()) {
        broadcastState(`error:${userErr.userMessage}`)
        const dismissAfter = userErr.code === 'NO_SPEECH' ? 2200 : 4000
        setTimeout(() => {
          if (stillLatest()) broadcastState('idle')
        }, dismissAfter)
      }
    }
  })
}

// A pipeline run failed. Decide what happens to the audio on disk.
async function handleRecordingFailure(id: string, err: unknown): Promise<void> {
  const userErr = toUserError(err)

  if (userErr.disposition === 'drop') {
    await deleteRecording(id)
    return
  }

  const meta = await markAttempt(id, userErr.code)
  // Gone already — a concurrent success or a retention sweep won the race.
  if (!meta) return

  if (userErr.disposition === 'park') {
    // Nothing to gain from spinning: the same audio will fail identically
    // until the user adds or fixes a key. Kept on disk; the next launch
    // gives it another go, by which time they may have fixed it.
    logInfo('Recording parked for later recovery', { id, code: userErr.code, attempts: meta.attempts })
    return
  }

  const delay = retryDelayMs(meta.attempts)
  if (delay === null) {
    logInfo('Recording retries exhausted — audio kept for next launch', {
      id, attempts: meta.attempts, code: userErr.code,
    })
    return
  }
  logInfo('Recording retry scheduled', { id, attempts: meta.attempts, delayMs: delay, code: userErr.code })
  setTimeout(() => { void retryRecording(id) }, delay)
}

// Re-run the pipeline against audio already on disk, replaying the focus
// context it was recorded with.
async function retryRecording(id: string): Promise<void> {
  const meta = (await listRecordings()).find((m) => m.id === id)
  if (!meta) return

  const audio = await readRecordingAudio(id)
  if (!audio) {
    // Sidecar without audio can never be replayed — drop the pair.
    await deleteRecording(id)
    return
  }

  const focusOverride: FocusedApp = {
    bundleId: meta.context.bundleId,
    name: meta.context.name,
    category: meta.context.category,
    pid: meta.context.pid,
  }

  logInfo('Retrying recording', { id, attempts: meta.attempts, app: meta.context.name })
  try {
    let text: string
    if (meta.context.commandMode) {
      text = await runCommandPipeline(audio, meta.context.selection, getSettings(), focusOverride)
      addToHistory({
        id: crypto.randomUUID(),
        transcript: '(rewrite)',
        cleaned: text,
        appName: meta.context.name,
        appCategory: meta.context.category,
        timestamp: Date.now(),
      })
    } else {
      // No state/partial callbacks: a retry must never repaint the
      // indicator, which may be mid-recording for a newer dictation.
      // `replay` also suppresses the pipeline's internal paste so
      // deliverRecovered's safety gate is the only thing that can insert.
      const result = await runDictationPipeline(
        audio, getSettings(), () => {}, undefined, { focus: focusOverride },
      )
      text = result.cleaned
      addToHistory(result)
    }
    markDictationActive()
    updateTrayMenu()
    await deleteRecording(id)
    await deliverRecovered(text, meta)
  } catch (err) {
    logError('Recording retry failed', err)
    await handleRecordingFailure(id, err)
  }
}

// Get recovered text to the user without ever pasting it somewhere they
// didn't intend.
async function deliverRecovered(text: string, meta: RecordingMeta): Promise<void> {
  // Read CURRENT focus, not the cache — the cached value is from whenever
  // the last pipeline ran and would defeat the whole point of the check.
  await captureFocusedApp()
  const current = getFocusedApp().bundleId
  const elapsed = Date.now() - meta.timestamp

  if (shouldAutoPaste(meta.context.bundleId, current, elapsed)) {
    const { method } = await pasteText(text, { skipAxGate: true })
    if (method === 'paste') {
      logInfo('Recovered dictation pasted', { app: meta.context.name, elapsedMs: elapsed })
      return
    }
  }

  // Same affordance as a failed paste: click-to-insert, cannot land
  // anywhere unintended, and the text is on the clipboard regardless.
  logInfo('Recovered dictation offered via fallback', {
    app: meta.context.name, elapsedMs: elapsed, chars: text.length,
  })
  showPasteFallback(text)
}

// Replay recordings orphaned by a hard crash or quit mid-pipeline. Runs
// sequentially so a backlog can't stampede the whisper worker, and the
// elapsed-time gate in deliverRecovered guarantees none of these can
// auto-paste — they all land in the click-to-insert popup.
async function recoverOrphansAtStartup(): Promise<void> {
  try {
    const swept = await sweepRecordings(Date.now())
    if (swept > 0) logInfo('Recording retention sweep', { removed: swept })

    const metas = await listRecordings()
    if (metas.length === 0) return

    // Newest first — those are the ones the user still cares about.
    const ordered = [...metas].reverse()
    const batch = ordered.slice(0, MAX_STARTUP_RECOVERIES)
    const deferred = ordered.length - batch.length
    logInfo('Recovering orphaned recordings', {
      found: ordered.length, recovering: batch.length, deferred,
    })

    for (const meta of batch) {
      await retryRecording(meta.id)
    }
  } catch (err) {
    logError('Startup recording recovery failed', err)
  }
}

function setupIpcListeners(): void {
  ipcMain.on(IPC.OPEN_SETTINGS, () => createSettingsWindow())
  ipcMain.on(IPC.OPEN_ONBOARDING, () => createOnboardingWindow())
  ipcMain.on(IPC.HOTKEYS_RELOAD, () => setupHotkeys())
  ipcMain.handle(IPC.REVEAL_LOG, () => {
    shell.showItemInFolder(getLogPath())
  })

  // Paste fallback retry: the popup window's Insert button calls this
  // after the user has had a chance to focus their target text field.
  //
  // Two things must happen in this order:
  //  1. HIDE the popup first. Clicking Insert moved focus from the
  //     user's text field onto the popup's button; the ⌘V keystroke
  //     would otherwise fire into the popup itself, not the target.
  //     Hiding the popup releases focus and macOS routes the next
  //     key event to whatever was focused before the popup appeared
  //     (the user's text field).
  //  2. skipAxGate so the AX probe doesn't see our popup's AXButton
  //     and incorrectly route back to the clipboard fallback. The
  //     keystroke fires unconditionally against whatever has focus
  //     at the moment it runs.
  ipcMain.handle(IPC.PASTE_FALLBACK_RETRY, async () => {
    if (!lastUnpastedText) return false
    const text = lastUnpastedText
    // Snapshot the text BEFORE dismissing (dismiss clears it).
    dismissPasteFallback()
    // Brief pause so the OS focus event from .hide() processes before
    // we fire the keystroke. Without this, the keystroke can race the
    // focus restore and still hit the popup.
    await new Promise(resolve => setTimeout(resolve, 30))
    const { method } = await pasteText(text, { skipAxGate: true })
    return method === 'paste'
  })
  ipcMain.on(IPC.PASTE_FALLBACK_DISMISS, () => dismissPasteFallback())

  // Idle-pill quick actions — invoked from the persistent indicator's
  // hover menu. Mirror the hotkey behaviors so users get the same
  // result whether they click the pill or press the hotkey.
  ipcMain.on(IPC.INDICATOR_TOGGLE_RECORD, () => {
    if (currentState === 'recording') {
      actionStopRecording()
    } else if (currentState === 'idle' || currentState === 'done' || currentState === 'clipboard') {
      actionStartRecording()
    }
    // While 'stopping' or 'processing', clicks are no-ops — the pipeline
    // is mid-flight and starting a new session here would race.
  })
  ipcMain.on(IPC.INDICATOR_PASTE_LAST, () => actionPasteLast())
  ipcMain.on(IPC.INDICATOR_POLISH_SELECTION, () => {
    // Same path as the rewrite-selection mode triggered by hotkey, but
    // we have to start the capture now (since there's no press event)
    // and then begin recording so the user dictates the instruction.
    captureFocusedApp()
    captureSelectedText()
    captureAXRoleAtPress()
    if (currentState === 'idle' || currentState === 'done' || currentState === 'clipboard') {
      actionStartRecording()
    }
  })

  // Pill-window interactivity toggle: the renderer asks main to flip
  // setIgnoreMouseEvents based on whether the cursor is hovering the
  // idle pill. While idle, the window normally lets clicks pass
  // through; on hover the renderer needs real pointer events to show
  // the menu and accept clicks.
  ipcMain.on('indicator:set-interactive', (_e, interactive: boolean) => {
    if (!indicatorWindow || indicatorWindow.isDestroyed()) return
    if (interactive) {
      indicatorWindow.setIgnoreMouseEvents(false)
    } else {
      indicatorWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  })

  // Notch dimensions for whichever display the indicator currently sits
  // on. Read per call rather than cached: the window follows the cursor
  // across displays, and notch width and menu bar height differ between
  // an internal panel and an external monitor.
  ipcMain.handle(IPC.INDICATOR_NOTCH_GEOMETRY, () => {
    const target = indicatorWindow && !indicatorWindow.isDestroyed()
      ? screen.getDisplayNearestPoint(indicatorWindow.getBounds())
      : screen.getPrimaryDisplay()
    const geometry = readNotchGeometry({
      widthPt: target.bounds.width,
      boundsY: target.bounds.y,
      workAreaY: target.workArea.y,
    }, getSettings().notchWidthOverride ?? null)
    // The width is the one value we estimate rather than read, so log
    // what we resolved. If the centre band doesn't line up with the
    // physical notch, this line says whether the estimate or the
    // override produced it.
    logInfo('Notch geometry resolved', {
      hasNotch: geometry.hasNotch,
      width: geometry.width,
      height: geometry.height,
      displayWidth: target.bounds.width,
      source: geometry.widthIsOverride ? 'override' : 'estimate',
    })
    return {
      hasNotch: geometry.hasNotch,
      width: geometry.width,
      height: geometry.height,
      displayWidth: target.bounds.width,
    }
  })

  // The most recent dictation, surfaced as the peek state's clickable
  // transcript and in the expanded panel.
  ipcMain.handle(IPC.INDICATOR_RECENT, () => {
    const [latest] = getHistory()
    if (!latest) return null
    const text = latest.cleaned || latest.transcript
    if (!text) return null
    return {
      text,
      target: latest.appName || null,
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
      // DictationResult carries no recording length, so the panel
      // caption drops the duration rather than inventing one.
      durationSec: null,
    }
  })

  ipcMain.on(IPC.INDICATOR_COPY_RECENT, () => {
    const [latest] = getHistory()
    const text = latest?.cleaned || latest?.transcript
    if (text) clipboard.writeText(text)
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    // Point Electron at the bundled Yappr icon so Finder, Cmd-Tab,
    // and any other macOS surface that asks the app for its icon gets
    // the real one instead of the default Electron logo. In dev the
    // .icns lives in the repo's assets/; in production electron-builder
    // copies it into the .app bundle's Resources/.
    const iconCandidates = [
      join(app.getAppPath(), 'assets/icon.icns'),
      join(process.resourcesPath || '', 'assets/icon.icns'),
      join(__dirname, '../../assets/icon.icns'),
    ]
    for (const p of iconCandidates) {
      try {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          app.dock?.setIcon(img)
          break
        }
      } catch { /* try next */ }
    }
    app.dock?.hide()
  }

  // Must precede setupAudioIpc — the first AUDIO_DONE writes through it.
  initRecordingStore(join(app.getPath('userData'), 'recordings'))

  registerIpcHandlers({
    onNotchGeometryChanged: () => {
      indicatorWindow?.webContents.send(IPC.INDICATOR_GEOMETRY_CHANGED)
    },
  })
  // A backlog can already exist from previous sessions — the counter is
  // persisted. Without this kick, polling would only begin after the NEXT
  // dictation, which is how a 316-dictation backlog sat uncompacted.
  {
    const s = getSettings()
    if (s.useContextMemory && s.autoContextUpdate) startCompactionRetries()
  }
  setupAudioIpc()
  setupIpcListeners()

  indicatorWindow = createIndicatorWindow()
  // Show the indicator window immediately at app start so it joins the
  // macOS window tracker with collectionBehavior = canJoinAllSpaces.
  // The renderer returns null while state is 'idle', so the transparent
  // window is invisible — but it's "alive" in the OS and follows the
  // user across every Space.
  //
  // Critical: hide() / show() pairs during state transitions used to
  // intermittently strand the pill on the Space where it was last
  // shown. Keeping the window always-visible (and emptying its
  // content via renderer state) eliminates that race.
  indicatorWindow.setIgnoreMouseEvents(true, { forward: true })
  indicatorWindow.showInactive()
  setupTray()
  setupHotkeys()
  // Pre-spawn the AppleScript helper so the first paste doesn't pay
  // the ~120ms process-spawn tax.
  prewarmPasteHelper()

  const settings = getSettings()
  // Get the model onto the machine, then warm it.
  //
  // Both halves used to be someone else's job: a Settings card offered a
  // Download button, and onboarding made you pick a tier before it would
  // let you continue. Neither surface exists now — transcription isn't a
  // user-facing choice — so if the file isn't there, nothing else is
  // going to fetch it and every dictation fails with a missing model.
  //
  // Fire-and-forget on purpose: it must not delay the tray, the hotkeys
  // or the indicator. Progress still goes out on LOCAL_MODEL_PROGRESS for
  // anything that wants to show it.
  void (async () => {
    try {
      const modelId = prewarmModelId()
      if (!localModelDownloaded(modelId)) {
        logInfo('Model missing at startup — fetching', { modelId })
        await downloadWhisperModel(modelId)
      }
      // Without this prewarm the first dictation pays ~1s of worker fork
      // + model load + Metal compile, which we can hide behind startup.
      if (localModelDownloaded(modelId)) {
        prewarmWhisper(localModelPath(modelId))
      }
    } catch (err) {
      // A failed fetch is not fatal at launch — the next dictation
      // surfaces the real error, and the next launch retries.
      logError('Model fetch/prewarm failed', { error: String(err) })
    }
  })()

  if (settings.firstRun) {
    createOnboardingWindow()
  }

  // Sweep retention and replay anything a crash left behind. Deliberately
  // last and un-awaited: it transcribes, so it must not delay the tray,
  // hotkeys, or the indicator becoming usable.
  void recoverOrphansAtStartup()
})

app.on('window-all-closed', () => {
  // Intentionally empty — app lives in tray
})

app.on('before-quit', () => {
  shutdownPasteHelper()
  closeContextStore()
})
