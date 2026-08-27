import { describe, it, expect } from 'vitest'
import { axText, APPLESCRIPT_NIL } from './ax-value'

describe('axText', () => {
  // The shipped bug, verbatim. A user pressed the rewrite gesture with
  // nothing selected; osascript printed AppleScript's nil, the length
  // check passed on 13 characters, and "missing value" was sent to the
  // model and pasted. Four history entries recorded cleaned:"missing value".
  it('treats AppleScript nil as no selection', () => {
    expect(axText('missing value')).toBe('')
    expect(axText('missing value\n')).toBe('')
    expect(axText('  missing value  ')).toBe('')
    expect(axText(APPLESCRIPT_NIL)).toBe('')
  })

  it('keeps real text that merely resembles the token', () => {
    // A spreadsheet header or form label. Case-sensitive matching is what
    // makes these survive — osascript emits the token in lower case.
    expect(axText('Missing Value')).toBe('Missing Value')
    expect(axText('MISSING VALUE')).toBe('MISSING VALUE')
    // Only a bare nil is nil; the token inside a sentence is content.
    expect(axText('the field shows missing value here')).toBe(
      'the field shows missing value here',
    )
  })

  it('trims and passes through ordinary selections', () => {
    expect(axText('  hello world \n')).toBe('hello world')
    expect(axText('')).toBe('')
    expect(axText(null)).toBe('')
    expect(axText(undefined)).toBe('')
  })
})
