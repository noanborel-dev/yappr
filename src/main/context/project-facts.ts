// Mining project facts out of the last 50 dictations, during compaction.
//
// Until now the project cards filled from two places: the onboarding
// paste, and the standing-preference detector, which is deliberately
// strict — a sentence needs both a durability marker and a convention
// verb before it counts. That strictness is right on the hot path (a
// wrongly promoted rule silently steers every future prompt) but it
// means most people never see a card at all.
//
// Compaction is the right moment to be less strict. It already runs
// every 50 dictations while the machine is idle, it already has the
// history loaded, and nothing is waiting on it — so it can afford an LLM
// pass over a whole project's dictations rather than a regex over one
// sentence.
//
// Pure: grouping, prompt construction and parsing all live here so they
// can be tested without a network or a database. compactor.ts owns the
// call.

import type { DictationResult } from '../../shared/types'
import { UNSORTED_BUCKET } from './project-key'

/** Below this, a "project" is too thin to generalise from. */
export const MIN_DICTATIONS_PER_PROJECT = 3

/** Cap per project per run, so one noisy session cannot flood a card. */
export const MAX_FACTS_PER_RUN = 5

/** Most recent dictations fed to the model for one project. */
export const MAX_DICTATIONS_IN_PROMPT = 25

export const PROJECT_FACTS_SYSTEM = `You extract durable facts about a software project from a user's dictations.

A durable fact is something that stays true about the project: its stack, its conventions, its architecture, what it does, what it must not do.

NOT durable, never output these:
- one-off tasks ("add a spinner to the settings page")
- bug reports or symptoms ("the login button is broken")
- questions
- anything about the user's mood, schedule, or other people
- anything you inferred rather than read. If the dictations do not say it, it is not a fact.

Rules:
- One fact per line, starting with "- ".
- One sentence each, under 20 words.
- Write them as statements about the project, not about the user.
- If there are no durable facts, output nothing at all.
- Output only the lines. No preamble, no commentary, no headings.`

/**
 * Group dictations by project key, dropping the ones that have none.
 *
 * The unsorted bucket is excluded deliberately: those dictations have no
 * project in common, so generalising across them would invent a
 * relationship that does not exist — the same guessing that project-key
 * extraction refuses to do.
 */
export function groupByProject(
  dictations: readonly DictationResult[],
): Map<string, DictationResult[]> {
  const groups = new Map<string, DictationResult[]>()
  for (const d of dictations) {
    const key = d.projectKey
    if (!key || key === UNSORTED_BUCKET) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(d)
    else groups.set(key, [d])
  }
  return groups
}

/** Projects with enough material to be worth a call. */
export function eligibleProjects(
  groups: Map<string, DictationResult[]>,
  min = MIN_DICTATIONS_PER_PROJECT,
): string[] {
  return [...groups.entries()]
    .filter(([, ds]) => ds.length >= min)
    .map(([key]) => key)
    .sort()
}

export function buildProjectFactsPrompt(
  projectKey: string,
  dictations: readonly DictationResult[],
): string {
  const lines = dictations
    .slice(-MAX_DICTATIONS_IN_PROMPT)
    .map((d, i) => {
      const body = (d.cleaned && d.cleaned.trim()) || d.transcript || ''
      return `${i + 1}. ${body.trim()}`
    })
    .filter(l => l.length > 3)
    .join('\n')

  return `Project: "${projectKey}"

These are things the user dictated while working on it. Extract only durable facts about the project.

DICTATIONS:
${lines}`
}

/**
 * Parse the model's bullet list.
 *
 * Tolerant of the shapes models emit anyway (different glyphs, numbered
 * lists), and strict about what it accepts as a fact — a preamble line
 * that slipped through must not become a stored "fact" the user then has
 * to find and delete.
 */
export function parseProjectFacts(raw: string, cap = MAX_FACTS_PER_RUN): string[] {
  const out: string[] = []
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const m = /^\s*(?:[-*•·]|\d+[.)])\s+(.*)$/.exec(line)
    if (!m) continue
    const text = m[1].trim().replace(/\s+/g, ' ').replace(/^[`"'*]+|[`"'*]+$/g, '').trim()
    if (!text) continue
    // Same shape rules the store applies, checked here so a rejected
    // fact never counts against the cap.
    if (text.length > 200) continue
    if (text.split(' ').length < 3) continue
    // The model was told to output nothing when it has nothing; some
    // still say so in prose.
    if (/^(no |none|there are no|nothing)\b/i.test(text)) continue
    out.push(text)
    if (out.length >= cap) break
  }
  return out
}
