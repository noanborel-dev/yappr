// Spec §1.4 — what Yappr knows, per project.
//
// This is the trust surface. Context memory works by quietly adding
// things to prompts the user never sees, so the only way that stays
// acceptable is if they can look at the whole store and remove anything
// wrong. Everything here follows from that:
//
//   - Facts are shown VERBATIM, in the user's own words. Tidying them
//     would mean the card no longer shows what is actually being sent.
//   - Deleting a whole bucket asks first, because it is not undoable.
//
// This was view-and-delete only, on the reasoning that an editor turns a
// mirror into a rewrite. That held while the only way in was the user's
// own words. It stopped holding once the project KEY could be wrong: a
// rule filed under the wrong card is not something the user said, and
// the only fix on offer was deleting a correct fact to correct its
// label. So renaming, in-place editing, and now moving a selection to
// another card all exist — each changes what IS sent, which keeps the
// card a mirror rather than making it a dressed-up copy.
// Still out of scope: manual project creation and drag-and-drop.

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

// The three scopes looked identical, which hid the one difference that
// actually matters: "Everywhere" is added to EVERY dictation, while a
// project's facts are added only when you're in it. A user scanning this
// list had no way to see that one card has far more reach than the rest.
//
// Cobalt is the same #5A8FE8 the landing page's memory panel uses, so
// "this is what Yappr remembers" is one colour across both surfaces.
//
// Unsorted is dashed rather than coloured. It is an ABSENCE — Yappr could
// not tell which project these belonged to — and a warning colour would
// claim something went wrong when the refusal to guess is the feature.
function ScopeChip({ scope }: { scope: string }) {
  const global = scope === GLOBAL_KEY
  const unsorted = scope === UNSORTED_KEY
  // 'global', not 'everywhere' — the card's own title already reads
  // "Everywhere", and a chip repeating it says nothing.
  const label = global ? 'global' : unsorted ? 'unsorted' : 'project'
  const tone = global
    ? 'text-cobalt border-cobalt bg-cobalt-soft'
    : unsorted
      ? 'text-ink-45 border-line border-dashed'
      : 'text-ink-45 border-line'
  return (
    <span
      className={`shrink-0 text-[9.5px] font-mono uppercase tracking-[0.12em] border rounded-full px-1.5 py-px ${tone}`}
    >
      {label}
    </span>
  )
}

export function ProjectCards() {
  const [buckets, setBuckets] = useState<FactBucket[] | null>(null)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingFact, setEditingFact] = useState<number | null>(null)
  // Selection spans cards on purpose: the move that matters is "these
  // three are on the wrong card", and the facts you are comparing are
  // sitting in two different ones while you decide.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Captured once per mount rather than read per row, so every card on
  // the screen dates from the same instant.
  const [now] = useState(() => Date.now())

  async function reload() {
    // Ids are only meaningful against the list they came from, and a
    // move rewrites rows. Clearing here covers every caller — including
    // the move itself, whose selection is stale the moment it lands.
    setSelected(new Set())
    try {
      setBuckets(await window.yappr.listContextFacts())
    } catch {
      setBuckets([])
    }
  }

  useEffect(() => { void reload() }, [])

  // Everywhere is the global scope, not a project name. Unsorted is the
  // ABSENCE of a key — renaming it would file facts that share nothing
  // under one project, which is the failure the unsorted bucket exists
  // to prevent.
  function isRenameable(key: string): boolean {
    return key !== GLOBAL_KEY && key !== UNSORTED_KEY
  }

  async function saveName(from: string, next: string) {
    setEditingKey(null)
    const to = next.trim()
    if (!to || to === from) return
    await window.yappr.renameContextBucket(from, to)
    await reload()
  }

  async function saveFact(id: number, next: string) {
    setEditingFact(null)
    const text = next.trim()
    if (!text) return
    await window.yappr.updateContextFact(id, text)
    await reload()
  }

  async function removeFact(id: number) {
    await window.yappr.deleteContextFact(id)
    await reload()
  }

  async function removeBucket(key: string) {
    await window.yappr.deleteContextBucket(key)
    setConfirmingKey(null)
    await reload()
  }

  function toggleSelected(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function moveSelected(toKey: string) {
    // The placeholder option carries '' — picking it is not a move.
    if (!toKey || selected.size === 0) return
    await window.yappr.moveContextFacts([...selected], toKey)
    await reload()
  }

  if (buckets === null) return null

  // The empty state has to answer "is this broken?", because on a real
  // machine it stayed blank for days and looked exactly like a bug. It
  // was not: Yappr only keeps a rule it actually heard you state, and a
  // history of one-off instructions ("add a spinner", "merge that")
  // contains none. Saying only "nothing stored yet" left no way to tell
  // that apart from a failure, and no way to act on it.
  if (buckets.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-[12.5px] text-ink-60 leading-relaxed">
          Nothing stored yet — Yappr only keeps rules it actually hears you say,
          like &ldquo;we always use zod for validation&rdquo;. Ordinary requests
          don&rsquo;t count, so this stays empty until you state one.
        </p>
        <p className="text-[12.5px] text-ink-60 leading-relaxed mt-2.5">
          To fill it now, use <span className="text-ink">Copy prompt</span> above:
          paste it into Claude or ChatGPT and paste the answer back. That imports
          your preferences and projects in one go.
        </p>
      </Card>
    )
  }

  // A card holding the WHOLE selection is not a destination — picking it
  // would promise a move that resolves to nothing. (The main process
  // treats it as a no-op either way and leaves the rows alone; this just
  // stops the menu offering it.)
  const spanned = buckets.filter(b => b.facts.some(f => selected.has(f.id))).map(b => b.key)
  const noOp = spanned.length === 1 ? spanned[0] : null

  // Everywhere is offered even when no global card exists yet. It is a
  // fixed tier rather than a bucket that happens to have rows in it, and
  // listBuckets only returns buckets that hold facts — so without this
  // the first rule you want to promote could never be promoted.
  const destinations = [GLOBAL_KEY, ...buckets.map(b => b.key).filter(k => k !== GLOBAL_KEY)]
    .filter(key => key !== noOp)

  return (
    <div className="flex flex-col gap-3">
      {/* Appears only while something is selected: with nothing checked
          it would be permanent chrome explaining a state you are not in. */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-card border border-line bg-paper">
          <span className="text-[12.5px] text-ink-60 tabular-nums">
            {selected.size} selected
          </span>
          <select
            value=""
            aria-label="Move selected rules to"
            onChange={(e) => void moveSelected(e.target.value)}
            className="bg-paper border border-line rounded-input px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
          >
            <option value="">Move to…</option>
            {/* Reachable only when everything you own is on one card and
                you selected from it: there is no other card to move to,
                and creating one by hand is out of scope. */}
            {destinations.length === 0 && (
              <option value="" disabled>Nowhere else to put these</option>
            )}
            {destinations.map(key => (
              <option key={key} value={key}>{bucketTitle(key)}</option>
            ))}
          </select>
          <button
            className="text-[11.5px] text-ink-60 hover:text-ink ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}
      {buckets.map(bucket => (
        // A cobalt rail on the global card only. Same reason as the chip:
        // this is the bucket that reaches every dictation, and in a list of
        // otherwise-identical cards that needs to be visible before you
        // read a word.
        <Card
          key={bucket.key}
          className={`p-4 ${bucket.key === GLOBAL_KEY ? 'border-l-2 border-l-cobalt' : ''}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {/* Renameable — except Everywhere, which is not a project
                    name but the global scope itself, and Unsorted, which
                    is the absence of a key rather than one you can fix by
                    typing. Renaming Unsorted would file everything in it
                    under one project the facts do not share. */}
                {editingKey === bucket.key ? (
                  <input
                    autoFocus
                    defaultValue={bucket.key}
                    onBlur={(e) => void saveName(bucket.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingKey(null)
                    }}
                    className="text-[13px] font-semibold bg-paper border border-line rounded-[6px] px-2 py-0.5 min-w-0 focus:outline-none focus:border-accent"
                  />
                ) : isRenameable(bucket.key) ? (
                  <button
                    className="text-[13px] font-semibold truncate hover:text-ink-60"
                    onClick={() => setEditingKey(bucket.key)}
                    title="Click to rename"
                  >
                    {bucketTitle(bucket.key)}
                  </button>
                ) : (
                  <h4 className="text-[13px] font-semibold truncate">{bucketTitle(bucket.key)}</h4>
                )}
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
                {/* In the bullet's slot, because the fact text is
                    already a button that opens the editor — selecting by
                    clicking the row would collide with editing it.
                    Accent, not cobalt: cobalt means "reaches every
                    dictation" everywhere else on this card, so a cobalt
                    tick would read as a scope claim rather than a
                    selection. */}
                <input
                  type="checkbox"
                  checked={selected.has(fact.id)}
                  onChange={() => toggleSelected(fact.id)}
                  aria-label={`Select: ${fact.text}`}
                  className="shrink-0 mt-1 w-3 h-3 accent-accent cursor-pointer"
                />
                {/* Editable in place. The card still shows what is
                    actually sent — the edit changes what IS sent, rather
                    than dressing up what was stored. */}
                {editingFact === fact.id ? (
                  <input
                    autoFocus
                    defaultValue={fact.text}
                    onBlur={(e) => void saveFact(fact.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingFact(null)
                    }}
                    className="text-[12.5px] flex-1 leading-5 bg-paper border border-line rounded-[6px] px-2 py-0.5 focus:outline-none focus:border-accent"
                  />
                ) : (
                  <button
                    className="text-[12.5px] flex-1 leading-5 text-left hover:text-ink-60"
                    onClick={() => setEditingFact(fact.id)}
                    title="Click to edit"
                  >
                    {fact.text}
                  </button>
                )}
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
