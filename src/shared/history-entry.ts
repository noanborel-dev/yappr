// Reading a history entry: is it a dictation or a rewrite, and what did
// the user actually say?
//
// This exists because the answer used to be "we don't know". Select-and-
// rewrite entries stored the literal string '(rewrite)' in `transcript`
// and threw the spoken instruction away. On 2026-08-28 that lost a real
// user 121 seconds of speech: a stale 16-character selection sent a
// two-minute dictation down the rewrite path, the model dutifully
// "rewrote" the selection into one short line, and the instruction that
// produced it was never written anywhere. Only a 60-character preview in
// the log survived, and no audio was retained.
//
// Rewrite entries now keep the real transcript, with the selection they
// were applied to alongside it. Pure and separately tested because
// everything that reads history has to agree on these questions —
// the compactor, the dashboard, and the re-polish path all ask them.

import type { DictationResult } from './types'

/**
 * What rewrite entries put in `transcript` before the fix.
 *
 * Entries written before then are still in every existing install's
 * yappr-history.json and cannot be repaired — the words are gone. They
 * must still be RECOGNISED as rewrites, or the compactor would start
 * mining the literal word "rewrite" as if it were something the user
 * said.
 */
export const LEGACY_REWRITE_PLACEHOLDER = '(rewrite)'

/** Did this entry come from select-and-rewrite rather than a dictation? */
export function isRewriteEntry(entry: DictationResult): boolean {
  return entry.rewrite !== undefined || entry.transcript === LEGACY_REWRITE_PLACEHOLDER
}

/**
 * What the user actually said, or '' when the entry predates the fix and
 * only the placeholder survives.
 *
 * Callers must handle the empty case rather than showing the placeholder:
 * offering to copy the string '(rewrite)' is worse than offering nothing,
 * because it looks like the feature worked.
 */
export function spokenText(entry: DictationResult): string {
  if (entry.transcript === LEGACY_REWRITE_PLACEHOLDER) return ''
  return entry.transcript
}

/**
 * Can the AI pass be run again on this entry?
 *
 * Needs words to run on. A legacy rewrite has none, and an entry whose
 * cleanup was skipped still has its transcript, so it qualifies — re-running
 * a short utterance that took the fast path is a legitimate thing to want.
 */
export function canRepolish(entry: DictationResult): boolean {
  return spokenText(entry).trim().length > 0
}
