// Appending the user's standing preferences to a shaped prompt, in code.
//
// WHY THIS IS NOT A PROMPT RULE.
//
// It was, five times. The context block was reworded (ba9f214), given a
// prompt-specific framing (ba9f214), split by destination (bd5961c), made
// mandatory in capitals — "## Constraints — REQUIRED... Omitting them is
// the failure this section exists to prevent" (8b29606) — and moved to sit
// immediately before the transcript instead of 25% into the prompt
// (8b29606). Measured after all of it, on the build containing all of it:
//
//   said:   "I really want to build a landing page with a sidebar..."
//   output: "## Goal\nBuild a landing page with a sidebar that includes
//            all features of the app."
//
// 3,432 characters of context attached. No constraints. The model is
// being asked to read 12,700 characters of rules, hold 3,400 characters
// of facts, judge which are relevant, and emit a structured document —
// and it drops the judgement step every time.
//
// So the judgement moves into code. The model shapes the request; the
// pipeline attaches the rules. A deterministic append cannot be
// forgotten, cannot be crowded out by a longer prompt, and does not care
// which model is behind the endpoint.

import type { StoredFact } from './types'

/**
 * Words that mark a preference as changing HOW something gets built.
 *
 * "I want fluid animations" changes a landing page. "Wants direct,
 * critical feedback" describes how to talk to the user and belongs
 * nowhere near a prompt for an agent. Scoring on these is what separates
 * the two without asking a model.
 */
const BUILD_RELEVANT = [
  'anim', 'colour', 'color', 'theme', 'style', 'styling', 'font', 'typograph',
  'mobile', 'responsive', 'layout', 'spacing', 'ui', 'component', 'design',
  'framework', 'language', 'typescript', 'javascript', 'react', 'tailwind',
  'css', 'accessib', 'test', 'lint', 'dark mode', 'light mode', 'outline',
  'polish', 'demo', 'slider', 'landing page', 'sidebar', 'onboarding',
]

/** How many constraints to attach. */
export const MAX_CONSTRAINTS = 6

/**
 * Does the keyword appear at the START of a word?
 *
 * The shorter entries above are prefixes on purpose — 'anim' has to
 * reach "animations", 'accessib' has to reach "accessibility" — so this
 * cannot be a whole-word test. But it must not be a bare substring test
 * either: 'ui' is two letters and sits inside require, built, fluid,
 * guided and liquid. Measured against the user's 71 stored facts, that
 * inflated six scores and admitted one fact on nothing else —
 *
 *   "I always require prompts to include all relevant context and
 *    constraints."
 *
 * — which is a bug report about Yappr, i.e. precisely what the comment
 * above says this module keeps out of a build prompt. It stayed out of
 * the top six by luck of the other scores, not by design.
 */
function containsAtWordStart(haystack: string, needle: string): boolean {
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(haystack[i - 1])) return true
  }
  return false
}

function score(text: string): number {
  const t = text.toLowerCase()
  return BUILD_RELEVANT.reduce((n, k) => (containsAtWordStart(t, k) ? n + 1 : n), 0)
}

/**
 * The preferences worth attaching to a build request, best first.
 *
 * Sorted by build-relevance and then by recency, rather than recency
 * alone — which is how a week of debugging notes came to fill the
 * injection budget while "I want fluid animations in interfaces" sat
 * below the cut.
 */
export function selectConstraints(
  facts: readonly StoredFact[],
  limit: number = MAX_CONSTRAINTS,
): StoredFact[] {
  return [...facts]
    .map((f) => ({ f, s: score(f.text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.f.createdAt - a.f.createdAt || b.f.id - a.f.id)
    .slice(0, Math.max(0, limit))
    .map((x) => x.f)
}

/** Normalised for comparison, so a bullet the model already wrote is not repeated. */
function key(line: string): string {
  return line.replace(/^[-*\d.\s]+/, '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')
}

/**
 * Attach the constraints to a shaped prompt.
 *
 * Only touches output that the model ALREADY shaped — it must contain a
 * `##` heading. A short request that came back as flat prose stays flat;
 * turning "run the tests" into a document would be its own bug.
 *
 * Merges into an existing `## Constraints` section rather than adding a
 * second one, and skips any bullet the model already wrote.
 */
export function appendConstraints(output: string, facts: readonly StoredFact[]): string {
  const text = (output ?? '').trimEnd()
  if (!text.includes('##')) return output
  const picked = selectConstraints(facts)
  if (picked.length === 0) return output

  const existing = /^##\s*Constraints\s*$/im.exec(text)
  const already = new Set(text.split('\n').filter((l) => /^\s*[-*]/.test(l)).map(key))
  const bullets = picked.filter((f) => !already.has(key(f.text))).map((f) => `- ${f.text}`)
  if (bullets.length === 0) return output

  if (!existing) return `${text}\n\n## Constraints\n${bullets.join('\n')}`

  // Insert at the end of the existing section, before the next heading.
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^##\s*Constraints\s*$/i.test(l))
  let end = start + 1
  while (end < lines.length && !/^##\s/.test(lines[end])) end++
  while (end > start + 1 && lines[end - 1].trim() === '') end--
  lines.splice(end, 0, ...bullets)
  return lines.join('\n')
}
