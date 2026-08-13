"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A chapter break: one full viewport, one enormous line, nothing else.
// Apple uses these constantly between feature movements — they cost almost
// no content and they're what stops a long page feeling like a list.
//
// The type scales and fades against scroll position rather than firing once,
// so it feels like it arrives rather than pops.

export function Statement({
  children,
  sub,
  tone = "cream",
}: {
  children: ReactNode;
  sub?: string;
  tone?: "cream" | "dark";
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
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 as it enters from the bottom, 1 once its centre reaches mid-screen.
      const centre = rect.top + rect.height / 2;
      const raw = 1 - Math.abs(centre - vh / 2) / (vh * 0.85);
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

  // Never fully transparent — a statement that vanishes reads as broken.
  const opacity = 0.25 + p * 0.75;
  const scale = 0.94 + p * 0.06;

  return (
    <section className={`stmt stmt--${tone}`} ref={ref}>
      <div
        className="stmt-inner"
        style={{ opacity, transform: `scale(${scale.toFixed(4)})` }}
      >
        <p className="stmt-line">{children}</p>
        {sub && <p className="stmt-sub">{sub}</p>}
      </div>
    </section>
  );
}
