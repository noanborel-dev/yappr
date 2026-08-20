import { describe, it, expect } from 'vitest'
import { detectAiAddressing, classifyCodeSurface, isActionableRequest } from './ai-intent'

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
  // Long enough to clear MIN_REFORMAT_WORDS. Every reformat route now
  // requires this, not just the AI-CLI one.
  const SUBSTANTIAL =
    'can you go through the auth module and fix the login redirect so it stops looping'

  it('routes a primary AI app to reformat', () => {
    expect(
      classifyCodeSurface({ ...base, transcript: SUBSTANTIAL, isPrimaryAiBundle: true }).register
    ).toBe('reformat')
  })

  it('routes a readable multi-line AXTextArea chat box in a code app to reformat', () => {
    expect(
      classifyCodeSurface({
        ...base, transcript: SUBSTANTIAL, axRole: 'AXTextArea', isAxReadable: true,
      }).register
    ).toBe('reformat')
  })

  // The word floor used to guard ONLY the AI-CLI route. A nine-word aside
  // in ChatGPT, or anywhere the AX probe happened to report AXTextArea,
  // got the full markdown-section treatment. Since that probe is
  // unreliable on Electron editors, identical input routed differently
  // run to run. Length is now checked before every reformat route.
  const SHORT = 'wait does this actually work'

  it('does NOT reformat a short dictation in a primary AI app', () => {
    const r = classifyCodeSurface({ ...base, transcript: SHORT, isPrimaryAiBundle: true })
    expect(r.register).not.toBe('reformat')
    expect(r.register).toBe('faithful_ai')
  })

  it('does NOT reformat a short dictation in a chat textarea', () => {
    expect(
      classifyCodeSurface({
        ...base, transcript: SHORT, axRole: 'AXTextArea', isAxReadable: true,
      }).register
    ).not.toBe('reformat')
  })

  it('does NOT reformat a short dictation on a browser AI URL', () => {
    expect(
      classifyCodeSurface({ ...base, transcript: SHORT, browserAiRouted: true }).register
    ).not.toBe('reformat')
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
  // from ~1.4s to 3–7s and mangled short input (46 chars in, 27 out). The
  // floor still exists — it just moved from 12 words to 8.
  it('LATENCY: a genuinely short aside beside a running CLI stays cheap', () => {
    for (const transcript of [
      'let us see how well this works',   // 7
      'yeah that works',                  // 3
    ]) {
      const r = classifyCodeSurface({ ...base, terminalAiCli: { isAiCli: true }, transcript })
      expect(r.register, transcript).toBe('faithful_ai')
      expect(r.reason, transcript).toBe('ai-cli-detected-short')
    }
  })

  // THE ACCEPTED COST of aligning the floor at 8.
  //
  // This phrase is 9 words and is plainly an aside, and at the old
  // 12-word floor it was deliberately excluded. It now gets shaped. That
  // is the price of removing the 8-11 dead zone, where a dictation was
  // too long to skip the LLM and too short to reformat and so paid a
  // ~2s round-trip to come back unchanged — the worst of both.
  //
  // If asides like this being shaped turns out to annoy more than the
  // dead zone did, raise MIN_REFORMAT_WORDS; the floor is one constant.
  // A 9-word aside is substantial by word count but asks for nothing, so
  // it takes the fast descriptive path rather than being forced into a
  // task template. This is what makes the aligned floor safe.
  it('does not shape a 9-word aside — it asks for nothing', () => {
    const transcript = 'just wanted to see how quick this thing works'
    expect(transcript.split(' ')).toHaveLength(9)
    const r = classifyCodeSurface({ ...base, terminalAiCli: { isAiCli: true }, transcript })
    expect(r.register).toBe('faithful_ai')
    expect(r.reason).toBe('ai-cli-descriptive')
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

// Thresholds aligned at 8 so nothing lands in the old 8-11 dead zone,
// where a dictation was too long to skip the LLM and too short to
// reformat — a ~2s round-trip that returned the text near-identical.
describe('reformat threshold aligns with the no-LLM floor', () => {
  const inCli = (transcript: string) => classifyCodeSurface({
    category: 'code', transcript, isAxReadable: false,
    terminalAiCli: { isAiCli: true, cli: 'claude' },
  })

  it('reformats an 8-word REQUEST — the old dead zone', () => {
    const eight = 'please fix the login redirect it keeps looping'
    expect(inCli(eight).register).toBe('reformat')
  })

  it('leaves an 8-word DESCRIPTION as plain text, no headings', () => {
    // Straight from the log. Nothing is being asked for, so a ## Goal /
    // ## Tasks template would invent a job the user never requested.
    expect(inCli('I also have to respond to this one').register).toBe('faithful_ai')
  })

  it('does not reformat below the floor', () => {
    expect(inCli('wait so is everything done').register).not.toBe('reformat')
  })

  it('leaves a one or two word aside completely alone', () => {
    expect(inCli('double check').register).toBe('faithful_ai')
  })
})

describe('explicit "make a prompt" request', () => {
  const anywhere = (transcript: string) => classifyCodeSurface({
    category: 'other', transcript, isAxReadable: false,
  })

  it('reformats when asked outright, outside any AI app', () => {
    const r = anywhere('make a prompt to turn our landing page into a waitlist')
    expect(r.register).toBe('reformat')
    expect(r.reason).toBe('explicit-prompt-request')
  })

  it('accepts the natural phrasings', () => {
    for (const t of [
      'write me a prompt for refactoring the auth module properly',
      'create a really good prompt for building out the settings page',
      'turn this into a prompt so I can send it to the agent',
    ]) expect(anywhere(t).register).toBe('reformat')
  })

  // Narrow on purpose: "prompt" is an ordinary word.
  it('ignores incidental uses of the word', () => {
    for (const t of [
      'the prompt was wrong so I had to run the whole thing again',
      'it should prompt me when the background job finally finishes',
      'I typed it at the prompt and it just hung there forever',
    ]) expect(anywhere(t).register).not.toBe('reformat')
  })

  it('still respects the word floor — a two word request is an aside', () => {
    expect(anywhere('make a prompt').register).not.toBe('reformat')
  })
})

// Descriptive vs request. Both get cleaned; only a request gets shaped
// into ## Goal / ## Tasks. Wrapping a description in a task template
// invents work nobody asked for — and it is also the slow path, since
// shaping runs a heavier model.
describe('isActionableRequest', () => {
  it('recognises an outright instruction', () => {
    expect(isActionableRequest('please build me a landing page for the waitlist')).toBe(true)
    expect(isActionableRequest('fix the login redirect it keeps looping on expiry')).toBe(true)
  })

  // The user's own phrasing: stating a need IS asking for it.
  it('recognises a stated need, not just "I need YOU TO"', () => {
    expect(isActionableRequest('I need a waitlist page and I need the copy tightened')).toBe(true)
    expect(isActionableRequest('the empty state should say something friendlier')).toBe(true)
  })

  // English hangs imperatives off commas constantly.
  it('recognises an imperative after a comma', () => {
    expect(isActionableRequest(
      "there's an issue because it's taking forever, just check the logs and fix it",
    )).toBe(true)
  })

  it('treats plain description as description', () => {
    for (const t of [
      'we rebuilt the dictation indicator to live in the MacBook notch',
      'just wanted to see how quick this thing works',
      'I also have to respond to this one',
    ]) expect(isActionableRequest(t), t).toBe(false)
  })

  // Position beats vocabulary: these carry request VERBS while plainly
  // describing. Matching on the word alone would shape all of them.
  it('is not fooled by a request verb in descriptive position', () => {
    for (const t of [
      'this is what I needed to essentially rewrite',
      'the deploy changed everything about how we ship now',
      'the build step removed the old assets automatically',
    ]) expect(isActionableRequest(t), t).toBe(false)
  })
})
