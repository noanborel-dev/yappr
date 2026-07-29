import type { AppCategory } from '../shared/types'

// Pure, electron-free classifier for "is the user prompting an AI?" inside
// (or around) a code editor. Kept dependency-free so it is fully
// vitest-covered and the load-bearing safety invariants are enforceable as
// code. Nothing imports this yet — wiring lands in a later phase.
//
// THE INVARIANT (from the design review): a focus-DECOUPLED signal — an AI
// CLI running in a background terminal tab, or words the user merely spoke
// — can NEVER reach the destructive REFORMAT path. Those only ever escalate
// to FAITHFUL_AI (run the LLM, fix brand names, but preserve every word).
// REFORMAT requires a focus-LOCALIZED signal (the user is literally in a
// known AI chat surface).
//
// AMENDED 2026-07-29 — the invariant now has exactly ONE deliberate
// exception: a detected AI CLI routes to REFORMAT (see rule 1b). Spoken
// words alone still cannot; that half of the invariant is intact and still
// enforced by test. Any NEW signal added here inherits the original rule
// unless it is explicitly argued otherwise.

export type AiCue = 'strong' | 'weak' | 'none'
export type CodeRegister = 'reformat' | 'faithful_ai' | 'code'

// Unambiguous AI assistant names. Saying one of these in a dictation is a
// STRONG signal the user is addressing an AI. Deliberately EXCLUDES words
// that double as common dictation/coding terms ("cursor" = the text caret,
// "grok" = the verb) — Cursor-the-app is detected by bundleId, not by the
// spoken word.
const AI_NAMES = ['claude', 'chatgpt', 'chat gpt', 'gpt', 'copilot', 'gemini', 'perplexity']

// How Whisper mishears "Claude". These are ordinary English words too, so
// they only count as a cue when a technical word sits nearby (mirrors the
// existing guarded QUICK_FIXES cloud→Claude rule).
const AI_NAME_MISHEARS = ['cloud', 'clawed']
const TECH_CONTEXT = [
  'refactor', 'auth', 'module', 'function', 'endpoint', 'repo', 'api', 'sdk',
  'regex', 'async', 'component', 'bug', 'test', 'code', 'commit', 'merge',
  'typescript', 'prompt', 'token',
]

// Verbs that on their own read as an instruction to an assistant.
const HARD_REQUEST_VERBS = ['refactor', 'implement', 'debug', 'optimize', 'rewrite', 'rename']
// Generic verbs that only signal a coding request alongside politeness or a
// coding noun ("add a test" yes; "add the numbers" no).
const GENERIC_VERB_RE = /\b(add|fix|write|make|create|update|change|explain|test)\b/i
const POLITE_PREFIX_RE = /\b(can you|could you|would you|please)\b/i
const CODING_NOUNS = [
  'test', 'tests', 'function', 'method', 'type', 'prop', 'field', 'param',
  'endpoint', 'route', 'component', 'hook', 'bug', 'module', 'class',
  'variable', 'interface', 'regex', 'api',
]

// Strip dictated string literals / comments so an AI name quoted as a value
// or a comment does not escalate (FP1). Handles "quote … unquote" spans and
// dictated line-comment markers.
function stripQuotedSpans(text: string): string {
  let out = text.replace(/\bquote\b[\s\S]*?\bunquote\b/gi, ' ')
  out = out.replace(/\b(slash slash|hash|pound|comment)\b[\s\S]*/gi, ' ')
  return out
}

function words(text: string): string[] {
  return text.split(/\s+/).map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean)
}

function mishearNearTech(toks: string[], word: string): boolean {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== word) continue
    const lo = Math.max(0, i - 5)
    const hi = Math.min(toks.length, i + 6)
    for (let j = lo; j < hi; j++) {
      if (j !== i && TECH_CONTEXT.includes(toks[j])) return true
    }
  }
  return false
}

function hasStrongCue(text: string, toks: string[]): boolean {
  for (const name of AI_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) return true
  }
  for (const mis of AI_NAME_MISHEARS) {
    if (mishearNearTech(toks, mis)) return true
  }
  return false
}

function hasWeakCue(text: string, toks: string[]): boolean {
  for (const v of HARD_REQUEST_VERBS) {
    if (toks.includes(v)) return true
  }
  if (POLITE_PREFIX_RE.test(text) && GENERIC_VERB_RE.test(text)) return true
  if (GENERIC_VERB_RE.test(text) && toks.some((t) => CODING_NOUNS.includes(t))) return true
  return false
}

// Classify how strongly a transcript reads as "addressed to an AI".
export function detectAiAddressing(transcript: string): AiCue {
  const text = stripQuotedSpans(transcript.toLowerCase())
  const toks = words(text)
  if (hasStrongCue(text, toks)) return 'strong'
  if (hasWeakCue(text, toks)) return 'weak'
  return 'none'
}

export interface CodeSurfaceInput {
  category: AppCategory
  transcript: string
  bundleId?: string
  // Focused-element AX role at hotkey press (paste.ts probe).
  axRole?: string
  // Whether the AX role is a real reading (not 'no-focus' / 'script-error').
  isAxReadable?: boolean
  // Result of the integrated-terminal AI-CLI ps-tree scan.
  terminalAiCli?: { isAiCli: boolean; cli?: string }
  // Focused app is a dedicated AI chat app (ChatGPT/Claude desktop, …).
  isPrimaryAiBundle?: boolean
  // Focused browser tab resolved to an AI chat URL/host.
  browserAiRouted?: boolean
  // User opted into the (lower-precision) weak-cue escalation.
  weakCueSettingOn?: boolean
}

export interface CodeSurfaceResult {
  register: CodeRegister
  reason: string
}

// Three-way routing. Decision order, first match wins.
export function classifyCodeSurface(input: CodeSurfaceInput): CodeSurfaceResult {
  // 1) REFORMAT — focus-LOCALIZED AI surface ONLY (never a decoupled signal).
  if (input.isPrimaryAiBundle) return { register: 'reformat', reason: 'primary-ai-app' }
  if (input.browserAiRouted) return { register: 'reformat', reason: 'browser-ai-url' }
  if (input.category === 'code' && input.axRole === 'AXTextArea' && input.isAxReadable === true) {
    return { register: 'reformat', reason: 'readable-chat-textarea' }
  }

  // 1b) REFORMAT — a DETECTED AI CLI in the focused app's process subtree.
  //
  // Option C (user decision 2026-07-29), superseding Option B: "when Claude
  // Code is detected, it should start writing things in a clear way." If an
  // agent CLI is running where you are working, you are overwhelmingly
  // talking TO it, and the product's value there is producing a well-shaped
  // prompt — not a verbatim transcript.
  //
  // This DELIBERATELY relaxes the original invariant (a focus-decoupled
  // signal never reaching destructive reformat). The accepted cost: dictating
  // a code comment into the editor pane while an agent runs in the integrated
  // terminal gets restructured, because a process scan cannot see where the
  // caret is. The other three reformat routes above remain focus-localized;
  // this is the single deliberate exception, and it is the one the user asked
  // for. Revisit by gating on caret position if editor-pane dictation ever
  // becomes common.
  if (input.terminalAiCli?.isAiCli) return { register: 'reformat', reason: 'ai-cli-detected' }

  // 2) FAITHFUL_AI — run the LLM, stay faithful. Reached when the user merely
  //    SPOKE an AI name with no tool detected: enough to fix "cloud"→"Claude"
  //    and friends, not enough to justify restructuring their words.
  const cue = detectAiAddressing(input.transcript)
  if (cue === 'strong') return { register: 'faithful_ai', reason: 'strong-cue' }
  // Opt-in: escalate on a weak spoken cue even when no tool was detected —
  // rescues editors we can't see into (JetBrains, etc.). Off by default
  // (low precision); still capped at faithful, never reformat.
  if (input.weakCueSettingOn && cue === 'weak') return { register: 'faithful_ai', reason: 'weak-cue-opt-in' }

  // 3) CODE — verbatim, skip-eligible. The fast path is preserved.
  return { register: 'code', reason: 'no-ai-signal' }
}
