---
category: App UI
---

# NotchMark

The recording indicator, drawn at Settings scale.

This replaces MiniPill — a rounded liquid-glass lozenge with a timer,
which was a faithful miniature of an indicator the app stopped shipping.
Every mock in Settings that showed one was teaching users to look for
something that no longer exists.

The state table is IMPORTED from the real indicator rather than copied,
so a label or accent that changes there changes here. The organizing
rule survives from the design handoff and must survive any edit:

  LEFT wing  = input   (what Yappr is hearing)
  CENTRE     = the physical notch. Never moves, paints nothing.
  RIGHT wing = outcome (what Yappr did with it)

Square at the top, rounded only at the bottom — it HANGS from the menu
bar. Which is also why it may never float in the middle of a mock: use
<MenuBar> to give it an edge to hang from, or leave it out.

Source: `src/renderer/shared/ui/NotchMark.tsx`
