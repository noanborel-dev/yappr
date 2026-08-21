"use client";

import { useEffect, useRef, useState } from "react";
import { PillLogo } from "./PillLogo";

// The last thing on the page, so it gets the biggest gesture: the panel
// PINS — scrolling stops — and opens from an inset card to full screen
// while you keep scrolling. Then it releases and the footer follows.
//
// Two things worth not undoing:
//  1. It opens via clip-path, not width/height. Animating the box would
//     reflow the headline on every frame; clipping is composited, so the
//     type sits perfectly still while the frame opens around it.
//  2. The pin is a tall track + a sticky child, the same mechanism as
//     BuiltForBuilders. Its parent must never get overflow:hidden — that
//     silently kills position:sticky.

export function FinalCTA() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    const el = trackRef.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const scrollable = r.height - window.innerHeight;
      if (scrollable <= 0) return;
      // Fully open by ~70% of the track, so it holds at full screen for a
      // beat before releasing rather than snapping open at the last pixel.
      setP(Math.min(1, Math.max(0, -r.top / (scrollable * 0.7))));
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

  const inset = Math.round((1 - p) * 140);
  const top = Math.round((1 - p) * 56);
  const radius = Math.round((1 - p) * 28);

  return (
    <section id="download" className="cta-track" ref={trackRef}>
      <div className="cta-pin">
        <div
          className="cta-clip"
          style={{ clipPath: `inset(${top}px ${inset}px round ${radius}px)` }}
        >
          <div className="cta-panel">
            <h2 className="cta-title">
              Go on then.
              <br />
              <em>Start yapping.</em>
            </h2>
            <p className="cta-sub">
              Unlimited dictation, free. $9/mo when you want the rest.
            </p>
            <a href="#" className="btn-primary btn-primary--lg">
              Start yapping
              <span className="btn-chip">macOS</span>
            </a>
            <p className="cta-fine">No card required.</p>
            <div className="cta-mark">
              <PillLogo size="md" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
