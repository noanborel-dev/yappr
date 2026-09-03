import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { redact, redactString } from './redact'

// Persistent log in userData so users (and we) can inspect failures after
// the fact without keeping a terminal open. Kept append-only and small.
const LOG_PATH = (() => {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'yappr.log')
})()

function fmt(level: string, msg: string, data?: unknown): string {
  const stamp = new Date().toISOString()
  const extra = data ? ` ${safeStringify(data)}` : ''
  return `${stamp} [${level}] ${redactString(msg)}${extra}\n`
}

// Everything here goes through redact() first. The log file is shared
// with us by users when something breaks, so it is effectively public;
// see src/main/redact.ts for why both nets are needed.
function safeStringify(v: unknown): string {
  if (v instanceof Error) {
    // An SDK error's message often quotes the failing request, so the
    // message needs scrubbing as much as any structured payload does.
    return JSON.stringify(redact({ message: v.message, stack: v.stack }))
  }
  try {
    return JSON.stringify(redact(v))
  } catch {
    return redactString(String(v))
  }
}

export function logInfo(msg: string, data?: unknown): void {
  const line = fmt('INFO', msg, data)
  // Guard against EIO from a closed stdout pipe — happens when the
  // terminal that launched the dev process disappears OR when the
  // utility/child process's stdio gets torn down mid-flight. Without
  // the catch, a single failed write throws an uncaught exception
  // and Electron terminates the app.
  try { process.stdout.write(line) } catch { /* best-effort */ }
  try { appendFileSync(LOG_PATH, line) } catch { /* best-effort */ }
}

export function logError(msg: string, err: unknown): void {
  const line = fmt('ERROR', msg, err)
  try { process.stderr.write(line) } catch { /* best-effort */ }
  try { appendFileSync(LOG_PATH, line) } catch { /* best-effort */ }
}

export function getLogPath(): string {
  return LOG_PATH
}
