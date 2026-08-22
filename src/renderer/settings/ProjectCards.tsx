// Spec §1.4 — what Yappr knows, per project.
//
// This is the trust surface. Context memory works by quietly adding
// things to prompts the user never sees, so the only way that stays
// acceptable is if they can look at the whole store and remove anything
// wrong. Everything here follows from that:
//
//   - Facts are shown VERBATIM, in the user's own words. Tidying them
//     would mean the card no longer shows what is actually being sent.
//   - View and delete only. No editing, no merging, no manual project
//     creation, no drag-and-drop — all explicitly out of scope, and all
//     of them would turn a mirror into an editor.
//   - Deleting a whole bucket asks first, because it is not undoable.

import { useEffect, useState } from 'react'
import { Card } from '../shared/ui/Card'
import type { FactBucket } from '../../shared/types'
import { bucketMetricLine } from '../../shared/fact-metrics'

// Bucket keys that are not project names and need explaining.
const GLOBAL_KEY = 'global'
const UNSORTED_KEY = 'unsorted'

function bucketTitle(key: string): string {
  if (key === GLOBAL_KEY) return 'Everywhere'
  if (key === UNSORTED_KEY) return 'Unsorted'
  return key
}

function bucketBlurb(key: string): string {
  if (key === GLOBAL_KEY) return 'How you work. Added to every dictation.'
  if (key === UNSORTED_KEY) {
    // Naming the cause matters: an unsorted pile with no explanation
    // reads like a bug rather than a deliberate refusal to guess.
    return 'Yappr could not tell which project these belonged to, so it did not guess.'
  }
  return 'Added only when you are working on this project.'
}

function ScopeChip({ scope }: { scope: string }) {
  const label = scope === GLOBAL_KEY ? 'global' : scope === UNSORTED_KEY ? 'unsorted' : 'project'
  return (
    <span className="shrink-0 text-[9.5px] font-mono uppercase tracking-[0.12em] text-ink-45 border border-line rounded-full px-1.5 py-px">
      {label}
    </span>
  )
}

export function ProjectCards() {
  const [buckets, setBuckets] = useState<FactBucket[] | null>(null)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  // Captured once per mount rather than read per row, so every card on
  // the screen dates from the same instant.
  const [now] = useState(() => Date.now())

  async function reload() {
    try {
      setBuckets(await window.yappr.listContextFacts())
    } catch {
      setBuckets([])
    }
  }

  useEffect(() => { void reload() }, [])

  async function removeFact(id: number) {
    await window.yappr.deleteContextFact(id)
    await reload()
  }

  async function removeBucket(key: string) {
    await window.yappr.deleteContextBucket(key)
    setConfirmingKey(null)
    await reload()
  }

  if (buckets === null) return null

  if (buckets.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-[12.5px] text-ink-60">
          Nothing stored yet. When you mention a durable rule while dictating —
          &ldquo;we always use zod for validation&rdquo; — Yappr remembers it and
          shows it here.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {buckets.map(bucket => (
        <Card key={bucket.key} className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold truncate">{bucketTitle(bucket.key)}</h4>
                <ScopeChip scope={bucket.key} />
              </div>
              <p className="text-[11.5px] text-ink-60 mt-0.5">{bucketBlurb(bucket.key)}</p>
              {/* At-a-glance read: how much is in here, and is it stale?
                  Most useful on a project the user stopped working on
                  months ago that is still feeding prompts. */}
              <p className="text-[10.5px] font-mono text-ink-45 mt-1.5 tabular-nums">
                {bucketMetricLine(bucket.facts, now)}
              </p>
            </div>
            {confirmingKey === bucket.key ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11.5px] text-ink-60">Forget all?</span>
                <button
                  className="text-[11.5px] text-danger hover:underline"
                  onClick={() => void removeBucket(bucket.key)}
                >
                  Yes, forget
                </button>
                <button
                  className="text-[11.5px] text-ink-60 hover:underline"
                  onClick={() => setConfirmingKey(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="text-[11.5px] text-ink-60 hover:text-ink shrink-0"
                onClick={() => setConfirmingKey(bucket.key)}
              >
                Forget all
              </button>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            {bucket.facts.map(fact => (
              <li key={fact.id} className="flex items-start gap-2 group">
                <span className="text-ink-45 select-none leading-5">·</span>
                {/* Verbatim: the card has to show what is actually sent. */}
                <span className="text-[12.5px] flex-1 leading-5">{fact.text}</span>
                <button
                  className="text-[11.5px] text-ink-45 hover:text-danger opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 leading-5"
                  onClick={() => void removeFact(fact.id)}
                  aria-label={`Forget: ${fact.text}`}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
