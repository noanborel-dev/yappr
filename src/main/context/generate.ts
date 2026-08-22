// Generate the user's context in-app, instead of making them ferry it.
//
// The old flow was: Yappr writes a prompt → user copies it → opens Claude or
// ChatGPT → pastes → waits → copies the answer → comes back → pastes again.
// Six manual steps to produce a paragraph, and every one of them is the user
// acting as a courier between two machines that could have talked directly.
//
// Yappr already holds a Groq key and the model that compaction runs on. The
// only thing the external chat had that Yappr did not was knowledge of the
// user — so ask for that in one sentence and generate the rest here.
//
// Two sources, either or both:
//   seed     — a few sentences the user says or types about themselves
//   history  — what they have already dictated, which needs no input at all
//
// Output is the same OnboardingImport shape the paste flow produced, so it
// lands in exactly the same storage through exactly the same parser. This
// replaces how the text is OBTAINED, not what is done with it.

import Groq from 'groq-sdk'
import { MODELS } from '../../shared/constants'
import { parseOnboardingImport, type OnboardingImport } from '../../shared/onboarding-import'
import { loadPersistedHistory } from '../history-store'
import { getSettings } from '../store'
import { logError, logInfo } from '../log'

// Same model background compaction uses: nothing is waiting on this, and it
// gets its own rate-limit bucket rather than competing with dictation.
function model(): string {
  return MODELS.groq.background ?? MODELS.groq.cleanup
}

const SYSTEM = `You build a background profile for a voice-dictation user, from what they tell you about themselves and from things they have recently dictated.

Output EXACTLY this shape and nothing else:

<one paragraph, max 120 words, third person, describing who they are: what they work on, names and products they say often, the tools they use, and how formal they are in different places>

GLOBAL
- one bullet per preference true of them everywhere, in their voice ("I always...", "I prefer...")

PROJECT: <name>
- one bullet per fact about that specific project. Repeat the heading per project.

UNSORTED
- anything you cannot confidently attach to a project.

GROUNDING — THE MOST IMPORTANT RULE:
Every bullet must be traceable to a specific sentence in the input. Before you
write one, find the sentence it came from. If you cannot point to one, do not
write it.

This is not a style note. These facts are fed back into the user's future
prompts as if they were true, so an invented one is worse than a missing one:
it is wrong, permanent, and invisible.

You will be tempted to fill in a plausible technical stack. Do not. If they
said "a Mac dictation app in TypeScript", that is ALL you know — you do not
know their database, their hosting, their queue, their architecture, or
whether a server exists at all. Real examples of forbidden invention:
  ✗ "Backend services run in Docker containers managed by Kubernetes."
  ✗ "Uses PostgreSQL for session data."
  ✗ "Streams audio to a backend model over WebSockets."
None of those were stated; all of them are the kind of thing that sounds right
and is not. A profile of three true bullets beats one of twelve plausible ones.

Find the source sentence in your head. NEVER write it down — no "(sentence 12)",
no quotes, no references. The bullet is the fact and nothing else.

A REQUEST IS NOT A FACT. Most of what someone dictates is work they want done,
and none of it belongs here. A fact stays true after the task is finished:
  ✗ "I want to add a prototype-builder image to the dashboard."   (a task)
  ✗ "I need the notch darkened."                                   (a task)
  ✓ "Yappr is a Mac dictation app built with Electron and TypeScript."
  ✓ "The team uses zod for validation."
If a bullet starts with "I want", "I need", "I plan", "I will", or names
something to change, it is a task. Drop it.

Rules:
- One fact per bullet, one sentence, under 20 words.
- Only name a PROJECT you were actually told about. Never invent one.
- Skip any heading you have nothing for. Empty is a valid answer.
- No preamble, no commentary, no headings other than those above.`

/** Most recent dictations shown to the model. Enough to see a pattern
 *  without spending the minute's whole token budget on one call. */
const HISTORY_SAMPLE = 30

// Enforced in code as well as in the prompt, because both of these were
// observed against the real model and a prompt rule is a request, not a
// guarantee.
//
//   citations — it cited its source inline: "…in Yappr. (sentence 12)".
//               Correct behaviour, wrong place; the citation would have been
//               stored as part of the fact and fed back forever.
//   tasks     — a history of dictated work turns into "I want to add X",
//               which is a to-do, not something true about the project. It
//               stops being true the moment the work is done.
const CITATION_RE = /\s*[（(]\s*sentences?\s*[\d‐-―,\s&+-]*\s*[)）]\s*$/i
const TASK_RE = /^\s*(?:i\s+(?:want|need|plan|intend|aim|will|should|would like)|we\s+(?:want|need|plan|will|should)|todo\b|remember to\b)/i

function cleanFact(text: string): string | null {
  const stripped = text.replace(CITATION_RE, '').trim()
  if (!stripped) return null
  if (TASK_RE.test(stripped)) return null
  return stripped
}

function scrub(parsed: OnboardingImport): OnboardingImport {
  const keep = (list: string[]) => list.map(cleanFact).filter((t): t is string => t !== null)
  const projects: Record<string, string[]> = {}
  for (const [key, facts] of Object.entries(parsed.projects)) {
    const kept = keep(facts)
    if (kept.length > 0) projects[key] = kept
  }
  return {
    overview: parsed.overview.replace(CITATION_RE, '').trim(),
    global: keep(parsed.global),
    projects,
    unsorted: keep(parsed.unsorted),
  }
}

export interface GenerateResult {
  ok: boolean
  error?: string
  parsed?: OnboardingImport
}

function buildUserPrompt(seed: string): string {
  const parts: string[] = []
  const trimmed = (seed ?? '').trim()
  if (trimmed) parts.push(`They describe themselves like this:\n${trimmed}`)

  const history = loadPersistedHistory().slice(0, HISTORY_SAMPLE)
  if (history.length > 0) {
    const lines = history
      .map((d, i) => {
        const body = (d.cleaned && d.cleaned.trim()) || d.transcript || ''
        return `${i + 1}. [${d.appName || 'unknown'}] ${body.trim()}`
      })
      .filter(l => l.length > 6)
      .join('\n')
    if (lines) parts.push(`Things they recently dictated:\n${lines}`)
  }

  // Said plainly, because the model will otherwise pad a thin profile out
  // to look complete — and an invented preference is worse than a short one.
  parts.push('Write the profile. If a section has nothing real behind it, leave it out.')
  return parts.join('\n\n')
}

/**
 * Build the profile. `seed` may be empty when there is enough history to work
 * from; the caller decides which it has.
 */
export async function generateContext(seed: string): Promise<GenerateResult> {
  const apiKey = getSettings().provider.groqKey
  if (!apiKey.trim()) {
    return { ok: false, error: 'Add a Groq key first — Yappr writes this for you.' }
  }

  const hasSeed = (seed ?? '').trim().length > 0
  const hasHistory = loadPersistedHistory().length > 0
  if (!hasSeed && !hasHistory) {
    return { ok: false, error: 'Tell Yappr a little about yourself first.' }
  }

  try {
    const client = new Groq({ apiKey })
    const response = await client.chat.completions.create({
      model: model(),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt(seed) },
      ],
      // 0, not 0.3. This task has one correct answer — what the input
      // actually says — and sampling variance here buys nothing but a
      // wider range of plausible inventions.
      temperature: 0,
      max_tokens: 700,
      // gpt-oss spends reasoning tokens out of max_tokens; unset, a long
      // history can leave nothing for the answer.
      ...(model().startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    } as never, { timeout: 20000, maxRetries: 1 })

    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    if (!raw) return { ok: false, error: 'The model returned nothing. Try again.' }

    // Same parser the paste flow used. The text arrives from a different
    // place; everything downstream of here is unchanged and already tested.
    const parsed = scrub(parseOnboardingImport(raw))
    logInfo('[context/generate] profile built', {
      seedChars: (seed ?? '').trim().length,
      global: parsed.global.length,
      projects: Object.keys(parsed.projects).length,
      unsorted: parsed.unsorted.length,
    })
    return { ok: true, parsed }
  } catch (err) {
    logError('[context/generate] failed', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Generation failed' }
  }
}
