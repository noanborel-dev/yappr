import type { AppCategory } from '../../shared/types'

export interface TranscriptionProvider {
  name: string
  transcribe(
    audio: Buffer,
    options?: {
      language?: string
      dictionary?: string[]
      // Optional streaming callback fired with the partial transcript
      // as the provider decodes segments. Cloud providers may emit
      // this once at the end (no real streaming) or not at all;
      // callers must treat it as best-effort. The pipeline uses it
      // to update the indicator pill with running text on long local
      // dictations so the user sees words appearing before the final
      // result is ready.
      onPartial?: (text: string) => void
    }
  ): Promise<string>
}

// What the cleanup call is being asked to do. The two modes have
// genuinely different contracts and conflating them broke command mode:
//
//   'cleanup' (default) — `text` IS the user's content (a dictation
//     transcript). Output should be about the same length, and a much
//     longer output means the model answered instead of cleaning.
//   'rewrite' — `text` is a selection PLUS an editing command, and the
//     output is a transformation of the selection. It legitimately runs
//     far longer than the input ("turn this into an email"), so the
//     token budget and the anti-loopback guard both have to change.
export type CleanupMode = 'cleanup' | 'rewrite'

export interface CleanupProvider {
  name: string
  cleanup(
    text: string,
    context: {
      appName: string
      appCategory: AppCategory
      // The prompt asks the model to WRITE something from a brief rather
      // than clean what was dictated, so the reply is several times the
      // input length and needs a matching token budget.
      expandsOutput?: boolean
      systemPrompt: string
      mode?: CleanupMode
      // What to return when the model's output has to be discarded.
      // Defaults to `text`, which is right for cleanup mode but wrong
      // for a rewrite — there the safe fallback is the user's own
      // selection, never the command they dictated.
      fallbackText?: string
    }
  ): Promise<string>
}
