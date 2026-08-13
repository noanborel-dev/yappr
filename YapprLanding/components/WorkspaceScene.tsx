"use client";

import { useEffect, useState } from "react";
import { NotchIndicator } from "./NotchIndicator";

// A builder's desk, composed from real window chrome rather than described
// in copy. Driven by a `beat` from the scroll sequence above it:
//   0 — four tabs open, nothing happening yet
//   1 — you're talking; the raw ramble is in the prompt box
//   2 — it landed structured, and Claude is working
//
// Everything is CSS. No stock photography, nothing to license.

const TABS = ["claude", "dev", "tests", "logs"];

const RAMBLE =
  "ok so stream the cleanup instead of waiting for the whole thing, and um if groq 429s just fall back to local whisper";

const SHAPED = [
  { h: "## Goal" },
  { t: "Stream cleanup output instead of buffering the full transcript." },
  { h: "## Tasks" },
  { t: "1. Stream chunks as they arrive.", n: true },
  { t: "2. Fall back to local whisper on 429.", n: true },
];

const RUN_LINES = [
  { t: "Streaming chunks from the polish pipeline", done: true },
  { t: "Adding whisper.cpp fallback on 429", done: false },
];

export function WorkspaceScene({ beat }: { beat: 0 | 1 | 2 }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (beat !== 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [beat]);

  return (
    <div className="ws" aria-hidden="true">
      <div className="ws-win ws-win--editor">
        <div className="ws-bar">
          <span className="ws-tl r" /><span className="ws-tl y" /><span className="ws-tl g" />
        </div>
        <div className="ws-editor-body">
          <div className="ws-side"><span /><span /><span /><span /><span /></div>
          <div className="ws-code">
            <div><i>37</i> <b>async</b> polish(chunks) {"{"}</div>
            <div><i>38</i>   <b>const</b> r = <b>await</b> groq.clean(c)</div>
            <div><i>39</i>   <b>return</b> r.text</div>
            <div><i>40</i> {"}"}</div>
          </div>
        </div>
      </div>

      <div className="ws-win ws-win--browser">
        <div className="ws-bar">
          <span className="ws-tl r" /><span className="ws-tl y" /><span className="ws-tl g" />
          <span className="ws-url">localhost:3000</span>
        </div>
        <div className="ws-browser-body">
          <span className="ws-blk w70" /><span className="ws-blk w40" />
          <span className="ws-blk w85" /><span className="ws-blk w55" />
        </div>
      </div>

      <div className="ws-win ws-win--term">
        <div className="ws-bar ws-bar--tabs">
          <span className="ws-tl r" /><span className="ws-tl y" /><span className="ws-tl g" />
          <span className="ws-tabs">
            {TABS.map((t, i) => (
              <span key={t} className={`ws-tab ${i === 0 ? "on" : ""}`}>
                {t}
                {i === 0 && beat === 2 && <span className="ws-tab-dot" />}
              </span>
            ))}
          </span>
        </div>

        <div className="ws-term-body">
          {beat === 0 && (
            <div className="ws-idle">
              <span className="ws-chev">&gt;</span>
              <span className="ws-caret" />
            </div>
          )}

          {beat === 1 && (
            <div className="ws-prompt ws-fade">
              <span className="ws-chev">&gt;</span> {RAMBLE}
            </div>
          )}

          {beat === 2 && (
            <div className="ws-fade">
              <div className="ws-shaped">
                {SHAPED.map((l, i) => (
                  <div
                    key={i}
                    className={`ws-shaped-line ${l.h ? "h" : ""} ${l.n ? "n" : ""}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {l.h ?? l.t}
                  </div>
                ))}
              </div>

              <div className="ws-run">
                {RUN_LINES.map((l) => (
                  <div key={l.t} className={`ws-run-line ${l.done ? "done" : ""}`}>
                    <span className="ws-run-mark">{l.done ? "✓" : "✻"}</span>
                    {l.t}
                  </div>
                ))}
              </div>

              <div className="ws-status">
                <span className="ws-spin" />
                Working… <span className="ws-dim">({12 + (tick % 40)}s)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top of the desk — the notch hangs from the menu bar, never floats
          over a window. */}
      <div className="ws-menubar" />
      <div className="ws-notch">
        <NotchIndicator
          state={beat === 0 ? "idle" : beat === 1 ? "recording" : "done"}
          notchWidth={104}
        />
      </div>
    </div>
  );
}
