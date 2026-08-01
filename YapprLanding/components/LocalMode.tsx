"use client";

import { useEffect, useState } from "react";

type Tier = {
  id: "fast" | "balanced" | "accurate";
  name: string;
  size: string;
  latency: string;
  blurb: string;
  recommended?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "fast",
    name: "Fast",
    size: "57 MB",
    latency: "~100 ms",
    blurb: "Tiny, multilingual, great for snippets.",
  },
  {
    id: "balanced",
    name: "Balanced",
    size: "181 MB",
    latency: "~200 ms",
    blurb: "Sub-300ms warm. Near-perfect for English.",
    recommended: true,
  },
  {
    id: "accurate",
    name: "Accurate",
    size: "547 MB",
    latency: "~1000 ms",
    blurb: "Highest accuracy. Auto-elevates in IDEs.",
  },
];

export function LocalMode() {
  // The radar-style pill cycles through tiers to convey "pick your speed."
  const [activeIdx, setActiveIdx] = useState(1); // Balanced by default

  useEffect(() => {
    const id = window.setInterval(
      () => setActiveIdx((i) => (i + 1) % TIERS.length),
      2800,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <section id="local" className="max-w-[1240px] mx-auto px-8 py-16">
      <div
        className="lm-card"
        style={{ boxShadow: "0 30px 60px -30px rgba(20,30,50,.18)" }}
      >
        <div className="lm-grid">
          {/* Left — story */}
          <div className="lm-left">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-accent mb-3">
              Local mode
            </p>
            <h2 className="font-serif font-normal text-[clamp(44px,6vw,68px)] leading-[0.95] tracking-[-0.02em] m-0 mb-5">
              Whisper, <em>on your Mac</em>.
            </h2>
            <p className="text-[17px] text-ink-2 leading-[1.55] m-0 mb-5 max-w-[520px]">
              Transcription runs on-device — your audio never leaves your
              machine. Three tiers, bundled with the app, ready in two clicks.
              Sub-300ms once the model is warm.
            </p>

            <ul className="lm-bullets">
              <li>
                <span className="lm-bullet-dot" />
                Audio stays on your Mac. No upload, no key.
              </li>
              <li>
                <span className="lm-bullet-dot" />
                Polish still calls Groq's Llama for cleanup —{" "}
                <em>local</em> means transcription, not full offline.
              </li>
              <li>
                <span className="lm-bullet-dot" />
                Auto-elevates to Accurate inside Cursor, VS Code, Terminal.
              </li>
            </ul>
          </div>

          {/* Right — tier picker */}
          <div className="lm-right">
            <div className="lm-mac" aria-hidden="true">
              <span className="lm-mac-label">your Mac</span>

              <div className="lm-tiers">
                {TIERS.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`lm-tier ${activeIdx === i ? "on" : ""}`}
                    onClick={() => setActiveIdx(i)}
                    aria-pressed={activeIdx === i}
                  >
                    <div className="lm-tier-head">
                      <span className="lm-tier-name">{t.name}</span>
                      {t.recommended ? (
                        <span className="lm-tier-rec">recommended</span>
                      ) : null}
                    </div>
                    <div className="lm-tier-meta">
                      <span className="lm-tier-latency">{t.latency}</span>
                      <span className="lm-tier-sep">·</span>
                      <span className="lm-tier-size">{t.size}</span>
                    </div>
                    <p className="lm-tier-blurb">{t.blurb}</p>

                    {/* Mini activity bars when this tier is active */}
                    <span
                      className={`lm-tier-bars ${activeIdx === i ? "live" : ""}`}
                      aria-hidden="true"
                    >
                      <span /><span /><span /><span /><span />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
