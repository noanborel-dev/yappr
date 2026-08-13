import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { Panel, StackRow, SettingRow } from '../../shared/ui/Panel'
import { Pill } from '../../shared/ui/Pill'
import { Toggle } from '../../shared/ui/Toggle'
import { PromptShapingStage } from '../../shared/ui/PromptShapingStage'

// What this tab used to be: a hero chat mock, then ~450 lines of
// pixel-recreated iMessage / Gmail / Notion windows — invented contact
// names, emoji standing in for UI icons, a cursor sprite dragging a
// selection — cycling on a 6.4s loop. Three simultaneous animations, zero
// controls. It was the landing page pasted into a settings pane.
//
// What survives is the one thing that shows the feature honestly (a raw
// dictation becoming a prompt) and the only real setting on the tab
// (background context).

export default function AITab() {
  return (
    <div className="max-w-[720px]">
      <SectionHead
        ord="04"
        label="AI"
        headline={<>Rambling in. <em className="italic">Sections</em> out.</>}
        body="Watch where every piece goes. Nothing is summarised away — it's just filed."
      />

      {/* The site's Section 01, at full width. The notch above it runs on
          the same clock as the text, so this is the real indicator moving
          through a real dictation rather than a picture of one.

          It replaced a smaller card that cycled three surfaces through the
          same before/after. Two demos of one feature on one screen is one
          too many — this is the one that shows WHERE each phrase went. */}
      <PromptShapingStage />

      <GroupLabel className="mt-6">Anywhere else</GroupLabel>
      <Panel className="mb-7">
        <SettingRow
          title="Select and rewrite"
          desc="Highlight text in any app, hold your key and say what to change — “make this formal”, “turn into bullets”. The selection is replaced in place."
          last
        >
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-45">
            always on
          </span>
        </SettingRow>
      </Panel>

      <GroupLabel>Memory</GroupLabel>
      <ContextMemoryCard />
    </div>
  )
}

// ─── Context memory ─────────────────────────────────────────────────

const OVERVIEW_MAX_CHARS = 1000  // mirrors src/main/context/store.ts
const OVERVIEW_TARGET_WORDS = 150

// The prompt the "Copy prompt" button drops into the clipboard: paste it
// into any AI chat, fill in the bracketed lines, paste the answer back.
// Hard-capped in words so the response fits the store's character limit,
// and told to output only the paragraph so nothing has to be stripped.
function buildContextPromptTemplate(): string {
  return `I'm setting up "background context" for a voice-dictation app called Yappr. Yappr cleans up my dictations using a small LLM, and this paragraph will be passed to that LLM as background so its polish sounds more like me.

Please write a single paragraph (max ${OVERVIEW_TARGET_WORDS} words) describing me, covering:

- What I do for work, in 1-2 sentences. [Replace this bracketed line with your role / projects, or leave it for me to invent something plausible.]
- Names I mention often — collaborators, products, places. [Replace with 3-5 names you actually use, or skip.]
- Tools, languages, or frameworks I use day-to-day. [Replace with yours, or skip.]
- My voice across contexts — e.g. "casual in iMessage, professional in email, terse in code chats." [Replace, or use a reasonable default.]
- Topics or recurring themes that come up in my dictations. [Optional.]

Style rules for the paragraph:
- Write it as one flowing paragraph, third-person factual ("Noan works on…", or use whatever name I gave). NOT a bulleted list.
- Keep it under ${OVERVIEW_TARGET_WORDS} words. Shorter is fine.
- No filler like "this person is..." or "based on the above..."
- OUTPUT ONLY the paragraph. No preamble, no quotes around it, no commentary after. I'm going to paste your response directly into a settings field.`
}

interface ContextStatus {
  count: number
  threshold: number
  lastCompactionAt: number
  compacting: boolean
}

function ContextMemoryCard() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [overview, setOverview] = useState('')
  const [persisted, setPersisted] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [status, setStatus] = useState<ContextStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshedFlash, setRefreshedFlash] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      window.yappr.getSettings(),
      window.yappr.getContextOverview(),
      window.yappr.getContextStatus(),
    ]).then(([s, ov, st]) => {
      if (!alive) return
      setSettings(s)
      setOverview(ov)
      setPersisted(ov)
      setStatus(st)
    })
    return () => { alive = false }
  }, [])

  // Poll status every 4s while mounted — IPC is in-process and cheap, and
  // it surfaces the counter incrementing live as you dictate.
  useEffect(() => {
    const id = window.setInterval(() => {
      window.yappr.getContextStatus().then(setStatus).catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(id)
  }, [])

  if (!settings) return null

  const dirty = overview.trim() !== persisted.trim()
  const enabled = settings.useContextMemory
  const hasGroqKey = settings.provider.groqKey.trim().length > 0
  const charCount = overview.length
  const overLimit = charCount > OVERVIEW_MAX_CHARS

  async function toggleEnabled(next: boolean) {
    if (!settings) return
    setSettings({ ...settings, useContextMemory: next })
    await window.yappr.setSettings({ useContextMemory: next })
  }

  async function toggleAutoUpdate(next: boolean) {
    if (!settings) return
    setSettings({ ...settings, autoContextUpdate: next })
    await window.yappr.setSettings({ autoContextUpdate: next })
  }

  async function refreshNow() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await window.yappr.refreshContextNow()
      if (res.ok) {
        const [ov, st] = await Promise.all([
          window.yappr.getContextOverview(),
          window.yappr.getContextStatus(),
        ])
        setOverview(ov)
        setPersisted(ov)
        setStatus(st)
        setRefreshedFlash(true)
        window.setTimeout(() => setRefreshedFlash(false), 1800)
      } else {
        setRefreshError(res.error ?? 'Refresh failed')
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function save() {
    setSaving(true)
    const trimmed = overview.slice(0, OVERVIEW_MAX_CHARS)
    await window.yappr.setContextOverview(trimmed)
    setPersisted(trimmed)
    setSaving(false)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1500)
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildContextPromptTemplate())
      setCopiedFlash(true)
      window.setTimeout(() => setCopiedFlash(false), 1500)
    } catch {
      // Clipboard writes can fail on some focus states. The user can retry.
    }
  }

  const count = status?.count ?? 0
  const threshold = status?.threshold ?? 50
  const lastAt = status?.lastCompactionAt ?? 0

  return (
    <Panel>
      <StackRow
        title="Background context"
        desc="A short paragraph about you — what you work on, names you say often, how formal you are where. Yappr passes it to the cleanup model so the polish sounds like you. Stays on this Mac."
        aside={
          <Toggle
            on={enabled}
            onChange={toggleEnabled}
            label="Use background context"
            title={enabled ? 'Click to disable' : 'Click to enable'}
          />
        }
      >
        <textarea
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          placeholder="e.g. I'm Noan, building Yappr — a Mac dictation app. I work in TypeScript and Electron, talk a lot about prompts, Claude, and Groq. Casual when I'm texting, professional in email."
          rows={5}
          className="w-full bg-paper border border-line rounded-input px-3 py-2.5 text-[12.5px] leading-relaxed placeholder:text-ink-45 focus:outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt-soft resize-none"
          spellCheck
        />

        <div className="flex items-center justify-between mt-2.5 gap-3">
          <div className={`text-[10.5px] font-mono ${overLimit ? 'text-danger' : 'text-ink-45'}`}>
            {charCount} / {OVERVIEW_MAX_CHARS}
            {overLimit && ' — trimmed on save'}
          </div>
          <div className="flex items-center gap-2">
            <Pill
              variant={copiedFlash ? 'ok' : 'secondary'}
              size="sm"
              onClick={copyPrompt}
              title="Copies a ready-to-paste prompt. Paste it into ChatGPT or Claude, fill in the brackets, then paste the answer back here."
            >
              {copiedFlash ? 'Copied — paste into any AI chat' : 'Write it for me'}
            </Pill>
            {persisted.length > 0 && (
              <Pill variant="ghost" size="sm" onClick={() => { setOverview(''); setPersisted(''); window.yappr.setContextOverview('') }}>
                Clear
              </Pill>
            )}
            <Pill
              variant={savedFlash ? 'ok' : 'primary'}
              size="sm"
              onClick={save}
              disabled={!dirty || saving}
            >
              {savedFlash ? 'Saved' : saving ? 'Saving…' : 'Save'}
            </Pill>
          </div>
        </div>

        {!enabled && persisted.length > 0 && (
          <p className="text-[10.5px] font-mono text-ink-45 mt-3">
            Saved but not in use — flip the toggle to enable.
          </p>
        )}
      </StackRow>

      <StackRow
        title="Keep it current"
        desc={`Every ${threshold} dictations, Yappr rewrites the paragraph above from your recent transcripts. Runs only while you're idle, and needs a Groq key.`}
        aside={
          <Toggle
            on={settings.autoContextUpdate}
            onChange={toggleAutoUpdate}
            disabled={!hasGroqKey}
            label="Auto-update context"
            title={hasGroqKey ? undefined : 'Add a Groq key in Provider to enable'}
          />
        }
        last
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10.5px] font-mono text-ink-45">
            {status?.compacting
              ? 'Refreshing now…'
              : lastAt > 0
                ? `Last updated ${formatRelativeTime(lastAt)} · ${count}/${threshold} since`
                : `Never refreshed · ${count}/${threshold} dictations`}
          </div>
          <Pill
            variant={refreshedFlash ? 'ok' : 'secondary'}
            size="sm"
            onClick={refreshNow}
            disabled={refreshing || !hasGroqKey}
            title={hasGroqKey ? 'Run a compaction now' : 'Add a Groq key in Provider to enable'}
          >
            {refreshedFlash ? 'Refreshed' : refreshing ? 'Refreshing…' : 'Refresh now'}
          </Pill>
        </div>
        {refreshError && <p className="text-[10.5px] text-danger mt-2">{refreshError}</p>}
      </StackRow>
    </Panel>
  )
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, (Date.now() - timestamp) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = diffSec / 60
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`
  const diffHr = diffMin / 60
  if (diffHr < 24) return `${Math.round(diffHr)}h ago`
  const diffDay = diffHr / 24
  if (diffDay < 7) return `${Math.round(diffDay)}d ago`
  const diffWk = diffDay / 7
  if (diffWk < 5) return `${Math.round(diffWk)}w ago`
  return `${Math.round(diffDay / 30)}mo ago`
}
