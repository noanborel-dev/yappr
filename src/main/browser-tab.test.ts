import { describe, it, expect, vi } from 'vitest'

vi.mock('./log', () => ({ logInfo: () => {}, logError: () => {} }))

import { parseTabReply } from './browser-tab'

describe('parseTabReply', () => {
  it('splits the URL from the title on the first newline', () => {
    expect(parseTabReply('https://mail.google.com/mail/u/0/#inbox\nInbox (3) - me@gmail.com - Gmail\n')).toEqual({
      url: 'https://mail.google.com/mail/u/0/#inbox',
      title: 'Inbox (3) - me@gmail.com - Gmail',
    })
  })

  it('keeps a URL containing the pipe the focused-app probe uses as its separator', () => {
    // Why the reply is newline-delimited rather than pipe-delimited:
    // query strings carry raw '|' often enough, and a truncated URL
    // routes to the wrong category silently.
    const r = parseTabReply('https://example.com/search?q=a|b\nA | B — Example')
    expect(r?.url).toBe('https://example.com/search?q=a|b')
    expect(r?.title).toBe('A | B — Example')
  })

  it('returns null for the empty reply a browser with no window gives', () => {
    expect(parseTabReply('')).toBeNull()
    expect(parseTabReply('\n')).toBeNull()
    expect(parseTabReply('   \n  \n')).toBeNull()
  })

  it('tolerates a URL-only reply', () => {
    expect(parseTabReply('https://claude.ai/chats')).toEqual({ url: 'https://claude.ai/chats', title: '' })
  })

  it('handles an untitled tab', () => {
    expect(parseTabReply('http://localhost:3000/\n')).toEqual({ url: 'http://localhost:3000/', title: '' })
  })
})
