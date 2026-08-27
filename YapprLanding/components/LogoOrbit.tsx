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

// Ordered so the builder tools sit together and the places you send
// things sit together — the ring is read as an arc, not a list, so
// neighbours matter more than sequence.
const APPS: Array<{ name: string; logo: string; invert?: boolean; wide?: boolean }> = [
  { name: "Claude Code", logo: "/logos/claudecode.png" },
  { name: "Codex", logo: "/logos/codex.png", invert: true, wide: true },
  { name: "Cursor", logo: "/logos/cursor.png" },
  { name: "Replit", logo: "/logos/replit.webp" },
  { name: "Lovable", logo: "/logos/lovable.webp" },
  { name: "Claude", logo: "/logos/claude.png" },
  { name: "ChatGPT", logo: "/logos/chatgpt.webp" },
  { name: "Slack", logo: "/logos/slack.png" },
  { name: "Gmail", logo: "/logos/gmail.webp" },
  { name: "Notion", logo: "/logos/notion.png" },
  { name: "iMessage", logo: "/logos/imessage.png" },
];

// The ring spans 310°, not 360°. The 50° gap sits at the bottom — the
// direction the logos arrive from.
const ARC_START = 115;
const ARC_SPAN = 310;

// The ring should fill the frame, so it is sized off BOTH axes and takes
// whichever is tighter. Off the short side alone it came out at about a
// third of the screen — a small cluster near the middle with the section
// empty around it.
const RADIUS_W = 0.32;
const RADIUS_H = 0.38;   // clears the sticky nav at the top of the ring

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
        setRadius(
          Math.max(
            140,
            Math.min(stage.clientWidth * RADIUS_W, stage.clientHeight * RADIUS_H),
          ),
        );
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
          {/* ONE rotation, and only once the ring exists.
              There used to be a second, scroll-driven one on the ring
              itself. It rotated the INCOMING LINE as well as the formed
              ring — so instead of rising from the bottom, the logos swung
              out to the side and stacked against the left edge of the
              screen, half of them cut off. Turning a circle that has not
              been drawn yet has no meaning; the spin waits for the ring. */}
          <div
            className="orb-spin"
            style={{ animationPlayState: p > 0.6 ? "running" : "paused" }}
          >
          <div className="orb-ring">
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
                  {/* Cancels the endless spin so the marks stay upright —
                      a rotating Slack logo reads as a loading spinner,
                      not as an app. One rotation to undo now, not two. */}
                  <div
                    className="orb-counter"
                    style={{ animationPlayState: p > 0.6 ? "running" : "paused" }}
                  >
                    {/* `invert` is for marks supplied as WHITE artwork —
                        Codex ships as a white wordmark, which is
                        invisible on cream. Inverting a white-on-
                        transparent PNG gives black on transparent, alpha
                        intact, which is the mark as it would be drawn for
                        a light background.
                        `wide` is for wordmarks rather than icons: forcing
                        one into a square box scales it down until it is
                        unreadable, so it gets width instead. */}
                    <div className={`orb-logo ${app.wide ? "is-wide" : ""}`}>
                      <Image
                        src={app.logo}
                        alt={app.name}
                        width={app.wide ? 150 : 96}
                        height={96}
                        style={app.invert ? { filter: "invert(1)" } : undefined}
                      />
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
