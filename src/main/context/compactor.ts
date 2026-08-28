// Phase 3 of Feature 4 (context memory). See:
//   docs/superpowers/plans/2026-05-18-feature-4-context-memory-plan.md
//
// Background auto-compaction of the user_overview paragraph. Triggered
// 50 dictations after the previous successful run, only when the user
// has been idle for >=60s of no dictation AND OS-level idle >30s — so
// it never competes for resources with the hot path. Local-only users
// (no Groq key) silently no-op.
//
// Why a module-level lock: maybeRunCompaction can be called from a
// setTimeout AND from the IPC handler ("Refresh now"). Both must see
// the same in-progress flag, and finally{} must clear it even if the
// LLM call throws.
//
// Why rebuild-every-10: additive compaction can drift — the model may
// accidentally drop the "moved to Berlin in March" fact when blending
// 10 new dictations into a paragraph. Forcing a from-scratch rebuild
// every 10th successful cycle (so cycles 10, 20, 30…) bounds drift to
// ~500 dictations per uptime.

import { powerMonitor } from 'electron'
import Groq from 'groq-sdk'
import {
  getUserOverview,
  setUserOverview,
  resetDictationCount,
  setLastCompaction,
  getLastCompaction,
  getDictationCount,
  incrementDictationCount,
} from './store'
import { loadPersistedHistory } from '../history-store'
import { isRewriteEntry } from '../../shared/history-entry'
import { getSettings } from '../store'
import { compactionGate, shouldKeepRetrying, type GateInput } from './compaction-gate'
import { logInfo, logError } from '../log'
import { MODELS } from '../../shared/constants'
import { addFact, hasAnyFacts } from './facts'
import {
  groupByProject,
  eligibleProjects,
  buildProjectFactsPrompt,
  buildGlobalPrefsPrompt,
  parseProjectFacts,
  PROJECT_FACTS_SYSTEM,
  GLOBAL_PREFS_SYSTEM,
} from './project-facts'

const THRESHOLD = 50

// Which model rewrites the overview.
//
// NOT the user's cleanup model, and never a hardcoded id. This line used
// to read `cleanupModel || 'llama-3.1-8b-instant'`, and both halves of
// that were wrong:
//
//   - Groq decommissioned llama-3.x, so the literal 404'd.
//   - The fallback fired whenever cleanupModel was blank — which it is
//     for anyone whose settings persisted an empty string. The stale-model
//     migration only rewrites KNOWN BAD ids, so '' sailed straight past it.
//
// The result was a compaction that failed every 60 seconds forever. The
// dictation counter never reset (observed at 157 against a threshold of
// 50), so "refresh after 50" looked broken when the trigger was fine and
// only the model was dead.
//
// Reading from MODELS means this cannot rot independently of the rest of
// the app again.
function backgroundModel(): string {
  return MODELS.groq.background ?? MODELS.groq.cleanup
}
const IDLE_MS = 60_000
const OS_IDLE_SECONDS = 30
const OVERVIEW_MAX_CHARS = 1000
const REBUILD_EVERY = 10

let lastDictationActivityAt = 0
let compacting = false
let successfulCompactions = 0

// How often to re-ask the gate once there's a backlog. Compaction must
// wait for the user to be idle, and "idle" is never true at the instant a
// dictation finishes — so the only way it ever runs is to keep checking.
const RETRY_INTERVAL_MS = 60_000
let retryTimer: ReturnType<typeof setInterval> | null = null

function stopCompactionRetries(): void {
  if (retryTimer) {
    clearInterval(retryTimer)
    retryTimer = null
  }
}

// Start polling until a compaction actually lands. Idempotent.
export function startCompactionRetries(): void {
  if (retryTimer) return
  logInfo('[compactor] backlog reached threshold — polling for an idle moment', {
    count: getDictationCount(),
    threshold: THRESHOLD,
    everyMs: RETRY_INTERVAL_MS,
  })
  retryTimer = setInterval(() => {
    maybeRunCompaction()
      .then(() => {
        if (!shouldKeepRetrying(gateInput())) stopCompactionRetries()
      })
      .catch((err) => {
        logError('[compactor] scheduled run threw', err)
      })
  }, RETRY_INTERVAL_MS)
  // Don't hold the process open purely to run housekeeping.
  retryTimer.unref?.()
}

export function notifyDictationCompleted(): void {
  lastDictationActivityAt = Date.now()
  const count = incrementDictationCount()
  // Previously this fired setTimeout(..., 0), which then failed the
  // "quiet for 60s" check it had just made impossible. Poll instead.
  if (count >= THRESHOLD && !compacting) startCompactionRetries()
}

function gateInput(): GateInput {
  return {
    count: getDictationCount(),
    threshold: THRESHOLD,
    compacting,
    hasApiKey: getSettings().provider.groqKey.trim().length > 0,
    msSinceDictation: Date.now() - lastDictationActivityAt,
    osIdleSeconds: powerMonitor.getSystemIdleTime(),
    idleMs: IDLE_MS,
    osIdleSeconds_threshold: OS_IDLE_SECONDS,
  }
}

export function markDictationActive(): void {
  lastDictationActivityAt = Date.now()
}

export function getCompactionStatus(): {
  count: number
  threshold: number
  lastCompactionAt: number
  compacting: boolean
} {
  return {
    count: getDictationCount(),
    threshold: THRESHOLD,
    lastCompactionAt: getLastCompaction(),
    compacting,
  }
}

export async function maybeRunCompaction(): Promise<{ ran: boolean; reason?: string }> {
  const decision = compactionGate(gateInput())
  if (!decision.run) return { ran: false, reason: decision.reason }

  const settings = getSettings()
  const apiKey = settings.provider.groqKey

  compacting = true
  try {
    const rebuild = successfulCompactions > 0 && successfulCompactions % REBUILD_EVERY === 0
    const result = await runCompaction(apiKey, rebuild)
    if (!result.ok) {
      logError('[compactor] compaction failed', new Error(result.error ?? 'unknown'))
      return { ran: false, reason: result.error ?? 'failed' }
    }
    setUserOverview(result.overview)
    resetDictationCount()
    setLastCompaction(Date.now())
    successfulCompactions += 1
    stopCompactionRetries()
    await mineProjectFacts(apiKey)
    logInfo('[compactor] compaction complete', {
      rebuild,
      chars: result.overview.length,
      successfulCompactions,
    })
    return { ran: true }
  } catch (err) {
    logError('[compactor] unexpected error', err)
    return { ran: false, reason: 'exception' }
  } finally {
    compacting = false
  }
}

export async function forceCompaction(): Promise<{ ok: boolean; error?: string }> {
  if (compacting) return { ok: false, error: 'A compaction is already running' }

  const settings = getSettings()
  const apiKey = settings.provider.groqKey
  if (!apiKey) return { ok: false, error: 'No Groq API key configured' }

  compacting = true
  try {
    const rebuild = successfulCompactions > 0 && successfulCompactions % REBUILD_EVERY === 0
    const result = await runCompaction(apiKey, rebuild)
    if (!result.ok) {
      logError('[compactor] forced compaction failed', new Error(result.error ?? 'unknown'))
      return { ok: false, error: result.error ?? 'Compaction failed' }
    }
    setUserOverview(result.overview)
    resetDictationCount()
    setLastCompaction(Date.now())
    successfulCompactions += 1
    await mineProjectFacts(apiKey)
    logInfo('[compactor] forced compaction complete', {
      rebuild,
      chars: result.overview.length,
    })
    return { ok: true }
  } catch (err) {
    logError('[compactor] forced compaction threw', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Unexpected error' }
  } finally {
    compacting = false
  }
}

type CompactionResult =
  | { ok: true; overview: string }
  | { ok: false; error: string }

async function runCompaction(
  apiKey: string,
  rebuildFromScratch: boolean,
): Promise<CompactionResult> {
  // Rewrites are excluded: they are edits to text the user already had,
  // not statements about their work, and mining them teaches the overview
  // things like "make this shorter".
  //
  // Via isRewriteEntry rather than a literal placeholder check — rewrites
  // now store the real spoken instruction, so the old
  // `transcript !== '(rewrite)'` test would let every new one through.
  // The helper still recognises the placeholder in entries written before
  // that changed.
  const dictations = loadPersistedHistory()
    .filter((d) => !isRewriteEntry(d))
    .slice(0, 50)

  if (dictations.length === 0) {
    return { ok: false, error: 'No dictations available to compact' }
  }

  const formatted = dictations
    .map((d, i) => {
      const body = (d.cleaned && d.cleaned.trim().length > 0) ? d.cleaned : d.transcript
      const when = relativeTime(d.timestamp)
      const app = d.appName || 'unknown app'
      return `${i + 1}. [${app}, ${when}] ${body}`
    })
    .join('\n')

  const existing = rebuildFromScratch ? '' : getUserOverview()
  const header = rebuildFromScratch
    ? `Write a fresh user overview from these ${dictations.length} recent dictations. Ignore any prior overview. Output ONE paragraph, ~120 words max.`
    : (existing
        ? `Here is the user's current overview (preserve its spine, add/refine only based on the new dictations below). Output ONE paragraph, ~120 words max.\n\nCURRENT OVERVIEW:\n${existing}`
        : `Write a fresh user overview from these ${dictations.length} recent dictations. Output ONE paragraph, ~120 words max.`)

  const userPrompt = `${header}\n\nRECENT DICTATIONS:\n${formatted}`

  const client = new Groq({ apiKey })
  let raw = ''
  try {
    const response = await client.chat.completions.create({
      model: backgroundModel(),
      messages: [
        { role: 'system', content: COMPACTION_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 600,
      // gpt-oss models reason before answering, and those tokens come out
      // of max_tokens. Unset, this burned 100 of the 600 on a five-line
      // input; a real 50-dictation input has more to chew on, and a
      // compaction that spends its budget thinking returns a truncated
      // paragraph or nothing. 'low' cut it to 18 with no quality loss.
      // Only gpt-oss models take this; the cast matches how groq.ts
      // passes it, since the SDK's types predate the field.
      ...(backgroundModel().startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    } as never, {
      timeout: 15000,
      maxRetries: 0,
    })
    raw = response.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Groq request failed' }
  }

  const cleaned = stripCompactionArtifacts(raw)
  if (!cleaned) return { ok: false, error: 'Empty response from model' }

  return { ok: true, overview: cleaned.slice(0, OVERVIEW_MAX_CHARS) }
}

const COMPACTION_SYSTEM = `You write a single short user-overview paragraph that summarizes who the user is and what they've been working on, based on their recent dictations.

OUTPUT FORMAT (MANDATORY — VIOLATING THIS IS A FATAL ERROR):
- Output ONLY the overview paragraph. Nothing else.
- One single paragraph. Approximately 120 words, hard maximum 1000 characters.
- Third person. Factual and casual. No marketing language.
- DO NOT add any preamble, suffix, explanation, or commentary.
  Forbidden: "Here is the overview:", "Based on the dictations,", "I noticed that...", "Let me know if..."
- DO NOT use bullets, numbered lists, headings, or markdown.
- DO NOT wrap the output in quotes, backticks, or code fences.
- DO NOT echo the dictations verbatim — summarize the user's role, focus areas, ongoing projects, and recurring people or tools.
- If the input is ambiguous, do your best with what you have. Never ask clarifying questions.
- Your entire response must be the overview paragraph and nothing else.`

// Targeted strip of the artifacts the 8B model leaks despite the
// OUTPUT_GUARD-style system prompt. Smaller than the cleanup stripper
// because overview output is one paragraph — we mainly need to drop
// leading labels, surrounding quotes/fences, and trailing meta lines.
function stripCompactionArtifacts(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '')
  s = s.replace(/^["“‘'](.*)["”’']$/s, '$1')
  s = s.replace(
    /^(?:here['’]?s?\s+(?:the|your|a)\s+(?:user\s+)?(?:overview|summary|paragraph)[^\n:]*:?\s*\n?|overview:\s*\n?|summary:\s*\n?|output:\s*\n?|result:\s*\n?|based\s+on[^,\n]{0,80},\s*)/i,
    '',
  )
  s = s.replace(
    /\n\s*\n(?:i\s+(?:noticed|hope|tried|wrote|kept|made|removed|summari[sz]ed)|note[:.]?\s|let\s+me\s+know|this\s+(?:overview|paragraph|summary))\b[^]*$/i,
    '',
  )
  s = s.replace(
    /\n(?:i\s+(?:noticed|hope|tried|wrote|kept|made|removed|summari[sz]ed)|note[:.]?\s|let\s+me\s+know|this\s+(?:overview|paragraph|summary))\b[^\n]*$/i,
    '',
  )
  return s.trim()
}

function relativeTime(timestamp: number): string {
  const diffSec = Math.max(0, (Date.now() - timestamp) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = diffSec / 60
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`
  const diffHr = diffMin / 60
  if (diffHr < 24) return `${Math.round(diffHr)}h ago`
  const diffDay = diffHr / 24
  if (diffDay < 7) return `${Math.round(diffDay)}d ago`
  const diffWk = diffDay / 7
  if (diffWk < 5) return `${Math.round(diffWk)}w ago`
  return `${Math.round(diffDay / 30)}mo ago`
}


// Fill the project cards from the same history the overview was built
// from (spec: cards should appear with each 50 transcriptions).
//
// Runs AFTER the overview has been saved and the counter reset, and
// every failure is swallowed. Mining is a bonus pass — if it throws, the
// compaction it rode in on has already succeeded and must stay
// succeeded, or a flaky extra call would put the user back into the
// "never refreshes" state this whole change exists to fix.
async function mineProjectFacts(apiKey: string): Promise<void> {
  if (!apiKey) return
  try {
    const history = loadPersistedHistory()
    const groups = groupByProject(history)
    const projects = eligibleProjects(groups)
    // NOTE: no early return when there are no projects. Global
    // preferences still need mining, and on a fresh install — or on any
    // history recorded before project keys existed — there are never any
    // eligible projects yet. Returning early here is what kept the
    // "Everywhere" card empty on a machine with 50 dictations stored.

    const client = new Groq({ apiKey })
    let stored = 0

    // GLOBAL pass first, and unconditionally — it needs no project key.
    //
    // This is the gap that left "What Yappr knows" empty on a machine
    // with 50 dictations in history: personal preferences are not scoped
    // to a project, but nothing mined them, so the only ways in were the
    // onboarding paste or the per-dictation detector (strict by design,
    // and only ever looking at one sentence).
    try {
      const response = await withRateLimitRetry('global-preference mining', () =>
        client.chat.completions.create({
        model: backgroundModel(),
        messages: [
          { role: 'system', content: GLOBAL_PREFS_SYSTEM },
          { role: 'user', content: buildGlobalPrefsPrompt(history) },
        ],
        temperature: 0.2,
        max_tokens: 400,
        ...(backgroundModel().startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      } as never, { timeout: 15000, maxRetries: 0 }))
      const raw = response.choices[0]?.message?.content ?? ''
      for (const text of parseProjectFacts(raw)) {
        if (addFact({ scope: 'global', text })) stored++
      }
    } catch (err) {
      logError('[compactor] global-preference mining failed', err)
    }

    for (const projectKey of projects) {
      const dictations = groups.get(projectKey) ?? []
      try {
        const response = await withRateLimitRetry(`project facts (${projectKey})`, () =>
          client.chat.completions.create({
          model: backgroundModel(),
          messages: [
            { role: 'system', content: PROJECT_FACTS_SYSTEM },
            { role: 'user', content: buildProjectFactsPrompt(projectKey, dictations) },
          ],
          temperature: 0.2,
          max_tokens: 400,
          ...(backgroundModel().startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        } as never, { timeout: 15000, maxRetries: 0 }))
        const raw = response.choices[0]?.message?.content ?? ''
        for (const text of parseProjectFacts(raw)) {
          // addFact dedupes, so re-mining the same history across runs
          // does not accumulate copies.
          if (addFact({ scope: 'project', projectKey, text })) stored++
        }
      } catch (err) {
        // One project failing must not stop the others.
        logError(`[compactor] project-fact mining failed for ${projectKey}`, err)
      }
    }
    logInfo('[compactor] project facts mined', { projects: projects.length, stored })
  } catch (err) {
    logError('[compactor] project-fact mining threw', err)
  }
}


// Groq answers a 429 with the exact wait it wants ("try again in 1.8s").
//
// Mining is background work with nothing waiting on it, so that wait is
// free — and skipping it is expensive. Observed on a real machine:
// compaction spent 6306 of an 8000 TPM budget, mining asked for 1934,
// and the whole pass was abandoned over a 1.8 SECOND wait. Nothing was
// stored, and the UI had no way to say so, which reads exactly like a
// broken feature.
//
// Bounded deliberately: two attempts, and only for waits short enough to
// be worth sitting through. A minute-long backoff on a background job
// that runs again next compaction is not worth holding a timer for.
const MINING_RETRY_MAX_WAIT_MS = 15_000

function retryAfterMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (!/429|rate limit/i.test(message)) return null
  const m = /try again in ([\d.]+)\s*s/i.exec(message)
  if (!m) return null
  const ms = Math.ceil(parseFloat(m[1]) * 1000) + 250
  return ms > 0 && ms <= MINING_RETRY_MAX_WAIT_MS ? ms : null
}

async function withRateLimitRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    const wait = retryAfterMs(err)
    if (wait === null) throw err
    logInfo(`[compactor] ${label} rate-limited — waiting`, { ms: wait })
    await new Promise(resolve => setTimeout(resolve, wait))
    return run()
  }
}

/**
 * One-time backfill so the cards are not empty for 50 dictations.
 *
 * Mining rides on compaction, which fires every THRESHOLD dictations. On
 * a machine that has already compacted once, the counter restarts at
 * zero — so a user who installs the mining feature mid-cycle sees an
 * empty "What Yappr knows" and no indication anything will ever appear.
 * That is exactly what happened here: compaction had run, the counter
 * was at 20/50, and the cards had been empty since install.
 *
 * A feature whose first output is 50 dictations away cannot be evaluated,
 * and a user cannot tell "working, not yet triggered" from "broken".
 *
 * Runs at most once — the moment anything is stored, hasAnyFacts() is
 * true forever and this never fires again. Gated on the same idle check
 * as compaction so it never competes with a dictation.
 */
export async function bootstrapFactsIfEmpty(): Promise<void> {
  try {
    const settings = getSettings()
    if (!settings.useContextMemory) return
    const apiKey = settings.provider.groqKey
    if (!apiKey.trim()) return
    if (hasAnyFacts()) return

    const history = loadPersistedHistory()
    // Too little to generalise from; wait for the normal cycle.
    if (history.length < 10) return

    logInfo('[compactor] no facts stored yet — running a one-time backfill', {
      history: history.length,
    })
    await mineProjectFacts(apiKey)
  } catch (err) {
    logError('[compactor] fact backfill failed', err)
  }
}
