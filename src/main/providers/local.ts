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
import { buildDecodeOptions, buildParakeetOptions, engineForModel, isLikelyHallucination } from '../transcribe-core'

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

// With one model there is nothing to select and nothing to elevate to.
// This used to weigh focused-app category against audio length to decide
// whether to pay whisper's ~870ms Accurate tier; Parakeet is ~25ms at any
// length, so the trade no longer exists.
type ModelSelectionReason = 'user-pick' | 'default'

function selectedModel(_audioSeconds: number): { id: LocalModelId; reason: ModelSelectionReason; focusedBundleId?: string } {
  try {
    return { id: getSettings().provider.localModel ?? DEFAULT_LOCAL_MODEL, reason: 'user-pick' }
  } catch {
    return { id: DEFAULT_LOCAL_MODEL, reason: 'default' }
  }
}

// Which model to load at startup. With a single tier this can no longer
// guess wrong.
export function prewarmModelId(): LocalModelId {
  try {
    return getSettings().provider.localModel ?? DEFAULT_LOCAL_MODEL
  } catch {
    return DEFAULT_LOCAL_MODEL
  }
}

// Used by the readiness check and uninstall gating.
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
      // Fail fast if the model isn't on disk, before decoding audio.
      if (!localModelDownloaded(userPickedModelId())) throw new LocalModelMissingError()

      const ffmpegStart = Date.now()
      const pcm = await webmToPcm16(audio)
      const ffmpegMs = Date.now() - ffmpegStart
      const seconds = pcm.byteLength / 2 / 16000

      const selection = selectedModel(seconds)
      const modelId = selection.id

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
        // Parakeet takes a different (much smaller) option set and has no
        // initial-prompt support, so the dictionary bias does not apply
        // there — applyDictionaryReplacements still corrects those terms
        // deterministically downstream.
        engineForModel(modelId) === 'parakeet'
          ? buildParakeetOptions()
          : buildDecodeOptions({ dictionary: options.dictionary ?? [], language: options.language }),
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
