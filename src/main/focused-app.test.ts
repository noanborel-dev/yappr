import { describe, it, expect } from 'vitest'
import { parseFocusLine } from './focused-app'

describe('parseFocusLine', () => {
  it('parses an ordinary reply', () => {
    expect(parseFocusLine('com.microsoft.VSCode|Code|pipeline.ts — Yappr|4242')).toEqual({
      bundleId: 'com.microsoft.VSCode',
      appName: 'Code',
      windowTitle: 'pipeline.ts — Yappr',
      pid: 4242,
    })
  })

  it('keeps the pid when the window title itself contains pipes', () => {
    // A shell title like `noan@mac | ~/Yappr | npm run dev` used to shift
    // the fields, zero the pid, and silently disable the AI-CLI scan.
    const line = 'com.googlecode.iterm2|iTerm2|noan@mac | ~/Yappr | npm run dev|991'
    const r = parseFocusLine(line)
    expect(r.pid).toBe(991)
    expect(r.bundleId).toBe('com.googlecode.iterm2')
    expect(r.windowTitle).toBe('noan@mac | ~/Yappr | npm run dev')
  })

  it('handles an empty window title', () => {
    const r = parseFocusLine('com.apple.Terminal|Terminal||770')
    expect(r.windowTitle).toBe('')
    expect(r.pid).toBe(770)
  })

  it('tolerates trailing whitespace/newline from osascript', () => {
    expect(parseFocusLine('dev.zed.zed|Zed|main.rs|8080\n').pid).toBe(8080)
  })

  it('returns pid 0 rather than NaN when the pid is unparseable', () => {
    expect(parseFocusLine('com.foo.bar|Foo|title|not-a-pid').pid).toBe(0)
  })

  it('returns pid 0 for a degraded reply with no pid field', () => {
    const r = parseFocusLine('com.foo.bar|Foo|title')
    expect(r.pid).toBe(0)
    expect(r.windowTitle).toBe('title')
  })

  it('never returns a negative or zero pid as truthy', () => {
    expect(parseFocusLine('com.foo.bar|Foo|title|-1').pid).toBe(0)
    expect(parseFocusLine('com.foo.bar|Foo|title|0').pid).toBe(0)
  })
})
