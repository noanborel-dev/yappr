// Append-only, all-time dictation stats.
//
// Kept apart from yappr-history.json, which is capped at 50 entries so
// that everything a user has ever said does not accumulate on disk. This
// file has the opposite lifetime — it is never pruned — which is only
// acceptable because it holds no text. See dictation-stats.ts.
//
// Sizing: a record is four short fields, ~45 bytes of JSON. Someone
// dictating 100 times a day for a year lands around 1.6MB. That is worth
// a dashboard that covers all time; it is not worth it for transcripts.

import ElectronStore from 'electron-store'
import { logError } from './log'
import type { StatRecord } from '../shared/dictation-stats'

interface StatsStoreShape {
  records: StatRecord[]
}

// A ceiling rather than a rolling window: at 100/day this is ~5 years.
// It exists so a runaway loop cannot fill the disk, not to expire data,
// which is why it drops the OLDEST records and is set far above any
// plausible real usage.
const MAX_RECORDS = 200_000

const store = new ElectronStore<StatsStoreShape>({
  name: 'yappr-stats',
  defaults: { records: [] },
})

export function recordDictationStat(entry: StatRecord): void {
  try {
    const records = store.get('records', [])
    records.push(entry)
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
    store.set('records', records)
  } catch (err) {
    // Stats are never worth failing a dictation over.
    logError('[stats] write failed', err)
  }
}

export function loadDictationStats(): StatRecord[] {
  try {
    return store.get('records', [])
  } catch (err) {
    logError('[stats] read failed', err)
    return []
  }
}

export function clearDictationStats(): void {
  try {
    store.set('records', [])
  } catch (err) {
    logError('[stats] clear failed', err)
  }
}
