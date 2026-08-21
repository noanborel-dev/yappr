import { describe, it, expect, vi } from 'vitest'

// focused-app imports ./log, which builds its path from electron's
// app.getPath at module load. Stub it — these tests only exercise the
// pure routing.
vi.mock('./log', () => ({ logInfo: () => {}, logError: () => {} }))

// Static import, NOT `await import(...)`. vi.mock is hoisted above the
// imports by vitest, so the stub is in place either way — but a
// top-level await fails `tsc -p tsconfig.node.json`, which compiles
// src/main as CommonJS. That broke CI for a day (TS1378) while
// `npm test` stayed green, because vitest never type-checks. Any test
// file under src/main has the same constraint.
import { parseFocusLine, resolveSurface } from './focused-app'

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

describe('resolveSurface', () => {
  const CHROME = 'com.google.Chrome'
  const tab = (url: string, title = '') => ({ url, title })

  it('routes Gmail in Chrome to the email category from the URL alone', () => {
    // The regression this was written for: Chrome hands us NO window
    // title (its AX tree reports zero windows), so before URL routing
    // this fell through to 'other' and a Gmail draft got generic prose
    // polish instead of the email prompt.
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab('https://mail.google.com/mail/u/0/#inbox')))
      .toEqual({ name: 'Gmail', category: 'email' })
  })

  it('routes a Gmail compose window', () => {
    const url = 'https://mail.google.com/mail/u/0/?compose=DmwnWsBvxLpMlZjLtqwSTPzGxKcVzZhLLQ'
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab(url)).category).toBe('email')
  })

  it('covers the other webmail hosts', () => {
    const cases: Array<[string, string]> = [
      ['https://outlook.office.com/mail/', 'Outlook'],
      ['https://outlook.live.com/mail/0/', 'Outlook'],
      ['https://mail.proton.me/u/0/inbox', 'ProtonMail'],
      ['https://app.fastmail.com/mail/Inbox', 'Fastmail'],
      ['https://mail.superhuman.com/', 'Superhuman'],
    ]
    for (const [url, name] of cases) {
      const r = resolveSurface(CHROME, 'Google Chrome', '', tab(url))
      expect(r, url).toEqual({ name, category: 'email' })
    }
  })

  it('routes non-email web apps too', () => {
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab('https://app.slack.com/client/T1/C2')).category).toBe('messaging')
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab('https://www.notion.so/Page-abc')).category).toBe('docs')
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab('https://claude.ai/chat/123')).category).toBe('ai_prompt')
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab('https://discord.com/channels/1/2')).category).toBe('messaging')
  })

  it('does not match a look-alike host', () => {
    for (const url of [
      'https://mail.google.com.evil.example/inbox',
      'https://notmail.google.com/',
      'https://example.com/?next=https://mail.google.com/',
    ]) {
      expect(resolveSurface(CHROME, 'Google Chrome', '', tab(url)), url)
        .toEqual({ name: 'Google Chrome', category: 'other' })
    }
  })

  it('falls back to the tab title when the URL is unknown', () => {
    expect(resolveSurface(CHROME, 'Google Chrome', '', tab('https://mail.example.edu/', 'Inbox – Gmail')))
      .toEqual({ name: 'Gmail', category: 'email' })
  })

  it('falls back to the window title when there is no tab read at all', () => {
    // Firefox: no AppleScript vocabulary for tabs, but it does publish
    // a window title.
    expect(resolveSurface('org.mozilla.firefox', 'Firefox', '(3) Inbox - me@gmail.com - Gmail — Mozilla Firefox', null))
      .toEqual({ name: 'Gmail', category: 'email' })
  })

  it('leaves an unmatched browser tab as the browser itself', () => {
    expect(resolveSurface(CHROME, 'Google Chrome', 'localhost', tab('http://localhost:5173/', 'localhost')))
      .toEqual({ name: 'Google Chrome', category: 'other' })
  })

  it('ignores tab data for non-browser apps', () => {
    expect(resolveSurface('com.apple.mail', 'Mail', 'Inbox', tab('https://app.slack.com/client/T1/C2')))
      .toEqual({ name: 'Mail', category: 'email' })
  })
})

// Browser app-builders. Each owns a project it can read, edit and deploy,
// so a prompt aimed at one should be shaped like a prompt aimed at Claude
// Code — not like a chat message.
describe('AI app-builder URL routing', () => {
  const route = (url: string) => resolveSurface('com.google.Chrome', 'Chrome', '', { url, title: '' })

  it('routes the app builders to ai_prompt', () => {
    for (const [url, name] of [
      ['https://lovable.dev/projects/abc123', 'Lovable'],
      ['https://replit.com/@noan/my-app', 'Replit'],
      ['https://bolt.new/~/sb1-xyz', 'Bolt'],
    ] as [string, string][]) {
      const r = route(url)
      expect(r.category, url).toBe('ai_prompt')
      expect(r.name, url).toBe(name)
    }
  })

  it('still routes the chat assistants', () => {
    expect(route('https://claude.ai/chat/123').category).toBe('ai_prompt')
    expect(route('https://chatgpt.com/c/456').category).toBe('ai_prompt')
  })

  it('does not claim unrelated hosts', () => {
    expect(route('https://news.ycombinator.com').category).not.toBe('ai_prompt')
    // Guard against a loose host match: a lookalike domain must not route.
    expect(route('https://lovable.dev.evil.co/x').category).not.toBe('ai_prompt')
  })
})
