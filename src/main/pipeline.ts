import { buildCleanupPrompt, type Register } from '../shared/prompts'
import {
  looksLikeEmailRewrite,
  buildRewriteSystemPrompt,
  buildRewriteUserMessage,
  normalizeEmailRewrite,
  normalizeComposedEmail,
  senderNameFromOverview,
  asksForEmailComposition,
  instructsMessageComposition,
  looksLikeMetaReply,
} from '../shared/rewrite-prompt'
import { buildContextBlock } from './context/prompt-injector'
import { composedEmailBodyChars } from '../shared/rewrite-prompt'
import { getUserOverview } from './context/store'
import { extractProjectKey, canonicalProjectKey } from './context/project-key'
import { extractStandingPreferences } from './context/fact-scope'
import { addFact } from './context/facts'
import { applyUltrathink, isUltrathinkSurface } from './ultrathink'
import { recordDictationStat } from './stats-store'
// Where compose takes over in an email client, with no explicit ask.
//
// 12, matching the reformat floor in ai-intent: below this a dictation is
// a reply, not a brief. The two thresholds are set independently and are
// not required to agree, but they answer the same question — "is there
// enough here to restructure?" — and landing on the same number is not a
// coincidence worth breaking.
const EMAIL_COMPOSE_MIN_WORDS = 12
import { wordCount, speakingMsFromAudioBytes } from '../shared/dictation-stats'
import { MODELS, BUILTIN_DICTIONARY, DICTIONARY_ALIASES, IDE_EDITORS, AGENTIC_AI_APP_NAMES } from '../shared/constants'
import type { AppCategory, DictationResult, Settings, Strictness } from '../shared/types'
import { isRewriteEntry, spokenText } from '../shared/history-entry'
import { selectionLikelyStale } from './rewrite-guard'
import { applySelfCorrection } from '../shared/correction-pass'
import { digitsForSpokenNumbers } from '../shared/spoken-numbers'
import { applyNearMissTerms } from '../shared/near-miss'
import type { FocusedApp } from './focused-app'
import type { TranscriptionProvider, CleanupProvider } from './providers/types'
import {
  createGroqTranscriptionProvider,
  createGroqCleanupProvider,
  judgeEmoji,
} from './providers/groq'
import { createLocalWhisperProvider, createLocalCleanupProvider } from './providers/local'
import { captureFocusedApp, getFocusedApp } from './focused-app'
import { pasteText, probeFocusedAXRole, getPressTimeAXRolePromise } from './paste'
import { logInfo, logError } from './log'
import { NoSpeechError, ModelUnsupportedError } from './errors'
import { focusedAppRunningAiCli } from './terminal-ai-cli'
import { classifyCodeSurface, isExplicitPromptRequest } from './ai-intent'
import type { PromptDestination } from './ai-intent'
import { countWords, cleanupSkipReason, cleanupRetryDecision } from './cleanup-policy'

// Apps that are PRIMARILY AI chat surfaces. Dictation here is always
// a prompt to an AI assistant — route to 'ai_prompt' regardless of
// AX role. Adding new entries: prefer apps where the entire surface
// is AI chat (ChatGPT desktop, Claude desktop, Perplexity), NOT apps
// that mix AI chat with other surfaces (those are detected via the
// AXTextArea role inside a 'code'-categorized app).
const PRIMARY_AI_CHAT_BUNDLES = new Set([
  'com.openai.chat',           // ChatGPT desktop
  'com.anthropic.claudefordesktop',  // Claude desktop
  'ai.perplexity.mac',          // Perplexity
])

// AX roles that indicate the user is in an AI-chat input WITHIN a
// 'code' category app (Cursor, Antigravity, VS Code with Copilot
// Chat). AXTextArea = multi-line chat input. Code editor panes
// usually report AXWebArea, AXTextField, or no-focus.
const CODE_APP_AI_CHAT_ROLES = new Set([
  'AXTextArea',
])

// Whisper hallucinates these on silent / near-silent audio. If the
// transcript is exactly one of these (case-insensitive, trimmed of
// punctuation), treat it as no speech.
const HALLUCINATIONS = new Set([
  '',
  '.',
  '...',
  'thanks for watching',
  'thanks for watching!',
  'thank you',
  'thank you.',
  'thanks',
  'you',
  'bye',
  'bye.',
  'okay',
  'ok',
  'mm',
  'mhm',
  'uh',
  'um',
  '[blank_audio]',
  '[silence]',
  '[music]',
  '[no audio]',
])

function isLikelySilence(transcript: string): boolean {
  const cleaned = transcript.trim().toLowerCase().replace(/[.!?,]+$/g, '')
  if (cleaned.length === 0) return true
  if (HALLUCINATIONS.has(cleaned)) return true
  // Very short outputs (< 2 chars after trimming punctuation) are almost
  // always silence-induced. Real dictation is at least a word.
  if (cleaned.length < 2) return true
  return false
}

function buildProviders(
  settings: Settings
): { transcription: TranscriptionProvider; cleanup: CleanupProvider; cleanupAvailable: boolean } {
  const { provider, groqKey, transcriptionModel, cleanupModel } = settings.provider

  if (provider === 'local') {
    // Transcription is always on-device. Cleanup always needs Groq.
    //
    // The no-op fallback below used to serve a "Local means local"
    // promise: a user who chose the Local PROVIDER and never configured
    // Groq should never see a network call. That choice no longer exists
    // — there is one transcription engine and cleanup is the only thing
    // the key buys — so the fallback stopped protecting a preference and
    // started silently disabling the product. Dictations transcribed fine
    // and pasted raw, with no cleanup and no prompt shaping, and nothing
    // anywhere said why.
    //
    // Keep the no-op (losing the user's words would be far worse) but
    // report that cleanup is unavailable so the caller can SAY so.
    const hasKey = groqKey.trim().length > 0
    return {
      transcription: createLocalWhisperProvider(),
      cleanup: hasKey
        ? createGroqCleanupProvider(groqKey, MODELS.groq.cleanup, MODELS.groq.reformat)
        : createLocalCleanupProvider(),
      cleanupAvailable: hasKey,
    }
  }

  return {
    transcription: createGroqTranscriptionProvider(groqKey, transcriptionModel),
    cleanup: createGroqCleanupProvider(groqKey, cleanupModel, MODELS.groq.reformat),
    cleanupAvailable: groqKey.trim().length > 0,
  }
}

// Run the given async fn; if it rejects, retry once after a short delay.
// Used for transcription + cleanup since both are network calls that can
// transiently fail (cold-start timeouts, dropped connections).
//
// NoSpeechError is treated as terminal — re-running the same audio
// always produces the same hallucination, so retry is wasted latency.
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof NoSpeechError) throw err
    // Retrying a model the binding cannot load just repeats the same
    // failure and triples the delay before the user sees the reason.
    if (err instanceof ModelUnsupportedError) throw err
    logError(`${label} failed (attempt 1) — retrying`, err)
    await new Promise(r => setTimeout(r, 250))
    try {
      return await fn()
    } catch (err2) {
      logError(`${label} failed (attempt 2) — giving up`, err2)
      throw err2
    }
  }
}

// Cleanup-specific retry. On a Groq 429 the error message embeds
// "Please try again in Ns" — parse it and wait up to a 5s cap before
// the second attempt instead of the fixed 250ms used by withRetry.
// Caps the wait because the hot path is user-facing: a 28s wait
// here is worse than failing fast and falling back to the raw
// transcript. For non-429 failures (network, timeout) we use the
// existing fast retry.
async function withCleanupRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof NoSpeechError) throw err
    const decision = cleanupRetryDecision(err)
    // Groq told us the rate-limit window is longer than we're willing
    // to stall the user for. A retry cannot succeed, so don't burn the
    // wait — fall back to the raw transcript immediately. This is what
    // turned short dictations into 6.7s round-trips: two doomed
    // attempts against a 28s window.
    if (!decision.retry) {
      logError('Cleanup rate-limited beyond wait cap — using raw transcript', err)
      throw err
    }
    logError('Cleanup failed (attempt 1) — retrying', err)
    await new Promise(r => setTimeout(r, decision.waitMs))
    try {
      return await fn()
    } catch (err2) {
      logError('Cleanup failed (attempt 2) — giving up', err2)
      throw err2
    }
  }
}

// Length-ratio guard thresholds. Only fire when the input is long
// enough to be a real dictation (not a one-line message), and only
// fail when the output is dramatically shorter than the input.
// 0.4 means "if the cleaned output is less than 40% of the input
// length, treat that as a summarization failure." Catches the 4%
// and 1% production cases without false-positiving on normal
// filler removal (~85-95% retention is typical).
// Below this many characters of BODY, a composed email is a shell rather
// than a terse email. The two live successes on the same day ran to ~880
// characters of body; the failure had zero. Forty is about one short
// sentence -- low enough that a genuinely brief reply survives, high
// enough that a greeting and a sign-off alone do not.
const COMPOSED_EMAIL_MIN_BODY_CHARS = 40

const LENGTH_GUARD_MIN_INPUT_CHARS = 300
const LENGTH_GUARD_MIN_RATIO = 0.4
function buildDictionary(settings: Settings): string[] {
  const user = settings.userDictionary ?? []
  // Lowercased de-dup so the same term in different cases doesn't repeat.
  const seen = new Set<string>()
  const out: string[] = []
  for (const term of [...BUILTIN_DICTIONARY, ...user]) {
    const k = term.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(term.trim())
  }
  return out
}

// Heuristic: can we skip the LLM cleanup pass entirely?
//
// Two cleanup modes (see prompts.ts):
//   - FAITHFUL (code): only used to normalize jargon/paths/casing. If the
//     transcript has no filler/stutter/correction markers, raw Whisper
//     output is good enough — skip.
//   - POLISHED (messaging/email/docs/other): restructures rambling into
//     clean prose even when there are no obvious filler markers, so we
//     can't skip based on absence of fillers alone. Only skip very short
//     inputs where there's nothing meaningful to polish.

// Deterministic regex pass for the most common Whisper mishearings of
// tech brand names. Applied to EVERY transcript (even fast-path skips)
// so brand names come out right regardless of whether the LLM cleanup
// runs. Context-aware: each replacement requires a tech-y neighbour
// to avoid clobbering legitimate uses ("cloud computing" stays).
const QUICK_FIXES: Array<[RegExp, string]> = [
  // "cloud" → "Claude" only when followed by Claude-y context
  [/\bcloud(?=\s+(?:code|opus|sonnet|haiku|api|agent|sdk|desktop|model|terminal|3\.\d|4\.\d))/gi, 'Claude'],
  // "clawed" → "Claude", the other way whisper mangles it. Same guarded
  // lookahead so the ordinary verb survives ("the cat clawed the sofa").
  [/\bclawed(?=\s+(?:code|opus|sonnet|haiku|api|agent|sdk|desktop|model|terminal|3\.\d|4\.\d))/gi, 'Claude'],
  // "Cloud Code" capitalization
  [/\bClaude\s+code\b/g, 'Claude Code'],
  // common bigrams
  [/\bchat\s*-?\s*gpt\b/gi, 'ChatGPT'],
  [/\bopen\s+ai\b/gi, 'OpenAI'],
  [/\bnext\s+js\b/gi, 'Next.js'],
  [/\btype\s+script\b/gi, 'TypeScript'],
  [/\bjava\s+script\b/gi, 'JavaScript'],
  [/\bgit\s+hub\b/gi, 'GitHub'],
  [/\bvs\s+code\b/gi, 'VS Code'],
  [/\bco\s*-?\s*pilot\b/gi, 'Copilot'],
  // GPT-N variants where Whisper hears "five" / "four" instead of the
  // digit. (Dropped "GPT for" → "GPT-4": it ate the preposition in
  // "use GPT for coding" → "use GPT-4 coding".)
  [/\bGPT\s+four\b/gi, 'GPT-4'],
  [/\bGPT\s+five\b/gi, 'GPT-5'],
  [/\bGPT\s+(\d+)\b/g, 'GPT-$1'],
  // tRPC — Whisper sometimes drops the "t" or adds a space
  [/\bt\s+RPC\b/g, 'tRPC'],
  [/\bT-?\s*RPC\b/g, 'tRPC'],
  // npm / npx / pnpm — Whisper hears them as words
  [/\bN\s*P\s*M\b/g, 'npm'],
  [/\bN\s*P\s*X\b/g, 'npx'],
  [/\bP\s*N\s*P\s*M\b/g, 'pnpm'],
  // Common framework / library names
  [/\bnode\s+js\b/gi, 'Node.js'],
  [/\breact\s+native\b/gi, 'React Native'],
  [/\bpost\s*gres\b/gi, 'Postgres'],
  [/\bgraph\s+QL\b/gi, 'GraphQL'],
]

// Map the focused app to a strictness bucket so we know which level
// (settings.strictness.personal | .work | .writing) to apply.
//   - code → null (always FAITHFUL, no level)
//   - email → 'work'
//   - docs → 'writing'
//   - other → 'writing' (conservative default)
//   - messaging → split: iMessage/WhatsApp/Telegram → personal,
//                        Slack/Discord/Teams → work
const PERSONAL_MESSAGING_BUNDLES = new Set([
  'com.apple.MobileSMS',
  'net.whatsapp.WhatsApp',
  'ru.keepcoder.Telegram',
  'org.telegram.desktop',
  'com.facebook.archon',  // Messenger
])
const WORK_MESSAGING_BUNDLES = new Set([
  'com.tinyspeck.slackmacgap',
  'com.hnc.Discord',
  'com.microsoft.teams',
  'com.microsoft.teams2',
])

function strictnessBucket(focused: FocusedApp): 'personal' | 'work' | 'writing' | null {
  switch (focused.category) {
    case 'code': return null
    // ai_prompt isn't a raw focused-app category (it's derived at
    // pipeline time from code apps with chat AX roles), so this is
    // mostly dead — but TS still needs the case for exhaustiveness.
    case 'ai_prompt': return 'writing'
    case 'email': return 'work'
    case 'docs': return 'writing'
    case 'other': return 'writing'
    case 'messaging': {
      if (PERSONAL_MESSAGING_BUNDLES.has(focused.bundleId)) return 'personal'
      if (WORK_MESSAGING_BUNDLES.has(focused.bundleId)) return 'work'
      // Browser-routed messaging (e.g. Slack-in-Arc) keeps the browser's
      // bundleId — fall back to the resolved app name.
      const n = focused.name.toLowerCase()
      if (['slack', 'discord', 'microsoft teams'].includes(n)) return 'work'
      if (['imessage', 'whatsapp', 'telegram', 'messenger'].includes(n)) return 'personal'
      return 'personal'
    }
  }
}

// Which project this dictation belongs to, or null when it cannot be
// derived confidently. Null is a normal outcome, not a failure: only
// global facts load, and anything learned lands in the unsorted bucket.
// See context/project-key.ts on why guessing is worse than not knowing.
// The name that goes under the sign-off. Read from the context overview,
// which is the only place the app currently knows it.
function senderFirstName(): string | null {
  try {
    return senderNameFromOverview(getUserOverview())
  } catch {
    return null
  }
}

function dictationProjectKey(focused: FocusedApp): string | null {
  // canonicalProjectKey, not the raw one: the key comes from a folder
  // name, and a folder is called whatever it was called at clone time.
  // Working in ~/OpenFlow on an app named Yappr produced a bucket called
  // "openflow" — accurate about the directory, useless as the name of
  // the thing being built.
  return canonicalProjectKey(extractProjectKey({
    surface: focused.surface,
    windowTitle: focused.windowTitle,
    appName: focused.name,
    tabTitle: focused.tabTitle,
    // Only the app-builders own a project. A Claude or ChatGPT tab is a
    // conversation, and its title was being filed as a codebase name.
    appOwnsProject: AGENTIC_AI_APP_NAMES.has(focused.name),
  }))
}

// Spec §3: remember durable rules the user states in passing ("we always
// use zod for validation") so they do not have to repeat them.
//
// Storage is Yappr-internal by design — the spec is explicit that this
// must never write to CLAUDE.md, .cursor/rules/, or any file in the
// user's repo. Nothing here touches the filesystem.
//
// Reads the RAW transcript rather than the cleaned output: cleanup can
// rephrase a rule, and a preference is worth storing in the user's own
// words. Failures are swallowed — never break a dictation over context
// bookkeeping.
function captureStandingPreferences(transcript: string, focused: FocusedApp): void {
  try {
    const found = extractStandingPreferences(transcript)
    if (found.length === 0) return
    const projectKey = dictationProjectKey(focused)
    for (const pref of found) {
      addFact({ scope: pref.scope, projectKey, text: pref.text })
    }
  } catch (err) {
    logError('Standing-preference capture failed', err)
  }
}

function strictnessFor(focused: FocusedApp, settings: Settings): Strictness {
  const bucket = strictnessBucket(focused)
  if (!bucket) return 2  // unused for code (FAITHFUL ignores level)
  return settings.strictness[bucket]
}

// Register hint for the cleanup LLM. Computed from the focused app:
//   - iMessage / WhatsApp / Telegram / Messenger → 'imessage' (lowercase casual)
//   - Slack / Discord / Teams → 'chat' (sentence-case casual)
//   - everything else → 'default' (whatever strictness block dictates)
// This drives a HARD final override at the end of the system prompt
// so the LLM doesn't default to "proper" capitalization in iMessage.
function registerFor(focused: FocusedApp, category: AppCategory): Register {
  if (category !== 'messaging') return 'default'
  if (PERSONAL_MESSAGING_BUNDLES.has(focused.bundleId)) return 'imessage'
  if (WORK_MESSAGING_BUNDLES.has(focused.bundleId)) return 'chat'
  // Browser-routed (Slack-in-Arc etc) — fall back to app name.
  const n = focused.name.toLowerCase()
  if (['imessage', 'messages', 'whatsapp', 'telegram', 'messenger'].includes(n)) return 'imessage'
  if (['slack', 'discord', 'microsoft teams'].includes(n)) return 'chat'
  // Unknown messaging app — default to iMessage casing (safer for personal).
  return 'imessage'
}

function applyQuickFixes(text: string): string {
  let out = text
  for (const [re, replacement] of QUICK_FIXES) {
    out = out.replace(re, replacement)
  }
  return out
}

// QUESTION-MARK NORMALIZATION
// Sentences that linguistically pose a question get a "?" if they end
// in "." or have no terminal punctuation. The trigger is the SHAPE of
// the sentence's opening, not just an inverted verb:
//   - Wh-words: who/what/when/where/why/which/how
//   - Yes/no inversions: "do you...", "can you...", "are you...",
//     "is it...", "should we...", "would you...", "could you...",
//     "did you...", "does it...", "have you...", "has it...", "will you...",
//     "won't you...", "shouldn't we...", "isn't it...", "aren't you...",
//     "wasn't it...", "weren't you...", "haven't you..."
//   - Tag-question shape: "..., right?", "..., yeah?", "..., no?"
//
// We do NOT add "?" when:
//   - The sentence already ends with "?" or "!" — leave it alone.
//   - The "question word" is being used as a relative pronoun
//     ("I know what you mean", "the place where we met", "this is how
//     it works", "tell me when you arrive") — these start with a
//     non-question subject like "I/we/this/the/that/he/she".
//   - It's a polite directive disguised as a question ("can you pass
//     the salt") — these we DO want to mark as questions actually,
//     because a "?" is correct there. Leave the heuristic broad.
//
// Implementation: split on sentence boundaries, inspect first 1-3
// words of each clause, swap trailing "." for "?" if it matches.

const QUESTION_OPENERS = [
  // Wh-questions
  'who', 'what', 'when', 'where', 'why', 'which', 'how', 'whose', 'whom',
  // Modal + subject inversions (most common forms)
  'do you', 'do we', 'do they', 'do i',
  'does he', 'does she', 'does it', 'does that', 'does this',
  'did you', 'did we', 'did they', 'did he', 'did she', 'did it',
  'are you', 'are we', 'are they', "aren't you", "aren't we", "aren't they",
  'is he', 'is she', 'is it', 'is this', 'is that', 'is there',
  "isn't he", "isn't she", "isn't it", "isn't this", "isn't that", "isn't there",
  'was it', 'was he', 'was she', 'was that', 'was this', 'was there',
  "wasn't it", "wasn't he", "wasn't she", "wasn't that", "wasn't this",
  'were you', 'were we', 'were they', "weren't you", "weren't we", "weren't they",
  'have you', 'have we', 'have they', "haven't you", "haven't we", "haven't they",
  'has he', 'has she', 'has it', "hasn't he", "hasn't she", "hasn't it",
  'had you', 'had we', "hadn't you",
  'can you', 'can we', 'can they', 'can he', 'can she', 'can it', 'can i',
  "can't you", "can't we", "can't they",
  'could you', 'could we', 'could they', 'could he', 'could she', "couldn't you",
  'would you', 'would we', 'would they', 'would he', 'would she', "wouldn't you",
  'will you', 'will we', 'will they', 'will he', 'will she', 'will it',
  "won't you", "won't we", "won't they",
  'should you', 'should we', 'should they', 'should he', 'should she', 'should i', 'should it',
  "shouldn't you", "shouldn't we", "shouldn't they",
  'shall we', 'shall i',
  'may i', 'may we',
  'might you', 'might we',
  // Common spoken stems that are usually questions
  'any chance',
  'wanna',
  'gonna',
]

// Tag-question endings — the LAST 1-2 words of the sentence indicate
// it's a question regardless of opener. ", right" / ", yeah" / ", no"
// / ", okay" / ", correct".
const TAG_QUESTION_END_RE = /,\s*(right|yeah|yea|no|ok|okay|correct|huh)\s*[.!?]?\s*$/i

// Subjects that, when they OPEN the sentence, indicate the wh-word
// later is a relative pronoun, NOT a question opener. Used to suppress
// false positives like "I know what you mean."
const STATEMENT_OPENER_RE = /^(?:i|we|you|he|she|they|it|this|that|the|my|our|your|his|her|their|its|tell|let|show|please)\b/i

function isQuestionShape(sentence: string): boolean {
  const trimmed = sentence.trim()
  if (trimmed.length === 0) return false
  // Already explicitly punctuated as a question or exclamation — leave it.
  if (/[?!]\s*$/.test(trimmed)) return false
  // Tag-question — fires regardless of opener.
  if (TAG_QUESTION_END_RE.test(trimmed)) return true
  // Statement-opener guard: "I know what you mean" should NOT be a question.
  if (STATEMENT_OPENER_RE.test(trimmed)) return false
  // Lowercase first 1-3 words, strip punctuation, check against openers.
  const head = trimmed.toLowerCase().replace(/^[^a-z']+/, '').split(/\s+/).slice(0, 3).join(' ')
  for (const opener of QUESTION_OPENERS) {
    if (head === opener || head.startsWith(opener + ' ') || head.startsWith(opener + ',')) {
      return true
    }
  }
  return false
}

function applyQuestionMarks(text: string): string {
  // Split on sentence boundaries but keep the trailing punctuation +
  // following whitespace, so we can rebuild faithfully. We use a
  // boundary regex that matches the punctuation as its own capture.
  // Examples handled:
  //   "do you want to go. yes" → "do you want to go? yes"
  //   "lets go to the beach. do you wanna come" (no end punctuation on
  //    second clause) → "lets go to the beach. do you wanna come?"
  //   "hey, are you free tonight" → "hey, are you free tonight?"
  // A terminator only counts when it's followed by whitespace or end-of-
  // text. This guards intra-token periods — "app.tsx", "version 3.2",
  // "v1.1" — from being treated as sentence boundaries (which used to
  // corrupt them into "app?tsx" / "3?2" when the clause looked like a
  // question). Sentences jammed without a space ("go.yes") won't split,
  // which is rare and far safer than mangling code/decimals.
  const parts = text.split(/([.!?]+(?:\s+|$))/)
  // parts is interleaved: [sentence, terminator, sentence, terminator, ..., lastSentence?]
  // Walk pairs and rewrite the terminator when the preceding sentence is question-shaped.
  let out = ''
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? ''
    const terminator = parts[i + 1] ?? ''
    if (sentence.length === 0 && terminator.length === 0) continue
    if (isQuestionShape(sentence)) {
      // Replace "." or "!" with "?" but keep the trailing whitespace.
      // If terminator is empty (sentence didn't have one — end of text),
      // append "?" + preserve nothing.
      if (terminator.length === 0) {
        out += sentence + '?'
      } else {
        const trailingWs = terminator.match(/\s*$/)?.[0] ?? ''
        out += sentence + '?' + trailingWs
      }
    } else {
      out += sentence + terminator
    }
  }
  return out
}

// SPELLED-OUT NAME / WORD COLLAPSE
// Whisper transcribes hyphen-separated spelled letters verbatim:
//   "J-U-L-I-A" / "j.u.l.i.a" / "J U L I A"
// Users spelling something out for clarity want the joined word in
// the output — NEVER the hyphenated letters. Two cases:
//
//   1. Preceded by a redundant name ("Julia, J-U-L-I-A") → drop the
//      spelled-out portion, keep the original name.
//   2. Standalone ("text me J-U-L-I-A") → collapse the letters into
//      a single word with appropriate casing (first letter caps if
//      the spelled sequence was uppercase, else lowercase).
//
// "Self-correction" intent (different letters from a preceding name)
// like "Julia, sorry, J-A-N-E" is handled by applySelfCorrection
// (which runs first) — and even if it doesn't fire, the spelled-out
// letters MUST still be collapsed into "Jane", not left as "J-A-N-E".
//
// Match shape: 2+ letter tokens separated by hyphens, dots, or
// whitespace, each letter token being a single A-Z (case-insensitive).
// Minimum 2 letters (so we don't match accidental "A-B" pairs in
// non-spelling contexts like "page A-B").

// CASE 1: preceded by a name (capitalized word) + connector. Drop the
// spelled-out portion entirely.
//
// Connector covers: ", " | " spelled " | " spelt " | ": " | " - " |
// " that's spelled " etc.
const SPELL_AFTER_NAME_RE = /\b([A-Z][a-z]{1,20})(\s*[,:]?\s+(?:spelled|spelt|that's|that is|which is|like)\s+|\s*,\s+|\s+)((?:[A-Za-z](?:[-.\s]+[A-Za-z]){1,19}))\b/g

// CASE 2: standalone hyphen/dot-separated letters anywhere. Collapse
// to a joined word. Requires 2+ separator-joined letters where every
// gap is exactly one of [-.\s] (so we don't accidentally match
// natural phrases like "I - you - me").
//
// To avoid false positives we ONLY fire when the separators are
// hyphens OR dots (NOT bare whitespace), since "A B C D" in dictation
// is almost never a spelled word — Whisper would have emitted that as
// a real word if the user said it as a word. The exception is when
// 3+ single letters appear in a row with only whitespace, which is
// also a clear spelling cadence.
// Note on trailing dot: "U.S.A." has a final period that isn't between
// letters. We allow an optional trailing `.` followed by a non-letter
// (or end of string) so we eat the abbrev-style terminal period too.
const SPELL_STANDALONE_HYPHEN_RE = /\b([A-Za-z](?:[-.]\s*[A-Za-z]){1,19})(\.?)(?=[^A-Za-z]|$)/g
const SPELL_STANDALONE_SPACED_RE = /\b([A-Za-z](?:\s+[A-Za-z]){2,19})\b/g

// Lowercase a string and strip non-letters, for dictionary lookup keys.
function letterKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '')
}

// Build a lookup once at module load: lowercased-letters-only → canonical
// form from BUILTIN_DICTIONARY. e.g. "github" → "GitHub", "nba" → "NBA"
// (if it's in the list), "vscode" → "VS Code" (multi-word entries get
// their internal spaces stripped from the key but preserved in the value).
const CANONICAL_BY_LETTERS: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const term of BUILTIN_DICTIONARY) {
    const key = letterKey(term)
    if (key.length >= 2 && !m.has(key)) m.set(key, term)
  }
  return m
})()

// A tiny set of frequent English words we definitely want to LOWERCASE
// when the user spells them out. The dictionary lookup handles brand
// names; this list handles common-noun spellings like "h.e.l.l.o" →
// "hello", not "Hello". We keep it small to avoid false positives —
// only add words that show up frequently in spoken speech and are
// unambiguous (not also a name).
const COMMON_WORD_LETTERS = new Set<string>([
  'hello', 'world', 'cool', 'nice', 'okay', 'yes', 'no', 'yeah', 'nope',
  'wait', 'stop', 'help', 'fine', 'good', 'bad', 'love', 'hate', 'sorry',
  'thanks', 'please', 'maybe', 'sure', 'true', 'false', 'left', 'right',
  'up', 'down', 'big', 'small', 'fast', 'slow', 'easy', 'hard',
])

// Pick the right casing for a spelled-out letter sequence based on
// context. Order of checks:
//   1. Built-in dictionary (brand names, acronyms with canonical case).
//      "n.b.a" → "NBA", "g.i.t.h.u.b" → "GitHub".
//   2. Common English word → all lowercase. "h.e.l.l.o" → "hello".
//   3. All-uppercase short sequence (≤5 letters) → keep all-caps
//      (acronym fallback). "a.b.c" → "ABC" only if the user said it
//      uppercase ("A.B.C." in transcript). Lowercase 3-letter
//      sequences pass through unchanged.
//   4. Otherwise → title case (name-shaped default). "j-u-l-i-a" →
//      "Julia", lowercase input still gets title-cased ONLY when it
//      doesn't match cases 1-3.
//
// Special rule for case 4: if the SPELLED input was lowercase (no
// uppercase letters at all), keep it lowercase. The user typed lower
// so we preserve their intent.
//   "hey j-u-l-i-a" → "hey julia" (lowercase preserved)
//   "hey J-U-L-I-A" → "hey Julia" (titlecase because uppercase input)
function joinSpelledLetters(s: string): string {
  const letters = s.replace(/[-.\s]+/g, '')
  if (letters.length === 0) return s
  const key = letterKey(letters)

  // 1. Canonical dictionary entry — use exactly as defined.
  const canonical = CANONICAL_BY_LETTERS.get(key)
  if (canonical) return canonical

  // 2. Common English word — lowercase.
  if (COMMON_WORD_LETTERS.has(key)) return key

  const upper = letters.replace(/[^A-Z]/g, '').length
  const total = letters.length
  const allUpper = upper === total
  const allLower = upper === 0

  // 3. Short all-uppercase (≤4 letters) → keep all-caps acronym.
  //    "A.B.C" → "ABC", "X-Y-Z" → "XYZ", "F.A.A.A" → "FAAA".
  //    5+ letters even all-uppercase prefer title-case ("J-U-L-I-A"
  //    → "Julia", not "JULIA") because real acronyms 5+ letters long
  //    are usually in the dictionary already (case 1 catches them).
  if (allUpper && total <= 4) return letters.toUpperCase()

  // 4. Title case for name-shaped sequences.
  //    But if the input was all-lowercase, preserve lowercase intent.
  if (allLower) return letters.toLowerCase()
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()
}

function applySpelledNameCollapse(text: string): string {
  // CASE 1 first: when preceded by a name (whether or not the spelled
  // letters match), prefer dropping the spelled-out portion entirely
  // — the user said the name itself, the spelling was for clarity.
  let out = text.replace(SPELL_AFTER_NAME_RE, (full, name: string, gap: string, letters: string) => {
    const joined = letters.replace(/[-.\s]+/g, '').toLowerCase()
    if (joined === name.toLowerCase()) {
      // Letters match the name → drop the spelled portion, keep the name.
      return name
    }
    // Letters DIFFER from the name → user probably re-spelled to
    // override. Replace the whole "<Name> <connector> <L-L-L>" with
    // the joined spelled word. Trim trailing whitespace from gap so
    // we don't leave double spaces.
    void gap  // intentionally unused
    return joinSpelledLetters(letters)
  })

  // CASE 2: any remaining standalone hyphen/dot-separated letter
  // sequences. Always collapse to a joined word.
  out = out.replace(SPELL_STANDALONE_HYPHEN_RE, (match, core: string) => {
    // Only fire on 3+ letters — pairs like "A-B" are likely things
    // like a list label, not a spelled word.
    const letters = core.replace(/[-.\s]+/g, '')
    if (letters.length < 3) return match
    return joinSpelledLetters(core)
  })

  // CASE 3: 3+ single letters separated only by whitespace
  // ("J U L I A"). Conservative — requires 3+ letters because pairs
  // like "I am" or "a B" are common false positives.
  out = out.replace(SPELL_STANDALONE_SPACED_RE, (match) => {
    const letters = match.replace(/\s+/g, '')
    if (letters.length < 3) return match
    // Extra guard: require that AT LEAST 2 of the letters are
    // uppercase, otherwise "i am at" looks like a spelled-out word.
    const upper = letters.replace(/[^A-Z]/g, '').length
    if (upper < 2) return match
    return joinSpelledLetters(match)
  })

  return out
}

// Escape a literal string for use inside a RegExp.
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a case-insensitive regex that matches the canonical form OR
// the same letters with internal whitespace/hyphens — covering common
// Whisper mishearings like "Yappr" → "open flow", "kubectl" →
// "koob control", "TypeScript" → "type script".
//
// Rules:
// - Skip terms shorter than 3 chars (too prone to false positives).
// - Skip terms with spaces (already multi-word; user can use perAppRules
//   or a different mechanism for those edge cases).
// - Skip pure-letter ALL-CAPS acronyms shorter than 4 chars (e.g. "API"
//   shouldn't rewrite "API" → "API"; nothing to fix).
// - Word-boundary anchored so we don't clobber substrings.
function buildDictionaryReplacers(terms: string[]): Array<[RegExp, string]> {
  const out: Array<[RegExp, string]> = []
  for (const term of terms) {
    const t = term.trim()
    if (t.length < 3) continue
    if (/\s/.test(t)) continue
    // Split CamelCase / kebab / snake into letter groups so we can
    // accept either the joined form or a separator between groups.
    // "Yappr" → ["Open", "Flow"]; "type-script" → ["type", "script"];
    // "kubectl" → ["kubectl"] (no internal case boundary).
    const parts = t
      .split(/(?<=[a-z0-9])(?=[A-Z])|[-_]/)
      .filter(Boolean)
    if (parts.length >= 2) {
      // Multi-part term: allow optional whitespace/hyphen between parts.
      const pattern = parts.map(reEscape).join('[\\s-]*')
      out.push([new RegExp(`\\b${pattern}\\b`, 'gi'), t])
    } else {
      // Single token: just enforce case-insensitive whole-word match.
      // Skip if the term is already a short all-caps acronym (nothing
      // to normalize — Whisper would have produced the same letters).
      if (t.length < 4 && t === t.toUpperCase()) continue
      out.push([new RegExp(`\\b${reEscape(t)}\\b`, 'gi'), t])
    }
  }
  return out
}

// Whole-word, case-insensitive alias substitution. Preserves the
// canonical casing from the table, not the casing that was misheard.
const ALIAS_RE = new RegExp(
  '\\b(' + Object.keys(DICTIONARY_ALIASES)
    .sort((a, b) => b.length - a.length)   // longest first: "super base" before "base"
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|') + ')\\b',
  'gi',
)

function applyDictionaryAliases(text: string): string {
  return text.replace(ALIAS_RE, (match) => {
    const key = match.toLowerCase().replace(/\s+/g, ' ')
    return DICTIONARY_ALIASES[key] ?? match
  })
}

function applyDictionaryReplacements(text: string, terms: string[]): string {
  let out = text
  for (const [re, canonical] of buildDictionaryReplacers(terms)) {
    out = out.replace(re, canonical)
  }
  return out
}

export async function runDictationPipeline(
  audioBuffer: Buffer,
  settings: Settings,
  onState: (state: 'processing' | 'done' | 'error') => void,
  // Streaming partial-transcript callback. Wired from the local
  // provider's onNewSegments through the worker IPC. Callers can use
  // it to update the indicator pill with running text so users see
  // words as whisper produces them on long clips. No-op for cloud
  // providers that don't stream.
  onPartial?: (text: string) => void,
  // Replay of a recording recovered from disk (see recording-store.ts).
  // Two effects, both essential:
  //   1. the focused-app refresh below is SKIPPED in favour of this
  //      snapshot — a retry running 30s (or a restart) later must be
  //      polished for the app the user actually dictated into, not
  //      whatever is frontmost now;
  //   2. the pipeline does NOT paste. Delivery is the caller's job,
  //      because by now the user may be somewhere else entirely and
  //      pasting would dump text into the wrong window.
  replay?: { focus: FocusedApp },
): Promise<DictationResult & { pasteMethod: 'paste' | 'clipboard' | 'deferred'; cleanupUnavailable: boolean }> {
  const start = Date.now()
  onState('processing')

  const { transcription, cleanup, cleanupAvailable } = buildProviders(settings)
  const dictionary = buildDictionary(settings)

  // Refresh the focused-app cache CONCURRENTLY with transcription. The
  // press-time capture is stale if the user moved between apps while
  // dictating (started in iMessage, released in Gmail → they want
  // Gmail-flavored polish, not iMessage). Both the osascript and the
  // Whisper call are async, so this adds no hot-path latency — the
  // ~50–150ms osascript completes during transcription's network
  // roundtrip. Read the value AFTER both have resolved.
  const refreshFocusedApp = replay ? null : captureFocusedApp()

  const tStart = Date.now()
  const transcript = (await withRetry('Transcription', () =>
    transcription.transcribe(audioBuffer, { dictionary, onPartial }))).trim()
  logInfo('Transcribed', { ms: Date.now() - tStart, chars: transcript.length, preview: transcript.slice(0, 60) })

  if (refreshFocusedApp) await refreshFocusedApp
  const focusedApp = replay?.focus ?? getFocusedApp()

  const category = settings.devModeApps.includes(focusedApp.bundleId)
    ? ('code' as const)
    : focusedApp.category

  // Bail out before cleanup + paste if Whisper returned nothing or a
  // known silence-hallucination. The indicator catches NoSpeechError
  // and shows a friendly "couldn't hear you" message.
  if (isLikelySilence(transcript)) {
    logInfo('No speech detected — skipping paste', { transcript })
    throw new NoSpeechError()
  }

  const rule = settings.perAppRules.find(r => r.bundleId === focusedApp.bundleId)
  let effectiveCategory = rule?.category ?? category

  // Detect AI-chat surface inside code apps. Code editors host BOTH
  // actual code (where the user types identifiers / commands and we
  // must preserve every word) AND an AI chat pane (Claude Code chat,
  // Cursor chat) where the user is composing a prompt that should be
  // restructured for clarity.
  //
  // Two signals combine:
  //   - The AX role of the focused element (AXTextArea = chat-like,
  //     AXTextField = single-line input, AXWebArea/no-focus = code editor)
  //   - Apps that are PRIMARILY AI chat (ChatGPT, Claude desktop,
  //     Perplexity, Gemini) always get ai_prompt regardless of role
  //
  // The press-time AX-role probe (paste.ts) is fired at hotkey press
  // and resolves by now (overlapped with transcription). Reuse it.
  //
  // The decision itself is pure (classifyCodeSurface, ai-intent.ts) and
  // adversarially tested; here we only gather the FREE signals it needs —
  // none of which is an LLM call:
  //   - the press-time AX role (overlapped with transcription)
  //   - whether a known AI CLI runs in the focused terminal / the editor's
  //     integrated-terminal subtree (a local `ps` scan, hard-capped)
  // Three outcomes:
  //   reformat    → ai_prompt (aggressive restructure into a markdown prompt)
  //   faithful_ai → stay code, but force the LLM to run a verbatim cleanup
  //                 (fixes "cloud"→"Claude" mishears without restructuring)
  //   code        → unchanged; the verbatim fast path stays eligible
  let runFaithfulAi = false
  let promptDestination: PromptDestination = 'chat'
  // Which AI CLI is running in the focused terminal, if any. Hoisted out
  // of the routing block because the ultrathink mapping (spec §2) needs
  // it after cleanup, and it is gated on Claude Code specifically.
  let detectedAiCli: string | undefined
  // Whether the classifier routed to REFORMAT. Hoisted because the skip
  // policy needs it further down: a shaping-bound transcript is a brief,
  // and the short-utterance bypass would otherwise paste the brief.
  let willReformat = false
  // The classifier is normally only consulted on code surfaces and the
  // dedicated AI apps. An explicit "make me a prompt" has to widen that:
  // the request stands on its own, and the user asking for it from a
  // browser or a notes app means the same thing it means in an editor.
  // ai_prompt is included because a browser AI surface (claude.ai, Lovable,
  // Replit, Bolt...) is routed straight to that category by URL. Without
  // this the classifier never ran there, so EVERY dictation into those
  // surfaces was shaped into ## Goal / ## Tasks — including plain
  // descriptions, which is the thing the user asked not to happen.
  if (
    effectiveCategory === 'code'
    || effectiveCategory === 'ai_prompt'
    || PRIMARY_AI_CHAT_BUNDLES.has(focusedApp.bundleId)
    || isExplicitPromptRequest(transcript)
  ) {
    const axRole = await (getPressTimeAXRolePromise() ?? Promise.resolve('script-error'))
    const isAxReadable = axRole !== 'no-focus' && axRole !== 'script-error'

    // Only code surfaces have an integrated terminal worth scanning; the
    // primary AI chat apps route on bundleId alone.
    const terminalAiCli = effectiveCategory === 'code'
      ? await focusedAppRunningAiCli({ bundleId: focusedApp.bundleId, rootPid: focusedApp.pid })
      : { isAiCli: false as const }
    detectedAiCli = terminalAiCli.cli

    const surface = classifyCodeSurface({
      category: effectiveCategory,
      transcript,
      bundleId: focusedApp.bundleId,
      axRole,
      isAxReadable,
      terminalAiCli,
      isPrimaryAiBundle: PRIMARY_AI_CHAT_BUNDLES.has(focusedApp.bundleId),
      // A browser AI surface resolved by URL. focused-app.ts already did
      // the work; this just tells the classifier it is on one.
      browserAiRouted: effectiveCategory === 'ai_prompt'
        && !PRIMARY_AI_CHAT_BUNDLES.has(focusedApp.bundleId),
      // Whether that surface BUILDS. Lovable and friends run the project
      // they are handed; claude.ai answers a question about it.
      browserIsAgentic: AGENTIC_AI_APP_NAMES.has(focusedApp.name),
      weakCueSettingOn: false,  // not yet exposed as a user setting
    })

    if (surface.register === 'reformat') {
      effectiveCategory = 'ai_prompt'
      willReformat = true
      // App-builders own a project they can read, edit and deploy, so they
      // get the agentic shaping even though they run in a browser. A chat
      // assistant gets told it can do none of that.
      promptDestination = AGENTIC_AI_APP_NAMES.has(focusedApp.name)
        ? 'agentic'
        : surface.destination ?? 'chat'
      logInfo('Routed to ai_prompt (reformat)', {
        // cli was captured but only ever logged on the faithful branch, so
        // a prompt bound for Claude Code looked identical to one bound for
        // Perplexity. Threading it is the prerequisite for shaping the two
        // differently.
        bundleId: focusedApp.bundleId, axRole, reason: surface.reason,
        cli: terminalAiCli.cli, destination: promptDestination,
      })
    } else if (surface.register === 'faithful_ai') {
      runFaithfulAi = true
      // The URL router had already set ai_prompt purely from the host. The
      // classifier has now judged this a description, so drop back to
      // general prose cleanup — otherwise the section template still
      // applies and the description comes back as a task list.
      if (effectiveCategory === 'ai_prompt') effectiveCategory = 'other'
      logInfo('Routed to faithful_ai', {
        bundleId: focusedApp.bundleId, cli: terminalAiCli.cli, reason: surface.reason,
      })
    }
  }

  // Fast path: skip the LLM cleanup pass when there are no filler / stutter /
  // correction markers. The 8B-instant model over-edits when given long
  // clean text, so we prefer raw Whisper output (already excellent for
  // most English / Spanish / French dictation) unless cleanup is needed.
  let cleaned = transcript
  // Use the press-time AX-role probe if it's available — fired in
  // index.ts onStart, it overlaps with the 1-3s recording window so
  // the ~1100ms osascript is fully hidden. Fall back to a fresh probe
  // for code paths that don't go through the hotkey (paste-last from
  // history, etc.); that fresh probe used to be the default and blocked
  // the hot path for ~1s on every dictation.
  const axRolePromise = getPressTimeAXRolePromise() ?? probeFocusedAXRole()

  // Kick off the emoji-judge IN PARALLEL with whatever cleanup
  // branch fires below. It's a separate Groq call to llama-8b with
  // a laser-focused "should this message get an emoji" prompt — the
  // earlier in-cleanup-prompt approach got mostly ignored because
  // llama-8b reads the long "skip when ..." list as default-skip.
  // The judge runs on the RAW transcript (not the cleaned text)
  // because cleanup doesn't change semantic content, and starting
  // the judge before cleanup completes overlaps the network round-
  // trip with the cleanup call. Net wall-clock cost: ~0ms in the
  // common case where cleanup takes longer than the judge.
  //
  // Only fires for:
  //   - messaging category
  //   - emojiInMessages setting on
  //   - Groq key configured (managed mode reuses this path; BYOK
  //     users without a key get no emoji, like before)
  const emojiPromise: Promise<string> = (
    effectiveCategory === 'messaging'
    && settings.emojiInMessages
    && settings.provider.groqKey.trim().length > 0
    // Pause = no LLM. The emoji judge is a separate Groq call but
    // it's still LLM polish — respect the user's bypass.
    && !settings.pauseCleanup
  )
    ? judgeEmoji(settings.provider.groqKey, MODELS.groq.cleanup, transcript)
        .catch(() => '') // emoji is nice-to-have; never block paste
    : Promise.resolve('')

  const effectiveStrictness = strictnessFor(focusedApp, settings)
  const skipReason = cleanupSkipReason(transcript, effectiveCategory, { willReformat })
  let cleanupUnavailable = false
  if (settings.pauseCleanup) {
    // User-controlled hard bypass. Skip the LLM entirely. The
    // downstream regex passes (brand names, dictionary, self-
    // correction, spelled-name collapse, question marks) still run.
    logInfo('Cleanup skipped (user-paused)', { chars: transcript.length })
  } else if (skipReason === 'short-utterance'
             || (!runFaithfulAi && skipReason === 'code-verbatim')) {
    // The short-utterance case is deliberately allowed to beat
    // runFaithfulAi and the ai_prompt category: there is nothing in
    // "yeah ok" for a reformat to shape, and a ~3.4k-token round-trip to
    // decide that is the whole latency problem. The "cloud"->"Claude"
    // mishears that runFaithfulAi exists to fix are already handled
    // deterministically by QUICK_FIXES, which still runs below.
    //
    // code-verbatim still yields to runFaithfulAi, because a longer code
    // dictation aimed at an AI genuinely benefits from the faithful pass.
    logInfo('Cleanup skipped (fast path)', {
      reason: skipReason,
      words: countWords(transcript),
      chars: transcript.trim().length,
    })
  } else if (!cleanupAvailable) {
    // Cleanup was wanted here — not skipped by policy — but there is no
    // credential, so the "cleanup provider" is a no-op that hands the raw
    // transcript straight back. That used to happen silently: text pasted,
    // unpolished, unshaped, with nothing to indicate the product's main
    // pass had been switched off.
    //
    // Still paste (losing dictated words would be worse), but say so, and
    // return a flag so the caller can put it in front of the user rather
    // than leaving it in a log nobody reads.
    cleanupUnavailable = true
    logError('Cleanup unavailable — no key configured, pasting raw', new Error(
      'Set a cleanup key in Settings → General. Transcription is unaffected; '
      + 'filler removal, tone matching and prompt shaping are off until then.'
    ))
  } else {
    // Compose rather than clean.
    //
    // Two ways in. The first is an explicit ask ("write an email to Sam")
    // anywhere. The second is being IN an email client with something
    // substantial to say: in Gmail or Outlook the destination already
    // tells you the output is an email, and requiring the user to also
    // say the word "email" while staring at a compose window is asking
    // them to narrate what is on screen.
    //
    // The length floor is the guard. A quick reply — "sounds good", "yes
    // Thursday works" — is the user's actual message and wants cleaning,
    // not a greeting and a sign-off wrapped around four words. Compose
    // only takes over once there is enough of a brief to compose FROM.
    //
    // Hoisted because it drives two things that must agree: which prompt
    // is built, and how many tokens the reply is allowed — budgeting a
    // composed email like a cleaned one truncates it mid-sentence.
    // Length alone is NOT evidence of a brief. See
    // instructsMessageComposition — dictating the email you want to send
    // is the common case, and an email is usually over twelve words.
    const composingEmail = asksForEmailComposition(transcript)
      || (effectiveCategory === 'email'
        && countWords(transcript) >= EMAIL_COMPOSE_MIN_WORDS
        && instructsMessageComposition(transcript))
    const editor = IDE_EDITORS[focusedApp.bundleId]
    const strictness = strictnessFor(focusedApp, settings)
    const register = registerFor(focusedApp, effectiveCategory)
    // Feature 4 Phase 1: optional "Who you are" block. Empty when
    // disabled or no overview saved. Hot-path cost ~1ms (cached read).
    // Now also carries this project's facts — and only this project's.
    const contextBlock = buildContextBlock({
      enabled: settings.useContextMemory,
      // A shaped prompt is going to an agent that knows none of this, so
      // the context has to be carried INTO the output. Cleanup wants the
      // opposite and gets the anti-echo framing. Passing the wrong one
      // here is what made shaped prompts never mention the context layer
      // despite ~2,400 characters of it being injected every time.
      mode: willReformat ? 'prompt' : 'cleanup',
      projectKey: dictationProjectKey(focusedApp),
    })
    const systemPrompt = buildCleanupPrompt(
      effectiveCategory,
      focusedApp.name,
      rule?.customPrompt,
      editor,
      strictness,
      settings.emojiInMessages,
      register,
      contextBlock,
      promptDestination,
      composingEmail,
    ).replace('{text}', transcript)
    const cStart = Date.now()
    try {
      cleaned = await withCleanupRetry(() =>
        cleanup.cleanup(transcript, {
          appName: focusedApp.name,
          appCategory: effectiveCategory,
          systemPrompt,
          expandsOutput: composingEmail,
        }))

      // Compose output was never normalised — normalizeEmailRewrite only
      // ever ran on select-and-rewrite — so every rule the prompt states
      // about how an email ENDS was enforced by nothing.
      //
      // Both failures below were produced by the live model with the
      // prohibitions already in the prompt, which is the whole argument
      // for doing it here as well: "Thanks,\n[Your Name]" (the exact
      // placeholder the prompt forbids by name) and a body that simply
      // stopped, with no sign-off, reading as truncated in the compose
      // window the user is about to send from.
      if (composingEmail) {
        cleaned = normalizeComposedEmail(cleaned, senderFirstName())
      }
      // A composed email with a greeting, a sign-off, and nothing between.
      //
      // Observed live: the brief "Write an email with all of the
      // architecture of my app, plus asking my friend Jeff if he wants to
      // be an investor" came back as the complete string
      // "Hi Jeff,\n\nBest,\nNoan" -- 20 characters, pasted into Gmail.
      //
      // The length guard below could not catch it. That guard needs a
      // 300-character transcript before it runs, because it is calibrated
      // for CLEANUP where output tracks input. Compose inverts the
      // relationship: the input is a short brief and the output should be
      // several times longer, so a short brief is precisely the case the
      // guard skips and precisely the case that fails. This brief was 123
      // characters. Had the guard run, 20 < 123 * 0.4 would have caught it.
      //
      // Falling back to the transcript is the same thing every other
      // failure here does, and it is the safer of two bad outputs: a brief
      // in a compose window is visibly not an email, while a hollow shell
      // looks finished enough to send.
      if (composingEmail && composedEmailBodyChars(cleaned) < COMPOSED_EMAIL_MIN_BODY_CHARS) {
        logError('Composed email has no body — falling back to raw transcript', {
          transcriptChars: transcript.length,
          cleanedChars: cleaned.length,
          bodyChars: composedEmailBodyChars(cleaned),
          cleanedPreview: cleaned.slice(0, 100),
        })
        cleaned = transcript
      }
      // The 8B cleanup model occasionally ignores LENGTH_PRESERVATION
      // and summarizes long dictations down to a sentence. ai_prompt
      // legitimately restructures (rambling → structured prompt), so
      // it's exempt; everything else falls back to the raw transcript
      // when the output is catastrophically shorter than the input.
      if (
        effectiveCategory !== 'ai_prompt'
        && transcript.length >= LENGTH_GUARD_MIN_INPUT_CHARS
        && cleaned.length < transcript.length * LENGTH_GUARD_MIN_RATIO
      ) {
        logError('Cleanup output too short — falling back to raw transcript', {
          transcriptChars: transcript.length,
          cleanedChars: cleaned.length,
          ratio: Number((cleaned.length / transcript.length).toFixed(2)),
          category: effectiveCategory,
          cleanedPreview: cleaned.slice(0, 100),
        })
        cleaned = transcript
      } else {
        logInfo('Cleaned', {
          ms: Date.now() - cStart,
          chars: cleaned.length,
          category: effectiveCategory,
          strictness,
          register,
          contextChars: contextBlock.length,
        })
      }
    } catch (err) {
      // Cleanup failed (Groq down, rate limit beyond cap, network).
      // Fall back to raw Whisper transcript so the user still gets
      // their content. Deterministic passes below still run on it.
      logError('Cleanup failed — falling back to raw transcript', err)
      cleaned = transcript
    }
  }

  // Always apply deterministic brand-name fixes — runs after the LLM
  // cleanup (which usually catches them) AND on fast-path output where
  // the LLM never ran.
  cleaned = applyQuickFixes(cleaned)

  // User-dictionary auto-replace. Built on top of the Whisper bias
  // prompt: the bias makes Whisper *more likely* to produce the right
  // spelling, but it's probabilistic. This pass guarantees that "open
  // flow" → "Yappr", "type script" → "TypeScript", etc., for any
  // term the user added to their dictionary. Case-insensitive, word-
  // boundary anchored, multi-part-aware (see buildDictionaryReplacers).
  // Aliases first: they fix mis-HEARD spellings ("Yapper" -> "Yappr"),
  // which the replacer below cannot do because it only knows a term's own
  // spelling and its spacing variants.
  cleaned = applyDictionaryAliases(cleaned)
  // BUILTIN_DICTIONARY belongs here, not just the user's terms. It used to
  // reach the model only as whisper's bias PROMPT; Parakeet takes no
  // prompt, so passing only settings.userDictionary meant the entire
  // built-in vocabulary — every brand name in it — silently stopped being
  // applied anywhere once the engine changed.
  cleaned = applyDictionaryReplacements(cleaned, [
    ...BUILTIN_DICTIONARY,
    ...(settings.userDictionary ?? []),
  ])

  // Then the near misses — the words the transcriber got ALMOST right.
  //
  // The pass above is exact-match, so it only ever fixed casing. A user
  // with "Noan" in their dictionary said their own name and got "Noen"
  // pasted, over and over, and reasonably asked why it could not tell.
  //
  // USER TERMS ONLY, never BUILTIN_DICTIONARY. The user asked for their
  // terms by adding them; the built-in list is a hundred brand names
  // nobody opted into, and letting those claim near neighbours would
  // start rewriting ordinary English across every dictation. See
  // shared/near-miss.ts for why the test is phonetic AND edit distance.
  cleaned = applyNearMissTerms(cleaned, settings.userDictionary ?? [])

  // Deterministic self-correction safety net. The LLM should handle
  // "at 6, I mean 7" → "at 7" — but the 8B cleanup model still keeps
  // both halves of the correction ~40% of the time, and local-only
  // mode has no LLM at all. This regex pass catches the obvious shape:
  // "<value>, <marker> <value>" where both values look like the same
  // kind of thing (number, time, name, path). Conservative on purpose
  // — see CORRECTION_REWRITES.
  cleaned = applySelfCorrection(cleaned)

  // Spoken numbers as digits: "make it twenty pixels" → "20 pixels".
  //
  // There is a prompt rule for this as well, but it cannot be the only
  // one — anything under eight words skips the LLM entirely, and a bare
  // quantity is usually a short dictation. Deterministic, so it holds on
  // the fast path and in local-only mode too. See shared/spoken-numbers.ts
  // for what it deliberately refuses to touch.
  cleaned = digitsForSpokenNumbers(cleaned)

  // The next two passes are DESTRUCTIVE for code — they rewrite content
  // that is legitimate in a coding/AI-prompt surface — so we skip them
  // whenever the surface is code (both the verbatim fast path and the
  // faithful_ai LLM path keep effectiveCategory === 'code'). A dictated
  // identifier spelled out letter-by-letter, or a line that merely reads
  // like a question (`grep foo bar`), must survive untouched; the LLM
  // already handles punctuation in the faithful path.
  if (effectiveCategory !== 'code') {
    // Collapse spelled-out letters into joined words — the user never
    // wants hyphenated letters in prose:
    //   "Julia, J-U-L-I-A" → "Julia"  (redundant spelling dropped)
    //   "text me J-U-L-I-A" → "text me Julia"  (standalone collapse)
    //   "Julia, J-A-N-E"    → "Jane"  (user re-spelled; spelled version wins)
    // Runs BEFORE question-mark normalization so collapsed sentences
    // are correctly punctuated.
    cleaned = applySpelledNameCollapse(cleaned)

    // Question-mark normalization: sentences shaped like questions
    // ("do you want to go", "are you free tonight") get "?" appended
    // or swapped from "." → "?". Statements like "I know what you mean"
    // are left alone via the STATEMENT_OPENER_RE guard. See
    // applyQuestionMarks for the full opener list + heuristics.
    cleaned = applyQuestionMarks(cleaned)
  }

  // Await the emoji judge (fired in parallel above) and append. The
  // emoji is appended to the CLEANED text, not stuffed in mid-sentence,
  // because that's how friends actually text — emoji at the end as
  // accent, not interleaved.
  const emoji = await emojiPromise
  if (emoji) {
    // Trim any trailing whitespace before adding a space + emoji.
    cleaned = `${cleaned.trimEnd()} ${emoji}`
    logInfo('Emoji appended', { emoji })
  }

  // Spec §2: "think really hard" is not a Claude Code keyword and does
  // nothing; `ultrathink` is. Applied last, to the finished text, so the
  // cleanup model cannot paraphrase the token away. Gated to Claude Code
  // and to explicit intent — never inferred from how big the request is.
  const ultrathink = applyUltrathink(cleaned, {
    enabled: isUltrathinkSurface(detectedAiCli),
    // Decide from what was SAID, not from what cleanup produced. The
    // shaped prompt is a paraphrase, and the phrases this looks for are
    // exactly the ones cleanup normalises away. See applyUltrathink.
    spoken: transcript,
  })
  if (ultrathink.applied) {
    cleaned = ultrathink.text
    // Log which route fired: 'explicit' means the user said it,
    // 'reasoning' means the task itself asked for it. If auto-firing ever
    // feels too eager, this line is what says how often it happens.
    logInfo('Ultrathink mapped', { app: focusedApp.name, trigger: ultrathink.trigger })
  }

  // A replay hands the text back instead of pasting it — see the `replay`
  // parameter. Pasting here would ignore the caller's same-app/elapsed
  // safety gate and could land the text in a window the user never
  // intended, which is the whole failure mode recovery exists to avoid.
  const pasteMethod = replay
    ? ('deferred' as const)
    : (await pasteText(cleaned, { rolePromise: axRolePromise })).method
  logInfo(replay ? 'Replay cleaned (delivery deferred to caller)' : 'Pasted', {
    method: pasteMethod,
    totalMs: Date.now() - start,
    app: focusedApp.name,
  })

  onState('done')

  // After the paste, deliberately: this is bookkeeping and must never sit
  // between the user finishing a dictation and seeing their text.
  captureStandingPreferences(transcript, focusedApp)

  // All-time stats. No text — see dictation-stats.ts on why this is a
  // separate store from the 50-entry transcript history. Also after the
  // paste, for the same reason: bookkeeping never delays the user's text.
  recordDictationStat({
    t: Date.now(),
    w: wordCount(cleaned),
    ms: speakingMsFromAudioBytes(audioBuffer.byteLength),
    a: focusedApp.name,
  })

  return {
    id: crypto.randomUUID(),
    transcript,
    cleaned,
    appName: focusedApp.name,
    appCategory: effectiveCategory,
    timestamp: Date.now(),
    // One word, so the user learns the mapping happened (spec §2).
    ultrathink: ultrathink.applied,
    // Recorded so background compaction can group by project later.
    projectKey: dictationProjectKey(focusedApp),
    pasteMethod,
    cleanupUnavailable,
  }
}

// Detect whether the selected text is already markdown-formatted.
// Triggers: ATX headings, list bullets, numbered lists, blockquotes,
// code fences, inline code, bold/italic markers, or multiple newlines
// with structure. Used by the command pipeline to tell the LLM to
// preserve formatting on rewrite/polish — otherwise the 8B model
// flattens markdown into a single paragraph.
//
// Heuristic, not a parser. False positives are acceptable (telling
// the LLM "preserve markdown" when it isn't is harmless); false
// negatives mean lost formatting.
function looksLikeMarkdown(text: string): boolean {
  // ATX headings: line starts with 1-6 hashes + space.
  if (/^#{1,6}\s+\S/m.test(text)) return true
  // Bullet lists: line starts with -, *, or + + space.
  if (/^\s*[-*+]\s+\S/m.test(text)) return true
  // Numbered lists: line starts with "1. " / "2. " etc.
  if (/^\s*\d+\.\s+\S/m.test(text)) return true
  // Blockquote.
  if (/^\s*>\s+\S/m.test(text)) return true
  // Fenced code block.
  if (/```/.test(text)) return true
  // Inline code with multiple backticks across the text.
  const inlineCodeMatches = text.match(/`[^`\n]+`/g)
  if (inlineCodeMatches && inlineCodeMatches.length >= 2) return true
  // Bold or italic markers in multiple places.
  const boldMatches = text.match(/\*\*[^*\n]+\*\*/g)
  if (boldMatches && boldMatches.length >= 1) return true
  // Multi-paragraph (blank line separating non-empty content) is a
  // softer signal — only flag when combined with at least 3 paragraphs.
  const blanks = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  if (blanks.length >= 3) return true
  return false
}

export async function runCommandPipeline(
  audioBuffer: Buffer,
  selectedText: string,
  settings: Settings,
  // Same focus-replay semantics as runDictationPipeline. No paste-related
  // effect here: this pipeline already returns its text for the caller to
  // deliver rather than pasting it itself.
  focusOverride?: FocusedApp,
  // Returns the command as well as the result. The caller has to persist
  // what the user SAID — for a long time it stored the string
  // '(rewrite)' instead, which meant a rewrite could eat two minutes of
  // speech and leave nothing behind. See DictationResult.rewrite.
  //
  // `guarded` means no rewrite happened: the speech was too long for the
  // selection to plausibly be its target, so it was cleaned as a
  // dictation instead and the selection was left untouched. File it as a
  // dictation, not a rewrite.
): Promise<{ text: string; command: string; guarded?: boolean }> {
  // Command mode ("rewrite my selection with this voice instruction")
  // fundamentally requires an LLM — there's no regex-able way to
  // "make this paragraph shorter" or "translate to French". Transcription
  // is on-device, but with no cleanup key the cleanup provider is a no-op
  // and this would silently paste the raw spoken command instead of the
  // rewritten selection. Surface the requirement instead.
  if (settings.provider.groqKey.trim().length === 0) {
    throw new Error('Rewriting a selection needs the cleanup service. Add a key in Settings → General, or press the hotkey with nothing selected to dictate normally.')
  }
  const { transcription, cleanup } = buildProviders(settings)
  const dictionary = buildDictionary(settings)
  // Same release-time refresh as the dictation pipeline — see comment
  // there. The user may have moved between apps mid-recording.
  const refreshFocusedApp = focusOverride ? null : captureFocusedApp()

  const command = await withRetry('Transcription', () =>
    transcription.transcribe(audioBuffer, { dictionary }))

  if (refreshFocusedApp) await refreshFocusedApp
  const focusedApp = focusOverride ?? getFocusedApp()

  // Did a stray selection just eat a dictation?
  //
  // Rewrite mode is entered on one signal — was anything selected — which
  // knows nothing about how much was then said. On 2026-08-28 a
  // 16-character selection swallowed 121 seconds of speech and collapsed
  // it into one line. See rewrite-guard.ts.
  //
  // When it fires, the speech is treated as what it evidently is: a
  // dictation. It is cleaned and returned as normal text, the selection is
  // left alone, and the caller files it as a dictation rather than a
  // rewrite so it stays searchable and can be re-polished.
  if (selectionLikelyStale({
    transcriptChars: command.length,
    selectionChars: selectedText.length,
  })) {
    logInfo('Rewrite guarded — treating long speech as a dictation', {
      transcriptChars: command.length,
      selectionChars: selectedText.length,
      ratio: selectedText.length > 0
        ? Number((command.length / selectedText.length).toFixed(1))
        : null,
    })
    return {
      text: await cleanupAsDictation(
        command, focusedApp, dictationProjectKey(focusedApp), settings, cleanup,
      ),
      command,
      guarded: true,
    }
  }

  return {
    text: await rewriteSelection(command, selectedText, focusedApp, settings, cleanup),
    command,
  }
}

/**
 * Apply a spoken command to a piece of selected text.
 *
 * Split out of runCommandPipeline so the same prompt-building runs when a
 * rewrite is re-run from the history list (repolishEntry). Duplicating it
 * there would let the two drift, and the markdown and email rules below
 * are exactly the sort of thing that only shows up as a bug months later.
 *
 * Takes an already-transcribed command and a resolved focused app, so it
 * touches neither the microphone nor the AX tree — which is what makes it
 * safe to call from an IPC handler long after the fact.
 */
async function rewriteSelection(
  command: string,
  selectedText: string,
  focusedApp: FocusedApp,
  settings: Settings,
  cleanup: CleanupProvider,
): Promise<string> {
  // Markdown-preservation rule. The 8B model flattens structured
  // input into a single paragraph by default. If the selection has
  // markdown shape (headings, bullets, fences, multi-paragraph), we
  // explicitly tell the model to keep that shape — only the text
  // inside structural elements changes, never the structure itself.
  const isMarkdown = looksLikeMarkdown(selectedText)
  const formatRule = isMarkdown
    ? `FORMATTING RULE — CRITICAL:
The selected text contains markdown formatting (headings, lists, code blocks, bold/italic, or multiple paragraphs). PRESERVE all structural formatting EXACTLY:
- Keep every \`##\` heading at the same level, in the same position.
- Keep every bullet list (\`-\`, \`*\`, \`+\`) and numbered list (\`1.\`, \`2.\`) intact. The number of items stays the same unless the command explicitly says to add/remove.
- Keep every code fence (\`\`\`...\`\`\`) and inline backticks intact, with code content unchanged unless the command targets it.
- Keep every blockquote (\`>\`).
- Keep every \`**bold**\` and \`*italic*\` marker.
- Keep paragraph breaks (blank lines) where they were.
- Do NOT flatten into a single paragraph.
- The command modifies the TEXT INSIDE the structure, not the structure itself, unless the command is explicitly about formatting.`
    : `FORMATTING RULE:
The selected text is plain prose. Output as plain prose. Do not introduce markdown formatting unless the command explicitly asks for it.`

  // Inject the user-context block (command framing) so a rewrite can
  // fulfil commands like "turn this into an email and explain more about
  // my internship" using facts from the stored overview. Empty when
  // context memory is off or no overview exists.
  const contextBlock = buildContextBlock({
    enabled: settings.useContextMemory,
    mode: 'command',
    projectKey: dictationProjectKey(focusedApp),
  })
  // "Turn this into an email" needs rules the generic rewrite prompt
  // has no business carrying (subject line on top, no [Recipient]
  // placeholders). Detected from the command, NOT from the focused app:
  // "make this shorter" in Gmail is not a request for a subject line.
  const emailMode = looksLikeEmailRewrite(command)
  const systemPrompt = buildRewriteSystemPrompt({ formatRule, contextBlock, emailMode })
  // The selection goes in the USER message, with the command. Sending
  // the bare command as the user message (and burying the selection in
  // the system prompt, below a ~1.9k-char context block) is what made
  // the model write a brand-new email out of the context and ignore the
  // text the user had highlighted.
  const userMessage = buildRewriteUserMessage(selectedText, command)

  logInfo('Command pipeline', {
    chars: selectedText.length,
    markdown: isMarkdown,
    emailMode,
    command: command.slice(0, 60),
  })

  const result = await withCleanupRetry(() =>
    cleanup.cleanup(userMessage, {
      appName: focusedApp.name,
      appCategory: focusedApp.category,
      systemPrompt,
      mode: 'rewrite',
      // Anything unusable comes back as the user's own selection —
      // never the dictated command, and never the delimited scaffold.
      fallbackText: selectedText,
    }))

  // The model sometimes answers ABOUT the selection rather than rewriting
  // it — one user got the single word "identical" pasted over a sentence.
  // Keeping their own text is always the better outcome: a rewrite that
  // did nothing is a non-event, and a rewrite that deletes a paragraph and
  // leaves a verdict behind is destructive.
  if (looksLikeMetaReply(selectedText, result)) {
    logInfo('Rewrite discarded — model reported instead of rewriting', {
      reply: result.trim().slice(0, 40),
      selectionChars: selectedText.length,
    })
    return selectedText
  }

  return emailMode ? normalizeEmailRewrite(result) : result
}

/**
 * Run the AI pass again on an entry from the history list, and hand back
 * the new text without pasting anything.
 *
 * This exists because there was no way to recover from a bad cleanup. If
 * the model mangled a dictation you had exactly one artifact — the text it
 * had already pasted — and the raw transcript sat in the store, unreachable.
 *
 * HONEST LIMIT: this re-runs with today's settings and the app NAME and
 * CATEGORY stored on the entry. It cannot reproduce the original run
 * exactly, because the things that steered it — the AX role of the focused
 * field, whether an AI CLI was running in the terminal, which project the
 * window title resolved to — were live facts about a moment that has
 * passed and were never persisted. Expect the same register, not the same
 * bytes.
 */
export async function repolishEntry(
  entry: DictationResult,
  settings: Settings,
): Promise<string> {
  const said = spokenText(entry)
  if (said.trim().length === 0) {
    // A rewrite recorded before the instruction was persisted. There is
    // nothing to run on, and saying so is better than running the literal
    // string '(rewrite)' through the model.
    throw new Error(
      'This entry has no transcript to work from — it was recorded before Yappr kept the words spoken for a rewrite.',
    )
  }

  const { cleanup, cleanupAvailable } = buildProviders(settings)
  if (!cleanupAvailable) {
    throw new Error('The AI pass needs a cleanup key. Add one in Settings → General.')
  }

  // A stand-in for the app this was dictated into. bundleId is empty on
  // purpose: it is the key every routing table is keyed by, and guessing
  // one from a display name would silently apply another app's rules.
  // Everything keyed by bundle id therefore falls back to its default,
  // which is the honest answer for a dictation that happened an hour ago.
  const focusedApp: FocusedApp = {
    bundleId: '',
    name: entry.appName,
    category: entry.appCategory,
    pid: 0,
    windowTitle: '',
    surface: 'other',
    tabTitle: null,
  }

  if (isRewriteEntry(entry)) {
    const selection = entry.rewrite?.selection ?? ''
    if (selection.trim().length === 0) {
      throw new Error('This rewrite has no saved selection to apply the instruction to.')
    }
    return rewriteSelection(said, selection, focusedApp, settings, cleanup)
  }

  const cleaned = await cleanupAsDictation(
    said, focusedApp, entry.projectKey ?? null, settings, cleanup,
  )
  logInfo('Re-polished from history', {
    chars: cleaned.length,
    transcriptChars: said.length,
    category: entry.appCategory,
  })
  return cleaned
}

/**
 * Clean a transcript the way the dictation path would, given a resolved
 * app rather than live focus.
 *
 * Shared by two callers that both arrive with a transcript and no live
 * routing context: re-polishing an old history entry, and the rewrite
 * guard, which has just decided that what it is holding is a dictation
 * after all. Both need the real cleanup rather than pasting raw Whisper
 * output, and neither can consult the AX tree.
 *
 * Not a substitute for the block inside runDictationPipeline, which has
 * the live surface, the per-app rule and the AI-CLI routing to work with.
 * This is the same cleanup with the parts that need a live window left at
 * their defaults.
 */
async function cleanupAsDictation(
  transcript: string,
  focusedApp: FocusedApp,
  projectKey: string | null,
  settings: Settings,
  cleanup: CleanupProvider,
): Promise<string> {
  const category = focusedApp.category
  const strictness = strictnessFor(focusedApp, settings)
  const register = registerFor(focusedApp, category)
  const composingEmail = asksForEmailComposition(transcript)
    || (category === 'email' && countWords(transcript) >= EMAIL_COMPOSE_MIN_WORDS)
  const contextBlock = buildContextBlock({
    enabled: settings.useContextMemory,
    // This path cannot do AI-CLI routing, but the category can still be
    // ai_prompt from the URL router — and then the output is a shaped
    // prompt and wants the shaping framing like any other.
    mode: category === 'ai_prompt' ? 'prompt' : 'cleanup',
    projectKey,
  })
  const systemPrompt = buildCleanupPrompt(
    category,
    focusedApp.name,
    undefined,
    undefined,
    strictness,
    settings.emojiInMessages,
    register,
    contextBlock,
    undefined,
    composingEmail,
  ).replace('{text}', transcript)

  const cleaned = await withCleanupRetry(() =>
    cleanup.cleanup(transcript, {
      appName: focusedApp.name,
      appCategory: category,
      systemPrompt,
      expandsOutput: composingEmail,
    }))

  return composingEmail ? normalizeComposedEmail(cleaned, senderFirstName()) : cleaned
}
