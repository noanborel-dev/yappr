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

// Does a plain dictation (nothing selected) ask for an email to be
// WRITTEN, as opposed to being the email itself?
//
// "please write an email explaining what I'm working on" is a brief.
// "Hi Sam, just confirming Thursday works" is an email. The first needs
// composing; the second needs cleaning, and running compose mode on it
// would rewrite the user's actual words into something they did not say.
//
// Requires a verb of composition next to the word, so "I replied to his
// email" and "the email bounced" do not trigger it.
// Two shapes, because people phrase this two ways.
//
//   1. a composition verb before the noun — "write an email to Sam"
//   2. EMAIL ITSELF AS THE VERB — "email Sam I'm running late"
//
// Only the first was matched, so the second fell through to ordinary
// cleanup and, being short, was skipped entirely: the user got the words
// "email Sam I'm running late" pasted into their compose window.
//
// The second form is anchored to the START of the dictation, which is
// what keeps it from firing on "check my email" or "the email bounced" —
// as an imperative it can only be the first thing said.
const EMAIL_COMPOSE_RE = new RegExp(
  [
    /\b(?:write|draft|compose|send|reply\s+to|respond\s+to|answer)\s+(?:me\s+)?(?:an?|the|this)?\s*(?:\w+\s+){0,2}e-?mail\b/
      .source,
    /^\s*(?:(?:can|could)\s+you\s+|please\s+|just\s+)*e-?mail\s+(?!me\b)\w+/.source,
  ].join('|'),
  'i',
)

/**
 * How far into a dictation the ask may appear and still BE the ask.
 *
 * "Please write an email to Danielle explaining…" opens with it. Someone
 * describing a bug — "…I literally just ask it to write an email to my
 * friend and it made up some random thing" — mentions it three sentences
 * deep, inside a paragraph about something else entirely.
 *
 * 40 is measured, not guessed. Across the real asks in one user's
 * history the match starts at 0, 7, 7, 13 and 17 — people lead with what
 * they want done. The two dictations that were wrongly composed matched
 * at 72 and 158, both mid-paragraph, in text about something else.
 * 40 clears every real opening ("Could you please write an email to…"
 * reaches 17) with room to spare, and neither mention comes close.
 */
const COMPOSE_ASK_WINDOW = 40

/**
 * Is this dictation ASKING for an email, rather than mentioning one?
 *
 * The window is the whole point. This used to test the entire transcript,
 * so any dictation containing the words "write an email" was composed —
 * including a bug report about email composition, dictated into VS Code,
 * which came back with "Best," stapled to the end of it. The user's
 * report was itself the reproduction.
 *
 * Matching only near the start is what separates an instruction from a
 * subject: people lead with what they want done, and refer back to other
 * things later.
 */
export function asksForEmailComposition(transcript: string): boolean {
  const opening = (transcript ?? '').trimStart().slice(0, COMPOSE_ASK_WINDOW)
  return EMAIL_COMPOSE_RE.test(opening)
}

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
- Sign off with the user's own first name on the line after the sign-off word ("Best,\\nNoan") whenever the context block tells you what it is. A bare "Best," with nothing under it reads unfinished.
- The email is ADDRESSED TO the recipient, so speak to them directly: "can they confirm when it goes out" becomes "could you confirm when it goes out", "they need the PO by Friday" stays third-person only when "they" is someone other than the reader.
- The body says what the selected text says. Every fact, name, date, number, and ask in the selection appears in the email. Do not pad it out with filler sentences that add no information.
- Turn the notes into real email sentences. The selection is dictated speech: fix comma splices, finish fragments, and drop lead-ins like "quick note:" or "ok so". Do not paste it back verbatim under a subject line.`

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

// ─── Composed-email normalisation ───────────────────────────────────
//
// normalizeEmailRewrite above runs only on select-and-rewrite. Dictation
// compose output went out raw, so every rule the prompt states about
// endings was enforced by nothing.
//
// Both of these were observed against gpt-oss-20b with the prohibitions
// already in the prompt, which is the point: a prompt rule is a request.
//
//   "Thanks,\n[Your Name]"  — the exact placeholder the prompt forbids
//                             by name, produced anyway when the context
//                             block carried no first name.
//   "…running late."        — body with no sign-off at all, which reads
//                             as truncated in a compose window.

const PLACEHOLDER_LINE_RE = /^\s*[\[<(]\s*(?:your|my|the)?\s*(?:name|recipient|first name|full name|signature|company|title)\s*[\]>)]\s*[.,]?\s*$/i
const PLACEHOLDER_INLINE_RE = /[\[<]\s*(?:your|my|the)?\s*(?:name|recipient|first name|full name|signature|company|title)\s*[\]>]/gi

/** Sign-off words, as the closing line of a message. */
const SIGNOFF_RE = /^\s*(best|best regards|thanks|thank you|cheers|regards|kind regards|warmly|sincerely|talk soon|speak soon)\b[\s,.!—-]*$/i

// How far back to look for a sign-off that already has a signature under
// it, and how long a line under one may be before it stops looking like a
// signature. A name, a title and a company is three short lines; a fourth
// line, or a long one, is prose that happens to follow the word "Best".
const SIGNATURE_TAIL_LINES = 4
const SIGNATURE_LINE_MAX_CHARS = 48

export function looksLikeSignoff(line: string): boolean {
  return SIGNOFF_RE.test(line)
}

// Words a model reaches for when it decides to REPORT on the text instead
// of returning it. Anchored and whole-string: a rewrite that legitimately
// ends up being the single word "same" is not something to guard against,
// but a one-word reply that IS one of these, standing in for a paragraph,
// is never what the user asked for.
const META_REPLY_RE = /^\s*(identical|same|unchanged|no changes?( needed)?|nothing to change|n\/?a|ok|okay|done)\s*[.!]?\s*$/i

/**
 * Did the model answer ABOUT the selection instead of rewriting it?
 *
 * A user dictated a command over a sentence and got back the single word
 * "identical" — pasted over their text, replacing it. Nothing in any
 * prompt asks for that word; the model volunteered a judgement, and the
 * pipeline pasted the judgement.
 *
 * Two conditions, both required. The reply has to LOOK like a verdict,
 * and it has to be far shorter than what it is replacing — a genuine
 * rewrite that shortens a paragraph to one word is vanishingly rare, and
 * an actual one-word selection rewritten to another word is common. The
 * length ratio is what separates them.
 */
export function looksLikeMetaReply(original: string, output: string): boolean {
  const out = (output ?? '').trim()
  const src = (original ?? '').trim()
  if (!out || !src) return false
  if (!META_REPLY_RE.test(out)) return false
  // Replacing something substantial. A short selection legitimately
  // rewrites to a short result.
  return src.length >= 25 && out.length * 4 < src.length
}

/**
 * Make a composed email end properly.
 *
 * `userName` is the sender's first name when context knows it. Absent, the
 * sign-off word stands alone — which is a correct ending, and is what the
 * placeholder was standing in for.
 */
export function normalizeComposedEmail(text: string, userName?: string | null): string {
  const name = (userName ?? '').trim()

  let lines = (text ?? '').replace(/\r\n/g, '\n').split('\n')

  // Drop placeholder lines outright, and strip inline ones in place.
  lines = lines
    .filter(l => !PLACEHOLDER_LINE_RE.test(l))
    .map(l => l.replace(PLACEHOLDER_INLINE_RE, '').replace(/[ \t]{2,}/g, ' ').trimEnd())

  // Trailing blanks would hide the real last line from the checks below.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return ''

  const last = lines[lines.length - 1]

  // Ends on a sign-off word. Add the name under it when we know it, and
  // normalise "Best regards." to "Best regards," — a full stop after a
  // sign-off reads as the end of a sentence, not the start of a signature.
  if (looksLikeSignoff(last)) {
    lines[lines.length - 1] = last.trim().replace(/[\s,.!—-]*$/, ',')
    if (name) lines.push(name)
    return lines.join('\n')
  }

  // A sign-off ALREADY sits a line or two above, with a signature under it.
  //
  // This used to be `name && last === name`, which could only recognise a
  // signature when context happened to know the user's first name. When it
  // did not — a new user, an empty overview — a perfectly signed email fell
  // through to the branch below and got a SECOND sign-off stapled on:
  //
  //     Best,          <- the model's
  //     Noan
  //                    <- appended
  //     Best,
  //
  // which is the duplicate the user reported. What makes the email finished
  // is the sign-off being present, not our being able to name the person
  // beneath it, so the test is now about the sign-off.
  //
  // Bounded to the last few lines, and to SHORT ones: a signature is a name,
  // maybe a title or a company. "Best" opening a sentence in the final
  // paragraph must not count as an ending.
  const tailStart = Math.max(0, lines.length - SIGNATURE_TAIL_LINES)
  for (let i = lines.length - 2; i >= tailStart; i--) {
    if (!looksLikeSignoff(lines[i])) continue
    const below = lines.slice(i + 1).filter(l => l.trim() !== '')
    if (below.every(l => l.trim().length <= SIGNATURE_LINE_MAX_CHARS)) {
      lines[i] = lines[i].trim().replace(/[\s,.!—-]*$/, ',')
      return lines.join('\n')
    }
    break
  }

  // No sign-off at all — the failure that reads as a truncated email.
  lines.push('', 'Best,')
  if (name) lines.push(name)
  return lines.join('\n')
}

/**
 * The sender's first name, from the context overview.
 *
 * The overview is prose the compaction model wrote — "Noan builds Yappr,
 * a Mac dictation app" — so there is no field to read. The sign-off wants
 * a name, and the alternative to reading one here is what the model
 * already did unprompted: emit "[Your Name]" into a compose window.
 *
 * Deliberately narrow. It accepts only a capitalised first word followed
 * by a verb that means "this is a person", which is the shape the
 * compactor's overviews open with. Anything else returns null, and null
 * is a correct outcome — the sign-off word then stands alone, which is a
 * real ending rather than a placeholder.
 */
const OVERVIEW_NAME_RE =
  /^\s*([A-Z][a-zA-Z'-]{1,20})\s+(?:is|builds|works|runs|writes|makes|leads|founded|studies)\b/

export function senderNameFromOverview(overview: string | null | undefined): string | null {
  const m = OVERVIEW_NAME_RE.exec((overview ?? '').trim())
  if (!m) return null
  const name = m[1]
  // Shapes that pass the test but are not names. A sign-off reading
  // "Best,\nThe" is worse than one with no name at all.
  if (/^(the|they|this|that|he|she|it|we|i|a|an|his|her|their)$/i.test(name)) return null
  return name
}
