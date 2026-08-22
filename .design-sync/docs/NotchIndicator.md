---
category: Landing
---

# NotchIndicator

The real Yappr indicator, not the old floating pill.

Ported from the app source: src/renderer/indicator/NotchIndicator.tsx and
notch-states.ts. The organizing rule is from that design handoff and must
survive any edit here: the shape is asymmetric with fixed meaning —
  LEFT wing  = input   (what Yappr is hearing)
  CENTRE     = the physical notch, never moves, paints nothing
  RIGHT wing = outcome (what Yappr did with it)

Values below are lifted from the app, not eyeballed. If the app changes,
re-pull rather than approximating:
  ACCENT #5A8FE8 · DANGER #E84A3A · shell #0A0B0F
  9 waveform bars, 2px wide, 2.5px gap, 13px max height
  label: Instrument Serif italic 13.5px

Square at the top, rounded only at the bottom — it hangs from the menu
bar. A fully rounded pill is the old design and reads as a different app.

Source: `YapprLanding/components/NotchIndicator.tsx`
