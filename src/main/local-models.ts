import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { DEFAULT_LOCAL_MODEL_ID } from '../shared/constants'

// On-disk model storage. We use Electron's user-data dir so models
// survive app updates and don't bloat the .app bundle.
export function modelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

// The only local transcription model.
//
// Yappr shipped four whisper tiers (base / small / large-v3-turbo) plus
// Parakeet. The whisper tiers are gone: Parakeet is faster than every one
// of them at matching English quality, and having a single model removes
// the entire auto-elevation machinery — the length thresholds, the tier
// swapping, and the model-reload cost that came with it.
//
// What was given up: whisper covers ~100 languages, Parakeet covers
// English plus 24 European ones. Anything outside that set is no longer
// supported on-device; the Groq cloud provider still uses whisper.
export type LocalModelId = 'parakeet-tdt-0.6b-v3'

// Single tier, so this is really just "the model". Kept as a named
// export because callers read it as a fallback when settings are
// unreadable.
export const DEFAULT_LOCAL_MODEL: LocalModelId = DEFAULT_LOCAL_MODEL_ID

interface LocalModelInfo {
  id: LocalModelId
  filename: string
  url: string
  bytes: number          // approximate, used for download progress %
  sizeLabel: string      // shown in Settings, e.g. "181 MB"
  speedLabel: string     // shown in Settings, e.g. "~120ms"
  description: string    // one-line UX copy
}

export const LOCAL_MODELS: Record<LocalModelId, LocalModelInfo> = {
  'parakeet-tdt-0.6b-v3': {
    id: 'parakeet-tdt-0.6b-v3',
    filename: 'ggml-parakeet-tdt-0.6b-v3-q4_0.bin',
    url: 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q4_0.bin',
    bytes: 355_615_679,
    sizeLabel: '339 MB',
    speedLabel: '~25 ms',
    description: 'NVIDIA Parakeet. Near-instant. English + 24 European languages.',
  },
}

export function localModelInfo(id: LocalModelId): LocalModelInfo {
  return LOCAL_MODELS[id]
}

export function localModelPath(id: LocalModelId): string {
  return path.join(modelsDir(), LOCAL_MODELS[id].filename)
}

export function localModelDownloaded(id: LocalModelId): boolean {
  try {
    const stat = fs.statSync(localModelPath(id))
    const expected = LOCAL_MODELS[id].bytes
    // Allow ±10% slack — quantization updates can shift the exact
    // byte count slightly. Reject anything under 80% of expected (a
    // partial / truncated download).
    return stat.size > expected * 0.8
  } catch {
    return false
  }
}

// Legacy helpers — kept for compat with any callers that haven't been
// updated to the id-aware versions. Default to the active "selected"
// model; the caller can pass an explicit id if they need a specific
// one.
export const DEFAULT_WHISPER_MODEL = LOCAL_MODELS[DEFAULT_LOCAL_MODEL].filename
export const DEFAULT_WHISPER_MODEL_URL = LOCAL_MODELS[DEFAULT_LOCAL_MODEL].url
export const DEFAULT_WHISPER_MODEL_BYTES = LOCAL_MODELS[DEFAULT_LOCAL_MODEL].bytes

export function whisperModelPath(id: LocalModelId = DEFAULT_LOCAL_MODEL): string {
  return localModelPath(id)
}

export function whisperModelDownloaded(id: LocalModelId = DEFAULT_LOCAL_MODEL): boolean {
  return localModelDownloaded(id)
}
