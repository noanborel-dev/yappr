// Phase 1 + Phase 3 of Feature 4 (context memory). See:
//   docs/superpowers/plans/2026-05-18-feature-4-context-memory-plan.md
//
// SQLite-backed persistence for the user-overview context paragraph.
// We use better-sqlite3 (synchronous) deliberately — the table is tiny
// (one row), the read happens once per app session, and synchronous
// I/O is fine for a few hundred bytes on local disk. Async wrappers
// would add overhead for no benefit.
//
// Phase 3 adds context_meta (dictation_count + last_compaction) to
// drive background auto-compaction. Category summaries still land later.
//
// Hot path: at cleanup-prompt-build time, we call getUserOverview()
// which returns from an in-memory cache after the first call. First-
// call cost: ~3ms cold DB open + ~1ms read. Subsequent calls: <1ms.

import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { logError, logInfo } from '../log'

let db: Database.Database | null = null
let cachedOverview: string | null = null
let initialized = false

// Hard cap on the user-overview length in characters. ~150 words at
// ~6 chars/word = 900; we add a tiny margin. Trimmed at write time
// AND at read time as a safety net.
const OVERVIEW_MAX_CHARS = 1000

function dbPath(): string {
  return join(app.getPath('userData'), 'context.db')
}

function ensureInit(): void {
  if (initialized) return
  try {
    db = new Database(dbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_kv (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS context_meta (
        key   TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
      -- Two-tier context (spec §1.2). 'global' facts are about the user
      -- and load everywhere; 'project' facts load only for their own
      -- project_key, which is what keeps one project's stack out of
      -- another project's prompt. project_key is '' for global rows.
      CREATE TABLE IF NOT EXISTS context_facts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        scope       TEXT    NOT NULL,
        project_key TEXT    NOT NULL DEFAULT '',
        text        TEXT    NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_context_facts_scope
        ON context_facts (scope, project_key);
      -- Dedupe at the schema level: the same rule dictated twice must not
      -- accumulate, or a repeated preference slowly crowds out the rest
      -- of the context budget.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_context_facts_unique
        ON context_facts (scope, project_key, text);
    `)
    const seed = db.prepare('INSERT OR IGNORE INTO context_meta (key, value) VALUES (?, 0)')
    seed.run('dictation_count')
    seed.run('last_compaction')
    initialized = true
  } catch (err) {
    logError('[context/store] init failed — context memory disabled for this session', err)
    db = null
    initialized = true // don't keep retrying
  }
}

// Facts live in the same database, so lifecycle stays in one place.
// facts.ts owns the queries; this hands it an initialised handle (null
// when the store failed to open, which callers treat as "no context").
export function getDb(): Database.Database | null {
  ensureInit()
  return db
}

export function getUserOverview(): string {
  if (cachedOverview !== null) return cachedOverview
  ensureInit()
  if (!db) {
    cachedOverview = ''
    return ''
  }
  try {
    const row = db.prepare<[string], { value: string }>('SELECT value FROM context_kv WHERE key = ?').get('user_overview')
    cachedOverview = (row?.value ?? '').slice(0, OVERVIEW_MAX_CHARS)
    return cachedOverview
  } catch (err) {
    logError('[context/store] read failed', err)
    cachedOverview = ''
    return ''
  }
}

export function setUserOverview(text: string): void {
  ensureInit()
  if (!db) return
  const trimmed = text.trim().slice(0, OVERVIEW_MAX_CHARS)
  try {
    db.prepare('INSERT INTO context_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('user_overview', trimmed)
    cachedOverview = trimmed
    logInfo('[context/store] user_overview saved', { chars: trimmed.length })
  } catch (err) {
    logError('[context/store] write failed', err)
  }
}

export function clearUserOverview(): void {
  setUserOverview('')
}

// Reset the in-memory cache. Useful if the file is wiped externally
// (e.g. via a "Clear context memory" admin action that bypasses
// setUserOverview). Phase 3 will use this for the compaction wipe.
export function invalidateCache(): void {
  cachedOverview = null
}

export function getDictationCount(): number {
  ensureInit()
  if (!db) return 0
  try {
    const row = db.prepare<[string], { value: number }>('SELECT value FROM context_meta WHERE key = ?').get('dictation_count')
    return row?.value ?? 0
  } catch (err) {
    logError('[context/store] getDictationCount failed', err)
    return 0
  }
}

export function incrementDictationCount(): number {
  ensureInit()
  if (!db) return 0
  try {
    db.prepare("UPDATE context_meta SET value = value + 1 WHERE key = 'dictation_count'").run()
    const row = db.prepare<[string], { value: number }>('SELECT value FROM context_meta WHERE key = ?').get('dictation_count')
    return row?.value ?? 0
  } catch (err) {
    logError('[context/store] incrementDictationCount failed', err)
    return 0
  }
}

export function resetDictationCount(): void {
  ensureInit()
  if (!db) return
  try {
    db.prepare("UPDATE context_meta SET value = 0 WHERE key = 'dictation_count'").run()
  } catch (err) {
    logError('[context/store] resetDictationCount failed', err)
  }
}

export function getLastCompaction(): number {
  ensureInit()
  if (!db) return 0
  try {
    const row = db.prepare<[string], { value: number }>('SELECT value FROM context_meta WHERE key = ?').get('last_compaction')
    return row?.value ?? 0
  } catch (err) {
    logError('[context/store] getLastCompaction failed', err)
    return 0
  }
}

export function setLastCompaction(unixMs: number): void {
  ensureInit()
  if (!db) return
  try {
    db.prepare("UPDATE context_meta SET value = ? WHERE key = 'last_compaction'").run(unixMs)
  } catch (err) {
    logError('[context/store] setLastCompaction failed', err)
  }
}

// Lifecycle: close the DB on app quit so WAL files commit cleanly.
// Called from main/index.ts on `before-quit`.
export function closeContextStore(): void {
  if (db) {
    try { db.close() } catch { /* ignore */ }
    db = null
    initialized = false
    cachedOverview = null
  }
}
