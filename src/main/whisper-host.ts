import { app } from 'electron'
import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { logInfo, logError } from './log'
import { ModelUnsupportedError } from './errors'
import { SerialQueue } from './serial-queue'
import type { TranscribeOptions } from '@fugood/whisper.node'

// Host-side wrapper around the whisper worker child process.
//
// We use Node's `child_process.fork()` instead of Electron's
// `utilityProcess.fork()` for one specific reason: utilityProcess
// inherits Chromium's macOS QoS policy (THREAD_QOS_UTILITY), which
// lands whisper threads on E-cores at reduced clock speed. The end
// result was deterministically 2x slower whisper inference inside
// Electron vs standalone Node. utilityProcess.fork() couldn't escape
// the throttle even with --disable-features=MacUtilityProcessQoSPolicy.
//
// child_process.fork() spawns a plain Node runtime — by setting
// ELECTRON_RUN_AS_NODE=1, Electron's own binary acts as `node` (it
// ships a Node runtime internally). The child gets default user QoS,
// no Chromium baggage, no GPU/sandbox arbitration.
//
// IPC is Node's built-in `child.send` / `process.send` with JSON
// serialization. PCM ArrayBuffers go over as base64-encoded strings
// because Node's IPC channel doesn't accept TypedArrays / ArrayBuffers
// directly. ~200KB of PCM base64-encodes to ~270KB and round-trips in
// well under 5ms — negligible against the ~500ms inference.

interface PendingRequest {
  resolve: (result: { text: string; segments: Array<{ text: string; t0: number; t1: number }>; ms: number }) => void
  reject: (err: Error) => void
  // Streaming partial-transcript callback. Each call carries the
  // cumulative transcript so far. Used by the indicator to show
  // words as they're produced rather than waiting for the final
  // result on long clips.
  onPartial?: (text: string) => void
}

let proc: ChildProcess | null = null
// When the host itself tears the worker down (app quitting), the child
// dies by signal and reports `code: null` — identical on the wire to a
// segfault or an OOM kill. Without this flag every clean shutdown was
// logged as `Whisper worker exited {code: null}` at ERROR level, which is
// why the log showed a pile of "crashes" that were mostly just quits.
let expectedExit = false
// Spawn time, so an exit can report how long the worker survived. A death
// seconds into a transcribe reads very differently from one after an hour
// of idling.
let procStartedAt = 0
let readyPromise: Promise<void> | null = null
let loadedModelPath: string | null = null
let loadingModelPath: string | null = null
let loadResolve: (() => void) | null = null
let loadReject: ((err: Error) => void) | null = null
const pending = new Map<number, PendingRequest>()
let nextRequestId = 1

// Serializes ALL worker transcribes so the single non-reentrant
// WhisperContext only ever has one transcribeData() in flight (M1).
// Streaming issues overlapping chunk transcribes; without this they
// would race on the shared context and crash.
const transcribeQueue = new SerialQueue()

function workerScriptPath(): string {
  // electron-vite emits the worker next to main's index.js.
  return path.join(__dirname, 'whisper-worker.js')
}

function ensureProc(): Promise<void> {
  if (readyPromise) return readyPromise
  readyPromise = new Promise<void>((resolve, reject) => {
    // ELECTRON_RUN_AS_NODE=1 turns the Electron binary into a Node
    // runtime for this child. No Chromium init, no QoS shaping,
    // no GPU process. process.execPath is Electron itself, which is
    // exactly what we want — same Node ABI as main, so the precompiled
    // @fugood/whisper.node binaries load correctly.
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    const child = fork(workerScriptPath(), [], {
      env,
      // stdio: inherit so the worker's whisper.cpp logs surface in
      // the dev terminal for debugging. The 'ipc' entry is required
      // for the message channel.
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      execPath: process.execPath,
    })
    proc = child
    procStartedAt = Date.now()
    expectedExit = false
    logInfo('Whisper worker spawned', { pid: child.pid })

    child.on('message', (msg: unknown) => {
      handleWorkerMessage(msg as Record<string, unknown>, resolve, reject)
    })

    child.on('exit', (code, signal) => {
      // `signal` is the field that actually identifies the cause and was
      // previously discarded: SIGTERM is us (or the dev-server restart),
      // SIGKILL is the OS reaping us (memory pressure), SIGSEGV/SIGABRT is
      // a genuine fault inside whisper.cpp. `inFlight` separates a death
      // that cost the user a dictation from one that cost nothing.
      const detail = {
        code,
        signal,
        pid: child.pid,
        uptimeMs: Date.now() - procStartedAt,
        inFlight: pending.size,
        model: loadedModelPath,
      }
      if (expectedExit) {
        logInfo('Whisper worker stopped', detail)
      } else {
        logError('Whisper worker exited unexpectedly', detail)
      }
      for (const [, req] of pending) {
        req.reject(new Error(`Whisper worker exited (code ${code})`))
      }
      pending.clear()
      proc = null
      readyPromise = null
      loadedModelPath = null
      loadingModelPath = null
      if (loadReject) {
        loadReject(new Error(`Whisper worker exited during load (code ${code})`))
        loadReject = null
        loadResolve = null
      }
    })

    child.on('error', (err) => {
      logError('Whisper worker spawn error', { error: String(err) })
      reject(err)
    })
  })
  return readyPromise
}

// Worker errors cross IPC as plain strings, so the type is rebuilt here.
// Capability failures must not be retried — see ModelUnsupportedError.
function reviveWorkerError(message: string): Error {
  if (/needs @fugood\/whisper\.node/.test(message)) {
    return new ModelUnsupportedError(message)
  }
  return new Error(message)
}

function handleWorkerMessage(
  msg: Record<string, unknown>,
  spawnResolve: () => void,
  _spawnReject: (err: Error) => void,
): void {
  const type = msg.type
  if (type === 'ready') {
    spawnResolve()
    return
  }
  if (type === 'loaded') {
    // `cached: true` means the worker already had this model resident
    // and the switch cost nothing — that's the 2-model cache working.
    logInfo('Whisper worker loaded model', { ms: msg.ms, cached: msg.cached === true, path: loadingModelPath })
    loadedModelPath = loadingModelPath
    loadingModelPath = null
    if (loadResolve) {
      loadResolve()
      loadResolve = null
      loadReject = null
    }
    return
  }
  if (type === 'partial') {
    const id = msg.id as number
    const req = pending.get(id)
    if (!req || !req.onPartial) return
    try {
      req.onPartial(msg.text as string)
    } catch (err) {
      logError('onPartial callback threw', { error: String(err) })
    }
    return
  }
  if (type === 'result') {
    const id = msg.id as number
    const req = pending.get(id)
    if (!req) return
    pending.delete(id)
    req.resolve({
      text: msg.text as string,
      segments: (msg.segments as Array<{ text: string; t0: number; t1: number }>),
      ms: msg.ms as number,
    })
    return
  }
  if (type === 'error') {
    const id = msg.id as number | null
    const message = msg.message as string
    if (id != null) {
      const req = pending.get(id)
      if (req) {
        pending.delete(id)
        req.reject(reviveWorkerError(message))
      }
      return
    }
    if (loadReject) {
      loadReject(reviveWorkerError(message))
      loadReject = null
      loadResolve = null
      loadingModelPath = null
    } else {
      logError('Whisper worker error (no caller)', { message })
    }
  }
}

async function loadModel(modelPath: string): Promise<void> {
  await ensureProc()
  if (loadedModelPath === modelPath) return
  if (loadingModelPath === modelPath && loadResolve) {
    return new Promise<void>((resolve, reject) => {
      const priorResolve = loadResolve!
      const priorReject = loadReject!
      loadResolve = () => { priorResolve(); resolve() }
      loadReject = (err: Error) => { priorReject(err); reject(err) }
    })
  }
  loadingModelPath = modelPath
  const loadPromise = new Promise<void>((resolve, reject) => {
    loadResolve = resolve
    loadReject = reject
  })
  proc!.send({ type: 'load', modelPath })
  await loadPromise
}

export async function workerTranscribe(
  modelPath: string,
  pcm: ArrayBuffer,
  options: TranscribeOptions,
  onPartial?: (text: string) => void,
): Promise<{ text: string; segments: Array<{ text: string; t0: number; t1: number }>; ms: number }> {
  // Serialize the entire load+send+await sequence. The queue guarantees
  // the worker never has two transcribeData() calls in flight at once
  // (M1). loadModel() is awaited INSIDE the task, so a model load can't
  // interleave with another task's transcribe either.
  return transcribeQueue.run(async () => {
    await loadModel(modelPath)
    const id = nextRequestId++
    const result = new Promise<{ text: string; segments: Array<{ text: string; t0: number; t1: number }>; ms: number }>((resolve, reject) => {
      pending.set(id, { resolve, reject, onPartial })
    })
    // Node IPC can't send ArrayBuffer directly. Buffer.from(pcm) wraps
    // it, then we encode as base64 in the message envelope. Worker
    // decodes back to ArrayBuffer. ~5ms encode + decode for 200KB of
    // PCM, vs ~1000ms inference — negligible.
    const pcmBase64 = Buffer.from(pcm).toString('base64')
    proc!.send({ type: 'transcribe', id, pcmBase64, options })
    return result
  })
}

export async function workerFree(): Promise<void> {
  if (!proc) return
  proc.send({ type: 'free' })
  loadedModelPath = null
}

// Spin up the worker process AND load the selected model on app
// launch — fire-and-forget. By the time the user presses the hotkey
// for the first time, the worker is alive and the WhisperContext is
// warm in GPU memory. Without this, the first dictation pays:
//   ~200ms worker fork (ELECTRON_RUN_AS_NODE bring-up)
//  +~150ms model file load
//  +~500ms first Metal pipeline compile + GPU buffer allocation
//  = ~1s cold-start penalty on top of the actual inference.
// With this, all of that happens during app launch where the user
// is already waiting, and the first dictation matches the warm-state
// timing of every subsequent one.
//
// If the model isn't downloaded yet (user just installed and hasn't
// fetched any model), loadModel() will surface an error that we
// silently swallow — the actual transcribe call will surface the
// LocalModelMissingError to the user at the right moment.
export function prewarmWhisper(modelPath: string): void {
  loadModel(modelPath).catch(() => { /* deferred to first transcribe */ })
}

app.on('will-quit', () => {
  if (proc) {
    // Mark BEFORE killing so the exit handler files this as a normal stop
    // rather than a crash.
    expectedExit = true
    try { proc.kill() } catch { /* ignore */ }
    proc = null
  }
})
