import { describe, it, expect } from 'vitest'
import {
  looksLikeEmailRewrite,
  buildRewriteSystemPrompt,
  buildRewriteUserMessage,
  normalizeEmailRewrite,
} from './rewrite-prompt'

describe('looksLikeEmailRewrite', () => {
  it('fires on the phrasings users actually dictate', () => {
    for (const cmd of [
      'Turn this into an email.',
      'Can you rewrite this as an email?',
      'Make this a professional email',
      'email this to the team',
      'turn it into an e-mail',
      'Make this into an email and add a bit about the timeline',
    ]) {
      expect(looksLikeEmailRewrite(cmd), cmd).toBe(true)
    }
  })

  it('stays off for ordinary rewrites, including inside a mail client', () => {
    for (const cmd of [
      'Make this shorter',
      'Fix the grammar',
      'Translate to French',
      'Make it more professional',
      'Turn this into bullet points',
    ]) {
      expect(looksLikeEmailRewrite(cmd), cmd).toBe(false)
    }
  })
})

describe('buildRewriteUserMessage', () => {
  it('carries the selection AND the command, delimited', () => {
    const msg = buildRewriteUserMessage('push the sync to Thursday', 'Turn this into an email.')
    expect(msg).toContain('push the sync to Thursday')
    expect(msg).toContain('Turn this into an email.')
    // The selection has to come first and be fenced — the old prompt
    // sent the bare command as the user message and the model wrote a
    // brand-new email from context.
    expect(msg.indexOf('<<<SELECTION')).toBeLessThan(msg.indexOf('<<<COMMAND'))
  })
})

describe('buildRewriteSystemPrompt', () => {
  const base = { formatRule: 'FORMATTING RULE: plain prose.', contextBlock: '' }

  it('never contains user content — selection and command live in the user message', () => {
    const p = buildRewriteSystemPrompt({ ...base, emailMode: false })
    expect(p).toContain('SELECTED TEXT')
    expect(p).toContain('FORMATTING RULE: plain prose.')
    expect(p).not.toContain('<<<SELECTION')
  })

  it('adds email rules only in email mode', () => {
    expect(buildRewriteSystemPrompt({ ...base, emailMode: true })).toContain('Subject: <subject>')
    expect(buildRewriteSystemPrompt({ ...base, emailMode: false })).not.toContain('Subject: <subject>')
  })

  it('keeps the context block when one is supplied', () => {
    const p = buildRewriteSystemPrompt({ ...base, contextBlock: '\nUSER CONTEXT — blah\n', emailMode: true })
    expect(p).toContain('USER CONTEXT — blah')
  })
})

describe('normalizeEmailRewrite', () => {
  it('normalizes a markdown-decorated subject to a plain first line', () => {
    const out = normalizeEmailRewrite('**Subject:** "Pushing the sync to Thursday."\n\nHi,\n\nWednesday is packed.')
    expect(out.split('\n')[0]).toBe('Subject: Pushing the sync to Thursday')
    expect(out.split('\n')[1]).toBe('')
    expect(out).toContain('Wednesday is packed.')
  })

  it('hoists a subject that landed below a blank line to the top', () => {
    const out = normalizeEmailRewrite('\n### Subject - June invoice is still outstanding\n\nHi,\n\nIt was due on the 12th.')
    expect(out.startsWith('Subject: June invoice is still outstanding\n\nHi,')).toBe(true)
  })

  it('replaces a bracketed greeting placeholder with a neutral greeting', () => {
    const out = normalizeEmailRewrite('Subject: Design help\n\nDear [Recipient],\n\nI am building an app.')
    expect(out).toContain('Hi,')
    expect(out).not.toContain('[')
  })

  it('drops a placeholder signature line but keeps the sign-off', () => {
    const out = normalizeEmailRewrite('Subject: Design help\n\nHi,\n\nThanks.\n\nBest regards,\n[Your Name]')
    expect(out.trimEnd().endsWith('Best regards,')).toBe(true)
    expect(out).not.toContain('[Your Name]')
  })

  it('strips inline placeholders without eating the sentence', () => {
    const out = normalizeEmailRewrite('Subject: Invoice\n\nHi,\n\nPlease confirm with [Company] by Friday.')
    expect(out).toContain('Please confirm with by Friday.')
  })

  it('drops a duplicated subject line', () => {
    const out = normalizeEmailRewrite('Subject: One\n\nSubject: One\n\nHi,\n\nBody.')
    expect(out.match(/Subject:/g)).toHaveLength(1)
  })

  it('leaves a subject-less rewrite alone rather than inventing one', () => {
    const out = normalizeEmailRewrite('Hi,\n\nWednesday is packed, can we move to Thursday?\n\nBest,')
    expect(out).toBe('Hi,\n\nWednesday is packed, can we move to Thursday?\n\nBest,')
    expect(out).not.toContain('Subject:')
  })

  it('preserves body structure, including lists', () => {
    const out = normalizeEmailRewrite('Subject: Vendor call\n\nHi,\n\nThree things:\n\n- 500 units by the 20th\n- $12.40 a unit\n- PO due Friday\n\nBest,')
    expect(out).toContain('- 500 units by the 20th\n- $12.40 a unit\n- PO due Friday')
  })
})
