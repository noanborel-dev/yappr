// Onboarding: teach Yappr what you work on, and show what it learned.
//
// The cards are the point of this step, not the textarea. Context memory
// works by quietly adding things to prompts the user never sees, and the
// moment to establish that it is inspectable is the first time anything
// gets stored — not later, buried in Settings, after they have already
// wondered why their dictation mentioned a project they never named.
//
// So the flow is: paste → see it sorted → delete anything wrong. The
// cards render whatever exists, which on a fresh install is nothing;
// that empty state is honest rather than a failure, and it also means
// this step works for someone who skips the paste entirely.
//
// Splitting the paste into global / per-project / unsorted buckets is
// done by the shared parser, which is unit-tested. This file only
// collects the text and shows the result.

import { useState } from 'react'
import {
  parseOnboardingImport,
  isOverviewOnly,
  ONBOARDING_CONTEXT_PROMPT,
} from '../../shared/onboarding-import'
import { ProjectCards } from '../settings/ProjectCards'

export function ContextStep({ onNext }: { onNext: () => void }) {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stored, setStored] = useState<number | null>(null)
  // Bumped after a save so the cards re-read from disk.
  const [cardsKey, setCardsKey] = useState(0)

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ONBOARDING_CONTEXT_PROMPT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard writes can fail depending on focus. The textarea below
      // still works, so this is not worth interrupting anyone over.
    }
  }

  async function save() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const parsed = parseOnboardingImport(text)
      if (isOverviewOnly(parsed)) {
        // No headings — the user pasted a plain paragraph, or wrote their
        // own. Keep it whole as the overview rather than discarding it.
        await window.yappr.setContextOverview(parsed.overview)
        setStored(0)
      } else {
        const { stored: n } = await window.yappr.importContext(parsed)
        setStored(n)
      }
      setText('')
      setCardsKey(k => k + 1)
    } catch {
      // Leave the text in place so nothing the user pasted is lost, and
      // let them try again. This step is optional — a failure here must
      // not become a dead end in the middle of onboarding.
    } finally {
      // In a finally so a throw cannot leave the button stuck on
      // "Sorting…" with no way forward.
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[640px]">
      <div className="mb-6">
        <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-accent mb-3">
          Context
        </div>
        <h1 className="font-display text-[46px] leading-[1.0] tracking-[-0.02em] mb-3">
          What are you <em className="italic">working on</em>?
        </h1>
        <p className="text-[13.5px] text-ink-60 leading-relaxed max-w-[52ch]">
          Optional, and you can skip it. If Yappr knows your projects it spells
          their names right and stops asking you to explain them.
        </p>
      </div>

      <div className="bg-card border border-line rounded-card px-5 py-4 mb-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Borrow it from a chat you already have</div>
            <div className="text-[11px] text-ink-45 mt-0.5 leading-snug">
              Copy this into ChatGPT or Claude, then paste the answer back here.
              Nothing leaves your Mac except that one message, which you send yourself.
            </div>
          </div>
          <button
            onClick={copyPrompt}
            className="shrink-0 px-3 py-1.5 rounded-pill border border-line text-[11.5px] font-medium hover:bg-ink/[0.03] transition-colors"
          >
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Paste the answer here — or just write a couple of sentences about yourself."
          className="w-full bg-paper border border-line rounded-[10px] px-3 py-2.5 text-[12.5px] leading-relaxed resize-none focus:outline-none focus:border-ink-40"
        />

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={save}
            disabled={!text.trim() || saving}
            className="px-4 py-2 rounded-pill bg-ink text-paper text-[12.5px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Sorting…' : 'Sort it out'}
          </button>
          {stored !== null && (
            <span className="text-[11px] text-ink-45">
              {stored > 0
                ? `Sorted ${stored} ${stored === 1 ? 'fact' : 'facts'} into the cards below.`
                : 'Saved as background context.'}
            </span>
          )}
        </div>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-semibold">What Yappr knows</div>
        <div className="text-[10.5px] text-ink-45">Delete anything that&rsquo;s wrong</div>
      </div>
      <div className="mb-6">
        <ProjectCards key={cardsKey} />
      </div>

      <button
        onClick={onNext}
        className="px-5 py-2.5 rounded-pill bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        Continue
      </button>
    </div>
  )
}
