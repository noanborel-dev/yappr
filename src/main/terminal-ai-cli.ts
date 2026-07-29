import { execFile } from 'child_process'
import { logError } from './log'
import { parsePsArgs, findAiCliInTree } from './proc-tree'

export const TERMINAL_BUNDLE_IDS: ReadonlySet<string> = new Set<string>([
  'com.apple.Terminal',          // Apple Terminal
  'com.googlecode.iterm2',       // iTerm2
  'app.warp.dev',                // Warp
  'com.github.wez.wezterm',      // WezTerm
  'org.alacritty',               // Alacritty
  'net.kovidgoyal.kitty',        // Kitty
  'co.zeit.hyper',               // Hyper
  'org.tabby',                   // Tabby
  'com.mitchellh.ghostty',       // Ghostty
])

// Code editors that host an INTEGRATED terminal. An AI CLI launched there
// (e.g. Claude Code in VS Code's terminal) runs as a descendant of the
// editor's own process — NOT of a standalone-terminal bundle — so the
// scan must root at the editor's pid (captured at focus time) instead of
// pgrep'ing a terminal app. This is the fix for the biggest detection
// gap: integrated terminals carry the editor bundleId, so the old
// standalone-only gate never fired for them.
export const EDITOR_TERMINAL_HOST_BUNDLES: ReadonlySet<string> = new Set<string>([
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.exafunction.windsurf',      // Windsurf
  'com.microsoft.VSCode',          // VS Code
  'dev.zed.zed',                   // Zed
  'com.google.antigravity',        // Google Antigravity
  'com.github.atom',               // Atom
  'org.gnu.Emacs',                 // Emacs
  'com.replit.ReplitDesktop',      // Replit
  'com.apple.dt.Xcode',            // Xcode
])

// The catalog of AI-CLI binaries (and the argv/wrapper/tmux matching) now
// lives in proc-tree.ts (pure, unit-tested) — this module only does the
// impure `ps`/pgrep plumbing and hands rows to findAiCliInTree.

// AppleScript "tell application ... to unix id" needs the app's display
// name, not the bundle ID. Map known terminals to their AppleScript name.
const TERMINAL_APPLESCRIPT_NAMES: Record<string, string> = {
  'com.apple.Terminal': 'Terminal',
  'com.googlecode.iterm2': 'iTerm',
  'app.warp.dev': 'Warp',
  'com.github.wez.wezterm': 'WezTerm',
  'org.alacritty': 'Alacritty',
  'net.kovidgoyal.kitty': 'kitty',
  'co.zeit.hyper': 'Hyper',
  'org.tabby': 'Tabby',
  'com.mitchellh.ghostty': 'Ghostty',
}

const PROBE_TIMEOUT_MS = 100

function execWithTimeout(file: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
    // execFile's own timeout sends SIGTERM; add a hard kill safety net.
    const t = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already exited */ }
      reject(new Error('probe timeout'))
    }, timeoutMs + 20)
    child.on('exit', () => clearTimeout(t))
  })
}

async function getTerminalPids(bundleId: string): Promise<number[]> {
  const appName = TERMINAL_APPLESCRIPT_NAMES[bundleId]
  if (!appName) return []
  // `pgrep -x` matches the exact process name (truncated to 15 chars by
  // the kernel, but pgrep handles that). Faster and side-effect-free
  // compared to osascript (~1s cold).
  try {
    const out = await execWithTimeout('/usr/bin/pgrep', ['-x', appName.slice(0, 15)], PROBE_TIMEOUT_MS)
    return out.split('\n').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
  } catch {
    return []
  }
}

// Is a known AI CLI running in (or reachable from) the focused app's
// process subtree? For a standalone terminal we scan the descendants of
// the terminal app's pids (resolved via pgrep). For a code editor we scan
// the descendants of the editor's own pid (captured at focus time), which
// covers AI CLIs running in its integrated terminal. Returns false fast
// for any other app. Hard-capped by PROBE_TIMEOUT_MS — this is a free,
// local SIGNAL on the hot path, never an LLM call.
export async function focusedAppRunningAiCli(opts: {
  bundleId: string
  rootPid?: number
}): Promise<{ isAiCli: boolean; cli?: string }> {
  const { bundleId, rootPid } = opts
  const isTerminal = TERMINAL_BUNDLE_IDS.has(bundleId)
  const isEditorHost = EDITOR_TERMINAL_HOST_BUNDLES.has(bundleId)
  if (!isTerminal && !isEditorHost) return { isAiCli: false }

  try {
    return await Promise.race([
      detectAiCli(bundleId, isTerminal, rootPid),
      new Promise<{ isAiCli: false }>((resolve) => {
        setTimeout(() => resolve({ isAiCli: false }), PROBE_TIMEOUT_MS + 30)
      }),
    ])
  } catch (err) {
    logError('terminal-ai-cli probe failed', err)
    return { isAiCli: false }
  }
}

async function detectAiCli(
  bundleId: string,
  isTerminal: boolean,
  rootPid?: number,
): Promise<{ isAiCli: boolean; cli?: string }> {
  // Resolve the pids to root the scan at.
  const rootPids = isTerminal
    ? await getTerminalPids(bundleId)
    : rootPid && rootPid > 0 ? [rootPid] : []
  if (rootPids.length === 0) return { isAiCli: false }

  let psOut: string
  try {
    // Full argv (not truncated `comm`) so wrapper invocations
    // (`node …/.bin/claude`, `npx @anthropic-ai/claude-code`, `uvx aider`)
    // are visible to the matcher.
    psOut = await execWithTimeout('/bin/ps', ['-axo', 'pid=,ppid=,args='], PROBE_TIMEOUT_MS)
  } catch {
    return { isAiCli: false }
  }

  return findAiCliInTree(parsePsArgs(psOut), rootPids)
}
