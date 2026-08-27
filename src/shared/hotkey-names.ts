// Hotkey names: one vocabulary, the global listener's.
//
// The Settings recorder used to read the key from a browser
// KeyboardEvent, while matching at dictation time reads it from
// node-global-key-listener. Those two name the same keys differently,
// and the mismatch is why two kinds of key could not be bound:
//
//   apostrophe   browser "'"   listener "QUOTE"        never matched
//   semicolon    browser ";"   listener "SEMICOLON"    never matched
//   comma, dot, slashes, brackets, backtick, minus, equals — all the same
//
// Function keys failed a rung earlier and for a different reason: macOS
// consumes F1-F12 as media keys unless the user holds Fn or has flipped
// "Use F1, F2, etc. as standard function keys". The renderer never
// receives a keydown at all, so there was nothing to translate. The
// listener sees them regardless, because it reads the event tap with
// Accessibility permission rather than the focused window.
//
// So the recorder now captures through the listener too. There is no
// translation table here on purpose — a table has to be kept in sync
// with a library's key set, and the failure mode is silent. Capturing
// from the source that does the matching cannot drift.
//
// The one thing that still needs canonicalising is modifiers, because
// the listener distinguishes sides and a user pressing "control" means
// either of them.

/** Modifier names the listener emits, mapped to the side-agnostic form. */
const MODIFIER_SIDES: Record<string, string> = {
  'LEFT CTRL': 'CTRL',
  'RIGHT CTRL': 'CTRL',
  'LEFT ALT': 'ALT',
  'RIGHT ALT': 'ALT',
  'LEFT SHIFT': 'SHIFT',
  'RIGHT SHIFT': 'SHIFT',
  'LEFT META': 'META',
  'RIGHT META': 'META',
}

/**
 * The form a captured key is stored in.
 *
 * Modifiers collapse to a side-agnostic name — a user who binds control
 * and then presses the right-hand one has not pressed a different key.
 * Everything else is stored exactly as the listener names it, so
 * matching is a string comparison with nothing in between.
 */
export function canonicalHotkeyName(listenerName: string | null | undefined): string | null {
  const name = (listenerName ?? '').trim().toUpperCase()
  if (!name) return null
  return MODIFIER_SIDES[name] ?? name
}

/** Listener names that are punctuation, and the glyph to show for each. */
const PUNCTUATION_GLYPHS: Record<string, string> = {
  QUOTE: "'",
  SEMICOLON: ';',
  COMMA: ',',
  DOT: '.',
  'FORWARD SLASH': '/',
  BACKSLASH: '\\',
  BACKTICK: '`',
  MINUS: '-',
  EQUALS: '=',
  'SQUARE BRACKET OPEN': '[',
  'SQUARE BRACKET CLOSE': ']',
  SECTION: '§',
}

const MODIFIER_GLYPHS: Record<string, string> = {
  CTRL: '⌃',
  ALT: '⌥',
  SHIFT: '⇧',
  META: '⌘',
}

/**
 * What to print inside the keycap.
 *
 * Punctuation shows its glyph rather than its listener name: a keycap
 * reading "SQUARE BRACKET OPEN" describes the key instead of depicting
 * it, and the user is looking for the one with "[" on it.
 *
 * Function keys and multi-word names (SPACE, PAGE UP) keep their words —
 * those keys are labelled with words on the keyboard too.
 */
export function hotkeyDisplay(name: string | null | undefined): string {
  const key = (name ?? '').trim().toUpperCase()
  if (!key) return ''
  if (MODIFIER_GLYPHS[key]) return MODIFIER_GLYPHS[key]
  if (PUNCTUATION_GLYPHS[key]) return PUNCTUATION_GLYPHS[key]
  if (key === 'SPACE') return 'space'
  if (/^F\d{1,2}$/.test(key)) return key
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

/** Spoken name, for the line under the keycap. */
export function hotkeyLabel(name: string | null | undefined): string {
  const key = (name ?? '').trim().toUpperCase()
  if (!key) return ''
  const spoken: Record<string, string> = {
    CTRL: 'Control',
    ALT: 'Option',
    SHIFT: 'Shift',
    META: 'Command',
    QUOTE: 'Apostrophe',
    SEMICOLON: 'Semicolon',
    COMMA: 'Comma',
    DOT: 'Period',
    'FORWARD SLASH': 'Slash',
    BACKSLASH: 'Backslash',
    BACKTICK: 'Backtick',
    MINUS: 'Minus',
    EQUALS: 'Equals',
    'SQUARE BRACKET OPEN': 'Left bracket',
    'SQUARE BRACKET CLOSE': 'Right bracket',
  }
  if (spoken[key]) return spoken[key]
  // Title-case the listener's multi-word names: PAGE UP -> Page up.
  return key.charAt(0) + key.slice(1).toLowerCase()
}
