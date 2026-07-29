import { describe, it, expect } from 'vitest'
import {
  shouldCut,
  buildChunkPrompt,
  StreamingSession,
  CUT_POLICY,
  type PendingChunk,
} from './streaming-session'

const pcm = () => new ArrayBuffer(8)

describe('shouldCut — chunk boundaries', () => {
  it('never cuts below the minimum chunk length', () => {
    // A tiny chunk still costs a full 30s encoder pass, so an early cut
    // is pure waste — this is why 2s chunking was the wrong design.
    expect(shouldCut(2, 5)).toBe(false)
    expect(shouldCut(CUT_POLICY.minChunkSec - 0.1, 10)).toBe(false)
  })

  it('does not cut mid-window just because there is silence', () => {
    expect(shouldCut(10, 1.0)).toBe(false)
  })

  it('cuts in silence once near the window edge', () => {
    expect(shouldCut(CUT_POLICY.preferCutAfterSec, CUT_POLICY.silenceRunSec)).toBe(true)
  })

  it('does not cut near the edge while the user is still speaking', () => {
    expect(shouldCut(CUT_POLICY.preferCutAfterSec, 0)).toBe(false)
  })

  it('cuts at the window boundary regardless of speech', () => {
    // Past 30s the next call pays for a second window anyway, so there
    // is nothing left to protect by waiting for silence.
    expect(shouldCut(CUT_POLICY.windowSec, 0)).toBe(true)
    expect(shouldCut(CUT_POLICY.windowSec + 5, 0)).toBe(true)
  })
})

describe('buildChunkPrompt — cross-chunk context', () => {
  it('returns undefined when there is nothing to carry', () => {
    expect(buildChunkPrompt('', [])).toBeUndefined()
  })

  it('carries the dictionary alone on the first chunk', () => {
    expect(buildChunkPrompt('', ['Yappr', 'tRPC'])).toBe('Yappr, tRPC')
  })

  it('appends the tail of the previous chunk', () => {
    const out = buildChunkPrompt('and then we deploy it', ['Yappr'])
    expect(out).toContain('Yappr')
    expect(out).toContain('and then we deploy it')
  })

  it('truncates a long previous transcript to the tail', () => {
    const long = 'x'.repeat(5000) + ' ENDING'
    const out = buildChunkPrompt(long, [])!
    expect(out.length).toBeLessThan(300)
    expect(out).toContain('ENDING')
  })
})

describe('StreamingSession — assembly', () => {
  it('returns empty for a session with no chunks', async () => {
    const s = new StreamingSession({ transcribe: async () => 'unused' })
    expect(await s.finalize()).toBe('')
  })

  it('joins chunks in sequence order, not completion order', async () => {
    // Chunk 0 resolves LAST. Assembly must still put it first.
    const delays = [30, 0, 0]
    const texts = ['first', 'second', 'third']
    const s = new StreamingSession({
      transcribe: (c: PendingChunk) =>
        new Promise(r => setTimeout(() => r(texts[c.seq]), delays[c.seq])),
    })
    s.push(pcm(), 30)
    s.push(pcm(), 30)
    s.push(pcm(), 10)
    expect(await s.finalize()).toBe('first second third')
  })

  it('drops a failed chunk but still returns the rest', async () => {
    const seen: number[] = []
    const s = new StreamingSession({
      transcribe: async (c) => {
        if (c.seq === 1) throw new Error('worker died')
        return `chunk${c.seq}`
      },
      onChunkError: (seq) => seen.push(seq),
    })
    s.push(pcm(), 30)
    s.push(pcm(), 30)
    s.push(pcm(), 5)
    expect(await s.finalize()).toBe('chunk0 chunk2')
    expect(seen).toEqual([1])
    expect(s.hadFailure).toBe(true)
  })

  it('reports a clean session as not failed', async () => {
    const s = new StreamingSession({ transcribe: async () => 'ok' })
    s.push(pcm(), 30)
    await s.finalize()
    expect(s.hadFailure).toBe(false)
  })

  it('collapses whitespace between chunks', async () => {
    const s = new StreamingSession({
      transcribe: async (c) => (c.seq === 0 ? '  hello  ' : '  world  '),
    })
    s.push(pcm(), 30)
    s.push(pcm(), 5)
    expect(await s.finalize()).toBe('hello world')
  })

  it('counts the chunks it dispatched', () => {
    const s = new StreamingSession({ transcribe: async () => '' })
    s.push(pcm(), 30)
    s.push(pcm(), 30)
    expect(s.chunkCount).toBe(2)
  })
})
