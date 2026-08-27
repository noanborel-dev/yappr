import { clipboard } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { logInfo } from './log'
import { axText } from './ax-value'
import { getFocusedApp } from './focused-app'
import { BROWSER_BUNDLE_IDS, AX_OPAQUE_APPS } from '../shared/constants'

const exec = promisify(execFile)

// Persistent osascript helper — keeps a long-lived process alive that
// reads scripts from stdin. The classic per-paste `exec('osascript', ...)`
// spends ~120ms forking + compiling AppleScript on every dictation;
// reusing one process drops paste latency to roughly the cost of writing
// a few bytes to a pipe (~5–10ms).
//
// We use fire-and-forget semantics: once stdin.write returns, AppleScript
// is queued for execution and `keystroke ... using command down` is
// synchronous from there. We do NOT try to parse osascript's stdout for
// a "done" signal — that turned out to be unreliable in piped mode.
//
// On any failure (helper crashed, stdin closed, write error) we fall back
// to a one-shot exec which is the previous, slower-but-reliable path.
let helper: ChildProcess | null = null

const PASTE_LINE = 'tell application "System Events" to keystroke "v" using command down\n'

function startHelper(): void {
  try {
    const child = spawn('osascript', ['-i'], { stdio: ['pipe', 'pipe', 'pipe'] })
    child.on('exit', () => { if (helper === child) helper = null })
    child.on('error', () => { if (helper === child) helper = null })
    // Drain stdout/stderr so the OS pipe buffers don't fill and stall
    // the child process. We don't care about the contents.
    child.stdout?.on('data', () => { /* drain */ })
    child.stderr?.on('data', () => { /* drain */ })
    helper = child
  } catch {
    helper = null
  }
}

function pasteViaHelper(): boolean {
  const h = helper
  if (!h || !h.stdin || h.stdin.destroyed || !h.stdin.writable) return false
  try {
    return h.stdin.write(PASTE_LINE)
  } catch {
    return false
  }
}

// AX roles where firing ⌘V is meaningless — the focused element is a
// button, image, list row, etc. that can't accept text. Hitting paste
// against these used to be the most common reason a dictation
// "succeeded" but nothing visible appeared.
const NON_PASTEABLE_ROLES = new Set([
  'AXButton', 'AXLink', 'AXMenuItem', 'AXMenuBar', 'AXMenu', 'AXMenuButton',
  'AXImage', 'AXIcon', 'AXStaticText',
  'AXOutline', 'AXTable', 'AXRow', 'AXCell', 'AXColumn',
  'AXBrowser', 'AXList', 'AXTabGroup', 'AXTab',
  'AXSlider', 'AXProgressIndicator',
  'AXCheckBox', 'AXRadioButton', 'AXPopUpButton',
  'AXDisclosureTriangle',
])

// Live AX-role probe — fired at paste time (or by the pipeline,
// concurrently with cleanup, so the wait overlaps with LLM latency
// and adds no hot-path time). Returns the role of whatever has
// keyboard focus AT THE MOMENT THE PROMISE IS CREATED, which is the
// only reading that makes sense — the user might have moved between
// apps while dictating.
const FOCUSED_ROLE_SCRIPT = `
tell application "System Events"
  try
    set frontApp to first application process whose frontmost is true
    try
      set focusedEl to value of attribute "AXFocusedUIElement" of frontApp
      -- nil is not an error here. Without these the caller gets the
      -- string "missing value" as the AX role, which matches no role it
      -- tests for, so every branch falls through to its else. Same trap
      -- that made the rewrite gesture paste "missing value"; see
      -- ax-value.ts.
      if focusedEl is missing value then return "no-focus"
      set r to value of attribute "AXRole" of focusedEl
      if r is missing value then return "no-focus"
      return r
    on error
      return "no-focus"
    end try
  on error
    return "script-error"
  end try
end tell
`

export async function probeFocusedAXRole(): Promise<string> {
  if (process.platform !== 'darwin') return 'script-error'
  try {
    const { stdout } = await exec('osascript', ['-e', FOCUSED_ROLE_SCRIPT])
    // axText collapses a nil that survived the script to '', which then
    // reads as 'script-error' rather than as a role nothing matches.
    return axText(stdout) || 'script-error'
  } catch {
    return 'script-error'
  }
}

// Press-time AX-role cache. We fire probeFocusedAXRole() at hotkey
// press so the slow osascript (~1100ms on this machine) overlaps with
// recording — by the time the pipeline runs, the role is cached and
// the paste step doesn't block.
//
// Why this is safe vs. probing at paste time: the role is only used
// to decide "should we attempt the ⌘V keystroke, or fall back to the
// clipboard popup?" The keystroke itself targets whatever has focus
// at the moment of the keystroke, NOT whatever was focused when the
// probe ran. So a stale role only causes a wrong decision in two
// edge cases:
//   1. User starts in a text field, moves to a non-text element
//      (Finder file list, button) mid-dictation → we try ⌘V which
//      does nothing visible. Same outcome as today's stale cache when
//      AX permission is denied.
//   2. User starts in a non-text element, moves to a text field
//      mid-dictation → we incorrectly route to fallback instead of
//      pasting. Annoying but recoverable (user clicks Retry).
// Both are rare; the latency win on the common case is decisive.
let pressTimeAXPromise: Promise<string> | null = null

export function captureAXRoleAtPress(): void {
  if (process.platform !== 'darwin') return
  pressTimeAXPromise = probeFocusedAXRole()
}

export function getPressTimeAXRolePromise(): Promise<string> | null {
  return pressTimeAXPromise
}

// Apps where AXGroup / AXScrollArea / generic roles mean "no text
// destination". For these we require an EXPLICIT text-input role
// before allowing paste; everything else routes to the fallback.
//
// Finder is the canonical case: it returns AXGroup when a window is
// focused but no text field is being edited. Paste would fire into
// the file list and do nothing visible. Add more bundle IDs here as
// we discover other "non-text-app" cases.
const STRICT_PASTE_APPS = new Set<string>([
  'com.apple.finder',
])

const EXPLICIT_TEXT_ROLES = new Set([
  'AXTextField', 'AXTextArea', 'AXComboBox', 'AXSearchField',
])

function canPasteIntoRole(role: string, bundleId: string): boolean {
  // 'no-focus' in browsers and Electron apps is a lie — their AX tree
  // is opaque past the web-view boundary and reports no focus even
  // when the user is typing into a contenteditable. Trust the
  // keystroke to land where the OS thinks focus actually is.
  if (role === 'no-focus' || role === '') {
    if (BROWSER_BUNDLE_IDS.has(bundleId) || AX_OPAQUE_APPS.has(bundleId)) return true
    return false
  }
  // Script error → AX permission probably denied. We've already given
  // up trying to be clever; let the actual paste attempt happen and
  // surface whatever error it produces.
  if (role === 'script-error') return true
  if (NON_PASTEABLE_ROLES.has(role)) return false
  // Strict apps: require an explicit text-input role. Catches Finder
  // (and similar) where AXGroup focus means "no text field anywhere".
  if (STRICT_PASTE_APPS.has(bundleId)) {
    return EXPLICIT_TEXT_ROLES.has(role)
  }
  // Permissive default — most apps with AXGroup/AXScrollArea focus
  // (Slack, Discord, Notion, Chrome) really DO have a focused
  // contenteditable underneath.
  return true
}

export interface PasteOptions {
  // The pipeline kicks off the AX-role probe concurrently with the
  // cleanup LLM so the result is ready when paste runs — no extra
  // hot-path osascript. Callers that don't have one (paste-last from
  // history, etc.) get a fresh probe fired here unless they set
  // skipAxGate.
  rolePromise?: Promise<string>
  // Skip the AX-role gate entirely. Used by code paths where the
  // user has explicitly asked us to paste (Insert button on the
  // fallback popup, double-tap paste-last) — the AX probe at those
  // moments sees Yappr's own popup/indicator as the focused
  // window and incorrectly routes BACK to the fallback. Bypassing
  // the gate makes the keystroke fire against whatever the OS
  // considers focused at that millisecond, which in practice is
  // the user's intended target after click-to-focus settles.
  skipAxGate?: boolean
}

export async function pasteText(
  text: string,
  options: PasteOptions = {},
): Promise<{ method: 'paste' | 'clipboard' }> {
  clipboard.writeText(text)

  if (process.platform !== 'darwin') {
    return { method: 'clipboard' }
  }

  if (!options.skipAxGate) {
    const role = await (options.rolePromise ?? probeFocusedAXRole())
    const { bundleId } = getFocusedApp()
    const canPaste = canPasteIntoRole(role, bundleId)
    if (!canPaste) {
      logInfo('Paste blocked — falling back to clipboard', { bundleId, focusedAXRole: role })
      return { method: 'clipboard' }
    }
  }

  // Lazily start the helper on first paste, then reuse it forever.
  if (!helper) startHelper()

  if (pasteViaHelper()) {
    return { method: 'paste' }
  }

  // Fallback: one-shot exec. Slower but reliable.
  try {
    await exec('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])
    return { method: 'paste' }
  } catch {
    return { method: 'clipboard' }
  }
}

// Spawn the helper proactively at app startup so the first paste doesn't
// pay the spawn cost. No-op on non-darwin or if already started.
export function prewarmPasteHelper(): void {
  if (process.platform !== 'darwin') return
  if (!helper) startHelper()
}

export function shutdownPasteHelper(): void {
  if (helper) {
    try { helper.kill() } catch { /* ignore */ }
    helper = null
  }
}
