import type { TranscribeOptions } from '@fugood/whisper.node'

// Whisper-cpp hallucinates these strings on silent / near-silent audio.
// TWO distinct sets (spec §4.4):
//
//  - WHOLE_UTTERANCE_HALLUCINATIONS: PERMISSIVE — used to bail on a full
//    assembled transcript (the one-shot / pipeline silence bail).
//    Includes real words like "you" / "thanks" that, as an ENTIRE
//    utterance, are almost always silence artifacts.
//
//  - CHUNK_ARTIFACTS: STRICT — used per-chunk during streaming. ONLY true
//    Whisper artifact tokens, NEVER real words: dropping a chunk that
//    legitimately said "thanks" mid-stream would delete real speech. A
//    pure-artifact chunk is dropped-and-continue, never aborts the session.
export const WHOLE_UTTERANCE_HALLUCINATIONS = new Set<string>([
  '', '.', '...',
  'thanks for watching', 'thanks for watching!',
  'thank you', 'thank you.',
  'thanks', 'you', 'bye', 'bye.',
  '[blank_audio]', '[silence]', '[music]', '[no audio]',
  '(silence)', '(soft music)',
])

export const CHUNK_ARTIFACTS = new Set<string>([
  '', '.', '...',
  '[blank_audio]', '[silence]', '[music]', '[no audio]',
  '(silence)', '(soft music)',
])

function normalizeForArtifactCheck(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?,]+$/g, '')
}

// Whole-utterance check: is this assembled transcript just a silence
// artifact? Permissive (real-word artifacts included); also rejects
// sub-2-char output.
export function isLikelyHallucination(text: string): boolean {
  const cleaned = normalizeForArtifactCheck(text)
  if (cleaned.length === 0) return true
  if (WHOLE_UTTERANCE_HALLUCINATIONS.has(cleaned)) return true
  if (cleaned.length < 2) return true
  return false
}

// Per-chunk check: is this chunk PURE artifact (drop it, keep streaming)?
// STRICT — only true artifacts, never real words, and NO length rejection
// (a legit 1-char chunk like "A" can be real mid-stream).
export function isChunkArtifact(text: string): boolean {
  const cleaned = normalizeForArtifactCheck(text)
  if (cleaned.length === 0) return true
  return CHUNK_ARTIFACTS.has(cleaned)
}

// Which engine backs a given model file.
//
// Parakeet is a different architecture, not a whisper checkpoint: it has
// no fixed 30-second encoder window, so inference scales with audio
// length instead of being flat. Measured on an M5 Pro:
//
//   clip        base   small   large-v3-turbo   parakeet
//   1.27s       55ms   170ms          825ms       24ms
//   4.43s       77ms   219ms          849ms       48ms
//   7.11s       86ms   245ms          870ms       64ms
//
// It also takes a much narrower option set — no language, no initial
// prompt, no beam/temperature. The dictionary bias prompt therefore does
// NOT apply on this engine; applyDictionaryReplacements (a deterministic
// post-pass) still does, so user dictionary terms are still corrected,
// just not biased for during decoding.
export type TranscribeEngine = 'whisper' | 'parakeet'

export function engineForModel(modelIdOrPath: string): TranscribeEngine {
  return /parakeet/i.test(modelIdOrPath) ? 'parakeet' : 'whisper'
}

export interface DecodeParams {
  // Whisper bias dictionary → initial prompt (biases toward known spellings).
  dictionary?: string[]
  // Forced language code, or undefined to auto-detect. Defaults to 'auto'.
  language?: string
}

// The canonical decode options shared by EVERY local transcribe — the
// one-shot provider, command mode, and (soon) streaming chunks — so
// decode params and the bias prompt never drift between paths. Drift is
// the concrete code-switch divergence hazard the spec calls out.
export function buildDecodeOptions(params: DecodeParams = {}): TranscribeOptions {
  const dict = params.dictionary ?? []
  const prompt = dict.length > 0 ? dict.join(', ') : undefined
  return {
    // Greedy decoding (beam=1, best_of=1, temp=0): faster AND
    // deterministic. Dictation values "same audio -> same transcript".
    beamSize: 1,
    bestOf: 1,
    temperature: 0,
    // M-series has ~6 perf cores; >4 threads spills onto E-cores
    // (3-4x slower per thread).
    maxThreads: 4,
    // All local models are multilingual; 'auto' lets users code-switch
    // without rebinding the setting.
    language: params.language ?? 'auto',
    ...(prompt ? { prompt } : {}),
  }
}

// Parakeet's option set is deliberately tiny — the binding accepts only
// maxThreads and audioCtx. Passing whisper's options here is not merely
// ignored, it is a type error, which is why engine selection has to
// happen before options are built rather than inside the worker.
export interface ParakeetDecodeOptions {
  maxThreads: number
}

export function buildParakeetOptions(): ParakeetDecodeOptions {
  // Same 4-thread reasoning as whisper: >4 spills onto E-cores.
  // audioCtx is left at the model default; parakeet already scales with
  // audio length, so there is no fixed window to trim.
  return { maxThreads: 4 }
}
