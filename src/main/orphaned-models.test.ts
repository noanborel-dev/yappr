import { describe, it, expect } from 'vitest'
import {
  findOrphanedModels,
  totalBytes,
  formatBytes,
  isModelFile,
  type OrphanFile,
} from './orphaned-models'

// The real listing from the machine this was written for: three retired
// Whisper tiers left behind by the move to Parakeet, 785MB of them.
const REAL_DISK: OrphanFile[] = [
  { filename: 'ggml-base-q5_1.bin', bytes: 57_000_000 },
  { filename: 'ggml-large-v3-turbo-q5_0.bin', bytes: 547_000_000 },
  { filename: 'ggml-parakeet-tdt-0.6b-v3-q4_0.bin', bytes: 339_000_000 },
  { filename: 'ggml-small-q5_1.bin', bytes: 181_000_000 },
]
const CLAIMED = ['ggml-parakeet-tdt-0.6b-v3-q4_0.bin']

describe('findOrphanedModels', () => {
  it('finds the retired Whisper weights and leaves the live model alone', () => {
    const orphans = findOrphanedModels(REAL_DISK, CLAIMED)
    expect(orphans.map(o => o.filename).sort()).toEqual([
      'ggml-base-q5_1.bin',
      'ggml-large-v3-turbo-q5_0.bin',
      'ggml-small-q5_1.bin',
    ])
  })

  it('reports the real reclaimable size', () => {
    expect(totalBytes(findOrphanedModels(REAL_DISK, CLAIMED))).toBe(785_000_000)
  })

  it('finds nothing when every file is claimed', () => {
    const all = REAL_DISK.map(f => f.filename)
    expect(findOrphanedModels(REAL_DISK, all)).toEqual([])
  })

  // The models directory is ours, but a loose match would make this
  // function capable of deleting things we did not put there.
  it('ignores files that are not model weights', () => {
    const disk: OrphanFile[] = [
      { filename: 'notes.txt', bytes: 10 },
      { filename: '.DS_Store', bytes: 6 },
      { filename: 'ggml-base-q5_1.bin.download', bytes: 100 },
      { filename: 'ggml-old.bin', bytes: 20 },
    ]
    expect(findOrphanedModels(disk, []).map(o => o.filename)).toEqual(['ggml-old.bin'])
  })

  it('treats an empty directory as nothing to reclaim', () => {
    expect(findOrphanedModels([], CLAIMED)).toEqual([])
    expect(totalBytes([])).toBe(0)
  })
})

describe('isModelFile', () => {
  it('accepts ggml weights only', () => {
    expect(isModelFile('ggml-small-q5_1.bin')).toBe(true)
    expect(isModelFile('model.bin')).toBe(false)
    expect(isModelFile('ggml-small-q5_1.bin.tmp')).toBe(false)
  })
})

describe('formatBytes', () => {
  it('reads as MB below a gigabyte', () => {
    expect(formatBytes(785_000_000)).toBe('785 MB')
    expect(formatBytes(57_000_000)).toBe('57 MB')
  })

  it('switches to GB above one', () => {
    expect(formatBytes(1_200_000_000)).toBe('1.2 GB')
  })

  it('says 0 MB rather than something alarming for nothing', () => {
    expect(formatBytes(0)).toBe('0 MB')
    expect(formatBytes(-5)).toBe('0 MB')
  })
})
