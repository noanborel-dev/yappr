// Whisper transcription worker process.
//
// Why this exists: when whisper.cpp runs in Electron's main process
// OR utility process, it inherits Chromium's macOS QoS class downgrade
// (especially under LSUIElement). Metal command-buffer scheduling
// defers GPU work submitted from background-QoS threads — ~2x slower.
//
// child_process.fork() with ELECTRON_RUN_AS_NODE=1 starts the Electron
// binary as plain Node (no Chromium init, no QoS shaping, no sandbox).
// The forked process runs at default user QoS like any other Node
// process, which is the only environment where we hit the standalone-
// Node speed envelope (~470ms warm for large-v3-turbo on M5 Pro).
//
// Wire protocol over Node IPC (child_process.send / process.send):
//
//   main → worker:
//     { type: 'load', modelPath: string }
//     { type: 'transcribe', id: number, pcmBase64: string, options: {...} }
//     { type: 'free' }
//
//   worker → main:
//     { type: 'ready' }
//     { type: 'loaded', ms: number, cached: boolean }
//         Sent exactly once per 'load', hit or miss — the host blocks
//         on it, so a cache hit must still reply.
//     { type: 'partial', id: number, text: string }    ← streaming
//     { type: 'result', id: number, text: string, segments: [...], ms: number }
//     { type: 'error', id: number | null, message: string }
//
// The 'partial' messages stream during transcription via fugood's
// onNewSegments callback. Each one carries only the NEWLY completed
// segment(s), NOT the cumulative transcript — a host that wants a
// running total must accumulate them itself. Hosts that don't want
// streaming just ignore them. This
// doesn't change total inference time — it just lets the indicator
// show words as they're transcribed instead of waiting for the
// complete result. Perceived latency drops dramatically on long
// clips: a 35s dictation that takes 1400ms total now shows the
// first words at ~200ms.
//
// Node IPC serializes payloads as JSON, so PCM travels as base64.
// Worker decodes back to Buffer → ArrayBuffer before calling fugood.

import { initWhisper, initParakeet, toggleNativeLog } from '@fugood/whisper.node'
import type { WhisperContext, ParakeetContext, TranscribeOptions } from '@fugood/whisper.node'
import { chooseEvictionVictim } from './model-cache-policy'
import { engineForModel } from './transcribe-core'

interface LoadMsg {
  type: 'load'
  modelPath: string
}
interface TranscribeMsg {
  type: 'transcribe'
  id: number
  pcmBase64: string
  options: TranscribeOptions
}
interface FreeMsg {
  type: 'free'
}
type IncomingMsg = LoadMsg | TranscribeMsg | FreeMsg

// Resident model cache.
//
// Previously the worker held exactly ONE context and released it
// whenever a different model was requested, so every tier switch paid a
// full re-init (~150-290ms warm, and a Metal shader recompile on top).
// That matters now that model tier varies per dictation by audio length
// — short clips stay on the user's tier, longer ones elevate to
// Accurate — which makes base↔large alternation the common case rather
// than a rarity.
//
// Two resident contexts covers that: the user's tier plus Accurate.
// Cost is RAM — roughly 60MB for base + 574MB for large-v3-turbo q5_0.
// A third distinct model evicts the least recently used, never the one
// currently transcribing and never the active one.
const MAX_RESIDENT_MODELS = 2

// Either engine's context. Both expose transcribeData()/release(); only
// the accepted options differ, which the host resolves before sending.
type AnyContext = WhisperContext | ParakeetContext

interface CacheEntry {
  ctx: AnyContext | null
  loading: Promise<AnyContext> | null
  lastUsed: number
}

const models = new Map<string, CacheEntry>()
// The model `transcribe` should use — set by the most recent `load`.
// The wire protocol has no model field on transcribe, so the host's
// load→transcribe ordering defines it, exactly as before.
let activeModelPath: string | null = null
// Guards against a prewarm `load` evicting the model mid-transcribe.
let inFlightModelPath: string | null = null

void toggleNativeLog(false).catch(() => { /* ignore */ })

function send(msg: Record<string, unknown>): void {
  if (process.send) {
    process.send(msg)
  }
}

// Only ever reached on a cache MISS — a hit returns before this, which
// is why steady-state base↔large alternation never releases anything.
async function evictIfNeeded(keepPath: string): Promise<void> {
  for (;;) {
    const victimPath = chooseEvictionVictim(
      [...models].map(([path, e]) => ({
        path,
        loading: e.loading !== null,
        lastUsed: e.lastUsed,
      })),
      {
        keepPath,
        activePath: activeModelPath,
        inFlightPath: inFlightModelPath,
        maxResident: MAX_RESIDENT_MODELS,
      },
    )
    if (!victimPath) return  // at or under budget, or nothing safe to drop
    const victim = models.get(victimPath)
    models.delete(victimPath)
    if (victim?.ctx) {
      try { await victim.ctx.release() } catch { /* best-effort */ }
    }
  }
}

// Returns [context, wasCached]. NEVER sends the 'loaded' message — the
// host blocks on exactly one 'loaded' per 'load' it sends, so that reply
// is the caller's responsibility (see handle()). Sending it from in here
// would skip the reply on a cache hit and hang the host forever.
async function load(modelPath: string): Promise<[AnyContext, boolean]> {
  activeModelPath = modelPath
  const existing = models.get(modelPath)
  if (existing) {
    existing.lastUsed = Date.now()
    if (existing.ctx) return [existing.ctx, true]
    if (existing.loading) return [await existing.loading, true]
  }

  await evictIfNeeded(modelPath)

  const entry: CacheEntry = { ctx: null, loading: null, lastUsed: Date.now() }
  // Parakeet is a separate context type in the binding, not a whisper
  // checkpoint — it needs initParakeet and rejects whisper's options.
  const init = engineForModel(modelPath) === 'parakeet'
    ? initParakeet({ filePath: modelPath, useGpu: true })
    : initWhisper({ filePath: modelPath, useGpu: true, useFlashAttn: true })
  entry.loading = init.then((c) => {
    entry.ctx = c
    entry.loading = null
    entry.lastUsed = Date.now()
    return c
  }).catch((err: unknown) => {
    // Drop the failed entry so a later attempt can retry cleanly.
    models.delete(modelPath)
    if (activeModelPath === modelPath) activeModelPath = null
    throw err
  })
  models.set(modelPath, entry)
  return [await entry.loading, false]
}

async function handle(msg: IncomingMsg): Promise<void> {
  if (msg.type === 'load') {
    const start = Date.now()
    try {
      const [, cached] = await load(msg.modelPath)
      // Exactly one 'loaded' per 'load', cache hit or miss — the host
      // blocks until it arrives.
      send({ type: 'loaded', ms: Date.now() - start, cached })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      send({ type: 'error', id: null, message })
    }
    return
  }
  if (msg.type === 'free') {
    // Release everything resident — 'free' is the host telling us it
    // wants the memory back, so honouring it partially would defeat it.
    const entries = [...models.values()]
    models.clear()
    activeModelPath = null
    for (const entry of entries) {
      if (entry.ctx) {
        try { await entry.ctx.release() } catch { /* ignore */ }
      }
    }
    return
  }
  if (msg.type === 'transcribe') {
    const { id, pcmBase64, options } = msg
    const modelPath = activeModelPath
    try {
      const entry = modelPath ? models.get(modelPath) : undefined
      // The context may still be loading if the host pipelined a
      // transcribe straight after its load; await rather than fail.
      const ctx = entry?.ctx ?? (entry?.loading ? await entry.loading : null)
      if (!ctx || !modelPath) {
        throw new Error('Worker received transcribe before load')
      }
      entry!.lastUsed = Date.now()
      inFlightModelPath = modelPath
      // Decode base64 → Buffer → ArrayBuffer slice. The slice() is
      // important because Node's Buffer wraps a shared pool — passing
      // buf.buffer directly would hand fugood a reference to MUCH
      // more memory than we intend.
      const buf = Buffer.from(pcmBase64, 'base64')
      const pcm = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      const start = Date.now()
      // onNewSegments fires every time whisper completes a segment.
      // We forward each as a 'partial' so the host can drive the
      // indicator UI with the running transcript. The final result
      // still comes through `result` so callers can rely on a single
      // canonical "done" signal.
      // The host has already built options for the right engine.
      // Parakeet takes no onNewSegments, so only attach it for whisper.
      const isParakeet = engineForModel(modelPath) === 'parakeet'
      const result = isParakeet
        ? await (ctx as ParakeetContext).transcribeData(
            pcm, options as unknown as { maxThreads?: number },
          ).promise
        : await (ctx as WhisperContext).transcribeData(pcm, {
            ...options,
            onNewSegments: (r) => {
              send({ type: 'partial', id, text: r.result })
            },
          }).promise
      send({
        type: 'result',
        id,
        text: result.result,
        segments: result.segments,
        ms: Date.now() - start,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      send({ type: 'error', id, message })
    } finally {
      if (inFlightModelPath === modelPath) inFlightModelPath = null
    }
  }
}

process.on('message', (msg: IncomingMsg) => {
  void handle(msg)
})

send({ type: 'ready' })
