// Reading AppleScript results without swallowing its nil.
//
// `value of attribute "AXSelectedText"` does not error when there is no
// selection — it returns AppleScript's nil, and osascript prints that as
// the literal string "missing value". So an `on error` branch never
// fires, `stdout.trim()` is 13 non-empty characters, and every
// `if (result.length > 0)` guard downstream passes.
//
// This shipped. A user pressed the rewrite gesture with nothing
// selected, Yappr took "missing value" as their selection, sent it to
// the model and pasted the result. Four dictations in one history file
// have `cleaned: "missing value"`.
//
// The AppleScript in selection.ts and paste.ts now coerces nil to ""
// itself, which is the real fix. This exists because that fix is one
// line inside a template literal in two files, an easy thing to drop in
// a rewrite, and because any FUTURE osascript call has the same trap
// waiting. Reading a result through here costs nothing and closes it.

/** AppleScript's nil, as osascript prints it to stdout. */
export const APPLESCRIPT_NIL = 'missing value'

/**
 * Trim an osascript result, treating AppleScript's nil as empty.
 *
 * Case-sensitive on purpose: "missing value" is a fixed token osascript
 * emits, not user text. A user whose actual selection is the words
 * "Missing Value" — a spreadsheet header, a form label — keeps it.
 */
export function axText(stdout: string | null | undefined): string {
  const text = (stdout ?? '').trim()
  return text === APPLESCRIPT_NIL ? '' : text
}
