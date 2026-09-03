// Pure process-tree analysis for detecting an AI CLI running in (or
// reachable from) a focused editor/terminal's process subtree. Kept
// dependency-free and vitest-covered; the impure `ps`/osascript plumbing
// lives in terminal-ai-cli.ts and calls these.

export interface ProcRow {
  pid: number
  ppid: number
  args: string
}

// Last path segment, without importing node:path (keeps this pure/portable).
function base(token: string): string {
  const seg = token.split('/').pop()
  return seg || token
}

// Native AI-coding CLI executables (2026 catalog). Matched when they are the
// process executable. Under Option B the downstream register is FAITHFUL_AI,
// which is non-destructive (fixes brand-name mishears, preserves every word),
// so a rare collision (e.g. some other `codex`/`amp`/`gemini` binary) costs
// one extra Groq cleanup call — never a mangled transcript. That changed the
// calculus: we now include the popular agentic CLIs even at mild collision
// risk, where before they were excluded to protect the verbatim fast path.
//
// Still EXCLUDED, deliberately: `goose` (Block's agent collides head-on with
// the ubiquitous Go DB-migration tool) and `q` bare (collides with the kdb+/
// JSON `q`) — `q` only matches when qualified by `chat`. A renamed/unlisted
// CLI is a documented false-negative; the planned user-extensible setting is
// the escape hatch.
const DIRECT_AI_BINS = new Set([
  'claude', 'claude-code', 'cursor-agent', 'aider',
  'codex', 'gemini', 'copilot', 'opencode', 'amp',
])
// Wrappers whose argv may reference an AI CLI: JS launchers (npx/bunx/node
// ./.bin/claude) and the Python ecosystem (aider et al. install via pip/uv:
// `uvx aider`, `python -m aider`, `pipx run aider`).
const WRAPPERS = new Set([
  'node', 'bun', 'bunx', 'npm', 'npx', 'pnpm', 'yarn', 'deno',
  'uv', 'uvx', 'pipx', 'python', 'python3',
])
const MULTIPLEXERS = new Set(['tmux', 'screen'])

function normalize(cli: string): string {
  return cli === 'claude-code' ? 'claude' : cli
}

// Classify a single process's full argv as an AI CLI (or not).
export function matchAiCli(args: string): string | null {
  const lower = args.toLowerCase().trim()
  if (!lower) return null
  const tokens = lower.split(/\s+/).filter(Boolean)
  const exe = base(tokens[0])

  if (DIRECT_AI_BINS.has(exe)) return normalize(exe)
  // gh is an AI surface ONLY as `gh copilot` (not `gh pr`, `gh repo`, …).
  if (exe === 'gh') return tokens.includes('copilot') ? 'gh copilot' : null
  // q (Amazon Q) is an AI surface ONLY as `q chat` — bare `q` collides with
  // the kdb+/JSON `q`, so it must be qualified.
  if (exe === 'q') return tokens.includes('chat') ? 'q chat' : null
  // A wrapper process whose argv references a known AI CLI.
  if (WRAPPERS.has(exe)) {
    for (const tk of tokens.slice(1)) {
      const b = base(tk)
      if (DIRECT_AI_BINS.has(b)) return normalize(b)
    }
  }
  return null
}

function isMultiplexer(args: string): boolean {
  const exe = base((args.trim().split(/\s+/)[0] ?? '').toLowerCase())
  return MULTIPLEXERS.has(exe)
}

// Parse `ps -axo pid=,ppid=,args=` output into rows.
export function parsePsArgs(psOutput: string): ProcRow[] {
  const rows: ProcRow[] = []
  for (const line of psOutput.split('\n')) {
    const m = line.trimStart().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    const pid = parseInt(m[1], 10)
    const ppid = parseInt(m[2], 10)
    const args = m[3].trim()
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !args) continue
    rows.push({ pid, ppid, args })
  }
  return rows
}

const MAX_DEPTH = 14

interface Match {
  isAiCli: boolean
  cli?: string
}

// BFS the descendants of `rootPids` looking for an AI CLI. Multiplexer
// (tmux/screen) processes are treated as LEAVES in the primary scan so a
// shared server can't bridge to unrelated panes; if a multiplexer CLIENT is
// seen in the subtree, a bounded fallback then searches multiplexer servers'
// own subtrees (where a `tmux`-hosted `claude` actually lives).
export function findAiCliInTree(rows: ProcRow[], rootPids: number[], opts: { maxDepth?: number } = {}): Match {
  if (rootPids.length === 0) return { isAiCli: false }
  const maxDepth = opts.maxDepth ?? MAX_DEPTH

  const childrenOf = new Map<number, number[]>()
  const argsOf = new Map<number, string>()
  for (const r of rows) {
    argsOf.set(r.pid, r.args)
    const list = childrenOf.get(r.ppid)
    if (list) list.push(r.pid)
    else childrenOf.set(r.ppid, [r.pid])
  }

  let sawMultiplexerClient = false

  function bfs(roots: number[], treatMultiplexerAsLeaf: boolean): Match {
    const visited = new Set<number>()
    const queue: Array<{ pid: number; depth: number }> = roots.map((pid) => ({ pid, depth: 0 }))
    while (queue.length > 0) {
      const { pid, depth } = queue.shift()!
      if (visited.has(pid)) continue
      visited.add(pid)
      const args = argsOf.get(pid)
      if (args != null) {
        const hit = matchAiCli(args)
        if (hit) return { isAiCli: true, cli: hit }
        if (treatMultiplexerAsLeaf && isMultiplexer(args)) {
          // Don't expand a multiplexer's children in the primary scan, but
          // remember we saw one so the fallback can search servers.
          if (!roots.includes(pid)) sawMultiplexerClient = true
          continue
        }
      }
      if (depth >= maxDepth) continue
      const kids = childrenOf.get(pid)
      if (kids) for (const k of kids) queue.push({ pid: k, depth: depth + 1 })
    }
    return { isAiCli: false }
  }

  const primary = bfs(rootPids, true)
  if (primary.isAiCli) return primary

  if (sawMultiplexerClient) {
    const serverPids = rows.filter((r) => isMultiplexer(r.args)).map((r) => r.pid)
    const fallback = bfs(serverPids, false)
    if (fallback.isAiCli) return fallback
  }

  return { isAiCli: false }
}

// ---------------------------------------------------------------------------
// Project roots — the shells that tell us where a project lives
// ---------------------------------------------------------------------------

// The project KEY comes from a window title and is a name, not a path
// ("yappr"), so nothing in the app knows where a project actually lives.
// A shell running in an editor's integrated terminal does: its cwd is the
// project root. That is the only reliable source we have — the editor's
// own argv carries just the binary path, and the AI CLI's cwd resolves to
// a daemon temp dir, not the repo. Both were checked before landing this.
const SHELL_BINS: ReadonlySet<string> = new Set(['zsh', 'bash', 'fish', 'sh', 'dash'])

/**
 * Pids of shell processes. A login shell shows as `-zsh`, so the leading
 * dash is stripped before matching.
 */
export function findShellPids(rows: readonly ProcRow[], limit = 16): number[] {
  const out: number[] = []
  for (const r of rows) {
    if (out.length >= limit) break
    const first = (r.args.trim().split(/\s+/)[0] ?? '').replace(/^-/, '')
    if (SHELL_BINS.has(base(first))) out.push(r.pid)
  }
  return out
}

/**
 * Directories from `lsof -Fn` output.
 *
 * -F is the machine-readable mode: one field per line, prefixed by its
 * type. We asked for cwd only, so every `n` line is a directory. Parsing
 * the human format instead would break on any path containing a space,
 * which on macOS is most of them.
 */
export function parseLsofCwds(stdout: string): string[] {
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    if (line.charCodeAt(0) !== 110 /* 'n' */) continue
    const path = line.slice(1).trim()
    if (path.startsWith('/')) seen.add(path)
  }
  return [...seen]
}
