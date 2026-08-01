import { useEffect, useState } from 'react'
import type { CategoryStrictness, Settings, Strictness } from '../../../shared/types'
import { SectionHead, GroupLabel } from '../../shared/ui/SectionHead'
import { Panel, SettingRow } from '../../shared/ui/Panel'
import { Toggle } from '../../shared/ui/Toggle'
import { BrandLogo, type BrandSlug } from '../../shared/ui/BrandLogo'

type Bucket = keyof CategoryStrictness

const META: Record<Bucket, { title: string; sub: string; icon: BrandSlug }> = {
  personal: { title: 'Personal messaging', sub: 'iMessage · WhatsApp · Telegram', icon: 'imessage' },
  work: { title: 'Work messaging', sub: 'Slack · Discord · Gmail · Outlook', icon: 'slack' },
  writing: { title: 'Writing & AI', sub: 'Notion · Docs · Claude · ChatGPT', icon: 'claude' },
}

const LEVEL_LABEL: Record<Strictness, string> = { 1: 'Light', 2: 'Balanced', 3: 'Strict' }
const ORDER: Bucket[] = ['personal', 'work', 'writing']

// Per-context example dictation and what each level does to it.
// Deliberately not lunch-themed — that's the other guys' example.
const EXAMPLES: Record<Bucket, { raw: string; outputs: Record<Strictness, string> }> = {
  personal: {
    raw: 'yo um did you get the package i sent like the one with the book',
    outputs: {
      1: 'yo did you get the package i sent like the one with the book',
      2: 'did you get the package I sent? the one with the book',
      3: 'Did the package make it to you — the one with the book?',
    },
  },
  work: {
    raw: 'hey just wanted to follow up on the proposal um can you let me know if you got a chance to look at it',
    outputs: {
      1: 'hey just wanted to follow up on the proposal can you let me know if you got a chance to look at it',
      2: "Just following up on the proposal — can you let me know if you've had a chance to look?",
      3: "Hi — following up on the proposal. Could you let me know once you've had a chance to review it?",
    },
  },
  writing: {
    raw: 'so the main idea is that um we want users to feel like the app is responding to them and like adapting',
    outputs: {
      1: 'so the main idea is that we want users to feel like the app is responding to them and like adapting',
      2: 'The main idea is that we want users to feel the app is responding to them and adapting.',
      3: 'The core idea: users should feel the app responds and adapts to them.',
    },
  },
}

// Code is FAITHFUL — one example, one output, never level-dependent.
const CODE_EXAMPLE = {
  raw: 'git commit dash m fix the um the bug in user auth',
  output: 'git commit -m "fix the bug in user auth"',
}

export default function PolishTab() {
  const [strictness, setStrictness] = useState<CategoryStrictness | null>(null)
  // The row whose preview is open. Previews used to live in a hero above
  // the table and appear on hover, which meant the example you were
  // reading vanished the moment you moved the pointer toward the control
  // that changes it. Now the preview is inside the row.
  const [open, setOpen] = useState<Bucket | 'code'>('personal')

  useEffect(() => {
    window.yappr.getSettings().then((s: Settings) => setStrictness(s.strictness))
  }, [])

  if (!strictness) return <div className="text-ink-45 text-sm">Loading…</div>

  function setLevel(bucket: Bucket, lvl: Strictness) {
    if (!strictness) return
    const next = { ...strictness, [bucket]: lvl }
    setStrictness(next)
    setOpen(bucket)
    window.yappr.setSettings({ strictness: next })
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        ord="03"
        label="Polish"
        headline={<>One voice, three <em className="italic">registers</em>.</>}
        body="Same content, calibrated to where it lands. Code and terminal stay faithful — words are never dropped there."
      />

      <Panel className="mb-6">
        {ORDER.map((bucket) => {
          const meta = META[bucket]
          const level = strictness![bucket]
          const isOpen = open === bucket
          return (
            // Every row keeps its divider: the locked Code row follows the
            // last of these, so none of them is the panel's final row.
            <div key={bucket} className="border-b border-line-soft">
              <div
                onClick={() => setOpen(bucket)}
                className={[
                  'grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 cursor-pointer transition-colors',
                  isOpen ? 'bg-accent-soft' : 'hover:bg-paper/60',
                ].join(' ')}
              >
                <div className="w-9 h-9 rounded-[10px] bg-ink/[0.03] flex items-center justify-center">
                  <BrandLogo brand={meta.icon} size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-tight">{meta.title}</div>
                  <div className="text-[11px] text-ink-45 mt-1">{meta.sub}</div>
                </div>
                <Segmented
                  value={level}
                  onChange={(lvl) => setLevel(bucket, lvl)}
                />
              </div>

              {isOpen && (
                <Preview
                  raw={EXAMPLES[bucket].raw}
                  cleaned={EXAMPLES[bucket].outputs[level]}
                  levelLabel={LEVEL_LABEL[level]}
                />
              )}
            </div>
          )
        })}

        {/* Code & Terminal — not adjustable, but still openable, because
            "what does faithful actually do" is the question the lock
            raises. */}
        <div>
          <div
            onClick={() => setOpen('code')}
            className={[
              'grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 cursor-pointer transition-colors',
              open === 'code' ? 'bg-accent-soft' : 'bg-paper/40 hover:bg-paper/70',
            ].join(' ')}
          >
            <div className="w-9 h-9 rounded-[10px] bg-ink/[0.03] flex items-center justify-center">
              <BrandLogo brand="terminal" size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight text-ink-60">Code &amp; Terminal</div>
              <div className="text-[11px] text-ink-45 mt-1">Cursor · VS Code · iTerm — faithful, always.</div>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-45 px-3">
              locked
            </span>
          </div>
          {open === 'code' && (
            <Preview raw={CODE_EXAMPLE.raw} cleaned={CODE_EXAMPLE.output} levelLabel="Faithful" mono />
          )}
        </div>
      </Panel>

      <GroupLabel>Behaviour</GroupLabel>
      <Panel>
        <EmojiRow />
        <PauseRow />
      </Panel>
    </div>
  )
}

function Segmented({
  value,
  onChange,
}: {
  value: Strictness
  onChange: (v: Strictness) => void
}) {
  return (
    <div className="flex items-center gap-0.5 bg-ink/[0.05] rounded-pill p-0.5" onClick={(e) => e.stopPropagation()}>
      {([1, 2, 3] as Strictness[]).map((lvl) => {
        const on = value === lvl
        return (
          <button
            key={lvl}
            onClick={() => onChange(lvl)}
            className={[
              'px-3 py-1 rounded-pill text-[11.5px] font-medium transition-all duration-150',
              on ? 'bg-ink text-paper shadow-sm' : 'text-ink-60 hover:text-ink',
            ].join(' ')}
          >
            {LEVEL_LABEL[lvl]}
          </button>
        )
      })}
    </div>
  )
}

// Raw in, polished out. The cleaned line types itself so the difference
// registers as a change rather than as two blocks of text.
function Preview({
  raw,
  cleaned,
  levelLabel,
  mono,
}: {
  raw: string
  cleaned: string
  levelLabel: string
  mono?: boolean
}) {
  const typed = useTypewriter(cleaned)
  return (
    <div className="px-5 pb-4 pt-1 bg-accent-soft border-t border-line-soft/60">
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 items-start">
        <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-ink-45 pt-1">
          you said
        </div>
        <div className="text-[12px] text-ink-45 italic leading-snug">“{raw}”</div>

        <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-accent pt-1.5">
          {levelLabel}
        </div>
        <div
          className={[
            'leading-snug text-ink pt-1',
            mono ? 'font-mono text-[12px]' : 'text-[13px] font-medium',
          ].join(' ')}
        >
          {typed}
          <span className="inline-block w-[2px] h-[13px] bg-ink/70 ml-0.5 align-text-bottom animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function useTypewriter(text: string, msPerChar = 12): string {
  const [shown, setShown] = useState('')
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text)
      return
    }
    setShown('')
    let i = 0
    const id = window.setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) window.clearInterval(id)
    }, msPerChar)
    return () => window.clearInterval(id)
  }, [text, msPerChar])
  return shown
}

// Sprinkles one relevant emoji when there's a concrete moment to hang it
// on. Casual chats only — never Slack, email, docs or code.
function EmojiRow() {
  const [emoji, setEmoji] = useState<boolean | null>(null)
  useEffect(() => {
    window.yappr.getSettings().then((s: Settings) => setEmoji(s.emojiInMessages))
  }, [])
  if (emoji === null) return null
  return (
    <SettingRow
      title="Emoji in messages"
      desc={'One emoji when there’s something concrete to mark — “ramen at 5” → “ramen at 5 🍜”. Casual chats only.'}
    >
      <Toggle
        on={emoji}
        label="Emoji in messages"
        onChange={(next) => {
          setEmoji(next)
          window.yappr.setSettings({ emojiInMessages: next })
        }}
      />
    </SettingRow>
  )
}

// Skips the LLM pass entirely. The deterministic passes still run, so this
// is "no restyling", not "no cleanup".
function PauseRow() {
  const [paused, setPaused] = useState<boolean | null>(null)
  useEffect(() => {
    window.yappr.getSettings().then((s: Settings) => setPaused(s.pauseCleanup))
  }, [])
  if (paused === null) return null
  return (
    <SettingRow
      title={
        <span className="flex items-center gap-2">
          Pause AI cleanup
          {paused && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-[0.14em] bg-danger/10 text-danger border border-danger/25">
              active
            </span>
          )}
        </span>
      }
      desc="Paste exactly what Whisper heard. Brand names, your dictionary and self-corrections are still applied — but no register, no restructuring, no Markdown."
      last
    >
      <Toggle
        on={paused}
        label="Pause AI cleanup"
        onChange={(next) => {
          setPaused(next)
          window.yappr.setSettings({ pauseCleanup: next })
        }}
      />
    </SettingRow>
  )
}
