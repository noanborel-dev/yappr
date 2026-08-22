import { useEffect, useMemo, useState } from 'react'
import type { DictationResult } from '../../../shared/types'
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
        body="Everything you've dictated, and where it went. Stays on this Mac, never synced."
      />

      {/* Two weeks of activity, then three numbers — all of them true of
          the kept history and nothing more. The old strip added a streak,
          a busiest hour, a longest dictation and a "time saved vs typing
          at 40 wpm" — the last being both invented arithmetic and a speed
          claim the product deliberately doesn't make. */}
      {/* The landing page's build-bench photo, same crop and the same
          line it carries there. The Dashboard opens on numbers, and a
          page of figures reads as a report rather than as the product —
          this is the one place the app can say who it is for before it
          starts counting.
          Scrim is a left-weighted gradient rather than a flat overlay so
          the text sits on darkness while the right of the frame stays
          legible as a photograph. */}
      <div className="relative rounded-card overflow-hidden shadow-glass mb-6 h-[168px]">
        <img
          src={buildBench}
          alt="A workbench mid-project: prototype parts, hand tools and a laptop pushed to one side."
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, rgba(10,11,15,0.86) 0%, rgba(10,11,15,0.62) 46%, rgba(10,11,15,0.18) 100%)',
          }}
        />
        <div className="relative h-full flex flex-col justify-end px-7 pb-6">
          <h3 className="font-display text-[30px] leading-[1.05] tracking-[-0.01em] text-white">
            Made for people who <em className="italic">build things</em>.
          </h3>
          <p className="text-[12.5px] text-white/70 mt-1.5">Not for dictating memos.</p>
        </div>
      </div>

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
  return (
    <div className="bg-white/50 backdrop-blur-md rounded-[12px] px-4 py-3 flex items-start gap-3 group shadow-glass hover:shadow-glass-lift hover:-translate-y-[1px] transition-[box-shadow,transform] duration-200">
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
        </div>
      </div>
      <button
        onClick={onCopy}
        aria-label="Copy to clipboard"
        className={`shrink-0 text-[11px] font-medium rounded-pill px-3 py-1.5 transition-all border ${
          copied
            ? 'bg-ok/12 text-ok border-ok/30'
            : 'border-line text-ink-60 hover:text-ink hover:bg-paper opacity-0 group-hover:opacity-100'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
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
  const saved = stats.minutesSavedThisMonth
  return (
    <div className="mb-8">
      {/* One figure carries the page. Four equal boxes gave every number
          the same weight, and on a young install three of them read the
          same value — "16 dictations / 16 this week / 16 today" — which
          looks broken rather than sparse. Minutes saved is the one number
          that answers "was this worth it", so it gets the size. */}
      <div className="bg-card border border-line-soft rounded-card shadow-card px-7 py-8 mb-3">
        <div className="flex items-baseline gap-3">
          <div className="font-display text-[76px] leading-[0.85] tracking-[-0.03em] tabular-nums">
            {saved === null ? '—' : compactNumber(saved)}
          </div>
          <div className="font-display italic text-[26px] leading-none text-ink-60 pb-1">
            minutes saved
          </div>
        </div>
        <p className="text-[12.5px] text-ink-45 mt-3.5">
          this month, against typing at {TYPING_WPM} words a minute
        </p>
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
