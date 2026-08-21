"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Scroll-linked scale: the media starts inset and grows to full size as it
// rises into view, the way Apple opens a product shot. Continuous, not a
// one-shot reveal — it tracks scroll position the whole way up.
//
// Only `transform` is animated (MASTER.md motion rules), so this stays on
// the compositor and doesn't trigger layout.
//
// Do NOT wrap this in <Reveal>. Both write to `transform` on their own
// element and the two would fight; ScrollExpand replaces Reveal here.

export function ScrollExpand({
  children,
  /** Scale at the moment it enters the viewport. 1 = no growth. */
  from = 0.9,
  className = "",
}: {
  children: ReactNode;
  from?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(from);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setScale(1);
      return;
    }

    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;

      // 0 when the top edge is at the bottom of the viewport,
      // 1 once it has risen to 40% up the screen.
      const startAt = vh;
      const endAt = vh * 0.4;
      const raw = (startAt - rect.top) / (startAt - endAt);
      const p = Math.min(1, Math.max(0, raw));

      setScale(from + (1 - from) * p);
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
  }, [from]);

  return (
    <div
      ref={ref}
      className={`scroll-expand ${className}`}
      style={{ transform: `scale(${scale.toFixed(4)})` }}
    >
      {children}
    </div>
  );
}
