"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PillLogo } from "./PillLogo";

// Where Yappr works, as an orbit rather than a list.
//
// This replaces a "Works in" label with a row of logos after it. The row
// said the same thing, but a row is read left to right and then finished;
// a ring has no end, which is closer to the claim being made.
//
// The logos rise from below the fold on a line, arc outward, and settle
// into a ring around the mark. The ring is left OPEN at the bottom, where
// they came in — a closed circle reads as a finished diagram, and the gap
// keeps the path they travelled visible in the final state.
//
// Scroll-driven with a tall track and a sticky stage, the same mechanism
// FinalCTA and the old pinned section use. No new dependencies: the
// position of every logo is one interpolation against scroll progress, and
// the continuous spin is a CSS animation that only runs once the ring has
// formed.

const APPS: Array<{ name: string; logo: string }> = [
  { name: "Claude Code", logo: "/logos/claudecode.png" },
  { name: "Cursor", logo: "/logos/cursor.png" },
  { name: "Claude", logo: "/logos/claude.png" },
  { name: "ChatGPT", logo: "/logos/chatgpt.png" },
  { name: "Slack", logo: "/logos/slack.png" },
  { name: "Gmail", logo: "/logos/gmail.webp" },
  { name: "Notion", logo: "/logos/notion.png" },
  { name: "iMessage", logo: "/logos/imessage.png" },
];

// The ring spans 310°, not 360°. The 50° gap sits at the bottom — the
// direction the logos arrive from.
const ARC_START = 115;
const ARC_SPAN = 310;

// Radius as a fraction of the stage's short side, so the ring scales with
// the viewport instead of overflowing it on a laptop.
const RADIUS_RATIO = 0.34;

/** Ease-out: the logos decelerate into the ring rather than snapping. */
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function LogoOrbit() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [radius, setRadius] = useState(220);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // Reduced motion gets the end state, still. The point of the section
    // is which apps are supported, and that is only legible once formed.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }

    let frame = 0;
    const measure = () => {
      const stage = stageRef.current;
      if (stage) {
        const short = Math.min(stage.clientWidth, stage.clientHeight);
        setRadius(Math.max(120, short * RADIUS_RATIO));
      }
    };
    const update = () => {
      frame = 0;
      const r = track.getBoundingClientRect();
      const scrollable = r.height - window.innerHeight;
      if (scrollable <= 0) return;
      // Formed by 80% of the track, so the ring holds for a beat before
      // the section releases rather than completing on the last pixel.
      setP(Math.min(1, Math.max(0, -r.top / (scrollable * 0.8))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      onScroll();
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const t = ease(p);

  return (
    <section id="builders" className="orb" ref={trackRef}>
      <div className="orb-pin">
        <div className="orb-stage" ref={stageRef}>
          {/* TWO rotations, on two elements, on purpose.
              A CSS animation beats an inline style, so putting the
              continuous spin and the scroll-driven turn on the same node
              silently drops the scroll one — which is what tilted every
              logo mid-formation. The outer node owns the endless spin,
              the inner owns the scroll. Each logo undoes both, one level
              at a time. */}
          <div
            className="orb-spin"
            style={{ animationPlayState: p > 0.6 ? "running" : "paused" }}
          >
          <div className="orb-ring" style={{ transform: `rotate(${p * 200}deg)` }}>
            {APPS.map((app, i) => {
              const angle =
                ((ARC_START + (i * ARC_SPAN) / (APPS.length - 1)) * Math.PI) / 180;
              // Where it ends: a point on the ring.
              const endX = Math.cos(angle) * radius;
              const endY = Math.sin(angle) * radius;
              // Where it starts: spread along a line below the stage, in
              // the order they will occupy, so nothing crosses over.
              const spread = (i / (APPS.length - 1) - 0.5) * radius * 1.6;
              const startX = spread;
              const startY = radius * 2.4;

              const x = startX + (endX - startX) * t;
              const y = startY + (endY - startY) * t;

              return (
                <div
                  key={app.name}
                  className="orb-slot"
                  style={{
                    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                    opacity: Math.min(1, p * 3),
                  }}
                >
                  {/* Undoes both turns so the marks stay upright — a
                      rotating Slack logo reads as a loading spinner, not
                      as an app. Outer cancels the endless spin, inner
                      cancels the scroll. */}
                  <div
                    className="orb-counter"
                    style={{ animationPlayState: p > 0.6 ? "running" : "paused" }}
                  >
                    <div className="orb-logo" style={{ transform: `rotate(${-p * 200}deg)` }}>
                      <Image src={app.logo} alt={app.name} width={74} height={74} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>

          <div className="orb-core" style={{ opacity: Math.min(1, p * 2.2) }}>
            <PillLogo size="lg" shape="square" />
            <p className="orb-core-line">wherever you type</p>
          </div>
        </div>
      </div>
    </section>
  );
}
