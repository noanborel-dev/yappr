// Is this really an instruction to rewrite a selection, or did a stray
// selection just eat a dictation?
//
// THE INCIDENT THIS EXISTS FOR (2026-08-28). A clipboard probe found 16
// characters of selected text — "My name is Noen." — when the hotkey went
// down. The user then held the key and spoke for 121.68 seconds. Because a
// selection was live, the pipeline treated two minutes of speech as an
// instruction to edit those sixteen characters. The model did as it was
// told and produced one short line. The instruction itself was stored as a
// placeholder, no audio was retained, and the words were gone.
//
// Rewrite mode is entered on ONE signal: was anything selected. That signal
// is right about the common case and has no idea how much you then said.
//
// The tell is proportion. A real rewrite instruction is small next to the
// thing it edits — "make this shorter", "turn this into an email" — because
// the text is already written and you are describing a change to it. Speech
// that dwarfs its own selection is not describing a change; it is the
// content, and something else is selected by accident.
//
// Pure and tested on its own: it decides whether a user keeps or loses what
// they just said, which is not a judgement to bury in the pipeline.

export interface RewriteGuardInput {
  /** Characters of speech that came back from transcription. */
  transcriptChars: number
  /** Characters of text that were selected when the key went down. */
  selectionChars: number
}

/**
 * Below this, the guard never fires.
 *
 * Rewrite instructions really can be longer than what they edit — "make
 * this a lot friendlier and mention I'll be there Tuesday" is 55 characters
 * aimed at a 20-character line, and it is exactly what the feature is for.
 * The absolute floor is what separates that from a dictation: 400 characters
 * is roughly eighty words, or half a minute of talking. Nobody spends half a
 * minute describing an edit to a sentence.
 */
export const GUARD_MIN_TRANSCRIPT_CHARS = 400

/**
 * And above the floor, it fires once speech is this many times longer than
 * the selection.
 *
 * 4 is deliberately generous. A long restructuring request aimed at a real
 * paragraph — 500 characters of speech against an 800-character draft — is
 * nowhere near it. The incident was at 94x.
 */
export const GUARD_LENGTH_RATIO = 4

/**
 * True when this should be treated as a dictation despite a selection
 * being present.
 *
 * Deliberately conservative in both directions. A false positive pastes new
 * text instead of editing — recoverable, the selection is untouched and
 * still on screen. A false negative destroys what the user said, which is
 * what happened. The thresholds are set so that ordinary rewrites, however
 * wordy, stay well clear.
 */
export function selectionLikelyStale({
  transcriptChars,
  selectionChars,
}: RewriteGuardInput): boolean {
  if (transcriptChars < GUARD_MIN_TRANSCRIPT_CHARS) return false
  // An empty selection is not this module's problem — the caller never
  // enters rewrite mode without one — but guard it rather than dividing
  // intent by zero.
  if (selectionChars <= 0) return true
  return transcriptChars > selectionChars * GUARD_LENGTH_RATIO
}
