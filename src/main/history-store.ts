import ElectronStore from 'electron-store'
import type { DictationResult } from '../shared/types'

// Persistent history. The in-memory list in ipc.ts is kept at 10 entries
// for quick paste-last access; this store keeps the searchable
// transcripts the Dashboard lists.
//
// Was 50, on the reasoning that older entries were not useful for
// re-copy and that keeping everything ever said in userData/ is a
// privacy surface. The first half of that is now wrong — the Dashboard
// is a record of your writing, not just a re-copy buffer — but the
// second half still holds, so this is a much larger bound rather than
// none at all. 1000 entries is roughly 300KB of JSON.
//
// The all-time METRICS do not come from here. They live in
// yappr-stats.json, which keeps no text and is never pruned, so the
// dashboard covers all time without every word being retained forever.
// See shared/dictation-stats.ts.
const HISTORY_PERSIST_LIMIT = 1000

interface HistoryStoreShape {
  history: DictationResult[]
}

const store = new ElectronStore<HistoryStoreShape>({
  name: 'yappr-history',
  defaults: { history: [] },
})

export function loadPersistedHistory(): DictationResult[] {
  return store.get('history', [])
}

export function persistHistoryEntry(entry: DictationResult): void {
  const current = store.get('history', [])
  current.unshift(entry)
  if (current.length > HISTORY_PERSIST_LIMIT) current.length = HISTORY_PERSIST_LIMIT
  store.set('history', current)
}

export function clearPersistedHistory(): void {
  store.set('history', [])
}
