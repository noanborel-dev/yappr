"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Opens to full screen as you scroll into it. The child starts inset with
// rounded corners and grows edge-to-edge, corners squaring off — Apple's
// expanding-media move.
//
// Driven by `clip-path: inset()` rather than width/height. Animating width
// would trigger layout on every frame and reflow the text inside it (which
// is the reason MASTER.md forbids it); clip-path is composited and leaves
// the content completely still while the frame around it opens.

export function ScrollFullBleed({
  children,
  /** Horizontal inset at rest, px. Matches the page's normal side margin. */
  inset = 136,
  /** Corner radius at rest, px. */
  radius = 28,
}: {
  children: ReactNode;
  inset?: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 as the top edge enters from below, 1 once it has risen to a
      // third of the way up the screen.
      const raw = (vh - r.top) / (vh * 0.66);
      setP(Math.min(1, Math.max(0, raw)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const x = Math.round((1 - p) * inset);
  const r = Math.round((1 - p) * radius);

  return (
    <div
      ref={ref}
      className="sfb"
      style={{ clipPath: `inset(0 ${x}px round ${r}px)` }}
    >
      {children}
    </div>
  );
}
