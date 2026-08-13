"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { WorkspaceScene } from "./WorkspaceScene";

// Section 2 — identity, not features, told as a scroll sequence: the scene
// pins, and one line at a time swaps beneath it. Never more than a single
// sentence on screen, because the image already says "four terminals open".
//
// Deliberately no stock photography and no borrowed likeness — a real
// person's face here would imply an endorsement nobody gave.

const BEATS: Array<{ line: string; em?: string }> = [
  { line: "You have four terminals open." },
  { line: "You think out loud." },
  { line: "Yappr makes it land", em: "clean." },
];

const APPS: Array<{ name: string; logo?: string }> = [
  { name: "Claude Code", logo: "/logos/claudecode.png" },
  { name: "Cursor", logo: "/logos/cursor.png" },
  { name: "Claude", logo: "/logos/claude.png" },
  { name: "ChatGPT", logo: "/logos/chatgpt.png" },
  { name: "Slack", logo: "/logos/slack.png" },
  { name: "Gmail", logo: "/logos/gmail.webp" },
  { name: "Notion", logo: "/logos/notion.png" },
  { name: "Terminal" },
  { name: "Warp" },
  { name: "VS Code" },
];

export function BuiltForBuilders() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No pinning to scrub — land on the payoff beat and stop.
      setBeat(2);
      return;
    }

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // How far through the pinned track we are, 0 → 1.
        const scrollable = rect.height - window.innerHeight;
        if (scrollable <= 0) return;
        const p = Math.min(1, Math.max(0, -rect.top / scrollable));
        setBeat(p < 0.34 ? 0 : p < 0.68 ? 1 : 2);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="builders" className="bfb">
      <div className="bfb-track" ref={trackRef}>
        <div className="bfb-pin">
          <div className="bfb-pin-inner">
            <p className="bfb-eyb">Who it&rsquo;s for</p>

            <div className="bfb-lines" aria-live="polite">
              {BEATS.map((b, i) => (
                <p key={i} className={`bfb-line ${beat === i ? "on" : ""}`}>
                  {b.line} {b.em && <em>{b.em}</em>}
                </p>
              ))}
            </div>

            <div className="bfb-scene">
              <WorkspaceScene beat={beat} />
            </div>

            <div className="bfb-dots" aria-hidden="true">
              {BEATS.map((_, i) => (
                <span key={i} className={beat === i ? "on" : ""} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bfb-foot">
        <div className="bfb-apps">
          <span className="bfb-apps-label">Works in</span>
          <ul>
            {APPS.map((a) => (
              <li key={a.name}>
                {a.logo ? (
                  <Image src={a.logo} alt="" width={20} height={20} />
                ) : (
                  <span className="bfb-app-glyph" aria-hidden="true">
                    {a.name.slice(0, 2)}
                  </span>
                )}
                <span>{a.name}</span>
              </li>
            ))}
            <li className="bfb-app-more">+ anywhere you can put a cursor</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
