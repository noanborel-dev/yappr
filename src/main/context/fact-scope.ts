// Which tier a remembered fact belongs to, and whether a dictation
// contained a durable rule worth remembering at all.
//
// Two tiers (spec §1.2):
//   global  — about the USER, true everywhere. "I always use TypeScript."
//   project — about one codebase, stack or product. "Yappr uses Groq."
//
// The default is `project`, deliberately. Misfiling a project fact as
// global contaminates every other project's prompt with something untrue
// there; misfiling a global preference as project-scoped only means it
// applies in fewer places than it could. The failure modes are not
// symmetric, so ambiguity resolves toward the narrower scope.
//
// Detection (spec §3) is deliberately strict. A dictation is mostly
// one-off instructions, and promoting one to a standing rule means it
// silently steers every future prompt. A missed rule costs the user one
// re-statement; a wrong rule is invisible and persistent. So a sentence
// must carry BOTH a durability marker and a convention-shaped predicate
// before it counts.
//
// Pure — no electron, no store.

import type { FactScope } from '../../shared/types'
export type { FactScope }

export interface StandingPreference {
  /** The rule, in the user's own words. */
  text: string
  scope: FactScope
}

// "I always...", "I prefer..." — the spec's global signal. Anchored to
// first-person SINGULAR: "we always use zod" is a team/codebase
// convention and belongs to the project, not the person.
const FIRST_PERSON_PREFERENCE_RE =
  /\b(?:i)\s+(?:always|never|usually|generally|typically|tend to|like to|prefer|hate|avoid|don't like|do not like)\b/i

const MY_PREFERENCE_RE = /\bmy\s+(?:preference|style|convention|default|rule)\b/i

// Signals that pin a statement to the thing being worked on right now.
// These beat the first-person signal — "I always use Tailwind on this
// project" is scoped, however it opens.
const PROJECT_SCOPE_RE =
  /\b(?:this|the)\s+(?:project|repo|repository|codebase|app|service|package|module)\b|\b(?:here|in this one|on this one)\b/i

// Durability: the statement is a rule, not a request for right now.
const DURABILITY_RE =
  /\b(?:always|never|by default|from now on|going forward|in future|in the future|every time|each time|as a rule|our (?:convention|standard|rule)|we (?:use|write|prefer)|i (?:use|write|prefer))\b/i

// Convention-shaped predicates. Without one of these, "always" is
// usually part of a complaint or an observation ("I always get an error
// when I click save") rather than a preference.
const CONVENTION_VERB_RE =
  /\b(?:use|uses|used|using|prefer|prefers|preferred|write|writes|written|format|formats|name|names|naming|indent|avoid|avoids|stick to|go with|default to|structure|style|test|tests|import|imports|export|exports|type|types|lint|run)\b/i

// Statements about a person's feelings or experience rather than a
// working convention. These carry durability markers but are not rules.
const NOT_A_RULE_RE =
  /\b(?:get|gets|getting|got|see|sees|saw|seeing|happens?|happened|breaks?|broke|fails?|failed|crash(?:es|ed)?|forget|forgets|forgot)\b/i

/**
 * Which tier a fact belongs to. Defaults to `project` — see the note at
 * the top of this file on why ambiguity resolves narrow.
 */
export function classifyFactScope(fact: string): FactScope {
  const text = (fact ?? '').trim()
  if (!text) return 'project'
  // An explicit project reference wins outright, even in a sentence that
  // otherwise reads as a personal preference.
  if (PROJECT_SCOPE_RE.test(text)) return 'project'
  if (FIRST_PERSON_PREFERENCE_RE.test(text) || MY_PREFERENCE_RE.test(text)) return 'global'
  return 'project'
}

// Split on sentence boundaries AND on the conjunctions people actually
// speak in, so one dictation can yield more than one rule.
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s*[;\n]+\s*/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Pull durable rules out of a dictation. Returns [] for the common case
 * of a dictation that contains no standing preference at all.
 *
 * Both a durability marker and a convention verb are required — see the
 * note at the top of this file.
 */
export function extractStandingPreferences(dictation: string): StandingPreference[] {
  const out: StandingPreference[] = []
  for (const sentence of sentences(dictation ?? '')) {
    if (!DURABILITY_RE.test(sentence)) continue
    if (!CONVENTION_VERB_RE.test(sentence)) continue
    // "I always get an error" has both markers but states a symptom.
    if (NOT_A_RULE_RE.test(sentence)) continue
    // A question is asking about a convention, not declaring one.
    if (sentence.trimEnd().endsWith('?')) continue
    out.push({ text: sentence, scope: classifyFactScope(sentence) })
  }
  return out
}

/** Convenience predicate for callers that only need a yes/no. */
export function containsStandingPreference(dictation: string): boolean {
  return extractStandingPreferences(dictation).length > 0
}
