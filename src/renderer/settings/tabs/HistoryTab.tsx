import { useEffect, useMemo, useState } from 'react'
import type { DictationResult } from '../../../shared/types'
import { Pill } from '../../shared/ui/Pill'
import { SectionHead } from '../../shared/ui/SectionHead'

export default function HistoryTab() {
  const [items, setItems] = useState<DictationResult[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.yappr.getAllHistory().then(setItems)
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

  const stats = useMemo(() => computeStats(items ?? []), [items])

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
        ord="01"
        label="Dashboard"
        headline={<>Every <em className="italic">word</em>, kept.</>}
        body="The last 50 dictations, searchable. They stay on this Mac and are never synced."
      />

      {/* Two weeks of activity, then three numbers — all of them true of
          the kept history and nothing more. The old strip added a streak,
          a busiest hour, a longest dictation and a "time saved vs typing
          at 40 wpm" — the last being both invented arithmetic and a speed
          claim the product deliberately doesn't make. */}
      {items.length > 0 && <Activity days={stats.days} />}
      <StatRail stats={stats} />

      <div className="flex items-stretch gap-2 mb-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search transcriptions…"
          className="flex-1 bg-card border border-line rounded-input px-3.5 py-2.5 text-[12.5px] placeholder:text-ink-45 focus:outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt-soft"
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
    <div className="bg-card border border-line rounded-[12px] px-4 py-3 flex items-start gap-3 group hover:border-ink-45 transition-colors">
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

interface Stats {
  total: number
  words: number
  thisWeek: number
  apps: number
  topApps: Array<{ name: string; count: number }>
  /** Dictations per day, oldest first, for the last DAYS days. */
  days: Array<{ label: string; date: Date; count: number }>
}

const DAYS = 14

function computeStats(items: DictationResult[]): Stats {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const byApp = new Map<string, number>()
  let words = 0
  let thisWeek = 0

  // Bucket by local calendar day so a dictation at 11pm counts for that
  // day, not for a rolling 24h window nobody thinks in.
  const buckets = new Map<string, number>()
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  for (const i of items) {
    words += wordCount(i.cleaned)
    if (i.timestamp >= weekAgo) thisWeek++
    byApp.set(i.appName, (byApp.get(i.appName) ?? 0) + 1)
    const d = new Date(i.timestamp)
    buckets.set(key(d), (buckets.get(key(d)) ?? 0) + 1)
  }

  const days: Stats['days'] = []
  for (let back = DAYS - 1; back >= 0; back--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - back)
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      date: d,
      count: buckets.get(key(d)) ?? 0,
    })
  }

  const topApps = [...byApp.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)

  return { total: items.length, words, thisWeek, apps: byApp.size, topApps, days }
}

// Dictations per day for the last two weeks.
//
// One series, so no legend — the heading says what's plotted. Columns are
// capped rather than filling their slot, carry a 4px rounded cap and a
// square baseline, and are separated by surface-colored gaps rather than
// strokes. Only the busiest day is labelled: a number over every column is
// noise, and the tooltip carries the rest.
function Activity({ days }: { days: Stats['days'] }) {
  const max = Math.max(...days.map((d) => d.count), 1)
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0])

  return (
    <div className="bg-card border border-line rounded-card px-5 pt-4 pb-3 mb-2.5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-ink-45">
          Last {DAYS} days
        </div>
        {busiest.count > 0 && (
          <div className="text-[10px] font-mono text-ink-45">
            busiest {busiest.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {' · '}{busiest.count}
          </div>
        )}
      </div>

      <div className="flex items-end gap-[2px] h-[68px]">
        {days.map((d, i) => {
          const pct = (d.count / max) * 100
          const isMax = d.count === busiest.count && d.count > 0
          return (
            <div key={i} className="flex-1 h-full flex flex-col justify-end items-center group">
              {isMax && (
                <div className="text-[9.5px] font-mono text-ink-60 mb-1 leading-none">
                  {d.count}
                </div>
              )}
              <div
                title={`${d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} — ${d.count} dictation${d.count === 1 ? '' : 's'}`}
                style={{ height: `${Math.max(pct, d.count > 0 ? 6 : 1.5)}%` }}
                className={[
                  'w-full max-w-[22px] rounded-t-[4px] transition-colors',
                  d.count > 0 ? 'bg-cobalt group-hover:bg-ink' : 'bg-ink/[0.10]',
                ].join(' ')}
              />
            </div>
          )
        })}
      </div>

      {/* Hairline baseline, one step off the surface — recessive. */}
      <div className="h-px bg-line mt-1.5 mb-1.5" />

      <div className="flex justify-between text-[9px] font-mono text-ink-45">
        <span>{days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>today</span>
      </div>
    </div>
  )
}

function StatRail({ stats }: { stats: Stats }) {
  if (stats.total === 0) return null
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_minmax(0,1.5fr)] gap-px bg-line border border-line rounded-card overflow-hidden mb-5">
      <Stat value={stats.words.toLocaleString()} label="words" />
      <Stat value={stats.total} label="dictations" />
      <Stat value={stats.thisWeek} label="this week" />
      <div className="bg-card px-4 py-3.5">
        <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-ink-45 mb-2">
          Where they went
        </div>
        <div className="flex flex-col gap-1.5">
          {stats.topApps.map((a) => (
            <div key={a.name} className="text-[10.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-60 truncate">{a.name}</span>
                <span className="text-ink-45 font-mono tabular-nums">{a.count}</span>
              </div>
              <div className="h-[3px] bg-ink/[0.06] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-cobalt rounded-full"
                  style={{ width: `${Math.max((a.count / stats.total) * 100, 5)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-card px-4 py-3.5 flex flex-col justify-center">
      <div className="font-display text-[30px] leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-ink-45 mt-2">
        {label}
      </div>
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
