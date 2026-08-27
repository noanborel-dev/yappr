import { execFile } from 'child_process'
import { promisify } from 'util'
import { clipboard } from 'electron'
import { getFocusedApp } from './focused-app'
import { BROWSER_BUNDLE_IDS, AX_OPAQUE_APPS } from '../shared/constants'
import { axText } from './ax-value'
import { logInfo } from './log'

const exec = promisify(execFile)

// Selection captured at hotkey-press time. This stays press-time on
// purpose: the user's *intent* (which text they want to rewrite) is
// fixed when they press the key. Focus could move during dictation,
// but the selection they meant to edit is the one that was active
// when they hit the hotkey.
//
// AX-role check for the paste destination is a separate concern —
// that one MUST run at release/paste time (see paste.ts) because the
// destination can change while the user is talking.
let cachedSelection: string = ''

// The `is missing value` checks are load-bearing, not defensive noise.
//
// Reading AXSelectedText with nothing selected does NOT error — it
// returns AppleScript's nil, which osascript prints as the literal
// string "missing value". The `on error` branch never runs, so without
// these the caller receives 13 characters that look like a selection.
// That shipped: a user pressed the rewrite gesture with nothing
// highlighted and Yappr rewrote and pasted the words "missing value".
//
// AXFocusedUIElement is checked too — an app with no focused element
// returns nil there, and asking for an attribute OF nil is what would
// have thrown into `on error` by luck rather than by design.
const SELECTED_TEXT_SCRIPT = `
tell application "System Events"
  try
    set frontApp to first application process whose frontmost is true
    set focusedEl to value of attribute "AXFocusedUIElement" of frontApp
    if focusedEl is missing value then return ""
    set sel to value of attribute "AXSelectedText" of focusedEl
    if sel is missing value then return ""
    return sel
  on error
    return ""
  end try
end tell
`

// Wait after sending ⌘C before reading the clipboard. Chrome writes its
// selection asynchronously through its IPC, so 80ms was too tight in
// production. 200ms still leaves ample headroom inside the recording
// window (the user is talking) and reliably catches Chrome's write.
const PROBE_WAIT_MS = 200

export async function captureSelectedText(): Promise<void> {
  cachedSelection = ''
  if (process.platform !== 'darwin') return

  // Phase 1: AX fast-path. No clipboard mutation. Works for native
  // macOS apps (Mail, Notes, Pages, TextEdit, Safari address bar).
  try {
    const { stdout } = await exec('osascript', ['-e', SELECTED_TEXT_SCRIPT])
    // axText, not stdout.trim(): the script above guards nil, and this
    // guards the script being edited later. See ax-value.ts.
    const axSelection = axText(stdout)
    if (axSelection.length > 0) {
      cachedSelection = axSelection
      logInfo('Selection captured (AX)', { chars: axSelection.length })
      return
    }
  } catch {
    /* fall through to clipboard probe */
  }

  // Phase 2: clipboard probe for AX-opaque apps. AXSelectedText
  // returns empty past the WebView boundary in Chromium/Electron
  // surfaces even when the user has text highlighted.
  const focused = getFocusedApp()
  if (!BROWSER_BUNDLE_IDS.has(focused.bundleId) && !AX_OPAQUE_APPS.has(focused.bundleId)) {
    logInfo('Selection skipped (not AX-opaque app)', { bundleId: focused.bundleId })
    return
  }

  cachedSelection = await probeSelectionViaClipboard()
  logInfo('Selection captured (clipboard probe)', {
    bundleId: focused.bundleId,
    chars: cachedSelection.length,
  })
}

// Drive a Copy via the focused app's menu item. Chrome / Chromium apps
// silently swallow synthetic `keystroke "c" using command down` events
// from System Events (security hardening), but they DO honor menu-
// action invocations on their own menu bar. So we fall back to
// "click menu item Copy of menu Edit" when the keystroke didn't move
// the clipboard. AppleScript matches the menu item case-insensitively
// across Chrome locales by walking menu items literally.
const MENU_COPY_SCRIPT = `
tell application "System Events"
  try
    set frontApp to first application process whose frontmost is true
    tell frontApp
      try
        click menu item "Copy" of menu "Edit" of menu bar 1
        return "ok"
      on error
        -- Some apps localize the menu name. Try a few common variants.
        try
          click menu item "Copy" of menu 1 of menu bar item "Edit" of menu bar 1
          return "ok"
        on error
          return "menu-not-found"
        end try
      end try
    end tell
  on error
    return "script-error"
  end try
end tell
`

async function probeSelectionViaClipboard(): Promise<string> {
  const previousText = clipboard.readText()
  const sentinel = `__YAPPR_SELECTION_PROBE__${Math.random().toString(36).slice(2)}`
  try {
    clipboard.writeText(sentinel)
    // Try the keystroke path first — fastest, works in most apps.
    await exec('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down'])
    await new Promise(r => setTimeout(r, PROBE_WAIT_MS))
    let after = clipboard.readText()
    let usedFallback = false
    // Fallback: drive Edit > Copy menu directly. Chrome hardens against
    // synthetic ⌘C keystrokes; menu-action invocation goes through and
    // can't be ignored by the renderer.
    if (after === sentinel) {
      usedFallback = true
      try {
        await exec('osascript', ['-e', MENU_COPY_SCRIPT])
        await new Promise(r => setTimeout(r, PROBE_WAIT_MS))
        after = clipboard.readText()
      } catch {
        /* keep `after` as sentinel — will be reported as no selection */
      }
    }
    logInfo('Clipboard probe result', {
      sentinelUnchanged: after === sentinel,
      afterChars: after.length,
      afterPreview: after.slice(0, 40),
      usedFallback,
    })
    if (after === sentinel) return ''
    return after
  } catch (err) {
    logInfo('Clipboard probe threw', { message: err instanceof Error ? err.message : 'unknown' })
    return ''
  } finally {
    // Always restore. Non-text clipboard content (images, files) is
    // not round-tripped through this path — known limitation.
    clipboard.writeText(previousText)
  }
}

export function getSelectedText(): string {
  return cachedSelection
}

export function clearSelectedText(): void {
  cachedSelection = ''
}
