// Model files on disk that no current model claims.
//
// Yappr shipped four Whisper tiers before Parakeet replaced them. Their
// weights stay where they were — 785MB on the machine this was written
// for — and nothing reclaimed them: the tier list they were selectable
// from is gone, and while the uninstall IPC still existed, no UI could
// reach it. The retired ids were being kept alive purely so uninstall
// could still *name* those files.
//
// Keying on FILENAME instead removes that dependency. A file is an orphan
// when no entry in LOCAL_MODELS claims it, so retiring an id turns its
// weights into a reclaimable orphan automatically, and the LocalModelId
// union no longer has to carry ghosts to make deletion possible.
//
// Pure: the caller supplies the directory listing and the claimed names,
// so this is testable without touching a disk.

export interface OrphanFile {
  filename: string
  bytes: number
}

// Only ever consider model weights. The models directory is ours, but
// matching loosely would risk deleting something we did not put there.
const MODEL_FILE_RE = /^ggml-.*\.bin$/

export function isModelFile(filename: string): boolean {
  return MODEL_FILE_RE.test(filename)
}

export function findOrphanedModels(
  onDisk: readonly OrphanFile[],
  claimedFilenames: readonly string[],
): OrphanFile[] {
  const claimed = new Set(claimedFilenames)
  return onDisk.filter(f => isModelFile(f.filename) && !claimed.has(f.filename))
}

export function totalBytes(files: readonly OrphanFile[]): number {
  return files.reduce((sum, f) => sum + f.bytes, 0)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / 1_000_000
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}
