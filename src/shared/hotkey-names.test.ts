import { describe, it, expect } from 'vitest'
import { canonicalHotkeyName, hotkeyDisplay, hotkeyLabel } from './hotkey-names'

describe('canonicalHotkeyName', () => {
  // A user who binds control and later presses the right-hand one has not
  // pressed a different key. keyMatches() in hotkeys.ts relies on this
  // collapsing, since its fallback is an exact string comparison.
  it('collapses modifier sides', () => {
    expect(canonicalHotkeyName('LEFT CTRL')).toBe('CTRL')
    expect(canonicalHotkeyName('RIGHT CTRL')).toBe('CTRL')
    expect(canonicalHotkeyName('LEFT SHIFT')).toBe('SHIFT')
    expect(canonicalHotkeyName('RIGHT META')).toBe('META')
    expect(canonicalHotkeyName('LEFT ALT')).toBe('ALT')
  })

  // The two families that could not be bound before. Stored verbatim, so
  // matching is a plain comparison against the same name the listener
  // emits at dictation time — nothing in between to drift.
  it('keeps function keys exactly as the listener names them', () => {
    expect(canonicalHotkeyName('F5')).toBe('F5')
    expect(canonicalHotkeyName('F13')).toBe('F13')
    expect(canonicalHotkeyName('F20')).toBe('F20')
  })

  it('keeps punctuation exactly as the listener names them', () => {
    // The apostrophe the user asked for. The recorder used to store "'"
    // from the browser, which never equalled QUOTE.
    expect(canonicalHotkeyName('QUOTE')).toBe('QUOTE')
    expect(canonicalHotkeyName('SEMICOLON')).toBe('SEMICOLON')
    expect(canonicalHotkeyName('SQUARE BRACKET OPEN')).toBe('SQUARE BRACKET OPEN')
  })

  it('normalises case and whitespace', () => {
    expect(canonicalHotkeyName('  left ctrl ')).toBe('CTRL')
    expect(canonicalHotkeyName('f5')).toBe('F5')
  })

  it('returns null for nothing', () => {
    expect(canonicalHotkeyName('')).toBeNull()
    expect(canonicalHotkeyName('   ')).toBeNull()
    expect(canonicalHotkeyName(null)).toBeNull()
    expect(canonicalHotkeyName(undefined)).toBeNull()
  })
})

describe('hotkeyDisplay', () => {
  it('shows modifier glyphs', () => {
    expect(hotkeyDisplay('CTRL')).toBe('⌃')
    expect(hotkeyDisplay('META')).toBe('⌘')
  })

  // A keycap reading "SQUARE BRACKET OPEN" describes the key instead of
  // depicting it; the user is hunting for the one with "[" printed on it.
  it('depicts punctuation rather than naming it', () => {
    expect(hotkeyDisplay('QUOTE')).toBe("'")
    expect(hotkeyDisplay('SQUARE BRACKET OPEN')).toBe('[')
    expect(hotkeyDisplay('FORWARD SLASH')).toBe('/')
  })

  it('keeps function keys upper case', () => {
    expect(hotkeyDisplay('F5')).toBe('F5')
    expect(hotkeyDisplay('F13')).toBe('F13')
  })

  it('handles letters and space', () => {
    expect(hotkeyDisplay('A')).toBe('a')
    expect(hotkeyDisplay('SPACE')).toBe('space')
    expect(hotkeyDisplay('')).toBe('')
  })
})

describe('hotkeyLabel', () => {
  it('names punctuation in words', () => {
    expect(hotkeyLabel('QUOTE')).toBe('Apostrophe')
    expect(hotkeyLabel('CTRL')).toBe('Control')
  })

  it('title-cases the listener multi-word names', () => {
    expect(hotkeyLabel('PAGE UP')).toBe('Page up')
    expect(hotkeyLabel('F5')).toBe('F5')
  })
})
