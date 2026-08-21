import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  APP_CATEGORY_MAP,
  BROWSER_BUNDLE_IDS,
  BROWSER_TITLE_ROUTES,
  BROWSER_URL_ROUTES,
} from '../shared/constants'
import { readActiveTab } from './browser-tab'
import { logInfo } from './log'
import { TERMINAL_BUNDLE_IDS, EDITOR_TERMINAL_HOST_BUNDLES } from './terminal-ai-cli'
import type { ProjectSurface } from './context/project-key'
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
  // The frontmost window title, kept so project-scoped context can derive
  // a project key from it (context/project-key.ts). It was already being
  // fetched for surface resolution and then discarded.
  //
  // This is USER CONTENT — a document name, a chat subject, a browser tab.
  // It must never be logged.
  windowTitle: string
  // Which project-key strategy applies. Resolved here because this module
  // already owns the bundle-id tables; keeping the mapping here is what
  // lets project-key.ts stay pure and testable.
  surface: ProjectSurface
  // Active tab title for browsers, needed to name a Lovable/v0/Bolt
  // project. Also user content — never logged.
  tabTitle: string | null
}

// Module-level cache populated by captureFocusedApp(). The full
// pipeline reads this synchronously, avoiding the ~500ms osascript
// round-trip on the hot path.
let cached: FocusedApp = {
  bundleId: 'unknown',
  name: 'Unknown',
  category: 'other',
  pid: 0,
  windowTitle: '',
  surface: 'other',
  tabTitle: null,
}

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

// Apply browser routing: if the focused app is a browser, work out
// which WEB APP the user is actually in (Gmail / Slack / Notion / …)
// and override the category accordingly. Returns the original values
// when not a browser or nothing matched.
//
// Signals, in order of reliability:
//   1. the active tab's URL, read from the browser itself. Exact, and
//      the only signal Chromium browsers give us at all — their AX
//      tree reports zero windows, so `windowTitle` is always empty
//      there and step 3 can never fire (this is what left Gmail-in-
//      Chrome categorised as 'other').
//   2. the active tab's TITLE, same source. Covers a web app whose
//      host isn't in the URL table.
//   3. the window title from System Events. Firefox and any browser
//      whose automation permission the user declined.
//
// Exported for tests — the routing table is the whole behaviour here.
export function resolveSurface(
  bundleId: string,
  appName: string,
  windowTitle: string,
  tab: { url: string; title: string } | null,
): { name: string; category: AppCategory } {
  if (BROWSER_BUNDLE_IDS.has(bundleId)) {
    if (tab?.url) {
      for (const route of BROWSER_URL_ROUTES) {
        if (route.pattern.test(tab.url)) {
          return { name: route.appName, category: route.category }
        }
      }
    }
    for (const title of [tab?.title, windowTitle]) {
      if (!title) continue
      for (const route of BROWSER_TITLE_ROUTES) {
        if (route.pattern.test(title)) {
          return { name: route.appName, category: route.category }
        }
      }
    }
  }
  return { name: appName, category: APP_CATEGORY_MAP[bundleId] ?? 'other' }
}

// Which project-key strategy a bundle id implies. Editors are checked
// before terminals because a couple of bundles (Replit desktop) appear in
// both sets, and the editor title format is the more specific one.
export function resolveProjectSurface(bundleId: string): ProjectSurface {
  if (EDITOR_TERMINAL_HOST_BUNDLES.has(bundleId)) return 'editor'
  if (TERMINAL_BUNDLE_IDS.has(bundleId)) return 'terminal'
  if (BROWSER_BUNDLE_IDS.has(bundleId)) return 'browser'
  return 'other'
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
    // Second osascript, browsers only: ask the browser what tab is
    // open. Both callers (hotkey press, release-time refresh) overlap
    // this with recording or transcription, so the ~50-100ms is free.
    const tab = BROWSER_BUNDLE_IDS.has(bundleId) ? await readActiveTab(bundleId) : null
    const resolved = resolveSurface(bundleId, appName, windowTitle, tab)
    if (tab && resolved.name !== appName) {
      logInfo('Browser surface resolved', {
        app: resolved.name,
        category: resolved.category,
        host: hostOf(tab.url),
      })
    }
    cached = {
      bundleId,
      name: resolved.name,
      category: resolved.category,
      pid,
      windowTitle,
      surface: resolveProjectSurface(bundleId),
      tabTitle: tab?.title ?? null,
    }
  } catch {
    // Keep stale cache rather than reset to 'unknown'.
  }
}

// Host only — the full URL of a private tab has no business in a log
// file that users are asked to attach to bug reports.
function hostOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/?#:]+)/i)
  return m ? m[1] : ''
}

// Synchronous read of the cached frontmost app. Cheap.
export function getFocusedApp(): FocusedApp {
  return cached
}
