// Splitting the onboarding paste into buckets (spec §1.3).
//
// The onboarding flow hands the user a prompt, they paste it into
// ChatGPT or Claude, and paste the answer back. That answer used to be
// one paragraph stored as one blob, which meant everything it contained
// was injected into every dictation regardless of which project the user
// was working on.
//
// The prompt now also asks for labelled sections, so the answer can be
// filed into the same two tiers everything else uses.
//
// Backwards compatibility is not optional here: users who already have
// the old prompt in a chat window, or who paste a plain paragraph of
// their own, must still get the behaviour they had. A response with no
// recognisable sections is treated as an overview, exactly as before.
//
// Pure — no electron, no store. Shared so the renderer parses and the
// main process stores the same shapes.

/**
 * The prompt the user copies into ChatGPT or Claude.
 *
 * It lives HERE, next to the parser, on purpose. The headings it asks
 * for are the headings the parser matches — they are one contract split
 * across two files, and there is a test below that round-trips a
 * response in this exact shape. Previously the prompt sat in a React
 * component, where nothing stopped someone renaming a heading and
 * silently breaking the import for everyone.
 */
export const ONBOARDING_CONTEXT_PROMPT = `I'm setting up Yappr, a voice-dictation app for my Mac. It cleans up what I say with an LLM, and it keeps a small profile of me so the result sounds like me and knows what I'm working on.

Write that profile. Use what you already know about me from our previous conversations. Where you don't know something, leave it out rather than guessing.

First, ONE paragraph, max 150 words — WHO I AM. My name, my email if you know it, my age, where I live, what I do for work, where I study, whether I run anything of my own, the people I work with and how, and how formally I write in different places (e.g. casual in iMessage, professional in email).

Then these headings, exactly as written. Skip any heading you have nothing real for.

GLOBAL
- Preferences that hold across EVERYTHING I work on, not just one product.
- e.g. "Uses TypeScript for every new project." / "Writes tests before implementation."

PROJECT: <name>
- What it is, in one line.
- Its stack, framework and architecture.
- Its conventions, and the rules I have set for it.
- Repeat this heading for each project you know by name.

PEOPLE
- One line per person I work with: who they are and what we do together.

UNSORTED
- Anything true and useful that fits nowhere above.

RULES — these matter more than completeness.

LENGTH. One fact per bullet, one sentence, UNDER 20 WORDS. Anything longer is discarded on import, so a long bullet is a lost bullet.

BE SPECIFIC. Name the actual tool, language, framework, or person. "Likes clean UI" is worthless. "Uses Tailwind and removes visible component outlines" is useful.

DURABLE ONLY. A standing rule, not a task. "Always uses TypeScript" belongs here. "Wants the sidebar text bigger" does not — that is a to-do, and it will be wrong next week.

SCOPE CAREFULLY. If a preference is about ONE product, put it under that PROJECT, not GLOBAL. Global facts are injected into every other project's prompts, so a misfiled one is actively misleading.

IDENTITY YES, TRIVIA NO. Name, age, city, school, job, company and colleagues all belong in the paragraph — they are how Yappr spells things right and works out who and what I am referring to. Skip anything with no bearing on what I write: pets, health, relationships, finances, politics.

DO NOT INVENT. If you do not know my stack, omit the line. A missing fact costs nothing. A wrong one silently steers every sentence I dictate from now on.

Output only the paragraph and the headings above. No preamble, no commentary, nothing after.`

export interface OnboardingImport {
  /** The "who you are" paragraph. Empty when the paste had none. */
  overview: string
  /** Preferences that apply everywhere. */
  global: string[]
  /** Facts per project key. */
  projects: Record<string, string[]>
  /** Anything the model could not attribute to a project. */
  unsorted: string[]
}

// Headings the prompt asks for. Matched leniently — models add
// punctuation, bold markers and colons unprompted, and a heading that
// fails to match silently drops the whole section.
const GLOBAL_HEADING_RE = /^[#*\s]*(?:global|everywhere|about me|preferences)\b[:\s]*[*#]*$/i
const PEOPLE_HEADING_RE = /^#*\s*PEOPLE\s*:?\s*$/i
const UNSORTED_HEADING_RE = /^[#*\s]*(?:unsorted|other|misc(?:ellaneous)?|unclear)\b[:\s]*[*#]*$/i
const PROJECT_HEADING_RE = /^[#*\s]*project\s*[:\-—]\s*(.+?)[\s*#]*$/i

// A bullet in any of the forms models emit.
const BULLET_RE = /^\s*(?:[-*•·]|\d+[.)])\s+(.*)$/

// Mirrors the store's cap so an import cannot write something the
// storage layer would then reject silently.
const MAX_FACT_CHARS = 200

type Section = 'overview' | 'global' | 'unsorted' | { project: string }

function normalizeKey(raw: string): string {
  return raw.trim().replace(/[`"'*]/g, '').replace(/\s+/g, ' ').toLowerCase()
}

function cleanFact(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, ' ').replace(/^[`"'*]+|[`"'*]+$/g, '').trim()
  if (!text) return null
  if (text.length > MAX_FACT_CHARS) return null
  // A lone word is not a fact — same rule the store applies.
  if (text.split(' ').length < 3) return null
  return text
}

/**
 * Parse a pasted onboarding response.
 *
 * When the paste contains no recognisable section headings, the whole
 * thing becomes the overview and the buckets come back empty — the
 * pre-existing behaviour, preserved deliberately.
 */
export function parseOnboardingImport(raw: string): OnboardingImport {
  const result: OnboardingImport = { overview: '', global: [], projects: {}, unsorted: [] }
  const input = (raw ?? '').trim()
  if (!input) return result

  const lines = input.split(/\r?\n/)
  let section: Section = 'overview'
  const overviewLines: string[] = []
  let sawHeading = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (GLOBAL_HEADING_RE.test(trimmed)) { section = 'global'; sawHeading = true; continue }
    if (UNSORTED_HEADING_RE.test(trimmed)) { section = 'unsorted'; sawHeading = true; continue }
    // PEOPLE folds into GLOBAL. Who someone works with is true wherever
    // they are working, and a separate tier would be a third scope for
    // getFactsFor to load and for the project cards to explain.
    if (PEOPLE_HEADING_RE.test(trimmed)) { section = 'global'; sawHeading = true; continue }
    const projectMatch = PROJECT_HEADING_RE.exec(trimmed)
    if (projectMatch) {
      const key = normalizeKey(projectMatch[1])
      if (key) { section = { project: key }; sawHeading = true; continue }
    }

    if (section === 'overview') {
      overviewLines.push(trimmed)
      continue
    }

    // Inside a section, take bullets. A non-bullet line here is usually
    // the model editorialising ("Here are the preferences:"), so it is
    // ignored rather than stored as a fact.
    const bullet = BULLET_RE.exec(line)
    if (!bullet) continue
    const fact = cleanFact(bullet[1])
    if (!fact) continue

    if (section === 'global') result.global.push(fact)
    else if (section === 'unsorted') result.unsorted.push(fact)
    else {
      const key = section.project
      ;(result.projects[key] ??= []).push(fact)
    }
  }

  // No headings at all → the old single-paragraph paste. Keep every word.
  result.overview = sawHeading
    ? overviewLines.join(' ').trim()
    : input

  return result
}

/** True when the paste produced nothing worth storing as facts. */
export function isOverviewOnly(parsed: OnboardingImport): boolean {
  return (
    parsed.global.length === 0 &&
    parsed.unsorted.length === 0 &&
    Object.keys(parsed.projects).length === 0
  )
}
