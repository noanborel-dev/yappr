// Pure formatters for the user-context block spliced into LLM prompts.
// Kept dependency-free (no electron / store imports) so the framing is
// unit-testable; prompt-injector.ts owns the impure overview read and
// delegates here.

// 'prompt' exists because the other two both forbid surfacing context,
// and for a shaped prompt that is exactly backwards. See promptBlock.
export type ContextMode = 'cleanup' | 'command' | 'prompt'

// Build the context block for the given prompt mode. Callers guarantee
// `overview` is non-empty.
export function formatContextBlock(overview: string, mode: ContextMode): string {
  const who = overview.trim()
  if (mode === 'command') return commandBlock(who)
  if (mode === 'prompt') return promptBlock(who)
  return cleanupBlock(who)
}

// CLEANUP mode (dictation pipeline). Frames the overview as RESOLUTION
// CONTEXT: the model should use it to disambiguate vague references while
// strict anti-echo rules stop the 8B model copying it into the output.
function cleanupBlock(who: string): string {
  return `

USER CONTEXT — read this to understand who is speaking. Use it to:
- Recognize and correctly spell names, places, projects, and people the user mentions ("uni" might mean their school; "my team" might mean a specific team named below).
- Quietly fill in or clarify vague references in the dictation when doing so makes the message more informative and stays true to the user's intent (e.g. if the user dictates "I'm doing an internship" and the overview says they're interning at Anthropic, you may write "I'm doing an internship at Anthropic" — but only if the original message clearly invites that detail; never invent context).
- Adjust register and tone to match the user's voice and domain.

About the user:
${who}

Strict rules (violating these is a fatal error):
- Do NOT echo or summarize this context as a preamble or suffix.
- Do NOT address the user about this context ("As you mentioned...", "Based on your background...").
- Do NOT paraphrase the overview into the output.
- Do NOT ask clarifying questions about who the user is.
- This is a CLEANUP task: your output is ONLY the cleaned-up version of the user's dictation, written in the user's voice — not a summary of who they are.
`
}

// COMMAND mode (select-and-rewrite). Here the user is issuing an explicit
// editing instruction, so the framing is permissive: when the command
// asks to elaborate/explain/add detail, the model MAY pull specific facts
// from the context to fulfil it — while still refusing to invent facts
// that are in neither the selection nor the context.
function commandBlock(who: string): string {
  return `

USER CONTEXT — background on who is speaking, for use when the editing command calls for it.

About the user:
${who}

How to use it:
- When the command asks you to elaborate, explain, expand, or add detail (e.g. "explain more about my internship", "turn this into an email about my project"), you MAY draw specific facts from this context — names, places, roles, companies, projects — to fulfil the command.
- Do NOT invent facts that are in neither the selected text nor this context. If the command asks for a detail that isn't available, write the rest and leave that part general rather than fabricating.
- Do NOT mention that you used any background context, and do NOT dump the whole profile. Output ONLY the edited text.
`
}

// PROMPT mode (prompt shaping / the ai_prompt register).
//
// This inverts the anti-echo rule the other two modes depend on, and the
// inversion is the whole point.
//
// Reported 2026-09-04: "persistent context is rarely shown in engineered
// prompts... it often does not mention any context layer data." The
// context WAS being injected — 310 reformat calls in the user's log
// averaged 2,429 characters of it — but the reformat path was handed the
// CLEANUP framing, which tells the model, at fatal-error level, not to
// paraphrase the overview into the output. It was being asked to know
// something and forbidden from using it.
//
// Cleanup and shaping want opposite things here. Cleaning a dictation
// must not smuggle the user's biography into their own sentence. Shaping
// a prompt for an agent that knows nothing about the project must carry
// the setting across, or the agent has to ask for what Yappr already had.
function promptBlock(who: string): string {
  return `

USER CONTEXT — background on the user and what they work on.

About the user:
${who}

You are shaping a PROMPT that will be sent to an AI assistant or coding agent. That agent knows NONE of this. So:
- Put what is RELEVANT to this request into the ## Context section, in your own words, so the agent does not have to ask for it.
- Relevant means it would change how the work is done: the stack, the framework, the conventions, the way this user builds things.
- Do NOT add goals, tasks or requirements the user did not ask for. Context describes the setting; it never invents work.
- Do NOT include the whole profile. Only the parts that bear on this request.
- Do NOT address the user about it ("as you mentioned", "based on your background").
`
}
