// What each plan may do. Pure, so the paywall is testable without
// Electron, a network, or a signed-in user.
//
// Pricing of record is docs/ARCHITECTURE.md: Free is unlimited dictation
// with cleanup, and Pro ($9/mo) sells four features. This module is the
// single place that says which. Nothing else should branch on plan name.
//
// WHERE THIS CAN AND CANNOT BE ENFORCED
//
// The plan itself comes from the server (profiles.state) and is not
// user-editable. But the *context limit* can only be applied on the
// client, because remembered facts live in local SQLite and the cleanup
// proxy must never receive them — the FAQ promises text is "never
// stored", and shipping a user's whole fact store to our server so we
// could count it would break exactly that promise.
//
// So: the proxy independently rejects what it can see cheaply
// (select-and-rewrite is a distinct request mode), and the fact limit is
// client-side by necessity. A user who unpacks app.asar can lift the
// context cap. That is an accepted trade, on the same reasoning
// docs/pricing-and-economics.md used to stop metering Free: cleanup runs
// ~$0.002–$0.14/user/mo, so the leak is worth cents and the alternative
// costs a privacy promise.

import type { StoredFact } from './types'

export type Plan = 'free' | 'pro_trial' | 'pro' | 'beta'

export interface Entitlements {
  /** Restructure a rambling dictation into a markdown prompt. */
  promptShaping: boolean
  /** Rewrite the current selection from a spoken command. */
  selectAndRewrite: boolean
  /** Per-app tone rules from settings.perAppRules. */
  perAppPolish: boolean
  /** The LLM-written "who you are" paragraph from the compactor. */
  contextOverview: boolean
  /** Remembered facts injected into cleanup. null means unlimited. */
  factLimit: number | null
  /** Words of LLM cleanup per week. null means unlimited. */
  weeklyWordLimit: number | null
}

// Free is metered again, at the pre-2026-07-29 figure.
//
// That earlier decision removed the cap on the arithmetic that cleanup is
// ~$0.002-$0.14/user/mo, so metering "was costing conversion without
// saving meaningful money". The arithmetic has not changed and the cap is
// still not a cost control. What changed is the other side of the trade:
// Free now also carries prompt shaping and three facts, so unlimited
// volume on top of that left little to buy. The cap restores a recurring
// moment where upgrading is the obvious move.
//
// Over-cap is a DOWNGRADE, not a wall. The user keeps dictating; cleanup
// falls back to createLocalCleanupProvider() and the deterministic passes
// in text-passes.ts, which still fix brand names, the dictionary,
// self-corrections and question marks. That gap is the upgrade incentive
// — a blocked hotkey would just be a broken app.
//
// Unlike the fact cap, this one IS server-enforceable: the proxy already
// sees the transcript on its way to cleanup, so it can count words and
// discard them without storing anything.
export const FREE_WEEKLY_WORD_LIMIT = 2000

// Free keeps three facts rather than zero.
//
// docs/pricing-and-economics.md rejected the hard paywall because users
// convert when they EXPERIENCE a feature "rather than just reading a
// feature list". Zero context is invisible absence, and absence does not
// sell. Three facts visibly work — it knows your name and your project —
// and the cards already render a count ("4 facts · added 2h ago"), so
// "3 / 3 remembered" is an honest, permanent upsell on a surface that
// exists today.
//
// Three and not ten: the limit has to be reachable in the first week or
// it never converts anyone.
export const FREE_FACT_LIMIT = 3

// Free keeps prompt shaping, but on the free context layer.
//
// The feature still works and is visibly worse with three facts than
// with a full store, which makes the upgrade felt rather than described.
// It also needs no quota, no counter, and no monthly reset — the context
// layer IS the limit.
const FREE: Entitlements = {
  promptShaping: true,
  selectAndRewrite: false,
  perAppPolish: false,
  contextOverview: false,
  factLimit: FREE_FACT_LIMIT,
  weeklyWordLimit: FREE_WEEKLY_WORD_LIMIT,
}

const FULL: Entitlements = {
  promptShaping: true,
  selectAndRewrite: true,
  perAppPolish: true,
  contextOverview: true,
  factLimit: null,
  weeklyWordLimit: null,
}

export function entitlementsFor(plan: Plan): Entitlements {
  // pro_trial and beta are Pro. Keeping them as distinct plan names
  // rather than collapsing them means the UI can say "4 days left" and
  // "beta" without a second field, and the server can expire them
  // differently.
  return plan === 'free' ? FREE : FULL
}

/**
 * Trims a fact list to what the plan allows, newest first.
 *
 * Newest rather than oldest so context stays current: the facts that
 * survive are the ones about what the user is working on now. Oldest-wins
 * would freeze a user's context at whatever they happened to say in week
 * one and quietly stop reflecting them.
 *
 * Does not mutate its input — the caller's list is the store's.
 */
export function limitFacts(
  facts: readonly StoredFact[],
  limit: number | null,
): StoredFact[] {
  if (limit === null) return [...facts]
  if (limit <= 0) return []
  return [...facts].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

export interface Allowance {
  /** False once the weekly cap is spent — cleanup degrades, never blocks. */
  cleanupAllowed: boolean
  /** Words left this week, or null when uncapped. */
  remaining: number | null
}

/**
 * How much cleanup this user has left this week.
 *
 * Drives both the gate and the "1,847 / 2,000 words" counter, so the
 * number the user reads and the number that decides are the same one —
 * a counter that disagrees with the gate is worse than no counter.
 *
 * The week boundary is the caller's: the proxy buckets by ISO week so a
 * client clock cannot buy extra words by changing timezone.
 */
export function weeklyAllowance(wordsUsed: number, limit: number | null): Allowance {
  if (limit === null) return { cleanupAllowed: true, remaining: null }
  const used = Math.max(0, wordsUsed)
  return { cleanupAllowed: used < limit, remaining: Math.max(0, limit - used) }
}
