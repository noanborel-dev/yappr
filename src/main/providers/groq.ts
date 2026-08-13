import Groq, { toFile } from 'groq-sdk'
import type { TranscriptionProvider, CleanupProvider } from './types'
import { NoSpeechError } from '../errors'
import { logInfo } from '../log'

// Cache the Groq SDK instance so the underlying HTTP agent (and its
// keep-alive connection pool) is reused across pipeline runs. Rebuilding
// per-call paid TLS handshake on every dictation. Keyed by API key so
// rotating the key triggers a fresh client.
let cachedClient: Groq | null = null
let cachedKey = ''
function getClient(apiKey: string): Groq {
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Groq({ apiKey })
    cachedKey = apiKey
  }
  return cachedClient
}

// Whisper exposes three per-segment confidence signals when called with
// response_format='verbose_json'. We use them to detect hallucinations
// (Whisper outputting multilingual word-salad on near-silent audio).
// We check the *max* no_speech_prob and *min* avg_logprob across
// segments rather than averages — averages wash out a clearly-silent
// segment in the middle of a longer clip, letting the hallucination
// pass.
const NO_SPEECH_PROB_THRESHOLD = 0.55
const AVG_LOGPROB_THRESHOLD = -1.2
const COMPRESSION_RATIO_THRESHOLD = 2.4

interface VerboseSegment {
  avg_logprob?: number
  compression_ratio?: number
  no_speech_prob?: number
  text?: string
}
interface VerboseTranscription {
  text: string
  language?: string
  duration?: number
  segments?: VerboseSegment[]
}

export function createGroqTranscriptionProvider(
  apiKey: string,
  model: string
): TranscriptionProvider {
  return {
    name: 'Groq',
    async transcribe(audio, options = {}) {
      const client = getClient(apiKey)
      // toFile is the SDK's supported helper for Node Buffers; wrapping in
      // DOM File/Blob produced malformed multipart bodies that Groq rejected.
      const file = await toFile(audio, 'audio.webm', { type: 'audio/webm' })
      const dict = options.dictionary ?? []
      // Whisper's prompt has a 224-token cap; comma-separated terms is the
      // canonical way to bias the model toward specific spellings.
      const prompt = dict.length > 0 ? dict.join(', ') : undefined
      // verbose_json gives us per-segment confidence so we can reject
      // hallucinations. Plain 'json' returns only text.
      const raw = await client.audio.transcriptions.create({
        file,
        model,
        response_format: 'verbose_json',
        // Only set language when explicitly requested. Whisper auto-detects
        // per clip otherwise — important for users who dictate in multiple
        // languages (forcing 'en' produced phonetic garbage on Spanish).
        ...(options.language ? { language: options.language } : {}),
        ...(prompt ? { prompt } : {}),
      }, {
        // Upload + transcribe of a long clip can legitimately take a
        // few seconds; 15s is comfortably above typical worst case
        // (~3s for a 60s clip) but well under SDK default 60s.
        // maxRetries 0 because withRetry handles the retry policy.
        timeout: 15000,
        maxRetries: 0,
      })
      const response = raw as unknown as VerboseTranscription

      const segs = response.segments ?? []
      if (segs.length > 0) {
        const maxNoSpeech = segs.reduce(
          (m, x) => Math.max(m, x.no_speech_prob ?? 0),
          0
        )
        const minLogprob = segs.reduce(
          (m, x) => Math.min(m, x.avg_logprob ?? 0),
          0
        )
        const maxCompression = segs.reduce(
          (m, x) => Math.max(m, x.compression_ratio ?? 0),
          0
        )

        const looksLikeHallucination =
          maxNoSpeech > NO_SPEECH_PROB_THRESHOLD ||
          minLogprob < AVG_LOGPROB_THRESHOLD ||
          maxCompression > COMPRESSION_RATIO_THRESHOLD

        if (looksLikeHallucination) {
          logInfo('Whisper hallucination rejected', {
            maxNoSpeech: Number(maxNoSpeech.toFixed(3)),
            minLogprob: Number(minLogprob.toFixed(3)),
            maxCompression: Number(maxCompression.toFixed(3)),
            language: response.language,
            preview: response.text.slice(0, 60),
          })
          throw new NoSpeechError()
        }
      }

      return response.text
    },
  }
}

// Strip LLM meta-commentary that leaks through despite the
// OUTPUT_GUARD prompt. The 8B model has a few stubborn habits:
//   1. Prepending "Here is the cleaned text:" / "Cleaned:" / etc.
//   2. Appending a trailing "I removed the fillers..." explanation,
//      usually after a blank line.
//   3. Wrapping the whole output in quotes or code fences.
//   4. Asking clarifying questions when input is ambiguous.
// If the model goes fully off-rails ("I'd like to understand...")
// and there's no recoverable cleaned text, we return the original
// transcript untouched — better to paste raw Whisper than to paste
// the LLM's clarifying question.
// LLM artifact stripper. The 8B cleanup model has several stubborn
// ways of leaking non-output text into its response. We catch each.
//
// Order matters: hard-cut at the first blank line followed by clearly-
// meta content, THEN strip leading labels, THEN trim surrounding quotes.
function stripLLMArtifacts(raw: string, fallback: string): string {
  let s = raw.trim()

  // 1. HARD CUT at the first blank line followed by anything that looks
  // like instruction-echo, meta-commentary, or rule listing. This is
  // the most destructive pattern — once the model says "\n\n1. remove
  // filler tokens..." it's gone off-rails and everything after the
  // blank line is garbage. Keep only what came before.
  const META_AFTER_BLANK = new RegExp(
    [
      '\\n\\s*\\n',                                      // blank line
      '(?:',
      [
        '(?:note|here|the\\s+dictated|output|result|cleaned)\\b',
        'i\\s+(?:removed|cleaned|corrected|kept|fixed|added|made|left|did|polished|restructured|preserved|hope|tried|will|have|just|did|am|did|did)\\b',
        'this\\s+(?:is|version|output|response)\\b',
        '(?:do|let)\\s+(?:you|me)\\b',
        'i[\'’]?(?:d|m|ll|ve)\\s+(?:like|happy|going|here)\\b',
        '(?:could|can|would|please)\\s+(?:you|i|provide|clarify)\\b',
        'what\\s+(?:is|are|did|do)\\b',
        '\\(?\\s*note[:.]\\s',
      ].join('|'),
      ')[^]*$',
    ].join(''),
    'i',
  )
  s = s.replace(META_AFTER_BLANK, '')

  // 2. Single-line trailing meta (no blank line) — model appends one
  // line directly below: "...dinner at 7 p.m.\nI removed the fillers"
  s = s.replace(
    /\n(?:i\s+(?:removed|cleaned|corrected|kept|fixed|added|made|left|did|polished|restructured|preserved|hope|tried)|note[:.]?\s|the\s+(?:result|output|cleaned|dictated)|i['’]d\s+like\s+to|could\s+you|can\s+you\s+(?:clarify|provide)|this\s+(?:is|version)|let\s+me\s+know|hope\s+(?:this|that))\b[^\n]*$/i,
    '',
  )

  // 3. Strip surrounding code fences / quotes.
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '')
  s = s.replace(/^["“‘'](.*)["”’']$/s, '$1')

  // 4. Strip leading labels: "Cleaned:", "Output:", "Here is the cleaned text:", etc.
  s = s.replace(
    /^(here['’]?s?\s+(?:the|your|a)\s+(?:cleaned|polished|cleaned[- ]up|final|edited|formatted|fixed|corrected)\s+(?:text|version|message|output|prompt|dictation)?:?\s*\n?|cleaned\s*(?:text|message|version)?:\s*\n?|output:\s*\n?|result:\s*\n?|response:\s*\n?)/i,
    '',
  )

  // 4b. Strip leading CONTEXT-ECHO phrases (Feature 4 Phase 1). The
  // 8B model sometimes opens its output with "Based on the context..."
  // / "As you mentioned..." / "Given your background..." — signals it
  // leaked from the USER CONTEXT block into the output.
  //
  // We strip ONLY the intro clause up to the FIRST comma (these
  // phrasings almost always end with a comma before the real content
  // begins). If there's no comma in the first 100 chars, we leave it
  // alone — the match might be a real sentence the user dictated.
  s = s.replace(
    /^(?:(?:based\s+on|given|considering|as\s+per)\s+(?:the\s+|your\s+|our\s+)?(?:context|background|overview|info(?:rmation)?|note)|as\s+(?:you|previously)\s+(?:mentioned|said|noted|wrote|stated)|from\s+what\s+you\s+(?:said|wrote|mentioned)|since\s+you\s+(?:mentioned|said|wrote)|given\s+(?:that\s+)?you[’']?re\s+\w[^,\n]{0,60})[^,\n]{0,80},\s*/i,
    '',
  )

  s = s.trim()

  // 5. If after stripping we have nothing or clearly-meta content,
  // fall back to the raw transcript. Better to paste raw Whisper than
  // a clarifying question or rules-echo.
  if (
    s.length === 0
    || /^(?:i['’]?d\s+like\s+to|could\s+you|can\s+you|please\s+(?:provide|clarify)|what\s+(?:is|are)|i\s+don['’]?t\s+understand|\d+\.\s+\w)/i.test(s)
  ) {
    return fallback
  }
  return s
}

// Question-shaped opener patterns for the input transcript. If the user
// dictated "how are you doing" or "what's up", the 8B cleanup model
// sometimes treats it as a chat message and answers it instead of
// cleaning it. We use these patterns as the first gate of the
// loopback detector below.
const LOOPBACK_INPUT_PATTERNS: readonly RegExp[] = [
  /^how\s+(are|were|is|was|did|do)\b/i,
  /^what\s+(are|were|is|was|did|do|you|s up|'?s up)\b/i,
  /^how'?s\b/i,
  /^what'?s\b/i,
  /^you\s+(doing|going|good|okay|alright)\b/i,
  /^are\s+you\b/i,
  /^can\s+you\b/i,
]

// Reply-shaped openers the cleanup model emits when it answers a
// question instead of cleaning it. Matched against the RAW LLM output
// (pre-strip) so leading "Sure!" / "I'm doing well" is still visible.
const LOOPBACK_REPLY_PATTERNS: readonly RegExp[] = [
  /^i'?m\s+(doing\s+)?(well|good|great|fine|okay)/i,
  /^doing\s+(well|good|great|fine|okay)/i,
  /^thanks?\s+for\s+asking/i,
  /^pretty\s+(good|well)/i,
  /^not\s+(much|bad)/i,
  /^just\s+(helping|chatting|hanging)/i,
  /^sure[!,.\s]/i,
  /^of\s+course/i,
  /^absolutely/i,
  /^happy\s+to\s+help/i,
  /^here'?s\s+(how|what|the)/i,
]

// Safety net for the canonical failure shape: short question-shaped
// transcript + reply-shaped or wildly-longer LLM output. Both gates
// must pass to keep the false-positive rate near zero — we only fall
// back when we're confident the model answered instead of cleaning.
function detectLoopbackAnswer(rawOutput: string, originalTranscript: string): boolean {
  const transcript = originalTranscript.trim()
  if (transcript.length === 0 || transcript.length > 80) return false
  if (!LOOPBACK_INPUT_PATTERNS.some(p => p.test(transcript))) return false

  const output = rawOutput.trim()
  if (output.length === 0) return false
  const lengthBlew = output.length > transcript.length * 2
  const replyShaped = LOOPBACK_REPLY_PATTERNS.some(p => p.test(output))
  return lengthBlew || replyShaped
}

export function createGroqCleanupProvider(
  apiKey: string,
  model: string
): CleanupProvider {
  return {
    name: 'Groq',
    async cleanup(text, { systemPrompt, appCategory, mode = 'cleanup', fallbackText }) {
      const client = getClient(apiKey)
      // max_tokens budget:
      //
      // - rewrite: 3× input + headroom. A rewrite EXPANDS ("turn these
      //   notes into an email" adds a subject, a greeting, and a
      //   sign-off), and until this case existed the budget was sized
      //   off the whole user message anyway — which, when the message
      //   was just the dictated command, meant ~90 tokens and an email
      //   that stopped mid-sentence (finish_reason "length").
      // - ai_prompt: 3× input. The cleanup REFORMATS rambling speech
      //   into a structured prompt (headings, bullets, "Done when",
      //   "Constraints") and must preserve every detail — so output
      //   commonly exceeds input length. Cap at 2048 to allow long
      //   multi-section prompts.
      // - everything else: ~1.5× input. Output is roughly input
      //   length minus fillers, plus added punctuation.
      //
      // Each token is ~4 chars (rough).
      const inputTokens = Math.ceil(text.length / 4)
      const maxTokens = mode === 'rewrite'
        ? Math.max(400, Math.min(3072, inputTokens * 3 + 200))
        : appCategory === 'ai_prompt'
          ? Math.max(160, Math.min(2048, inputTokens * 3 + 120))
          : Math.max(80, Math.min(1024, Math.ceil(inputTokens * 1.5) + 80))
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        // Lower temperature = more deterministic, less rambling, fewer
        // hallucinated suffixes. 0.2 still lets the model fix grammar
        // creatively without going off-prompt.
        temperature: 0.2,
        max_tokens: maxTokens,
      }, {
        // SDK defaults: timeout 60s, maxRetries 2 → worst case ~3min
        // before our withRetry sees a rejection. Cleanup normally
        // takes 500-900ms; if Groq stalls, fail fast and let the
        // pipeline's withRetry try once on a fresh connection.
        timeout: 8000,
        maxRetries: 0,
      })
      // In rewrite mode the safe fallback is the user's selection, not
      // `text` — `text` there is the selection wrapped up with the
      // dictated command, and pasting THAT over their selection is the
      // worst possible outcome.
      const fallback = fallbackText ?? text
      const raw = response.choices[0]?.message?.content?.trim() ?? fallback
      const cleaned = stripLLMArtifacts(raw, fallback)
      // The loopback guard is a cleanup-mode rule: it assumes output
      // much longer than input means the model answered the dictation
      // instead of cleaning it. A rewrite is SUPPOSED to run longer
      // than its input, and command-mode input often opens with "can
      // you…" — which used to trip both gates and paste the user's own
      // command back over their selection.
      if (mode === 'cleanup' && detectLoopbackAnswer(raw, text)) {
        // Model answered the dictated question instead of cleaning it.
        // Return the raw transcript so deterministic post-passes in
        // pipeline.ts still run on the user's actual message.
        logInfo('Cleanup loopback detected, falling back to transcript', {
          transcriptPreview: text.slice(0, 60),
          outputPreview: raw.slice(0, 60),
        })
        return text
      }
      return cleaned
    },
  }
}

export async function testGroqKey(apiKey: string): Promise<void> {
  const client = getClient(apiKey)
  await client.models.list()
}

// Focused emoji-judge. Single laser-clear question: "should this
// casual message get an emoji, and which one?" Runs in PARALLEL
// with the main cleanup pass so the only added wall-clock cost is
// max(cleanupMs, judgeMs) - cleanupMs (typically ~0-50ms since the
// judge is much shorter than cleanup).
//
// Why separate from cleanup:
//   - llama-8b on a single mixed prompt ("clean up the text AND
//     decide on emoji") interprets the long "skip if X" emoji
//     guidance as "default-skip" — emojis fired ~5% of the time
//     in practice even on clearly-emoji-able messages.
//   - A focused prompt that ONLY asks the emoji question fires
//     emojis ~60% of the time on the right messages, ~0% on the
//     wrong ones. Smaller model, smaller prompt, sharper signal.
//
// Returns either an empty string (no emoji) or a single emoji
// character. Caller appends it to the cleaned text.
const EMOJI_JUDGE_SYSTEM = `You are a strict emoji judge for casual messages (iMessage, WhatsApp). Your DEFAULT answer is "NONE". Only add an emoji when the message has a SPECIFIC concrete noun (a named food, a named activity, a specific event) OR an UNMISTAKABLE emotional moment (excitement about a milestone, real apology, exhaustion at the end of a day).

OUTPUT FORMAT: respond with EXACTLY one emoji character OR the literal string "NONE". Nothing else. No punctuation, no explanation, no quotes.

ADD AN EMOJI ONLY when the message NAMES one of these things:
- A specific FOOD: ramen, pizza, coffee, sushi, tacos, beer, breakfast, dinner → pick the matching emoji
- A specific PHYSICAL ACTIVITY: running, gym, hiking, swimming → matching emoji
- A specific NAMED EVENT: birthday, wedding, concert, demo, launch → matching emoji
- A SPECIFIC TRIP / LOCATION: flying somewhere, beach trip → matching emoji
- A STRONG explicit emotion that the user clearly intends to convey: "so happy / excited / proud" → 🎉 or similar; "so tired / exhausted" → 😴; "i'm so sorry" → 😔 or 🙏; "thanks so much / really appreciate" → 🙏
- A MILESTONE: "got the job", "passed the exam", "shipped it" → 🎉

DO NOT add an emoji for:
- Logistics: "on my way", "running late", "be there in 10", "let me know when"
- Questions: "what time", "where", "did you", "can you", "do you have"
- Acknowledgments: "ok", "sure", "got it", "sounds good", "yeah", "yep"
- Generic statements without a named thing: "i had a good day", "this is interesting", "let's catch up"
- Soft / mild feelings: "feeling fine", "doing alright", "could be better"
- Plans without specifics: "want to hang out", "let's do something", "free this weekend"
- Anything code-y, technical, or work-status-y
- Anything already containing an emoji

EXAMPLES (study the pattern carefully — note how many are NONE):
"let's grab ramen at 5" → 🍜
"happy birthday!!" → 🎉
"going for a run" → 🏃
"i'm so sorry about that" → 😔
"got the job!!" → 🎉
"want to grab coffee tomorrow" → ☕
"thanks so much for your help" → 🙏
"so excited for the trip" → 🛫
"so tired, going to bed" → 😴

"on my way" → NONE
"running late, be there in 10" → NONE
"can you send me the doc" → NONE
"what time is the meeting" → NONE
"ok sounds good" → NONE
"sure" → NONE
"i'll think about it" → NONE
"yeah for sure" → NONE
"let me know" → NONE
"need to finish the report tonight" → NONE
"that was good" → NONE
"hey what's up" → NONE
"did you see the email" → NONE
"i think so" → NONE
"i had a good day" → NONE
"feeling under the weather" → NONE
"let's catch up soon" → NONE
"this is interesting" → NONE
"can we move the meeting" → NONE
"let me check" → NONE

When in doubt, output NONE. Real text conversations between adults have emoji on maybe 1 in 4 messages, not every message. Only output an emoji if you can point to a SPECIFIC named noun or UNMISTAKABLE strong emotion in the message.

Remember: ONLY the emoji character or "NONE". No other output.`

// Regex to extract a single emoji-class codepoint from the model's
// response. We don't trust the model to output exactly one character —
// llama-8b sometimes prepends a "Sure: " or adds a period. Strip
// anything that isn't an emoji.
const EMOJI_PATTERN = /[\p{Extended_Pictographic}‍️]+/u

export async function judgeEmoji(
  apiKey: string,
  model: string,
  text: string,
): Promise<string> {
  // Bail out early for obviously-not-emoji messages. Avoids a network
  // call on every "ok" / "sure" / "yes".
  const trimmed = text.trim()
  if (trimmed.length < 6) return ''
  // If the message already contains an emoji, don't double-up.
  if (EMOJI_PATTERN.test(trimmed)) return ''

  const client = getClient(apiKey)
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: EMOJI_JUDGE_SYSTEM },
        { role: 'user', content: trimmed },
      ],
      // Low temperature for deterministic judgment, not creative
      // variety. Same message → same emoji choice across dictations.
      temperature: 0.2,
      // 4 tokens is enough for either an emoji (1-2 tokens) or "NONE"
      // (1 token). Capping prevents the model from rambling.
      max_tokens: 8,
    }, {
      // Emoji is nice-to-have and runs in parallel with cleanup —
      // never let it become the long pole. Cap tighter than cleanup.
      timeout: 5000,
      maxRetries: 0,
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    if (!raw || raw.toUpperCase().startsWith('NONE')) return ''
    const match = raw.match(EMOJI_PATTERN)
    return match ? match[0] : ''
  } catch {
    // Emoji is a nice-to-have; if the judge fails, return no emoji
    // rather than dropping the whole dictation.
    return ''
  }
}
