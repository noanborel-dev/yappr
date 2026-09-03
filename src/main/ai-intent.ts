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

// Word count below which a dictation is an aside, not a prompt worth
// restructuring. Calibrated against real usage: "let's see how well this
// works" (6) and "just wanted to see how quick this thing works" (9) are
// asides; "I think there's an issue because it's taking forever for things
// to paste, just check the logs and fix" (20) is a genuine instruction to
// an agent and does deserve shaping.
// Aligned with SHORT_UTTERANCE_MAX_WORDS (8) on purpose.
//
// At 12 there was a dead zone: an 8-11 word dictation was too long to
// skip the LLM and too short to reformat, so it took the faithful path —
// a full round-trip that returned the text almost unchanged. Observed:
// "I also have to respond to this one." and "This is what I needed to
// essentially rewrite." both cost ~2s to come back near-identical. Paying
// two seconds to change nothing is the worst of both options.
//
// One line now: under 8 words nothing is sent at all and the paste is
// immediate; at 8 or more, in an AI surface, it gets shaped into a real
// prompt. Nothing lands in between.
export const MIN_REFORMAT_WORDS = 8

// An explicit instruction to produce a prompt — "make a prompt to turn
// the landing page into a waitlist", "write me a prompt for...".
//
// This is the ONE spoken signal allowed to reach reformat on its own, and
// it does not weaken the invariant it appears to bend. That rule exists to
// stop a focus-DECOUPLED signal (an agent running in some background tab,
// an AI name merely mentioned) from restructuring words the user wanted
// verbatim. Saying "make me a prompt" is not a decoupled signal — it is
// the user asking for the thing, in as many words. Refusing there means
// refusing an explicit request.
//
// Deliberately narrow: a verb of creation, then "a/an/me a", then the noun.
// "at the prompt", "prompt me when it finishes", "the prompt was wrong"
// all fail it.
const EXPLICIT_PROMPT_RE =
  /\b(?:make|write|create|draft|turn\s+\w+\s+into|generate)\s+(?:me\s+)?(?:a|an|the)\s+(?:\w+\s+){0,2}prompt\b/i

export function isExplicitPromptRequest(transcript: string): boolean {
  return EXPLICIT_PROMPT_RE.test(transcript)
}

// Does this dictation ASK the AI to do something, or merely describe?
//
// Both deserve cleanup; only one deserves ## Goal / ## Context / ## Tasks.
// Wrapping a description in a task template invents a job the user never
// asked for, and it is also the slow path — shaping runs a heavier model.
// Descriptive input takes the fast register instead, which is where most
// of the latency saving on long dictations comes from.
//
// POSITION matters more than vocabulary here. "This is what I needed to
// essentially rewrite" contains a request verb and is plainly a
// description; "rewrite the auth module" is the same verb doing the
// opposite job. So a bare verb only counts when it OPENS a sentence —
// where English puts imperatives — or when an explicit directive phrase
// addresses the assistant.
// "I need you to X" was too strict. Real dictation states the need
// directly — "I need a waitlist page, and I need the copy tightened" —
// and describing a need IS asking for it. Bare "I need/I want/we need"
// counts, as do "it should" / "needs to", which are how requirements get
// phrased when the speaker is halfway between describing and asking.
const DIRECTIVE_PHRASE_RE = new RegExp([
  /\b(?:can|could|would|will)\s+you\b/,
  /\bplease\b/,
  /\b(?:i|we)\s+(?:want|need|would\s+like)\b/,
  // Any subject + "should" is a requirement, and a requirement is a
  // request: "the empty state should say something friendlier". Only
  // "I should" is excluded — that one is the speaker talking to
  // themselves, not asking for anything.
  /(?<!\bi\s)\bshould\b/,
  /\bneeds?\s+to\s+(?:be|have|get|do)\b/,
  /\bmake\s+sure\s+(?:you|to|that)\b/,
  /\blet'?s\b/,
].map(r => r.source).join('|'), 'i')

// Verbs that, when they OPEN a clause, are an instruction.
const IMPERATIVE_VERBS = [
  'add', 'build', 'change', 'check', 'clean', 'create', 'debug', 'delete',
  // design/draft/plan/sketch are how design and planning work get asked
  // for, and their absence made "design a landing page" read as prose
  // while "build a landing page" read as a request. They are safe here
  // because CLAUSE_OPENER_RE only fires at a clause opening: "the design
  // is wrong" and "I plan to rewrite it" do not match.
  'design', 'document', 'draft', 'find', 'fix', 'generate', 'give', 'go',
  'implement', 'improve', 'install', 'look', 'make', 'migrate', 'move',
  'open', 'optimize', 'plan', 'refactor', 'remove', 'rename', 'replace',
  'rewrite', 'run', 'set', 'show', 'sketch', 'split', 'start', 'stop',
  'switch', 'take', 'tell', 'turn', 'update', 'use', 'write',
]
const CLAUSE_OPENER_RE = new RegExp(
  // Start of text, after sentence punctuation, after a COMMA, or after
  // a coordinator. The comma case is not optional: English routinely
  // hangs an imperative off one — "there's an issue, just check the logs
  // and fix it" is a request, and without it that reads as description.
  //
  // The trailing \b is load-bearing: without it "changed everything"
  // matches `change` and a past-tense description reads as an instruction.
  String.raw`(?:^|[.!?;,]\s+|\b(?:and|then|also)\s+)(?:please\s+|just\s+)?(` +
  IMPERATIVE_VERBS.join('|') + String.raw`)\b`,
)

/**
 * Does the text OPEN with an imperative verb — "build a landing page",
 * "fix the login bug"?
 *
 * Narrower than isActionableRequest on purpose, and the difference is
 * load-bearing where it is used. isActionableRequest also fires on
 * "let's", "please", "can you" and "should", which are enough to call
 * something a request at length but are NOT enough to call a six-word
 * aside a prompt: "let's see how quick this is" satisfies it, and that
 * exact phrase is the one that went to the LLM, 429'd and took 6.5s (see
 * the ordering note in cleanup-policy.ts).
 *
 * A verb of action in the opening position is the stronger signal, and
 * it is what the reduced word floor keys on.
 */
export function hasImperativeOpener(transcript: string): boolean {
  return CLAUSE_OPENER_RE.test(stripQuotedSpans(transcript.toLowerCase()))
}

export function isActionableRequest(transcript: string): boolean {
  const text = stripQuotedSpans(transcript.toLowerCase())
  if (DIRECTIVE_PHRASE_RE.test(text)) return true
  if (CLAUSE_OPENER_RE.test(text)) return true
  return false
}

function wordCount(transcript: string): number {
  return transcript.trim().split(/\s+/).filter(Boolean).length
}

export function hasPromptSubstance(transcript: string): boolean {
  return wordCount(transcript) >= MIN_REFORMAT_WORDS
}

// A lower floor, for text that is unmistakably a request.
//
// MIN_REFORMAT_WORDS is a PROXY for "is there enough substance to shape".
// isActionableRequest measures the same thing directly, so where it fires
// the proxy can relax. Without this the floor was a cliff that meaning
// could not see: "build a landing page about my app" (7) took the
// faithful path and came back near-identical, while "build ME a landing
// page about my app" (8) got shaped. One semantically empty word decided
// it.
//
// Five, not lower: "fix the login bug" (4) is already clear and short
// enough that shaping invents structure nobody asked for.
//
// Deliberately scoped to the AI-CLI route. The other reformat routes keep
// the 8-word floor, so the 2026-07-29 latency measurement that set it is
// not reopened across the board.
export const MIN_ACTIONABLE_REFORMAT_WORDS = 5

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

// Where a reformatted prompt is headed. Shapes the prompt: an agentic
// tool has the repo, git, a shell and the test suite; a chat assistant
// has none of that, so telling it to "run the tests" is noise.
//
// Note readable-chat-textarea is AGENTIC, not chat — that route fires on
// Cursor / VS Code chat panes, which do have repo access. Only the
// standalone assistants and browser AI URLs are 'chat'.
export type PromptDestination = 'agentic' | 'chat'

export interface CodeSurfaceResult {
  register: CodeRegister
  reason: string
  // Only meaningful when register === 'reformat'.
  destination?: PromptDestination
}

// Three-way routing. Decision order, first match wins.
export function classifyCodeSurface(input: CodeSurfaceInput): CodeSurfaceResult {
  // 1) REFORMAT — focus-LOCALIZED AI surface ONLY (never a decoupled signal).
  //
  // Every route below is gated on the SAME word floor as the AI-CLI route.
  // It used to guard only that one, so a nine-word aside in ChatGPT — or
  // anywhere the AX probe happened to return AXTextArea — got the full
  // markdown-section treatment. Since the probe is unreliable on Electron
  // editors (AXTextArea / AXTextField / no-focus for the same caret), that
  // made reformat fire unpredictably on identical input. Now length decides
  // first, so the behaviour is explainable. Strictly more conservative:
  // this only ever removes LLM calls.
  const substantial = hasPromptSubstance(input.transcript)

  // Asked for outright — honour it wherever they are, so long as there is
  // enough to shape. Placed above the surface routes because it does not
  // depend on being in an AI app at all: "make a prompt to turn our
  // landing page into a waitlist" deserves shaping whether it is going to
  // Claude Code, a browser, or a notes app.
  if (substantial && isExplicitPromptRequest(input.transcript)) {
    return { register: 'reformat', reason: 'explicit-prompt-request', destination: 'agentic' }
  }
  if (substantial) {
    if (input.isPrimaryAiBundle) {
      return isActionableRequest(input.transcript)
        ? { register: 'reformat', reason: 'primary-ai-app', destination: 'chat' }
        : { register: 'faithful_ai', reason: 'primary-ai-descriptive' }
    }
    if (input.browserAiRouted) {
      return { register: 'reformat', reason: 'browser-ai-url', destination: 'chat' }
    }
    if (input.category === 'code' && input.axRole === 'AXTextArea' && input.isAxReadable === true) {
      // Cursor / VS Code chat panes: agentic, they can see the repo.
      return isActionableRequest(input.transcript)
        ? { register: 'reformat', reason: 'readable-chat-textarea', destination: 'agentic' }
        : { register: 'faithful_ai', reason: 'chat-textarea-descriptive' }
    }
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
  //
  // Gated on LENGTH. Reformat sends a large markdown-template system prompt
  // (plus the context block) and restructures the text — worth it for a real
  // prompt, ruinous for an aside. Measured on 2026-07-29: routing every
  // dictation through it took paste latency from ~1.4s to 3–7s, because the
  // heavy prompt on every clip chews through the 6000 TPM Groq budget and
  // starts getting rate-limited. It also mangles short input (46 chars in,
  // 27 out). The ai_prompt template's own sections are specified for input
  // of "2+ sentences", so anything shorter has no business there — it takes
  // the cheap faithful path instead, which still fixes "cloud"→"Claude".
  if (input.terminalAiCli?.isAiCli) {
    // Only shape it if it actually asks for something. Describing what you
    // did is not a task list, and forcing it into one invents work nobody
    // requested — as well as taking the slow model.
    const actionable = isActionableRequest(input.transcript)
    // An imperative OPENER carries the substance the word floor stands in
    // for, so it clears a lower bar. Deliberately hasImperativeOpener and
    // not isActionableRequest: the latter also fires on "let's", which
    // would drag "let's see how quick this is" (6 words) into reformat —
    // the phrase that 429'd and cost 6.5s. Everything else keeps the full
    // floor, where both outcomes are faithful anyway and the two reasons
    // differ only in the logs.
    const floor = hasImperativeOpener(input.transcript)
      ? MIN_ACTIONABLE_REFORMAT_WORDS
      : MIN_REFORMAT_WORDS
    if (wordCount(input.transcript) < floor) {
      return { register: 'faithful_ai', reason: 'ai-cli-detected-short' }
    }
    return actionable
      ? { register: 'reformat', reason: 'ai-cli-detected', destination: 'agentic' }
      : { register: 'faithful_ai', reason: 'ai-cli-descriptive' }
  }

  // Short dictation into a focus-localized AI surface: too small to
  // restructure, but still worth the faithful pass so "cloud" -> "Claude"
  // and friends get fixed.
  if (!substantial && (input.isPrimaryAiBundle || input.browserAiRouted)) {
    return { register: 'faithful_ai', reason: 'ai-surface-short' }
  }

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
