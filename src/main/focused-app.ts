import { execFile } from 'child_process'
import { promisify } from 'util'
import { APP_CATEGORY_MAP, BROWSER_BUNDLE_IDS, BROWSER_TITLE_ROUTES } from '../shared/constants'
import type { AppCategory } from '../shared/types'

const exec = promisify(execFile)

export interface FocusedApp {
  bundleId: string
  name: string
  category: AppCategory
  // Unix PID of the frontmost app process. Roots the process-tree scan
  // that looks for an AI CLI running in an editor's integrated terminal
  // (see terminal-ai-cli.ts). 0 when unknown.
  pid: number
}

// Module-level cache populated by captureFocusedApp(). The full
// pipeline reads this synchronously, avoiding the ~500ms osascript
// round-trip on the hot path.
let cached: FocusedApp = { bundleId: 'unknown', name: 'Unknown', category: 'other', pid: 0 }

// Fetch bundle ID, app name, the front window title, AND the process's
// unix PID. The title is what lets us tell Gmail-in-Chrome from
// Slack-in-Chrome; the PID roots the integrated-terminal AI-CLI scan.
// The title fetch is wrapped in try/end so apps that block window-name
// access don't fail the whole call.
const APPLESCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set bundleId to bundle identifier of frontApp
  set appName to name of frontApp
  set frontPid to unix id of frontApp
  set windowTitle to ""
  try
    set windowTitle to name of front window of frontApp
  end try
  return bundleId & "|" & appName & "|" & windowTitle & "|" & frontPid
end tell
`

// Apply browser-title routing: if the focused app is a browser, look
// at the window title to detect Gmail / Slack / Notion / etc. and
// override the category accordingly. Returns the original values when
// not a browser or no title pattern matched.
function resolveCategory(
  bundleId: string,
  appName: string,
  windowTitle: string
): { name: string; category: AppCategory } {
  if (BROWSER_BUNDLE_IDS.has(bundleId) && windowTitle) {
    for (const route of BROWSER_TITLE_ROUTES) {
      if (route.pattern.test(windowTitle)) {
        return { name: route.appName, category: route.category }
      }
    }
  }
  return { name: appName, category: APP_CATEGORY_MAP[bundleId] ?? 'other' }
}

// Async-fetch the frontmost app and stash it in the module cache. Call
// this when the user presses the hotkey; by the time recording ends and
// the pipeline runs, the cache is warm. Falls back to whatever was
// cached previously on error.
// Split the AppleScript's `bundleId|appName|windowTitle|pid` line.
//
// The window title is USER CONTENT and routinely contains '|' — shells and
// browsers put pipes in titles all the time. Indexing the 4th field would
// then pick up a fragment of the title, the pid would parse to NaN → 0, and
// the integrated-terminal AI-CLI scan would silently stop working with no
// error anywhere. The pid is always LAST and neither the bundle id nor the
// app name can contain '|', so anchor at both ends and let the title keep
// whatever is in the middle.
export function parseFocusLine(stdout: string): {
  bundleId: string
  appName: string
  windowTitle: string
  pid: number
} {
  const parts = stdout.trim().split('|')
  const bundleId = parts[0] ?? ''
  const appName = parts[1] ?? ''
  // Fewer than 4 fields means an older/degraded reply with no pid.
  const hasPid = parts.length > 3
  const windowTitle = hasPid ? parts.slice(2, -1).join('|') : (parts[2] ?? '')
  const pid = hasPid ? parseInt((parts[parts.length - 1] ?? '').trim(), 10) : NaN
  return {
    bundleId,
    appName,
    windowTitle,
    pid: Number.isFinite(pid) && pid > 0 ? pid : 0,
  }
}

export async function captureFocusedApp(): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    const { stdout } = await exec('osascript', ['-e', APPLESCRIPT])
    const { bundleId, appName, windowTitle, pid } = parseFocusLine(stdout)
    const resolved = resolveCategory(bundleId, appName, windowTitle)
    cached = {
      bundleId,
      name: resolved.name,
      category: resolved.category,
      pid,
    }
  } catch {
    // Keep stale cache rather than reset to 'unknown'.
  }
}

// Synchronous read of the cached frontmost app. Cheap.
export function getFocusedApp(): FocusedApp {
  return cached
}
