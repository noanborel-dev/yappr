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
}

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
}

const FULL: Entitlements = {
  promptShaping: true,
  selectAndRewrite: true,
  perAppPolish: true,
  contextOverview: true,
  factLimit: null,
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
