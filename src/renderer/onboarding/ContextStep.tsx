// Onboarding: teach Yappr who you are, by borrowing a model that already
// knows.
//
// This step existed, was deleted in 318d82a ("a lesson you do, not a page
// you read"), and is deliberately back. The deletion was right about the
// SHAPE — the old version was three paragraphs of explanation — and wrong
// about the outcome: the import moved to Settings → AI, where a first-run
// user has no reason to look. Persistent context is one of the four
// things Pro sells, and it starts empty for everyone who never finds that
// tab.
//
// So it returns as a thing you DO: copy, paste, done, in two moves with
// no reading. It is also the only step that can be skipped by pressing
// Enter on an empty box, because unlike the mic or the hotkey, nothing
// downstream breaks without it.

import { useRef, useState } from 'react'
import { useAdvanceOnEnter } from './nav'
import {
  ONBOARDING_CONTEXT_PROMPT,
  parseOnboardingImport,
  isOverviewOnly,
} from '../../shared/onboarding-import'

// Matches the cap Settings applies on the same field, so a paste does not
// behave differently depending on which surface received it.
const OVERVIEW_MAX_CHARS = 1200

export function ContextStep() {
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [stored, setStored] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  // Always ready. Skipping costs the user nothing that a later visit to
  // Settings cannot give back, and a gate here would hold the flow on the
  // one screen that is genuinely optional.
  useAdvanceOnEnter(true)

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ONBOARDING_CONTEXT_PROMPT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      box.current?.focus()
    } catch {
      // Clipboard writes fail on some focus states; the user can retry.
    }
  }

  async function save(text: string) {
    const raw = text.trim()
    if (!raw || saving) return
    setSaving(true)
    // Same split Settings performs: a paste with the labelled headings
    // files into global/project tiers, and one without them is an
    // overview paragraph, exactly as before the headings existed.
    const parsed = parseOnboardingImport(raw)
    if (isOverviewOnly(parsed)) {
      await window.yappr.setContextOverview(raw.slice(0, OVERVIEW_MAX_CHARS))
      setStored(0)
    } else {
      const { stored: n } = await window.yappr.importContext({
        ...parsed,
        overview: parsed.overview.slice(0, OVERVIEW_MAX_CHARS),
      })
      setStored(n)
    }
    setSaving(false)
    // Hand Enter back to the shell. The shell ignores Enter while a
    // textarea has focus (so a pasted newline is a newline), which would
    // otherwise strand the user on a finished screen with no way out that
    // the Enter cue is still promising them.
    box.current?.blur()
  }

  return (
    <div className="max-w-[640px]">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-2.5">
        Context
      </div>

      <p className="font-display text-[22px] leading-[1.25] text-ink mb-1.5">
        Let Yappr borrow what your AI already knows about you.
      </p>
      <p className="text-[12.5px] text-ink-60 leading-relaxed mb-5 max-w-[54ch]">
        Paste one prompt into ChatGPT or Claude, paste the answer back. Yappr
        keeps it on this Mac and uses it to resolve names and projects you
        mention. Skip it with Enter — Settings has the same box later.
      </p>

      <button
        onClick={copyPrompt}
        className="mb-3 px-3.5 py-2 rounded-pill bg-ink text-paper text-[12px] font-medium hover:opacity-90 transition-opacity"
      >
        {copied ? 'Copied — now paste it into your AI' : 'Copy the prompt'}
      </button>

      <textarea
        ref={box}
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        onBlur={() => void save(pasted)}
        placeholder="…then paste the answer here"
        spellCheck={false}
        rows={6}
        className="w-full bg-card border border-line rounded-input px-3.5 py-3 text-[12.5px] leading-relaxed placeholder:text-ink-45 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-none"
      />

      {stored !== null && (
        <p className="mt-2.5 text-[11.5px] text-ink-60">
          {stored > 0
            ? `Saved — ${stored} ${stored === 1 ? 'fact' : 'facts'} filed by project. You can read and delete every one in Settings.`
            : 'Saved. You can edit it any time in Settings.'}
        </p>
      )}
    </div>
  )
}
