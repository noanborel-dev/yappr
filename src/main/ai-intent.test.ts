import { describe, it, expect } from 'vitest'
import { detectAiAddressing, classifyCodeSurface } from './ai-intent'

describe('detectAiAddressing', () => {
  it('flags an explicit AI name as a STRONG cue', () => {
    expect(detectAiAddressing('hey claude can you add a test')).toBe('strong')
  })

  it('flags a misheard AI name (cloud) next to a tech word as STRONG', () => {
    expect(detectAiAddressing('ask cloud to refactor the auth module')).toBe('strong')
  })

  it('flags a bare coding-request verb as a WEAK cue', () => {
    expect(detectAiAddressing('refactor this and add a test')).toBe('weak')
  })

  it('returns none for a plain shell command', () => {
    expect(detectAiAddressing('git rebase -i main then force push')).toBe('none')
  })

  it('returns none for a generic "add" with no coding context', () => {
    expect(detectAiAddressing('add the numbers and divide by two')).toBe('none')
  })

  it('returns none for a generic "fix" with no coding context', () => {
    expect(detectAiAddressing('fix the leak under the sink')).toBe('none')
  })

  it('does NOT escalate an AI name quoted as a string literal (FP1 guard)', () => {
    expect(detectAiAddressing('const prompt quote hey claude refactor this unquote')).toBe('none')
  })
})

describe('classifyCodeSurface', () => {
  const base = { category: 'code' as const, transcript: '', isAxReadable: false }

  it('routes a primary AI app to reformat', () => {
    expect(classifyCodeSurface({ ...base, isPrimaryAiBundle: true }).register).toBe('reformat')
  })

  it('routes a readable multi-line AXTextArea chat box in a code app to reformat', () => {
    expect(
      classifyCodeSurface({ ...base, axRole: 'AXTextArea', isAxReadable: true }).register
    ).toBe('reformat')
  })

  const REAL_PROMPT =
    "I think there's an issue because it's taking forever for things to paste, just check the logs and fix it"

  it('Option C: a detected AI CLI + a substantial dictation → reformat', () => {
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: true },
      transcript: REAL_PROMPT,
    })
    expect(r.register).toBe('reformat')
    expect(r.reason).toBe('ai-cli-detected')
  })

  it('a detected CLI reformats even where the editor is AX-opaque (VS Code, Cursor)', () => {
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: true },
      axRole: 'AXTextArea',
      isAxReadable: false, // Electron editor: the AX probe tells us nothing
      transcript: REAL_PROMPT,
    })
    expect(r.register).toBe('reformat')
  })

  // Latency regression, 2026-07-29: reformatting EVERY dictation pushed paste
  // from ~1.4s to 3–7s and mangled short input (46 chars in, 27 out).
  it('LATENCY: a short aside beside a running CLI takes the cheap path, not reformat', () => {
    for (const transcript of [
      'let us see how well this works',
      'just wanted to see how quick this thing works',
      'yeah that works',
    ]) {
      const r = classifyCodeSurface({ ...base, terminalAiCli: { isAiCli: true }, transcript })
      expect(r.register, transcript).toBe('faithful_ai')
      expect(r.reason, transcript).toBe('ai-cli-detected-short')
    }
  })

  it('a short dictation with a spoken AI name still only reaches faithful', () => {
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: true, cli: 'claude' },
      transcript: 'hey claude rename getCwd',
    })
    expect(r.register).toBe('faithful_ai')
  })

  it('SURVIVING INVARIANT: spoken words alone never reach reformat', () => {
    // The CLI exception is deliberate and scoped to a detected PROCESS.
    // A transcript that merely mentions an AI, with no tool running, must
    // still cap at faithful — otherwise dictating *about* Claude into a
    // file would restructure the sentence.
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: false },
      transcript: 'the claude api call needs a retry here',
    })
    expect(r.register).toBe('faithful_ai')
    expect(r.register).not.toBe('reformat')
  })

  it('FP2: no CLI, generic transcript, weak-cue setting off → code', () => {
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: false },
      transcript: 'fix the off by one',
      weakCueSettingOn: false,
    })
    expect(r.register).toBe('code')
  })

  it('weak-cue opt-in: a weak spoken cue with no detected tool → faithful_ai', () => {
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: false },
      transcript: 'refactor this and add a test',
      weakCueSettingOn: true,
    })
    expect(r.register).toBe('faithful_ai')
  })

  it('weak cue with the opt-in OFF stays code', () => {
    const r = classifyCodeSurface({
      ...base,
      terminalAiCli: { isAiCli: false },
      transcript: 'refactor this and add a test',
      weakCueSettingOn: false,
    })
    expect(r.register).toBe('code')
  })

  it('FN rescue: a strong cue in a non-code app → faithful_ai (regardless of category)', () => {
    const r = classifyCodeSurface({
      category: 'other',
      transcript: 'hey claude summarize what changed',
      isAxReadable: false,
    })
    expect(r.register).toBe('faithful_ai')
  })

  it('FP6: a single-line AXTextField is NEVER reformat', () => {
    const r = classifyCodeSurface({
      ...base,
      axRole: 'AXTextField',
      isAxReadable: true,
      transcript: 'find all usages of getCwd',
    })
    expect(r.register).not.toBe('reformat')
  })
})
