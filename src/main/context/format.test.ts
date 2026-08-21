import { describe, it, expect } from 'vitest'
import { formatContextBlock } from './format'

const OVERVIEW = 'Noan runs Yappr and will intern at Office Hours.'

describe('formatContextBlock', () => {
  it('cleanup mode embeds the overview and keeps the strict anti-echo framing', () => {
    const block = formatContextBlock(OVERVIEW, 'cleanup')
    expect(block).toContain(OVERVIEW)
    expect(block).toContain('CLEANUP task')
    // Cleanup must NOT tell the model to add content on command.
    expect(block).not.toMatch(/editing command/i)
  })

  it('command mode embeds the overview and lets the model use it to fulfil the command', () => {
    const block = formatContextBlock(OVERVIEW, 'command')
    expect(block).toContain(OVERVIEW)
    // The behavioural contract that fixes the bug: when the command asks
    // to elaborate/explain, the model MAY draw facts from context.
    expect(block).toMatch(/elaborate|explain|add detail/i)
    expect(block).toMatch(/may.*(draw|use).*(context|facts)/i)
    // But it must not invent unsupported facts.
    expect(block).toMatch(/not invent/i)
  })

  it('trims surrounding whitespace on the overview before embedding', () => {
    const block = formatContextBlock(`  ${OVERVIEW}  `, 'command')
    expect(block).toContain(OVERVIEW)
    expect(block).not.toContain(`  ${OVERVIEW}  `)
  })
})
