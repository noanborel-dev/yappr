import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { findOrphanedModels, isModelFile, type OrphanFile } from './orphaned-models'

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
export type LocalModelId = 'parakeet-tdt-0.6b-v3'

// The model. Not "the default" — the only one the product runs.
//
// Parakeet is ~25ms warm against large-v3-turbo's ~900ms, at matching
// English quality, and covers 24 European languages. The other three
// entries in LOCAL_MODELS stay defined because installs from before this
// change may still have their files on disk and we need to be able to
// name and delete them; nothing selects them any more.
export const DEFAULT_LOCAL_MODEL: LocalModelId = 'parakeet-tdt-0.6b-v3'

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

// --- orphaned weights ------------------------------------------------

// Scan the models directory for weights no current model claims.
export function listOrphanedModels(): OrphanFile[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(modelsDir())
  } catch {
    return []   // directory may not exist yet on a fresh install
  }
  const onDisk: OrphanFile[] = []
  for (const filename of entries) {
    if (!isModelFile(filename)) continue
    try {
      onDisk.push({ filename, bytes: fs.statSync(path.join(modelsDir(), filename)).size })
    } catch { /* vanished between readdir and stat */ }
  }
  return findOrphanedModels(onDisk, claimedModelFilenames())
}

// Delete them. Returns how many bytes came back.
export function removeOrphanedModels(): { removed: number; bytes: number } {
  const orphans = listOrphanedModels()
  let removed = 0
  let bytes = 0
  for (const o of orphans) {
    try {
      fs.unlinkSync(path.join(modelsDir(), o.filename))
      removed += 1
      bytes += o.bytes
    } catch { /* leave it; reporting a smaller number is the safe error */ }
  }
  return { removed, bytes }
}

// Filenames the app currently claims. Anything else matching the model
// pattern in the models directory is an orphan — see orphaned-models.ts.
// Retiring a tier therefore makes its weights reclaimable automatically,
// which is why the retired Whisper ids no longer need to exist just so
// uninstall can name them.
export function claimedModelFilenames(): string[] {
  return Object.values(LOCAL_MODELS).map(m => m.filename)
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
