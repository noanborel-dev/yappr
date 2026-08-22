// The wordmark now lives in YapprMark, with every other lockup.
//
// This file used to hold its own pill — a #0E1018→#08090E gradient, #FFF
// text, the font stack written longhand — while the notch drew the same
// mark from different values. Three copies of one logo is how a logo
// stops being one logo.
//
// Kept as a re-export so the existing <Wordmark size="inline" /> call
// sites did not all have to change in the same commit as the unification.

export { Wordmark, YapprMark } from './YapprMark'
export type { MarkLockup, MarkTone, MarkSize, YapprMarkProps } from './YapprMark'
