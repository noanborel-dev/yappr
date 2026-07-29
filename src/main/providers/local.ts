import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { TranscriptionProvider, CleanupProvider } from './types'
import type { LocalModelId } from '../../shared/types'
import { NoSpeechError } from '../errors'
import { logInfo } from '../log'
import { localModelDownloaded, localModelPath, DEFAULT_LOCAL_MODEL } from '../local-models'
import { ffmpegPath, ffmpegAvailable } from '../local-binaries'
import { getSettings } from '../store'
import { getFocusedApp } from '../focused-app'
import { workerTranscribe, workerFree } from '../whisper-host'
import { buildDecodeOptions, isLikelyHallucination } from '../transcribe-core'

export class LocalModelMissingError extends Error {
  constructor() {
    super(
      'Local Whisper model is not downloaded yet. Open Settings → AI Provider → Local and click "Download model".'
    )
    this.name = 'LocalModelMissingError'
  }
}

export class LocalBinaryMissingError extends Error {
  constructor(which: 'ffmpeg') {
    super(
      `ffmpeg is not installed. \`npm install\` should have pulled @ffmpeg-installer/ffmpeg; try removing node_modules and reinstalling.`
    )
    this.name = 'LocalBinaryMissingError'
    void which
  }
}

// Reason the active model was chosen. Used in logs so the user can
// tell at a glance whether auto-switch fired and why.
type ModelSelectionReason =
  | 'user-pick'           // user's selected tier in Settings
  | 'auto-code'           // code/IDE — always elevate to Accurate
  | 'auto-email-long'     // email + audio long enough that polish matters
  | 'auto-docs-long'      // long-form doc — content stakes are high
  | 'auto-long'           // generic-context dictation, ≥ long threshold
  | 'default'             // settings unreadable, fell back to DEFAULT_LOCAL_MODEL

// Auto-switch thresholds in seconds. Tuned for typical M-series speed
// where Balanced is ~250ms/clip regardless of length and Accurate is
// ~5x slower. Length is a proxy for "how bad would a misheard word
// feel?" — a one-liner is fine on Balanced; a paragraph in an email
// is worth the extra second to get right.
const AUTO_THRESHOLDS = {
  // Code — elevate only once the clip is long enough to be worth a
  // second of inference. Measured on this machine's own logs:
  //   base            p50   92ms
  //   small           p50  270ms
  //   large-v3-turbo  p50  920ms   (flat — Whisper pads every clip to a
  //                                 30s encoder window, so a 1s clip
  //                                 costs the same as a 25s one)
  // Elevating a 1.5s "double check" to Accurate bought nothing and cost
  // ~650ms, and it fired on EVERY dictation in an editor because the
  // code branch had no length gate at all — unlike email/docs below.
  // Short technical one-liners are also the case the QUICK_FIXES regex
  // and the user dictionary already cover.
  codeSeconds: 3,
  // Email is a higher-stakes app — even short emails benefit from
  // proper capitalization and brand-name accuracy. Use a low bar.
  emailSeconds: 8,
  // Docs (Notion, Word, Pages) — long-form writing. Polish matters
  // after ~12s of content.
  docsSeconds: 12,
  // Everything else (messaging, browser, other apps) — only elevate
  // when audio gets long enough that the chance of a Balanced
  // mistake compounds.
  longSeconds: 20,
} as const

function selectedModel(audioSeconds: number): { id: LocalModelId; reason: ModelSelectionReason; focusedBundleId?: string } {
  try {
    const settings = getSettings()
    const userPick = settings.provider.localModel ?? DEFAULT_LOCAL_MODEL

    // Smart-switch off — always honor user's pick.
    if (settings.provider.localAutoAccurateInCode === false) {
      return { id: userPick, reason: 'user-pick' }
    }
    // User already picked Accurate — no elevation needed.
    if (userPick === 'large-v3-turbo') {
      return { id: userPick, reason: 'user-pick' }
    }
    // Accurate must be downloaded for any auto-elevation to fire.
    if (!localModelDownloaded('large-v3-turbo')) {
      return { id: userPick, reason: 'user-pick' }
    }

    let focused
    try {
      focused = getFocusedApp()
    } catch {
      return { id: userPick, reason: 'user-pick' }
    }

    // Code / IDE / terminal — elevate to Accurate once there's enough
    // audio to be worth it. Technical terms and brand names need the
    // larger vocabulary: "Claude Code" / "useEffect" / "GPT-4" / "tRPC"
    // come through cleanly on large; Balanced mangles them and the
    // QUICK_FIXES regex only catches the most common.
    //
    // Below codeSeconds we honor the user's tier instead. Whisper's
    // encoder cost is flat, so elevating a 1.5s utterance costs the full
    // ~920ms while transcribing almost nothing — and dictation in an
    // editor is mostly short one-liners, so this fired constantly.
    const isCode = focused.category === 'code'
      || settings.devModeApps.includes(focused.bundleId)
    if (isCode && audioSeconds >= AUTO_THRESHOLDS.codeSeconds) {
      return { id: 'large-v3-turbo', reason: 'auto-code', focusedBundleId: focused.bundleId }
    }

    // Email — elevate at a low audio-length threshold (8s). Even a
    // short email is high-stakes; "GPT 4" → "GPT for" in a work
    // email looks unprofessional.
    if (focused.category === 'email' && audioSeconds >= AUTO_THRESHOLDS.emailSeconds) {
      return { id: 'large-v3-turbo', reason: 'auto-email-long', focusedBundleId: focused.bundleId }
    }

    // Docs (Notion, Word, Pages) — elevate at the longer 12s
    // threshold. Long-form writing benefits from polish.
    if (focused.category === 'docs' && audioSeconds >= AUTO_THRESHOLDS.docsSeconds) {
      return { id: 'large-v3-turbo', reason: 'auto-docs-long', focusedBundleId: focused.bundleId }
    }

    // Generic catch-all: any dictation over 20s in any app benefits
    // from Accurate. By then there's enough text that a single
    // missed term feels worse than the latency hit.
    if (audioSeconds >= AUTO_THRESHOLDS.longSeconds) {
      return { id: 'large-v3-turbo', reason: 'auto-long', focusedBundleId: focused.bundleId }
    }

    return { id: userPick, reason: 'user-pick' }
  } catch {
    return { id: DEFAULT_LOCAL_MODEL, reason: 'default' }
  }
}

// Best-guess tier for prewarm (no audio yet) — the model the user is
// MOST LIKELY to need first, which is now their own picked tier.
//
// This used to prewarm Accurate on the reasoning that the code/email/
// long paths all elevate there. That stopped being true once elevation
// gained a length gate: the majority of dictations are short one-liners
// that stay on the user's tier, so prewarming Accurate meant the common
// case paid a model swap on the very first dictation after launch.
//
// A miss now costs one load of the OTHER model, after which the worker's
// two-slot cache holds both and no further swap occurs.
export function prewarmModelId(): LocalModelId {
  try {
    return getSettings().provider.localModel ?? DEFAULT_LOCAL_MODEL
  } catch {
    return DEFAULT_LOCAL_MODEL
  }
}

// Cheap accessor for the user's selected tier WITHOUT consulting
// focused app or audio length. Used by readiness check + uninstall
// gating; for actual transcription, use selectedModel(audioSeconds).
function userPickedModelId(): LocalModelId {
  try {
    return getSettings().provider.localModel ?? DEFAULT_LOCAL_MODEL
  } catch {
    return DEFAULT_LOCAL_MODEL
  }
}

// Force-release the worker's WhisperContext. Called from the uninstall
// IPC handler before we delete the model file (keeping the file open
// across unlink would orphan RAM and on Windows would fail with EBUSY).
// The worker stays alive for the next dictation.
export async function freeLocalWhisper(): Promise<void> {
  await workerFree()
}

function runProcess(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })
}

// Convert the renderer's WebM/Opus blob to a 16-bit signed PCM
// ArrayBuffer at 16kHz mono — the exact shape fugood's transcribeData
// expects. We write a tmp raw file because ffmpeg's stdout-piping can
// fragment on large clips (~5ms overhead, acceptable).
async function webmToPcm16(audio: Buffer): Promise<ArrayBuffer> {
  const tmp = path.join(os.tmpdir(), `yappr-${crypto.randomUUID()}`)
  const inPath = `${tmp}.webm`
  const outPath = `${tmp}.raw`
  await fs.writeFile(inPath, audio)
  const { code, stderr } = await runProcess(ffmpegPath(), [
    '-y',
    '-i', inPath,
    '-ar', '16000',
    '-ac', '1',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    outPath,
  ])
  fs.unlink(inPath).catch(() => {})
  if (code !== 0) {
    fs.unlink(outPath).catch(() => {})
    throw new Error(`ffmpeg failed (${code}): ${stderr.slice(-300)}`)
  }
  const buf = await fs.readFile(outPath)
  fs.unlink(outPath).catch(() => {})
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

export function createLocalWhisperProvider(): TranscriptionProvider {
  return {
    name: 'Local',
    async transcribe(audio, options = {}) {
      if (!ffmpegAvailable()) throw new LocalBinaryMissingError('ffmpeg')
      // Sanity-check the user's PICKED tier is downloaded before we
      // even decode audio. Auto-switch might still elevate to a
      // different model, but if the user has picked something that
      // doesn't exist we want to fail fast.
      if (!localModelDownloaded(userPickedModelId())) throw new LocalModelMissingError()

      const ffmpegStart = Date.now()
      const pcm = await webmToPcm16(audio)
      const ffmpegMs = Date.now() - ffmpegStart
      const seconds = pcm.byteLength / 2 / 16000

      // NOW we know audio duration → make the smart tier decision.
      // Tier depends on focused app category AND audio length:
      //   code/IDE → always Accurate
      //   email + ≥8s → Accurate
      //   docs + ≥12s → Accurate
      //   anything + ≥20s → Accurate
      //   else → user's selected tier (typically Balanced)
      const selection = selectedModel(seconds)
      if (!localModelDownloaded(selection.id)) {
        // Auto-switch wants a model that isn't downloaded — fall
        // back to the user's pick rather than hard-failing.
        logInfo('Auto-switch target missing, falling back', {
          wanted: selection.id,
          fallback: userPickedModelId(),
        })
        selection.id = userPickedModelId()
        selection.reason = 'user-pick'
      }
      const modelId = selection.id

      // Only log the model decision when auto-elevation actually fires —
      // the user-pick path is the boring default. The model + reason
      // also appear in the `Local whisper inference` line below.
      if (selection.reason !== 'user-pick' && selection.reason !== 'default') {
        const tierLabel =
          selection.id === 'large-v3-turbo' ? 'ACCURATE (large-v3-turbo)' :
          selection.id === 'small' ? 'BALANCED (small)' :
          'FAST (base)'
        const reasonLabel =
          selection.reason === 'auto-code' ? `focused app ${selection.focusedBundleId} is a code editor`
          : selection.reason === 'auto-email-long' ? `long email (${seconds.toFixed(1)}s ≥ ${AUTO_THRESHOLDS.emailSeconds}s)`
          : selection.reason === 'auto-docs-long' ? `long doc dictation (${seconds.toFixed(1)}s ≥ ${AUTO_THRESHOLDS.docsSeconds}s)`
          : `long dictation (${seconds.toFixed(1)}s ≥ ${AUTO_THRESHOLDS.longSeconds}s)`
        logInfo(`Auto-elevated → ${tierLabel}`, { reason: reasonLabel })
      }

      // Inference runs in the whisper utility process — see
      // src/main/whisper-host.ts and src/main/whisper-worker.ts.
      // Doing it there instead of in main avoids Chromium's macOS QoS
      // class downgrade (especially under LSUIElement) which would
      // otherwise halve the Metal command-queue throughput. Decode
      // params + bias prompt come from the shared transcribeCore so the
      // one-shot and streaming paths never drift.
      const inferStart = Date.now()
      const result = await workerTranscribe(
        localModelPath(modelId),
        pcm,
        buildDecodeOptions({ dictionary: options.dictionary ?? [], language: options.language }),
        // Forward fugood's per-segment callback so the indicator can show
        // words as whisper produces them (time-to-first-segment ~200ms).
        options.onPartial,
      )
      const inferMs = Date.now() - inferStart

      logInfo('Local whisper inference', {
        model: modelId,
        reason: selection.reason,
        ffmpegMs,
        inferMs,
        workerMs: result.ms,
        seconds: Number(seconds.toFixed(2)),
      })

      const text = result.text.trim()
      if (isLikelyHallucination(text)) {
        logInfo('Local whisper hallucination rejected', { preview: text.slice(0, 60) })
        throw new NoSpeechError()
      }
      return text
    },
  }
}

// Surfaced to the renderer via IPC. Two prerequisites: the ffmpeg
// binary and the selected model file. The worker handles the NAPI
// addon load lazily — if that ever fails, the next transcribe call
// surfaces the worker error.
export interface LocalReadiness {
  ready: boolean
  whisperCli: boolean   // kept for IPC compat — always true now
  ffmpeg: boolean
  modelDownloaded: boolean
}

export function localWhisperReadiness(): LocalReadiness {
  const ffmpeg = ffmpegAvailable()
  // Readiness reflects the user's PICKED tier (the model they set in
  // Settings). Auto-switch elevations are best-effort — if Accurate
  // isn't downloaded, we fall back to the picked tier — so readiness
  // doesn't need to gate on auto-switch targets.
  const modelDownloaded = localModelDownloaded(userPickedModelId())
  return {
    whisperCli: true,
    ffmpeg,
    modelDownloaded,
    ready: ffmpeg && modelDownloaded,
  }
}

export function localWhisperReady(): boolean {
  return localWhisperReadiness().ready
}

// No-op cleanup provider for fully-local mode. Returns the transcript
// unchanged — the regex passes in pipeline.ts (Light cleanup +
// QUICK_FIXES brand-name fixes) already handle filler/stutter and
// the most common Whisper mistranscriptions deterministically.
//
// What's lost without LLM cleanup:
//   - Strict (L3) prose restructuring
//   - List/bullet formatting from natural speech
//   - Self-correction handling ("actually" / "scratch that")
//   - Emoji injection (the EMOJI_BLOCK prompt is LLM-only)
//
// Users who want those polish features can still configure a Groq
// key — pipeline.ts' buildProviders picks the Groq cleanup whenever
// a key is present, regardless of transcription provider.
export function createLocalCleanupProvider(): CleanupProvider {
  return {
    name: 'Local',
    async cleanup(text) {
      // Return whatever Whisper produced as-is. The pipeline's regex
      // passes have already trimmed fillers and fixed brand names.
      return text
    },
  }
}
