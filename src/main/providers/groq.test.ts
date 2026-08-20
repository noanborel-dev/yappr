import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGroqCleanupProvider } from './groq'

// Capture the request the provider sends, and hand back a scripted
// completion. vi.hoisted so the (hoisted) module mock can reach it.
const stub = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  nextContent: '',
}))

vi.mock('groq-sdk', () => {
  class Groq {
    chat = {
      completions: {
        create: async (body: Record<string, unknown>) => {
          stub.calls.push(body)
          return { choices: [{ message: { content: stub.nextContent } }] }
        },
      },
    }
  }
  return { default: Groq }
})

vi.mock('../log', () => ({ logInfo: () => {}, logError: () => {} }))

const provider = createGroqCleanupProvider('gsk_test', 'llama-3.1-8b-instant')
const calls = stub.calls

beforeEach(() => {
  stub.calls.length = 0
  stub.nextContent = ''
})

const SELECTION = 'hey can we push the sync to thursday afternoon, wednesday is packed and I still owe you the deck'
const COMMAND = 'Can you rewrite this as an email?'
// What the pipeline actually sends in rewrite mode: selection + command.
const REWRITE_INPUT = `SELECTED TEXT:\n${SELECTION}\n\nEDITING COMMAND:\n${COMMAND}`
const EMAIL = 'Subject: Moving tomorrow\'s sync\n\nHi,\n\nWednesday is packed — can we push the sync to Thursday afternoon? I still owe you the deck.\n\nBest,'

describe('groq cleanup provider — rewrite mode', () => {
  it('does not mistake a long rewrite for a loopback answer', async () => {
    // The regression, in the exact shape that shipped: the pipeline
    // sent the bare command as the model input, so a "can you …"
    // command under 80 chars plus output more than twice its length
    // tripped the loopback guard — and the provider returned the
    // COMMAND, which got pasted over the user's highlighted text.
    // Rewrite mode must never apply that guard, whatever the input
    // looks like.
    stub.nextContent = EMAIL
    const out = await provider.cleanup(COMMAND, {
      appName: 'Gmail',
      appCategory: 'email',
      systemPrompt: 'sys',
      mode: 'rewrite',
      fallbackText: SELECTION,
    })
    expect(out).toBe(EMAIL)
    expect(out).not.toContain(COMMAND)
  })

  it('still catches a loopback in cleanup mode', async () => {
    stub.nextContent = "I'm doing well, thanks for asking! How about you?"
    const out = await provider.cleanup('how are you doing', {
      appName: 'Messages',
      appCategory: 'messaging',
      systemPrompt: 'sys',
    })
    expect(out).toBe('how are you doing')
  })

  it('sizes the token budget for an expanding rewrite, not for the input', async () => {
    stub.nextContent = EMAIL
    await provider.cleanup(REWRITE_INPUT, {
      appName: 'Gmail',
      appCategory: 'email',
      systemPrompt: 'sys',
      mode: 'rewrite',
      fallbackText: SELECTION,
    })
    // The old budget (~1.5× a short input, floor 80) truncated real
    // emails mid-sentence — Groq returned finish_reason "length".
    expect(calls[0].max_tokens as number).toBeGreaterThanOrEqual(400)
  })

  it('falls back to the selection — never to the scaffolded input — when output is unusable', async () => {
    stub.nextContent = 'Could you clarify what you would like me to do?'
    const out = await provider.cleanup(REWRITE_INPUT, {
      appName: 'Gmail',
      appCategory: 'email',
      systemPrompt: 'sys',
      mode: 'rewrite',
      fallbackText: SELECTION,
    })
    expect(out).toBe(SELECTION)
  })
})

describe('groq cleanup provider — artifact stripping', () => {
  it('keeps a list the user actually dictated', async () => {
    // The list-formatting rules ask for exactly this shape, and an
    // email of asks is mostly bullets. The stripper used to delete
    // everything from the blank line onward.
    stub.nextContent = 'I need to pick up:\n\n- eggs\n- milk\n- honey'
    const out = await provider.cleanup('i need to pick up eggs milk and honey', {
      appName: 'Gmail',
      appCategory: 'email',
      systemPrompt: 'sys',
    })
    expect(out).toBe('I need to pick up:\n\n- eggs\n- milk\n- honey')
  })

  it('still drops a trailing list that narrates the edit', async () => {
    stub.nextContent = 'We should ship Tuesday.\n\n1. Removed filler words\n2. Fixed capitalization'
    const out = await provider.cleanup('so um we should ship tuesday', {
      appName: 'Gmail',
      appCategory: 'email',
      systemPrompt: 'sys',
    })
    expect(out).toBe('We should ship Tuesday.')
  })

  it('still drops trailing prose commentary', async () => {
    stub.nextContent = 'We should ship Tuesday.\n\nI removed the fillers and fixed the punctuation.'
    const out = await provider.cleanup('so um we should ship tuesday', {
      appName: 'Gmail',
      appCategory: 'email',
      systemPrompt: 'sys',
    })
    expect(out).toBe('We should ship Tuesday.')
  })
})
