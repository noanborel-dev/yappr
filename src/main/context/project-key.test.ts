import { describe, it, expect } from 'vitest'
import {
  extractProjectKey,
  normalizeProjectKey,
  projectBucket,
  canonicalProjectKey,
  UNSORTED_BUCKET,
  type ProjectKeySource,
} from './project-key'

const editor = (windowTitle: string): ProjectKeySource => ({ surface: 'editor', windowTitle })
const terminal = (windowTitle: string): ProjectKeySource => ({ surface: 'terminal', windowTitle })
// An app-BUILDER: the tab is a project and its title is that project's
// name. Distinct from `chat` below, where the title is a conversation.
const browser = (tabTitle: string, appName: string): ProjectKeySource => ({
  surface: 'browser',
  windowTitle: tabTitle,
  tabTitle,
  appName,
  appOwnsProject: true,
})

const chat = (tabTitle: string, appName: string): ProjectKeySource => ({
  surface: 'browser',
  windowTitle: tabTitle,
  tabTitle,
  appName,
  appOwnsProject: false,
})

describe('editor titles', () => {
  // The shape named in the spec.
  it('takes the segment after the em-dash', () => {
    expect(extractProjectKey(editor('index.tsx — yappr'))).toBe('yappr')
  })

  // VS Code appends its own name, so "last segment" alone would return
  // the editor rather than the project.
  it('ignores the editor name when it trails the project', () => {
    expect(extractProjectKey(editor('index.tsx — yappr — Visual Studio Code'))).toBe('yappr')
    expect(extractProjectKey(editor('app.ts — my-app — Cursor'))).toBe('my-app')
  })

  it('handles a folder open with no file', () => {
    expect(extractProjectKey(editor('yappr'))).toBe('yappr')
  })

  it('strips the unsaved-changes bullet', () => {
    expect(extractProjectKey(editor('● index.tsx — yappr'))).toBe('yappr')
  })

  it('lowercases and collapses whitespace', () => {
    expect(extractProjectKey(editor('index.tsx —   YAPPR  '))).toBe('yappr')
  })

  // Hyphens are part of names, not separators — splitting on them would
  // turn "claude-code" into "claude".
  it('keeps hyphenated project names intact', () => {
    expect(extractProjectKey(editor('main.rs — claude-code-sdk'))).toBe('claude-code-sdk')
  })

  // A loose file with no project folder. Filing under "index.tsx" would
  // create a junk bucket per file.
  it('refuses to treat a bare filename as a project', () => {
    expect(extractProjectKey(editor('index.tsx'))).toBeNull()
    expect(extractProjectKey(editor('Untitled-1'))).toBeNull()
  })

  it('returns null for an empty title', () => {
    expect(extractProjectKey(editor(''))).toBeNull()
    expect(extractProjectKey(editor('   '))).toBeNull()
  })

  // Nothing but the editor's own name.
  it('returns null when the title names only the editor', () => {
    expect(extractProjectKey(editor('Visual Studio Code'))).toBeNull()
    expect(extractProjectKey(editor('Cursor'))).toBeNull()
  })
})

describe('the real VS Code title', () => {
  // Read off the user's machine with:
  //   AXTitle of (AXFocusedWindow of the VS Code process)
  // The scripting bridge returns "" here — Electron exposes no windows to
  // it — which is why every dictation from their editor went unsorted and
  // no project was ever created for the app they work on daily.
  it('reads the project out of a live VS Code window title', () => {
    expect(extractProjectKey(editor('◑ fixing model — OpenFlow'))).toBe('openflow')
  })

  // The status glyph VS Code prefixes while a task is running.
  it('is not confused by a leading status glyph', () => {
    expect(extractProjectKey(editor('◑ index.tsx — yappr'))).toBe('yappr')
  })
})

describe('canonicalProjectKey', () => {
  // A key is a folder name, and a folder is called whatever it was called
  // at clone time. This user's app is Yappr; the directory is ~/OpenFlow.
  it('maps a stale folder name onto the real project', () => {
    expect(canonicalProjectKey('openflow')).toBe('yappr')
  })

  it('leaves everything else alone', () => {
    expect(canonicalProjectKey('yappr')).toBe('yappr')
    expect(canonicalProjectKey('claude-code-sdk')).toBe('claude-code-sdk')
    expect(canonicalProjectKey(null)).toBeNull()
  })

  // The whole point: both spellings must land in ONE bucket, or the user
  // ends up merging two piles of the same project by hand.
  it('files both spellings under the same bucket', () => {
    expect(projectBucket(editor('index.tsx — OpenFlow'))).toBe('yappr')
    expect(projectBucket(editor('index.tsx — Yappr'))).toBe('yappr')
  })
})

describe('terminal titles', () => {
  it('takes the last path segment of the cwd', () => {
    expect(extractProjectKey(terminal('~/dev/yappr'))).toBe('yappr')
    expect(extractProjectKey(terminal('/Users/noan/code/yappr'))).toBe('yappr')
  })

  it('handles Terminal.app shell and geometry segments', () => {
    expect(extractProjectKey(terminal('Yappr — -zsh — 80×24'))).toBe('yappr')
  })

  it('strips a user@host prefix', () => {
    expect(extractProjectKey(terminal('noan@Mac: ~/dev/yappr'))).toBe('yappr')
  })

  it('tolerates a trailing slash', () => {
    expect(extractProjectKey(terminal('~/dev/yappr/'))).toBe('yappr')
  })

  // The home directory is not a project — everything would land in one
  // bucket named after the user's home folder.
  it('returns null for the home directory or root', () => {
    expect(extractProjectKey(terminal('~'))).toBeNull()
    expect(extractProjectKey(terminal('~/'))).toBeNull()
    expect(extractProjectKey(terminal('/'))).toBeNull()
  })

  it('returns null when the title is only a shell name', () => {
    expect(extractProjectKey(terminal('-zsh'))).toBeNull()
    expect(extractProjectKey(terminal('bash — 80×24'))).toBeNull()
  })

  // Generic container folders are not projects.
  it('rejects generic parent folders', () => {
    expect(extractProjectKey(terminal('~/Documents'))).toBeNull()
    expect(extractProjectKey(terminal('~/projects'))).toBeNull()
    expect(extractProjectKey(terminal('~/src'))).toBeNull()
  })
})

describe('browser app-builders', () => {
  it('reads the project from a builder tab title', () => {
    expect(extractProjectKey(browser('yappr – Lovable', 'Lovable'))).toBe('yappr')
    expect(extractProjectKey(browser('my-store - Replit', 'Replit'))).toBe('my-store')
    expect(extractProjectKey(browser('landing-page | Bolt', 'Bolt'))).toBe('landing-page')
  })

  it('drops the builder brand however it is written', () => {
    expect(extractProjectKey(browser('checkout-flow – v0 by Vercel', 'v0'))).toBe('checkout-flow')
    expect(extractProjectKey(browser('shop – Bolt.new', 'Bolt'))).toBe('shop')
  })

  // A bare landing page names no project.
  it('returns null when only the brand is present', () => {
    expect(extractProjectKey(browser('Lovable', 'Lovable'))).toBeNull()
    expect(extractProjectKey(browser('Bolt.new', 'Bolt'))).toBeNull()
  })

  // Ambiguity is not resolved by picking one — that is guessing.
  it('returns null when several candidate segments remain', () => {
    expect(extractProjectKey(browser('Editor – Settings – Preview', 'Lovable'))).toBeNull()
  })

  // Without a resolved builder, any tab could mint a project.
  it('refuses to derive a key with no known builder', () => {
    expect(extractProjectKey({ surface: 'browser', windowTitle: 'yappr – Lovable', tabTitle: 'yappr – Lovable' }))
      .toBeNull()
  })

  it('falls back to the window title when no tab title is available', () => {
    expect(extractProjectKey({
      surface: 'browser',
      windowTitle: 'yappr – Lovable',
      appName: 'Lovable',
      appOwnsProject: true,
    })).toBe('yappr')
  })
})

describe('surfaces with no project', () => {
  it('never derives a key from an unrelated app', () => {
    expect(extractProjectKey({ surface: 'other', windowTitle: 'Inbox — Gmail' })).toBeNull()
  })
})

describe('normalizeProjectKey', () => {
  it('rejects prose', () => {
    expect(normalizeProjectKey('how do I fix the login bug on staging')).toBeNull()
  })

  it('rejects an over-long title', () => {
    expect(normalizeProjectKey('a'.repeat(65))).toBeNull()
  })

  it('accepts a short multi-word product name', () => {
    expect(normalizeProjectKey('Firebase Studio')).toBe('firebase studio')
  })

  it('rejects empty and nullish input', () => {
    expect(normalizeProjectKey('')).toBeNull()
    expect(normalizeProjectKey(null)).toBeNull()
    expect(normalizeProjectKey(undefined)).toBeNull()
  })
})

describe('projectBucket', () => {
  // The spec's fallback: never guess, use the unsorted bucket.
  it('routes an unparseable surface to unsorted', () => {
    expect(projectBucket(editor('index.tsx'))).toBe(UNSORTED_BUCKET)
    expect(projectBucket({ surface: 'other', windowTitle: 'Slack' })).toBe(UNSORTED_BUCKET)
  })

  it('uses the derived key when there is one', () => {
    expect(projectBucket(editor('index.tsx — yappr'))).toBe('yappr')
  })
})
