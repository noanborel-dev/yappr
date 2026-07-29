#!/usr/bin/env node
// Parse `latency` records out of yappr.log and print p50/p95 per
// word-count bucket.
//
//   node scripts/latency-report.mjs                 # default log location
//   node scripts/latency-report.mjs path/to/yappr.log
//   node scripts/latency-report.mjs --since 2026-07-29
//
// Metric definitions live in src/main/metrics.ts. t0 is hotkey RELEASE,
// which is the only latency the user actually experiences — everything
// before release overlaps with them still talking.

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_LOG = join(
  homedir(),
  'Library',
  'Application Support',
  'yappr',
  'yappr.log'
)

const args = process.argv.slice(2)
const sinceIdx = args.indexOf('--since')
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null
const logPath = args.find(a => !a.startsWith('--') && a !== since) ?? DEFAULT_LOG

if (!existsSync(logPath)) {
  console.error(`No log at ${logPath}`)
  console.error('Pass the path explicitly, or run a dictation first.')
  process.exit(1)
}

// Lines look like:
//   2026-07-29T00:00:00.000Z [INFO] latency {"audioMs":3200,...}
const LINE_RE = /^(\S+) \[INFO\] latency (\{.*\})$/
const metrics = []
for (const line of readFileSync(logPath, 'utf8').split('\n')) {
  const m = LINE_RE.exec(line.trim())
  if (!m) continue
  if (since && m[1] < since) continue
  try {
    metrics.push(JSON.parse(m[2]))
  } catch {
    // Truncated final line during a live tail — skip it.
  }
}

if (metrics.length === 0) {
  console.error(`No latency records found in ${logPath}${since ? ` since ${since}` : ''}.`)
  console.error('This build must be running for records to appear.')
  process.exit(1)
}

const bucketFor = w => (w < 5 ? 'short' : w <= 20 ? 'medium' : 'long')
const percentile = (values, p) => {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(Math.max(Math.ceil((p / 100) * s.length) - 1, 0), s.length - 1)]
}
const TARGETS = { short: null, medium: 1000, long: 1000 }
const P95_TARGET = { short: null, medium: 1500, long: 1500 }

console.log(`\n${metrics.length} dictations from ${logPath}\n`)
console.log('bucket   n     final p50   final p95   transcribe p50   cleanup p50   LLM skipped')
console.log('------   ---   ---------   ---------   --------------   -----------   -----------')

for (const bucket of ['short', 'medium', 'long']) {
  const rows = metrics.filter(m => bucketFor(m.words) === bucket)
  if (rows.length === 0) {
    console.log(`${bucket.padEnd(6)}     0           —           —                —             —             —`)
    continue
  }
  const finals = rows.map(m => m.releaseToFinalMs)
  const p50 = percentile(finals, 50)
  const p95 = percentile(finals, 95)
  const skipped = Math.round((rows.filter(m => m.cleanupSkipped).length / rows.length) * 100)
  let flag = ''
  if (TARGETS[bucket] !== null && p50 > TARGETS[bucket]) flag += `  ⚠ p50 > ${TARGETS[bucket]}ms`
  if (P95_TARGET[bucket] !== null && p95 > P95_TARGET[bucket]) flag += `  ⚠ p95 > ${P95_TARGET[bucket]}ms`
  console.log(
    [
      bucket.padEnd(6),
      String(rows.length).padStart(3),
      `${p50}ms`.padStart(9),
      `${p95}ms`.padStart(9),
      `${percentile(rows.map(m => m.transcribeMs), 50)}ms`.padStart(14),
      `${percentile(rows.map(m => m.cleanupMs), 50)}ms`.padStart(11),
      `${skipped}%`.padStart(11),
    ].join('   ') + flag
  )
}

// Where the post-release time actually goes — this is what tells you
// whether streaming (which only removes transcription) can reach the
// target at all, or whether the LLM call is the real ceiling.
const totals = metrics.reduce(
  (a, m) => ({
    final: a.final + m.releaseToFinalMs,
    transcribe: a.transcribe + m.transcribeMs,
    cleanup: a.cleanup + m.cleanupMs,
  }),
  { final: 0, transcribe: 0, cleanup: 0 }
)
const pct = n => `${Math.round((n / totals.final) * 100)}%`
console.log(`\nShare of post-release wall-clock:`)
console.log(`  transcription   ${pct(totals.transcribe)}   <- what streaming removes`)
console.log(`  LLM cleanup     ${pct(totals.cleanup)}   <- the floor streaming cannot go below`)
console.log(`  other           ${pct(totals.final - totals.transcribe - totals.cleanup)}   (paste, regex passes, emoji judge)`)

// Why the LLM was skipped. Confirms the short-utterance cutoff is
// firing at the rate you'd expect, and at what median latency.
const byReason = new Map()
for (const m of metrics) {
  const r = m.skipReason ?? (m.cleanupSkipped ? 'skipped (pre-cutoff build)' : 'none')
  if (!byReason.has(r)) byReason.set(r, [])
  byReason.get(r).push(m.releaseToFinalMs)
}
console.log(`\nCleanup decision:`)
for (const [reason, finals] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
  const label = reason === 'none' ? 'LLM ran' : reason
  const share = Math.round((finals.length / metrics.length) * 100)
  console.log(
    `  ${label.padEnd(28)} ${String(finals.length).padStart(4)}  (${String(share).padStart(3)}%)   p50 ${percentile(finals, 50)}ms`
  )
}

const byProvider = new Map()
for (const m of metrics) byProvider.set(m.provider, (byProvider.get(m.provider) ?? 0) + 1)
console.log(`\nProviders: ${[...byProvider].map(([k, v]) => `${k} (${v})`).join(', ')}`)
console.log()
