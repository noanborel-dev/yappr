---
category: App UI
---

# Panel

The two shapes every Settings tab was rebuilding by hand: a hairline
card, and a labelled row inside it with its control on the right.

Before this, each tab wrote its own
  grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 border-b border-ink-08
which drifted — 13px vs 13.5px titles, py-3.5 vs py-4, some rows with a
trailing border and some without. One primitive, one rhythm.

Source: `src/renderer/shared/ui/Panel.tsx`
