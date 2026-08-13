// Reads the active tab's URL + title from the frontmost browser.
//
// WHY THIS EXISTS: the focused-app probe used to route browser surfaces
// off the window title fetched through System Events. That works for
// Firefox and native apps, but Chromium browsers publish nothing to the
// accessibility API until an assistive client turns their AX layer on —
// with a visible Gmail window open, `count of windows of application
// process "Google Chrome"` returns 0 and `name of front window` raises
// -1719. The title therefore arrived empty and Gmail-in-Chrome was
// categorised as 'other', so dictation into a compose box got generic
// prose polish instead of the email prompt.
//
// Browsers do answer their OWN AppleScript dictionary, so we ask them
// directly. Costs one osascript (~50-100ms) and only for browsers; both
// call sites overlap it with recording or transcription.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { logInfo } from './log'

const exec = promisify(execFile)

// bundleId → the name AppleScript knows the browser by. Chromium-family
// browsers all share the `active tab of front window` vocabulary.
const CHROMIUM_APP_NAMES: Record<string, string> = {
  'com.google.Chrome': 'Google Chrome',
  'com.google.Chrome.canary': 'Google Chrome Canary',
  'com.brave.Browser': 'Brave Browser',
  'com.microsoft.edgemac': 'Microsoft Edge',
  'com.vivaldi.Vivaldi': 'Vivaldi',
  'com.operasoftware.Opera': 'Opera',
  'company.thebrowser.Browser': 'Arc',
}

// WebKit-family: tabs are `documents`, not `tabs`.
const WEBKIT_APP_NAMES: Record<string, string> = {
  'com.apple.Safari': 'Safari',
  'com.apple.SafariTechnologyPreview': 'Safari Technology Preview',
}

// Firefox has no AppleScript vocabulary for tabs — deliberately absent
// from both maps. It exposes its window title through the accessibility
// API, so title routing still covers it.

// URL and title are returned on separate lines: neither can contain a
// newline, whereas both can contain the '|' that the focused-app probe
// uses, and a raw '|' in a query string would truncate the URL.
function chromiumScript(appName: string): string {
  return `
tell application "${appName}"
  if (count of windows) is 0 then return ""
  set theTab to active tab of front window
  try
    set theUrl to URL of theTab
  on error
    -- Arc exposes the address as "location" instead of "URL".
    set theUrl to location of theTab
  end try
  return theUrl & linefeed & (title of theTab)
end tell
`
}

function webkitScript(appName: string): string {
  return `
tell application "${appName}"
  if (count of documents) is 0 then return ""
  return (URL of front document) & linefeed & (name of front document)
end tell
`
}

export interface BrowserTab {
  url: string
  title: string
}

export function isSupportedBrowser(bundleId: string): boolean {
  return bundleId in CHROMIUM_APP_NAMES || bundleId in WEBKIT_APP_NAMES
}

// One log line per bundle per session. A user who declines the
// automation prompt would otherwise get a line on every dictation.
const loggedFailures = new Set<string>()

export function parseTabReply(stdout: string): BrowserTab | null {
  const text = stdout.replace(/\r/g, '')
  const nl = text.indexOf('\n')
  if (nl === -1) {
    const only = text.trim()
    return only.length > 0 ? { url: only, title: '' } : null
  }
  const url = text.slice(0, nl).trim()
  const title = text.slice(nl + 1).trim()
  if (url.length === 0) return null
  return { url, title }
}

// Returns null when the browser is unsupported, has no window, or the
// user has not granted Apple-events automation for it. Callers fall
// back to window-title routing.
export async function readActiveTab(bundleId: string): Promise<BrowserTab | null> {
  if (process.platform !== 'darwin') return null
  const chromium = CHROMIUM_APP_NAMES[bundleId]
  const webkit = WEBKIT_APP_NAMES[bundleId]
  if (!chromium && !webkit) return null
  const script = chromium ? chromiumScript(chromium) : webkitScript(webkit)
  try {
    // Hard timeout: a hung browser must never stall the pipeline. The
    // call normally returns in well under 100ms.
    const { stdout } = await exec('osascript', ['-e', script], { timeout: 1500 })
    return parseTabReply(stdout)
  } catch (err) {
    // -1743 is "not authorized to send Apple events" (the user declined
    // the automation prompt). Everything else is a browser that shut a
    // window mid-call or a script error. Both degrade to title routing.
    if (!loggedFailures.has(bundleId)) {
      loggedFailures.add(bundleId)
      logInfo('Active-tab read failed — falling back to window title', {
        bundleId,
        message: err instanceof Error ? err.message.split('\n')[0] : 'unknown',
      })
    }
    return null
  }
}
