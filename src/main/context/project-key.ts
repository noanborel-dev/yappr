// Which project is the user dictating INTO.
//
// Context memory stores one blob today, so a fact learned while working
// on one project gets injected into prompts for every other one. That is
// both a token cost and a quality cost — a smaller, focused context beats
// a large one on the same question. Scoping facts to a project key fixes
// that, and the key has to come from something we already have: the
// frontmost window title.
//
// The governing rule is NEVER GUESS. A wrong key is worse than no key:
// it silently files facts under the wrong project and then feeds them
// back as if they were true there. Every strategy below returns null the
// moment it is not confident, and null means the unsorted bucket.
//
// Pure — no electron, no store, no bundle-id tables. The caller resolves
// bundle id to a surface (it already owns those sets) and passes the
// titles in, which keeps this unit-testable and stops the bundle lists
// being duplicated.

export type ProjectSurface = 'editor' | 'terminal' | 'browser' | 'other'

export interface ProjectKeySource {
  surface: ProjectSurface
  /** Frontmost window title from the accessibility API. */
  windowTitle: string
  /** Resolved surface name for browsers — 'Lovable', 'v0', 'Bolt'. */
  appName?: string | null
  /**
   * Does this surface OWN a project whose name its title carries?
   *
   * Lovable, v0, Bolt and Replit do: the tab is a project you are
   * building, and its title is that project's name. Claude, ChatGPT and
   * Gemini do not: the tab is a CONVERSATION, and its title is whatever
   * the chat happened to be about.
   *
   * Without this the two were indistinguishable, and real installs ended
   * up with project cards called "creating tiktok-style slideshows for
   * yapper" and "full macos app redesign mockup" — chat titles filed as
   * codebases. Wrong keys are worse than missing ones: a missing key is
   * visibly unsorted, a wrong one silently feeds one project's facts
   * into another.
   *
   * The caller decides, because it owns the app tables.
   */
  appOwnsProject?: boolean
  /** Active tab title, browsers only. */
  tabTitle?: string | null
}

/** Where facts go when no key can be parsed confidently. */
export const UNSORTED_BUCKET = 'unsorted'

/** Scope key for facts about the user rather than any one project. */
export const GLOBAL_SCOPE = 'global'

// Editors put their own name in the title bar, terminals put the shell
// and the window size. None of those is a project.
const TITLE_NOISE = new Set([
  'visual studio code',
  'code',
  'cursor',
  'windsurf',
  'zed',
  'antigravity',
  'atom',
  'emacs',
  'xcode',
  'replit',
  'zsh',
  '-zsh',
  'bash',
  '-bash',
  'fish',
  '-fish',
  'sh',
  'login',
  'tmux',
  'ssh',
])

// Titles that exist but name nothing. Filing under "untitled" would merge
// unrelated work into one bucket, which is exactly the failure the key is
// meant to prevent.
const GENERIC_KEYS = new Set([
  'untitled',
  'untitled-1',
  'new tab',
  'new file',
  'home',
  'index',
  'dashboard',
  'welcome',
  'get started',
  'start',
  'blank',
  'documents',
  'desktop',
  'downloads',
  'projects',
  'code',
  'src',
  'tmp',
  'temp',
  'work',
])

// A project key is a folder or product name. Long strings are almost
// always a sentence, a document title, or an error message.
const MAX_KEY_CHARS = 64

// macOS window titles separate with an em-dash; some apps use an en-dash.
// A plain hyphen is NOT a separator — folder and product names contain
// hyphens constantly ("claude-code", "next-app"), and splitting on it
// would shred them.
const SEPARATOR_RE = /\s+[—–]\s+/

/**
 * Lowercase, collapse whitespace, and reject anything that is not a
 * plausible project name. Returns null rather than a bad key.
 */
export function normalizeProjectKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const key = raw
    // VS Code marks unsaved files with a bullet; Xcode uses similar marks.
    .replace(/^[•●◦*]\s*/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (!key) return null
  if (key.length > MAX_KEY_CHARS) return null
  if (TITLE_NOISE.has(key)) return null
  if (GENERIC_KEYS.has(key)) return null
  // A bare filename is a file, not a project.
  if (isFilename(key)) return null
  // Reject things that are clearly prose rather than a name.
  if (key.split(' ').length > 6) return null
  return key
}

// "index.tsx" is a file; "yappr" is a project. Used to avoid filing facts
// under whatever file happened to be open.
function isFilename(segment: string): boolean {
  return /\.[a-z0-9]{1,5}$/i.test(segment.trim())
}

function splitTitle(title: string): string[] {
  return title
    .split(SEPARATOR_RE)
    .map(s => s.trim())
    .filter(Boolean)
}

function isNoise(segment: string): boolean {
  return TITLE_NOISE.has(segment.trim().toLowerCase())
}

// Terminal.app appends the window size ("80×24"); drop it.
function isWindowSize(segment: string): boolean {
  return /^\d+\s*[×x]\s*\d+$/i.test(segment.trim())
}

/**
 * Editors: "index.tsx — yappr" → "yappr".
 *
 * The project is the last meaningful segment, because the editor's own
 * name (when present) trails it: "index.tsx — yappr — Visual Studio Code".
 * A title with only a filename in it names no project.
 */
function fromEditorTitle(title: string): string | null {
  const segments = splitTitle(title).filter(s => !isNoise(s))
  if (segments.length === 0) return null
  const last = segments[segments.length - 1]
  // Single segment that is a filename → a loose file, no project folder.
  if (segments.length === 1 && isFilename(last)) return null
  return normalizeProjectKey(last)
}

/**
 * Terminals: the cwd's last path segment.
 *
 * Shapes seen in the wild:
 *   "Yappr — -zsh — 80×24"        (Terminal.app: folder name already)
 *   "~/dev/yappr"                  (iTerm2, Ghostty)
 *   "noan@Mac: ~/dev/yappr"        (default bash PROMPT_COMMAND)
 */
function fromTerminalTitle(title: string): string | null {
  const segments = splitTitle(title).filter(s => !isNoise(s) && !isWindowSize(s))
  if (segments.length === 0) return null
  // The cwd comes first in every shape above; later segments are the
  // shell and the geometry, both already dropped.
  let candidate = segments[0]
  // Strip a "user@host:" prefix.
  candidate = candidate.replace(/^[^\s:]+@[^\s:]+:\s*/, '').trim()
  if (!candidate) return null
  if (candidate.includes('/')) {
    // Home itself is not a project, and neither is the filesystem root.
    const trimmed = candidate.replace(/\/+$/, '')
    if (trimmed === '~' || trimmed === '') return null
    const lastSegment = trimmed.split('/').filter(Boolean).pop()
    if (!lastSegment || lastSegment === '~') return null
    return normalizeProjectKey(lastSegment)
  }
  if (candidate === '~') return null
  return normalizeProjectKey(candidate)
}

/**
 * Browser app-builders: "yappr – Lovable" → "yappr".
 *
 * Only runs for surfaces we resolved to a known builder, so a random tab
 * can never mint a project. The builder's own name is dropped wherever it
 * sits, and what remains must be a single plausible name.
 */
function fromBrowserTitle(
  title: string,
  appName: string | null | undefined,
  appOwnsProject: boolean,
): string | null {
  // A chat surface names conversations, not projects.
  if (!appOwnsProject) return null
  if (!appName) return null
  const app = appName.trim().toLowerCase()
  if (!app) return null
  const segments = title
    // Builders are inconsistent: en-dash, em-dash, pipe and " - " all
    // appear. Unlike editor titles these are product-generated, so the
    // hyphen form is safe enough to split on here.
    .split(/\s+[—–|]\s+|\s+-\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => {
      const lower = s.toLowerCase()
      if (lower === app) return false
      // "v0 by Vercel", "Bolt.new", "Replit — the collaborative IDE"
      if (lower.startsWith(`${app} by `)) return false
      if (lower === `${app}.new` || lower === `${app}.dev` || lower === `${app}.app`) return false
      return true
    })
  if (segments.length !== 1) return null
  return normalizeProjectKey(segments[0])
}

/**
 * Derive the project key for a dictation, or null when nothing can be
 * parsed confidently. Null is not a failure — it routes to the unsorted
 * bucket, which is strictly better than guessing wrong.
 */
export function extractProjectKey(src: ProjectKeySource): string | null {
  const title = (src.windowTitle ?? '').trim()
  switch (src.surface) {
    case 'editor':
      return title ? fromEditorTitle(title) : null
    case 'terminal':
      return title ? fromTerminalTitle(title) : null
    case 'browser': {
      // Prefer the tab title: the window title of a browser is usually
      // the tab title anyway, but it can lag behind on tab switch.
      const tab = (src.tabTitle ?? '').trim() || title
      return tab ? fromBrowserTitle(tab, src.appName, src.appOwnsProject === true) : null
    }
    default:
      return null
  }
}

/**
 * Aliases: folder names that mean the same project as something else.
 *
 * A project key comes from a window title, which comes from a directory
 * name, which is whatever the folder happened to be called when it was
 * cloned. A user working in ~/OpenFlow on an app called Yappr gets a
 * bucket named "openflow" — correct about the folder and useless as a
 * name for what they are building.
 *
 * The map is from the FOLDER name to the real one, so renaming the
 * directory later is harmless: the alias simply stops matching, and the
 * key it produced is the one it was already producing.
 */
const PROJECT_ALIASES: Record<string, string> = {
  openflow: 'yappr',
}

/**
 * Resolve a raw key to its canonical project.
 *
 * Exported so the same rule applies wherever a key is derived — a fact
 * mined under "openflow" and one mined under "yappr" must not end up in
 * two buckets that the user then has to merge by hand.
 */
export function canonicalProjectKey(key: string | null): string | null {
  if (!key) return null
  return PROJECT_ALIASES[key] ?? key
}

/** The bucket a fact should be filed under, never null. */
export function projectBucket(src: ProjectKeySource): string {
  return canonicalProjectKey(extractProjectKey(src)) ?? UNSORTED_BUCKET
}
