import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// On-disk model storage. We use Electron's user-data dir so models
// survive app updates and don't bloat the .app bundle.
export function modelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

// Available local Whisper model tiers.
//
// We use the multilingual variants (not .en) for base and small
// because:
//   - The multilingual `small` is ~60ms slower than `small.en`
//     (~200ms vs ~140ms warm on M5 Pro) but produces noticeably
//     better English BRAND-NAME capitalization ("TypeScript" vs
//     "type script", "TRPC" vs "trpc", "Anthropic" vs "anthropic").
//     The .en variants were trained without the multilingual
//     vocabulary that exposes the model to mixed-case tokens at
//     scale.
//   - Users who occasionally speak Spanish / French / German get
//     reasonable transcription instead of phonetic garbage.
//   - The latency cost (~60ms) is invisible at this scale.
//
// Tiers map roughly to (speed × accuracy):
//   base   ~80ms   small but rough on names
//   small  ~200ms  near-perfect English + multilingual capable
//   large  ~970ms  best accuracy on multilingual + technical terms
export type LocalModelId = 'base' | 'small' | 'large-v3-turbo' | 'parakeet-tdt-0.6b-v3'

// Balanced (small, multilingual) is the default. It hits ~200ms
// warm on M5 Pro for typical clips, transcribes English brand names
// with proper capitalization (TypeScript, TRPC, Anthropic), AND
// handles Spanish / French / German for users who occasionally speak
// non-English. Users who want maximum accuracy on heavy multilingual
// or technical content can opt into Accurate (large-v3-turbo) in
// Settings — it's there, just ~5x slower.
export const DEFAULT_LOCAL_MODEL: LocalModelId = 'small'

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
  'base': {
    id: 'base',
    filename: 'ggml-base-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    bytes: 60_000_000,
    sizeLabel: '57 MB',
    speedLabel: '~100 ms',
    description: 'Tiny + ultra-fast. Multilingual. Some mistakes on technical terms.',
  },
  'small': {
    id: 'small',
    filename: 'ggml-small-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    bytes: 190_085_487,
    sizeLabel: '181 MB',
    speedLabel: '~200 ms',
    description: 'Sub-300ms warm. Multilingual. Near-perfect for English dictation.',
  },
  'large-v3-turbo': {
    id: 'large-v3-turbo',
    filename: 'ggml-large-v3-turbo-q5_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    bytes: 574_041_856,
    sizeLabel: '547 MB',
    speedLabel: '~1000 ms',
    description: 'Highest accuracy on non-English and technical terms. Slower.',
  },
  'parakeet-tdt-0.6b-v3': {
    id: 'parakeet-tdt-0.6b-v3',
    filename: 'ggml-parakeet-tdt-0.6b-v3-q4_0.bin',
    url: 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q4_0.bin',
    bytes: 355_615_679,
    sizeLabel: '339 MB',
    speedLabel: '~25 ms',
    description: 'NVIDIA Parakeet. 30x faster than Accurate at similar English quality. English + 24 European languages.',
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
