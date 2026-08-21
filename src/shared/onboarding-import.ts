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
