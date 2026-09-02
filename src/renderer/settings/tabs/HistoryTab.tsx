import { useEffect, useMemo, useState } from 'react'
import type { DictationResult } from '../../../shared/types'
import { isRewriteEntry, spokenText } from '../../../shared/history-entry'
import {
  aggregate,
  compactNumber,
  TYPING_WPM,
  type StatRecord,
  type DictationStats,
  type DayCount,
  type AppShare,
} from '../../../shared/dictation-stats'
import { Pill } from '../../shared/ui/Pill'
import { SectionHead } from '../../shared/ui/SectionHead'
import buildBench from '../../shared/photos/build-bench.jpg'

export default function HistoryTab() {
  const [items, setItems] = useState<DictationResult[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [records, setRecords] = useState<StatRecord[] | null>(null)

  useEffect(() => {
    window.yappr.getAllHistory().then(setItems)
    // Metrics come from the all-time store, so they are NOT bounded by
    // how many transcripts are kept.
    window.yappr.getDictationStats().then(setRecords).catch(() => setRecords([]))
  }, [])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.cleaned.toLowerCase().includes(q) ||
        i.transcript.toLowerCase().includes(q) ||
        i.appName.toLowerCase().includes(q),
    )
  }, [items, filter])

  // Captured once per mount so every figure on screen shares one instant.
  const [now] = useState(() => Date.now())
  const stats = useMemo(() => aggregate(records ?? [], now), [records, now])

  async function copy(item: DictationResult) {
    await navigator.clipboard.writeText(item.cleaned)
    setCopiedId(item.id)
    window.setTimeout(() => setCopiedId((id) => (id === item.id ? null : id)), 1200)
  }

  async function clearAll() {
    if (!confirm('Clear all transcription history? This cannot be undone.')) return
    await window.yappr.clearHistory()
    setItems([])
  }

  if (items === null) {
    return <div className="text-ink-45 text-sm">Loading…</div>
  }

  return (
    <div className="max-w-[720px]">
      <SectionHead
        headline={<>Every <em className="italic">word</em>, kept.</>}
      />

      <Headline stats={stats} />
      {stats.total > 0 && <Activity days={stats.days} />}
      <WhereItGoes apps={stats.apps} />

      <div className="flex items-stretch gap-2 mb-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search what you said…"
          className="flex-1 bg-card border border-line rounded-input px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-45 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        {items.length > 0 && (
          <Pill variant="secondary" size="sm" onClick={clearAll}>
            Clear all
          </Pill>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="text-[11.5px] text-ink-45 px-2 py-10 text-center">
          Nothing matches &ldquo;{filter}&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              copied={copiedId === item.id}
              onCopy={() => copy(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// One entry, with one button that gets your words back.
//
// The list used to offer exactly one button — copy the polished text —
// which is fine until the polish is the thing that went wrong. Then the
// only artifact you had was the output you were trying to get rid of,
// while the raw transcript sat in the store with no way to reach it. A
// user lost two minutes of dictation that way.
//
// The first attempt at a fix was a disclosure toggle over the raw text
// with a copy button and a re-run button under it, and then a third
// button on the result. Four clicks and a decision, to recover from a
// mistake the app made. That is a menu, not a rescue.
//
// The second attempt collapsed all of it into one button that copied the
// transcript AND re-ran the pass AND swapped the clipboard to the result.
// One click, but you could not ask for either half on its own, and it
// changed what was on your clipboard twice without being asked to.
//
// Two buttons, each doing exactly one thing it is named after. Copy
// Transcription copies the transcript. Rerun AI re-runs the pass and
// shows what came back. Neither touches the other's job, and neither
// pastes anything or rewrites the entry — that entry is a record of what
// happened.
function HistoryItem({
  item,
  copied,
  onCopy,
}: {
  item: DictationResult
  copied: boolean
  onCopy: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rawCopied, setRawCopied] = useState(false)
  const [redoneCopied, setRedoneCopied] = useState(false)
  const [redone, setRedone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const said = spokenText(item)
  const isRewrite = isRewriteEntry(item)
  // An entry from before rewrites kept their instruction. There is
  // nothing to copy and nothing to re-run, so the button does not appear
  // — an action that cannot work is worse than no action.
  const recoverable = said.trim().length > 0

  async function copyTranscription() {
    await navigator.clipboard.writeText(said)
    setRawCopied(true)
    window.setTimeout(() => setRawCopied(false), 1400)
  }

  async function rerunAI() {
    if (busy) return
    setBusy(true)
    setError(null)
    setRedone(null)
    const res = await window.yappr.repolishHistoryEntry(item.id)
    setBusy(false)
    // The result is shown, not copied. Putting it on the clipboard would
    // be this button quietly doing the other button's job.
    if (res.ok) setRedone(res.text)
    else setError(res.error)
  }

  async function copyRedone() {
    if (redone === null) return
    await navigator.clipboard.writeText(redone)
    setRedoneCopied(true)
    window.setTimeout(() => setRedoneCopied(false), 1400)
  }

  return (
    <div className="bg-white/50 backdrop-blur-md rounded-[12px] px-4 py-3 group shadow-glass hover:shadow-glass-lift hover:-translate-y-[1px] transition-[box-shadow,transform] duration-200">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Clamped: a dictated Claude Code prompt can run 40 lines, and
              unclamped entries turned the list into one entry per screen.
              Click to expand the one you're looking for. */}
          <div
            onClick={() => setExpanded((v) => !v)}
            className={[
              'text-[12.5px] leading-relaxed whitespace-pre-wrap break-words cursor-pointer',
              expanded ? '' : 'line-clamp-4',
            ].join(' ')}
          >
            {item.cleaned}
          </div>
          <div className="text-[10px] font-mono text-ink-45 mt-1.5 flex items-center gap-2 flex-wrap">
            <span>{formatRelativeTime(item.timestamp)}</span>
            <span className="opacity-40">·</span>
            <span>{item.appName}</span>
            <span className="opacity-40">·</span>
            <span>{wordCount(item.cleaned)}w</span>
            {isRewrite && (
              <>
                <span className="opacity-40">·</span>
                <span>rewrite</span>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <button
            onClick={onCopy}
            aria-label="Copy to clipboard"
            className={`text-[11px] font-medium rounded-pill px-3 py-1.5 transition-all border ${
              copied
                ? 'bg-ok/12 text-ok border-ok/30'
                : 'border-line text-ink-60 hover:text-ink hover:bg-paper opacity-0 group-hover:opacity-100'
            }`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {recoverable && (
            <>
              <button
                onClick={copyTranscription}
                className={[
                  'text-[11px] font-medium rounded-pill px-3 py-1.5 border whitespace-nowrap transition-all',
                  rawCopied
                    ? 'bg-ok/12 text-ok border-ok/30 opacity-100'
                    : 'border-line text-ink-60 hover:text-ink hover:bg-paper opacity-0 group-hover:opacity-100',
                ].join(' ')}
              >
                {rawCopied ? 'Copied' : 'Copy Transcription'}
              </button>
              <button
                onClick={rerunAI}
                disabled={busy}
                className={[
                  'text-[11px] font-medium rounded-pill px-3 py-1.5 border whitespace-nowrap',
                  'transition-all border-line text-ink-60',
                  'hover:text-ink hover:bg-paper disabled:opacity-45 disabled:cursor-not-allowed',
                  // Stays open once it has produced something: the result
                  // underneath belongs to this button, and a control that
                  // vanishes from above its own output is disorienting.
                  busy || redone !== null || error ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                ].join(' ')}
              >
                {busy ? 'Running…' : 'Rerun AI'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Only Rerun AI opens this. Copy Transcription says what it did on
          its own face and has nothing to show — a panel unfolding under a
          copy is a second thing to read after a finished action. */}
      {(error || redone !== null) && (
        <div className="mt-3 pt-3 border-t border-line-soft">
          {error && (
            <p className="text-[11.5px] text-danger leading-relaxed m-0">{error}</p>
          )}

          {redone !== null && (
            <>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-45">
                  New result
                </div>
                <button
                  onClick={copyRedone}
                  className={`text-[10.5px] font-medium rounded-pill px-2.5 py-1 border transition-all ${
                    redoneCopied
                      ? 'bg-ok/12 text-ok border-ok/30'
                      : 'border-line text-ink-60 hover:text-ink hover:bg-paper'
                  }`}
                >
                  {redoneCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words bg-paper border border-line rounded-[9px] px-3 py-2.5">
                {redone}
              </div>

              {/* What it was run against, so the new version can be judged
                  rather than just taken. */}
              <div className="mt-2.5">
                <div className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-45 mb-1.5">
                  What you said
                </div>
                <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words text-ink-60">
                  {said}
                </div>
                {isRewrite && item.rewrite && (
                  <>
                    <div className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-45 mt-2.5 mb-1.5">
                      Applied to
                    </div>
                    <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words text-ink-45">
                      {item.rewrite.selection}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// The empty state teaches the gesture rather than apologising for having
// no data — a fresh install lands here first.
function EmptyState() {
  return (
    <div className="bg-card border border-line rounded-card px-6 py-12 text-center">
      <div className="font-display text-[26px] leading-tight text-ink mb-2">
        Nothing yet.
      </div>
      <p className="text-[12px] text-ink-60 max-w-[42ch] mx-auto leading-relaxed">
        Hold your dictation key anywhere on the Mac and talk. What lands in the app
        shows up here, ready to re-copy.
      </p>
    </div>
  )
}

// The dashboard reads the ALL-TIME stats store, not the transcript list.
// Those are different lifetimes on purpose: metrics keep no text and are
// never pruned, transcripts are capped. See shared/dictation-stats.ts.

// Fourteen days of activity.
//
// One series, so no legend and no axis — the heading says what it is.
// Only the busiest day is labelled: a number over every column is noise
// the eye has to filter before it can see the shape.
function Activity({ days }: { days: DayCount[] }) {
  const max = Math.max(...days.map(d => d.count), 1)
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0])
  const total = days.reduce((n, d) => n + d.count, 0)

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[12.5px] text-ink-60">Last two weeks</div>
        <div className="text-[12.5px] text-ink-45 tabular-nums">
          {total} {total === 1 ? 'dictation' : 'dictations'}
        </div>
      </div>
      {/* Shorter and softer than it was. At 92px tall with one active day
          the chart rendered a single full-height black slab over a row of
          2px hairlines, which reads as a rendering fault rather than as
          sparse data. Empty days now hold a visible, quiet slot so the
          row still scans as a fortnight. */}
      <div className="flex items-end gap-[4px] h-[56px]">
        {days.map((d, i) => {
          const isBusiest = d.count > 0 && d.count === busiest.count
          const h = d.count === 0 ? 6 : Math.max(12, (d.count / max) * 56)
          return (
            <div
              key={i}
              title={`${d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.count}`}
              className={[
                'flex-1 rounded-[3px] transition-colors',
                d.count === 0
                  ? 'bg-ink/[0.06]'
                  : isBusiest
                    ? 'bg-accent/80'
                    : 'bg-ink/25',
              ].join(' ')}
              style={{ height: h }}
            />
          )
        })}
      </div>
    </div>
  )
}

// Where the words actually go.
//
// One proportional bar rather than a row of numbers: the question people
// ask is "how much of my typing is Claude Code", and a share reads faster
// as a width than as a percentage.
function WhereItGoes({ apps }: { apps: AppShare[] }) {
  if (apps.length === 0) return null
  const shown = apps.slice(0, 5)
  const restShare = apps.slice(5).reduce((sum, a) => sum + a.share, 0)
  const shades = ['bg-ink', 'bg-ink/65', 'bg-ink/45', 'bg-ink/30', 'bg-ink/20']

  return (
    <div className="mb-8">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-3.5">
        {shown.map((a, i) => (
          <div
            key={a.name}
            className={shades[i]}
            style={{ width: `${a.share * 100}%` }}
            title={`${a.name} · ${Math.round(a.share * 100)}%`}
          />
        ))}
        {restShare > 0 && <div className="bg-ink/10" style={{ width: `${restShare * 100}%` }} />}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {shown.map((a, i) => (
          <div key={a.name} className="flex items-center gap-2 text-[12px]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${shades[i]}`} />
            <span className="text-ink">{a.name}</span>
            <span className="text-ink-45 tabular-nums">{Math.round(a.share * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Four numbers, in plain words.
//
// The old rail labelled these in 9.5px uppercase mono with letter
// spacing, which is the house style for a caption but reads as jargon
// when it is the only thing describing a headline figure.
function Headline({ stats }: { stats: DictationStats }) {
  // All time, not this month. The number moved with the label — a
  // headline reading "total" over a monthly figure under-reports silently,
  // and worst for the people who have used it longest.
  const saved = stats.minutesSavedTotal
  return (
    <div className="mb-8">
      {/* The photo is the hero's BACKGROUND, not a box above it.
          As a separate band it was a second thing competing with the
          number for the top of the page; behind the number it does the
          job an image should do here — carry the figure instead of
          sitting next to it.
          The scrim is heavy on the left where the digits sit and thins
          out to the right, so the type stays on near-solid darkness while
          the workbench is still legible as a photograph. */}
      <div className="relative rounded-card overflow-hidden shadow-glass mb-3">
        <img
          src={buildBench}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, rgba(8,9,12,0.94) 0%, rgba(8,9,12,0.86) 38%, rgba(8,9,12,0.55) 72%, rgba(8,9,12,0.30) 100%)',
          }}
        />
        <div className="relative px-8 py-9">
          <div className="flex items-baseline gap-4">
            {/* 116px. The ask was for this to be unmissable, and at 76
                it still sat in the same size class as a headline. */}
            <div className="font-display text-[116px] leading-[0.82] tracking-[-0.035em] tabular-nums text-white">
              {saved === null ? '—' : compactNumber(saved)}
            </div>
            <div className="font-display italic text-[30px] leading-none text-white/75 pb-2">
              total minutes saved
            </div>
          </div>
          <p className="text-[12.5px] text-white/55 mt-4">
            against typing at {TYPING_WPM} words a minute
          </p>
        </div>
      </div>

      {/* Supporting numbers, deliberately small. */}
      <div className="grid grid-cols-3 gap-px bg-line-soft rounded-card overflow-hidden">
        <Figure value={compactNumber(stats.total)} label="dictations" />
        <Figure value={compactNumber(stats.words)} label="words" />
        <Figure
          value={stats.wordsPerMinute === null ? '—' : String(stats.wordsPerMinute)}
          label="words a minute"
        />
      </div>
    </div>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <div className="font-display text-[26px] leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-[11.5px] text-ink-45 mt-1.5">{label}</div>
    </div>
  )
}

function wordCount(s: string): number {
  const trimmed = s.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
