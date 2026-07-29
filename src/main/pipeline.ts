import { buildCleanupPrompt, type Register } from '../shared/prompts'
import { buildContextBlock } from './context/prompt-injector'
import { MODELS, BUILTIN_DICTIONARY, IDE_EDITORS } from '../shared/constants'
import type { AppCategory, DictationResult, Settings, Strictness } from '../shared/types'
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
import { NoSpeechError } from './errors'
import { focusedTerminalRunningAiCli, TERMINAL_BUNDLE_IDS } from './terminal-ai-cli'
import {
  applyQuickFixes,
  applyDictionaryReplacements,
  applySelfCorrection,
  applySpelledNameCollapse,
  applyQuestionMarks,
} from './text-passes'
import { strictnessFor, registerFor } from './routing'
import { countWords, type DictationMetric } from './metrics'
import { cleanupSkipReason, type SkipReason } from './cleanup-policy'

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
): { transcription: TranscriptionProvider; cleanup: CleanupProvider } {
  const { provider, groqKey, transcriptionModel, cleanupModel } = settings.provider

  if (provider === 'local') {
    // Local Whisper for transcription. Cleanup is conditional:
    //   - If the user has a Groq key configured, use it for LLM
    //     polish (filler removal at Light, prose restructure at
    //     Strict, list formatting, self-correction handling,
    //     optional emoji injection).
    //   - If NOT, fall back to a no-op cleanup so Local stays fully
    //     offline. The pipeline's regex passes (Light cleanup +
    //     QUICK_FIXES brand-name fixes) still apply.
    //
    // This matches the "Local means local" promise: a user who
    // picks Local and never configures Groq must never see a network
    // call (and must never see Groq's "Invalid API Key" error).
    const cleanup = groqKey.trim().length > 0
      ? createGroqCleanupProvider(groqKey, MODELS.groq.cleanup)
      : createLocalCleanupProvider()
    return {
      transcription: createLocalWhisperProvider(),
      cleanup,
    }
  }

  return {
    transcription: createGroqTranscriptionProvider(groqKey, transcriptionModel),
    cleanup: createGroqCleanupProvider(groqKey, cleanupModel),
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
    const wait = parseRateLimitDelayMs(err)
    logError('Cleanup failed (attempt 1) — retrying', err)
    await new Promise(r => setTimeout(r, wait))
    try {
      return await fn()
    } catch (err2) {
      logError('Cleanup failed (attempt 2) — giving up', err2)
      throw err2
    }
  }
}

const CLEANUP_RETRY_CAP_MS = 5000

// Length-ratio guard thresholds. Only fire when the input is long
// enough to be a real dictation (not a one-line message), and only
// fail when the output is dramatically shorter than the input.
// 0.4 means "if the cleaned output is less than 40% of the input
// length, treat that as a summarization failure." Catches the 4%
// and 1% production cases without false-positiving on normal
// filler removal (~85-95% retention is typical).
const LENGTH_GUARD_MIN_INPUT_CHARS = 300
const LENGTH_GUARD_MIN_RATIO = 0.4
function parseRateLimitDelayMs(err: unknown): number {
  if (!(err instanceof Error)) return 250
  const m = err.message.match(/Please try again in ([\d.]+)\s*s/i)
  if (!m) return 250
  const seconds = parseFloat(m[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return 250
  return Math.min(CLEANUP_RETRY_CAP_MS, Math.ceil(seconds * 1000))
}

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
  // Hotkey timestamps for latency instrumentation. Omitted (or with a
  // zero releasedAt) for non-hotkey entry points like paste-last, which
  // suppresses the metric instead of recording a meaningless one.
  timing?: { pressedAt: number; releasedAt: number },
): Promise<DictationResult & { pasteMethod: 'paste' | 'clipboard' }> {
  const start = Date.now()
  onState('processing')
  // Per-phase accumulators for the latency record emitted at the end.
  let transcribeMs = 0
  let cleanupMs = 0
  let cleanupSkipped = true

  const { transcription, cleanup } = buildProviders(settings)
  const dictionary = buildDictionary(settings)

  // Refresh the focused-app cache CONCURRENTLY with transcription. The
  // press-time capture is stale if the user moved between apps while
  // dictating (started in iMessage, released in Gmail → they want
  // Gmail-flavored polish, not iMessage). Both the osascript and the
  // Whisper call are async, so this adds no hot-path latency — the
  // ~50–150ms osascript completes during transcription's network
  // roundtrip. Read the value AFTER both have resolved.
  const refreshFocusedApp = captureFocusedApp()

  const tStart = Date.now()
  const transcript = (await withRetry('Transcription', () =>
    transcription.transcribe(audioBuffer, { dictionary, onPartial }))).trim()
  transcribeMs = Date.now() - tStart
  logInfo('Transcribed', { ms: transcribeMs, chars: transcript.length, preview: transcript.slice(0, 60) })

  await refreshFocusedApp
  const focusedApp = getFocusedApp()

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
  if (effectiveCategory === 'code' || PRIMARY_AI_CHAT_BUNDLES.has(focusedApp.bundleId)) {
    const axRole = await (getPressTimeAXRolePromise() ?? Promise.resolve('script-error'))
    const isAiChat = PRIMARY_AI_CHAT_BUNDLES.has(focusedApp.bundleId)
      || (effectiveCategory === 'code' && CODE_APP_AI_CHAT_ROLES.has(axRole))
    if (isAiChat) {
      effectiveCategory = 'ai_prompt'
      logInfo('Routed to ai_prompt', { bundleId: focusedApp.bundleId, axRole })
    } else if (effectiveCategory === 'code' && TERMINAL_BUNDLE_IDS.has(focusedApp.bundleId)) {
      const cliCheck = await focusedTerminalRunningAiCli(focusedApp.bundleId)
      if (cliCheck.isAiCli) {
        effectiveCategory = 'ai_prompt'
        logInfo('Routed to ai_prompt (terminal AI CLI)', {
          bundleId: focusedApp.bundleId,
          cli: cliCheck.cli,
        })
      }
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
  const skipReason: SkipReason = settings.pauseCleanup
    ? 'none'  // user-paused is tracked separately below
    : cleanupSkipReason(transcript, effectiveCategory)
  let cleanupSkipReasonLogged: string = 'none'
  if (settings.pauseCleanup) {
    // User-controlled hard bypass. Skip the LLM entirely. The
    // downstream regex passes (brand names, dictionary, self-
    // correction, spelled-name collapse, question marks) still run.
    cleanupSkipReasonLogged = 'user-paused'
    logInfo('Cleanup skipped (user-paused)', { chars: transcript.length })
  } else if (skipReason !== 'none') {
    // Two ways to get here: a code-category dictation with no
    // filler/stutter/correction markers, or any dictation shorter than
    // SHORT_UTTERANCE_MAX_WORDS that is likewise clean. Both remove the
    // whole LLM round-trip from the latency the user feels.
    cleanupSkipReasonLogged = skipReason
    logInfo('Cleanup skipped (fast path)', {
      reason: skipReason,
      words: countWords(transcript),
      chars: transcript.length,
    })
  } else {
    const editor = IDE_EDITORS[focusedApp.bundleId]
    const strictness = strictnessFor(focusedApp, settings)
    const register = registerFor(focusedApp, effectiveCategory)
    // Feature 4 Phase 1: optional "Who you are" block. Empty when
    // disabled or no overview saved. Hot-path cost ~1ms (cached read).
    const contextBlock = buildContextBlock({ enabled: settings.useContextMemory })
    const systemPrompt = buildCleanupPrompt(
      effectiveCategory,
      focusedApp.name,
      rule?.customPrompt,
      editor,
      strictness,
      settings.emojiInMessages,
      register,
      contextBlock,
    ).replace('{text}', transcript)
    const cStart = Date.now()
    cleanupSkipped = false
    try {
      cleaned = await withCleanupRetry(() =>
        cleanup.cleanup(transcript, {
          appName: focusedApp.name,
          appCategory: effectiveCategory,
          systemPrompt,
        }))
      cleanupMs = Date.now() - cStart
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
      // Still count the time — a failed cleanup is wall-clock the user
      // waited through, and hiding it would flatter the p95.
      cleanupMs = Date.now() - cStart
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
  cleaned = applyDictionaryReplacements(cleaned, settings.userDictionary ?? [])

  // Deterministic self-correction safety net. The LLM should handle
  // "at 6, I mean 7" → "at 7" — but the 8B cleanup model still keeps
  // both halves of the correction ~40% of the time, and local-only
  // mode has no LLM at all. This regex pass catches the obvious shape:
  // "<value>, <marker> <value>" where both values look like the same
  // kind of thing (number, time, name, path). Conservative on purpose
  // — see CORRECTION_REWRITES.
  cleaned = applySelfCorrection(cleaned)

  // Collapse spelled-out letters into joined words ALWAYS — the user
  // never wants hyphenated letters in their final output:
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

  const { method: pasteMethod } = await pasteText(cleaned, { rolePromise: axRolePromise })
  const pastedAt = Date.now()
  logInfo('Pasted', {
    method: pasteMethod,
    totalMs: pastedAt - start,
    app: focusedApp.name,
  })

  // One structured latency record per dictation, parsed by
  // scripts/latency-report.mjs. Only emitted for hotkey-driven
  // dictations, where "release → pasted" is a wall-clock the user
  // actually sat through.
  if (timing && timing.releasedAt > 0) {
    const releaseToFinalMs = pastedAt - timing.releasedAt
    const metric: DictationMetric = {
      audioMs: Math.max(0, timing.releasedAt - timing.pressedAt),
      words: countWords(cleaned),
      // Equal today: the text is pasted in one shot at the end. They
      // diverge only if progressive insertion is ever built.
      releaseToFirstMs: releaseToFinalMs,
      releaseToFinalMs,
      transcribeMs,
      cleanupMs,
      cleanupSkipped,
      skipReason: cleanupSkipReasonLogged,
      category: effectiveCategory,
      provider: transcription.name,
    }
    logInfo('latency', metric)
  }

  onState('done')

  return {
    id: crypto.randomUUID(),
    transcript,
    cleaned,
    appName: focusedApp.name,
    appCategory: effectiveCategory,
    timestamp: Date.now(),
    pasteMethod,
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
  settings: Settings
): Promise<string> {
  // Command mode ("rewrite my selection with this voice instruction")
  // fundamentally requires an LLM — there's no regex-able way to
  // "make this paragraph shorter" or "translate to French". On Local
  // with no Groq key configured the cleanup provider is a no-op,
  // which would silently paste the raw spoken command instead of
  // the rewritten selection. Surface the requirement instead.
  if (settings.provider.provider === 'local' && settings.provider.groqKey.trim().length === 0) {
    throw new Error('Command mode (rewrite selection) requires a cloud LLM. Add a Groq key in Settings → AI Provider, or use plain dictation by pressing the hotkey without a text selection.')
  }
  const { transcription, cleanup } = buildProviders(settings)
  const dictionary = buildDictionary(settings)
  // Same release-time refresh as the dictation pipeline — see comment
  // there. The user may have moved between apps mid-recording.
  const refreshFocusedApp = captureFocusedApp()

  const command = await withRetry('Transcription', () =>
    transcription.transcribe(audioBuffer, { dictionary }))

  await refreshFocusedApp
  const focusedApp = getFocusedApp()

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

  const systemPrompt = `You are a text editing assistant. The user has selected the following text and dictated an editing command. Apply the command and return ONLY the modified text, nothing else (no preamble, no explanation, no quotes around the output).

${formatRule}

Selected text:
${selectedText}

Editing command: ${command}

Output the modified text now:`

  logInfo('Command pipeline', {
    chars: selectedText.length,
    markdown: isMarkdown,
    command: command.slice(0, 60),
  })

  const result = await withCleanupRetry(() =>
    cleanup.cleanup(command, {
      appName: focusedApp.name,
      appCategory: focusedApp.category,
      systemPrompt,
    }))

  return result
}
