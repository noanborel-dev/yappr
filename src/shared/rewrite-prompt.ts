// Prompt construction + output normalization for COMMAND mode
// ("select text, hold the hotkey, dictate an editing instruction").
//
// Kept pure and electron-free so the load-bearing rules are unit
// testable — the failures this module exists to prevent were all
// silent ones (a rewrite that ignored the selection, an email whose
// subject line arrived as `**Subject:** ...` in the middle of the
// body) and the only way to keep them fixed is to test them.

// Does the dictated editing command ask for an EMAIL?
//
// Deliberately narrow. "Make this shorter" while sitting in Gmail is
// NOT an email rewrite — the user wants their selection tightened, not
// a subject line bolted on. Only an explicit ask flips email mode on.
const EMAIL_COMMAND_RE = /\b(e-?mails?|e-?mailing)\b/i

export function looksLikeEmailRewrite(command: string): boolean {
  return EMAIL_COMMAND_RE.test(command)
}

// Email-specific rules, appended to the rewrite system prompt when the
// command asks for an email. Every rule here maps to an observed
// llama-3.1-8b failure on this exact task:
//   - `**Subject:** Re: ...` (markdown leaking into a plain-text body)
//   - `Dear [Recipient],` / `[Your Name]` (placeholder brackets)
//   - a title-cased subject that reads like a press release
//   - the subject buried after the greeting instead of on line 1
const EMAIL_RULES = `EMAIL FORMAT — the command asks for an email, so follow this exactly:
- Line 1 is the subject, written as: Subject: <subject>
- Line 2 is blank. The email body starts on line 3.
- The subject is plain text: no markdown, no asterisks, no quotes, no trailing period. Sentence case ("Pushing tomorrow's sync to Thursday"), not Title Case. Keep it under 60 characters and make it specific to the content — never a generic "Update" or "Following up".
- NEVER write bracketed placeholders. No [Recipient], no [Name], no [Your Name], no [Company]. If you do not know the recipient's name, the greeting is exactly "Hi," on its own line. If you do not know how to sign off, end with the sign-off line only (e.g. "Best,") and the user's own name if it appears in the context block — otherwise stop after the sign-off word.
- Keep the greeting and sign-off short: "Hi," / "Hi <name>," and "Best," / "Thanks," — no "Dear Sir or Madam", no "I hope this email finds you well".
- The body says what the selected text says. Every fact, name, date, number, and ask in the selection appears in the email. Do not pad it out with filler sentences that add no information.`

export interface RewritePromptOptions {
  // Markdown-preservation rule chosen by the caller from the shape of
  // the selection (see looksLikeMarkdown in pipeline.ts).
  formatRule: string
  // Optional "who you are" block (context memory). Already framed for
  // command mode by src/main/context/format.ts.
  contextBlock: string
  // Command asks for an email → append EMAIL_RULES.
  emailMode: boolean
}

// The SYSTEM half of a rewrite call: role, grounding rules, format
// rules. It deliberately contains NO user content — the selection and
// the command both live in the user message (see buildRewriteUserMessage).
//
// This split is the fix for "the highlighted text was ignored". The old
// prompt put the selection in the system message and sent the bare
// command ("Turn this into an email.") as the user message, so the 8B
// model read the command as the thing to act on and happily wrote a
// brand-new email out of the context block. With the selection in the
// user message it is the obvious subject of the instruction.
export function buildRewriteSystemPrompt(opts: RewritePromptOptions): string {
  return `You are a text editing assistant. The user message contains a block of SELECTED TEXT the user highlighted, followed by an EDITING COMMAND they dictated. Apply the command to the selected text and return ONLY the resulting text — no preamble, no explanation, no quotes around the output, no notes about what you changed.

GROUNDING — this is the rule that matters most:
- The SELECTED TEXT is the content. You are transforming it, not replacing it. Every fact, name, date, number, and request in the selection must survive into your output unless the command explicitly says to remove it.
- Do NOT write something new from scratch. If the command is "turn this into an email", the email is ABOUT what the selected text says.
- Do NOT answer the selected text, and do NOT answer the command. Both are input.

${opts.formatRule}
${opts.emailMode ? `\n${EMAIL_RULES}\n` : ''}${opts.contextBlock}
Output the edited text now, and nothing else.`
}

// Delimiters. The 8B model needs an unmistakable boundary between the
// two inputs; without one it treats a command-shaped sentence at the
// end of the selection as part of the instruction.
export function buildRewriteUserMessage(selectedText: string, command: string): string {
  return `SELECTED TEXT (this is the content to transform):
<<<SELECTION
${selectedText}
SELECTION>>>

EDITING COMMAND (this is the instruction — never output it):
<<<COMMAND
${command}
COMMAND>>>`
}

// Placeholder shapes the model reaches for when it does not know a
// name. Pasting "[Recipient]" into a real compose window is worse than
// pasting nothing, so they get rewritten deterministically rather than
// trusted to the prompt alone.
const GREETING_PLACEHOLDER_RE =
  /^(hi|hey|hello|dear)\s+\[[^\]]*\]\s*([,:]?)\s*$/i
const SIGNATURE_PLACEHOLDER_RE = /^\[[^\]]*\]\s*$/

// Subject-line shapes llama emits: `Subject: x`, `**Subject:** x`,
// `### Subject: x`, `Subject - x`, `"Subject: x"`. The emphasis markers
// can sit on either side of the colon (`**Subject:** x` is the common
// one), so both positions are optional.
const SUBJECT_LINE_RE =
  /^\s*(?:#{1,6}\s*)?(?:\*{1,2}|_{1,2})?\s*subject\s*(?:\*{1,2}|_{1,2})?\s*[:\-–—]\s*(?:\*{1,2}|_{1,2})?\s*(.+?)\s*$/i

// Clean up whatever subject text the model produced: strip markdown
// emphasis and wrapping quotes, collapse whitespace, drop a trailing
// period, and cap the length at the conventional 78 columns.
function normalizeSubjectText(raw: string): string {
  let s = raw.trim()
  s = s.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
  s = s.replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
  // Unbalanced leftovers (`**Subject:** x**`) — strip the strays too.
  s = s.replace(/^[*_]+|[*_]+$/g, '')
  s = s.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/[.。]+$/, '')
  if (s.length > 78) s = s.slice(0, 78).trimEnd()
  return s
}

// Deterministic clean-up of an email rewrite. Runs AFTER the LLM, on
// the theory that a 8B model will keep finding new ways to decorate a
// subject line and the paste target (a real compose window) has no
// tolerance for it.
//
// Guarantees when the model emitted a subject at all:
//   - exactly one `Subject: <text>` line, at the very top
//   - one blank line between it and the body
//   - no markdown, quotes, or trailing period in the subject
// Always:
//   - no bracketed [placeholder] greetings or signature lines
//
// When the model emitted no subject we do NOT invent one — a fabricated
// subject is a worse failure than a missing one, and the prompt already
// asks for it.
export function normalizeEmailRewrite(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  // Find the subject anywhere in the first few lines — the model
  // sometimes puts it after a stray greeting or a leading blank.
  let subject = ''
  let subjectIdx = -1
  const searchDepth = Math.min(lines.length, 5)
  for (let i = 0; i < searchDepth; i++) {
    const m = lines[i].match(SUBJECT_LINE_RE)
    if (m) {
      subject = normalizeSubjectText(m[1])
      subjectIdx = i
      break
    }
  }

  const body: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i === subjectIdx) continue
    const line = lines[i]
    // A second "Subject:" line is a duplicate — drop it.
    if (subjectIdx !== -1 && SUBJECT_LINE_RE.test(line)) continue
    if (SIGNATURE_PLACEHOLDER_RE.test(line)) continue
    const greeting = line.match(GREETING_PLACEHOLDER_RE)
    if (greeting) {
      body.push('Hi,')
      continue
    }
    // Inline placeholders inside an otherwise fine line: strip the
    // brackets' contents rather than the whole line.
    body.push(line.replace(/\s*\[[^\]]*\]/g, ''))
  }

  // Trim leading/trailing blank lines from the body.
  while (body.length > 0 && body[0].trim() === '') body.shift()
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop()

  const bodyText = body.join('\n')
  if (!subject) return bodyText
  return `Subject: ${subject}\n\n${bodyText}`
}
