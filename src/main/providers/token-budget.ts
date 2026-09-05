import type { AppCategory } from '../../shared/types'

// How many tokens the model may spend on a reply.
//
// Pure so the limits are testable. Getting this wrong does not error — it
// truncates mid-sentence, which is exactly how an email lost its recipient
// and its closing.

export interface BudgetInput {
  inputChars: number
  mode: 'cleanup' | 'rewrite'
  appCategory: AppCategory
  /** The prompt WRITES from a brief, so output is several times input. */
  expandsOutput: boolean
  model: string
}

/**
 * Reasoning models spend part of max_tokens THINKING before emitting a
 * character, and that spend never appears in the reply body. Measured on
 * gpt-oss-20b at reasoning_effort:'low', 75-100 tokens go on reasoning no
 * matter how short the input. Without headroom a brief request had nothing
 * left to answer with:
 *
 *   "write me an email about what my app does to my friend Jeff"
 *   max_tokens 106 -> 102 on reasoning -> 0 characters of content
 *
 * finish_reason came back "length". That is also why the recipient's name
 * disappeared: the reply was cut off before the body.
 */
export const REASONING_HEADROOM_TOKENS = 200

export function reasoningHeadroomFor(model: string): number {
  return model.startsWith('openai/gpt-oss') ? REASONING_HEADROOM_TOKENS : 0
}

export function cleanupMaxTokens(input: BudgetInput): number {
  const inputTokens = Math.ceil(input.inputChars / 4)   // ~4 chars/token
  const headroom = reasoningHeadroomFor(input.model)

  // A rewrite restructures a selection and may legitimately grow.
  if (input.mode === 'rewrite') {
    return Math.max(400, Math.min(3072, inputTokens * 3 + 200)) + headroom
  }
  // Shaping a prompt adds headings and sections around every detail.
  if (input.appCategory === 'ai_prompt') {
    return Math.max(160, Math.min(2048, inputTokens * 3 + 120)) + headroom
  }
  // Composing writes an email from a brief: output is a multiple of input,
  // not roughly equal to it. Budgeting this like cleanup is what produced
  // 64 characters of half-finished email from a 47-character request.
  if (input.expandsOutput) {
    return Math.max(500, Math.min(1536, inputTokens * 6 + 300)) + headroom
  }
  // Cleanup: output is about input length, minus fillers, plus punctuation.
  //
  // The ceiling is 4096, not 1024. Because output tracks input here, a
  // FIXED ceiling is the wrong shape: it starts binding at ~630 input
  // tokens (~2,500 characters), and past that the reply is cut off rather
  // than shortened — the model is not summarising, it is running out of
  // room mid-sentence. The longest dictation on record is 2,265
  // characters, which sits just under, so this has not bitten yet; a
  // four-minute dictation would lose its tail.
  //
  // 4096 covers roughly 16,000 characters of output, which is longer than
  // anyone dictates in one press, and it stays as a runaway guard rather
  // than a working limit. Worst case costs $0.0012 at gpt-oss-20b output
  // pricing, which is not a number worth truncating someone's words over.
  return Math.max(80, Math.min(4096, Math.ceil(inputTokens * 1.5) + 80)) + headroom
}
