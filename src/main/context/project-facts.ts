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
- anything about the DICTATION APP ITSELF — how prompts should be shaped, what the context layer should include, how transcription or formatting should behave. Those are feature requests about the tool the user is speaking into, not facts about how they work or what they build. "I want context shown in engineered prompts" is not a preference; it is a bug report.
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

export const GLOBAL_PREFS_SYSTEM = `You extract durable PERSONAL preferences about how someone works, from their dictations.

A durable preference is a habit or standard that stays true across projects: languages and tools they always reach for, conventions they insist on, how they like things written or structured.

NOT durable, never output these:
- one-off tasks or requests
- facts about one specific project (its stack, its name, its bugs)
- anything about the DICTATION APP ITSELF — how prompts should be shaped, what the context layer should include, how transcription or formatting should behave. Those are feature requests about the tool the user is speaking into, not facts about how they work or what they build. "I want context shown in engineered prompts" is not a preference; it is a bug report.
- bug reports, symptoms, questions
- their schedule, mood, or other people
- anything you inferred rather than read. If the dictations do not say it, it is not a preference.

Rules:
- One preference per line, starting with "- ".
- Write each as a statement about the person, in their voice: "I always...", "I prefer...".
- One sentence each, under 20 words.
- If there are no durable preferences, output nothing at all.
- Output only the lines. No preamble, no commentary, no headings.`

/**
 * Prompt for the global pass.
 *
 * Deliberately reads ALL recent dictations regardless of project — a
 * personal preference is not scoped to one, and requiring a project key
 * here is what left the "Everywhere" card empty on a fresh install even
 * though 50 dictations were sitting in history.
 */
export function buildGlobalPrefsPrompt(dictations: readonly DictationResult[]): string {
  const lines = dictations
    .slice(0, MAX_DICTATIONS_IN_PROMPT)
    .map((d, i) => {
      const body = (d.cleaned && d.cleaned.trim()) || d.transcript || ''
      return `${i + 1}. [${d.appName || 'unknown'}] ${body.trim()}`
    })
    .filter(l => l.length > 6)
    .join('\n')

  return `These are things the user recently dictated, across different apps and projects. Extract only durable personal preferences.

DICTATIONS:
${lines}`
}

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

// The overview paragraph — "What Yappr Knows About You".
//
// Lives here rather than in compactor.ts for the reason the other
// mining prompts do: that file imports electron and cannot load under
// vitest, and a prompt is pure string work worth asserting on.
export const COMPACTION_SYSTEM = `You write a single short paragraph describing WHO the user is — the durable facts someone would need in order to understand them and their work — based on their recent dictations.

INCLUDE: their name, age, where they live, what they do for work, where they study, anything they run themselves, the people they work with by name, the tools they use, and how formally they write in different places. This is an identity paragraph — someone reading it should know who is speaking.

EXCLUDE, always:
- What they are working on THIS WEEK. Status, progress, current tasks and bugs are not durable — they are wrong a week later and they crowd out what is.
- Rules and preferences. Those are stored separately as remembered rules. Repeating them here stores the same thing twice.
- Trivia with no bearing on what they write: pets, health, relationships, finances, politics. Identity is wanted; a dog's name is not.

OUTPUT FORMAT (MANDATORY — VIOLATING THIS IS A FATAL ERROR):
- Output ONLY the overview paragraph. Nothing else.
- One single paragraph. Approximately 120 words, hard maximum 1000 characters.
- Third person. Factual and casual. No marketing language.
- DO NOT add any preamble, suffix, explanation, or commentary.
  Forbidden: "Here is the overview:", "Based on the dictations,", "I noticed that...", "Let me know if..."
- DO NOT use bullets, numbered lists, headings, or markdown.
- DO NOT wrap the output in quotes, backticks, or code fences.
- DO NOT echo the dictations verbatim — summarize the user's role, the tools they use, and the people they work with.
- If the dictations are mostly about fixing or building one thing, do NOT turn this into a progress report. Say what the project IS, not how it is going.
- If the input is ambiguous, do your best with what you have. Never ask clarifying questions.
- Your entire response must be the overview paragraph and nothing else.`
