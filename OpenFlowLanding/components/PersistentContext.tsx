"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";
import { SectionHead } from "./SectionHead";
import { ScrollExpand } from "./ScrollExpand";

// Section 4 — hardest to explain, so: show the artifact, show it change.
// No metaphors, no diagram, no supporting bullet list.
//
// Mechanic mirrors src/main/context/compactor.ts — the overview
// re-compacts every 50 dictations while you're idle.

const SEEDED = "I'm building Yappr, a macOS dictation app. Electron + TypeScript. Groq for inference.";

const LEARNED = [
  "Transcription runs locally on whisper-large-v3-turbo.",
  "The polish pipeline lives in src/main/pipeline.ts.",
  "Working with Søren on the streaming refactor.",
];

export function PersistentContext() {
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true);
      return;
    }
    const id = window.setInterval(() => setGrown((g) => !g), 5200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section id="context" className="section section--warm">
      <div className="section-inner">
        <SectionHead
          num="03"
          eyebrow="Persistent context"
          pro
          title={
            <>
              Stop re-explaining your <em>project</em>.
            </>
          }
          lede={
            <>
              Claude gets a context window. Dictation never did — it starts
              blank every time you press the key. Yours won&rsquo;t.
            </>
          }
        />

        {/* Drawn as the app's real settings panel — "Background context" in
            AITab.tsx: heading, opt-in toggle, the overview textarea, then a
            status row with Refresh. A generic white card was pretending to
            be a product surface without matching one. */}
        <ScrollExpand from={0.94}>
          <div className="pc-panel">
            <div className="pc-panel-head">
              <div>
                <p className="pc-panel-title">Background context</p>
                <p className="pc-panel-desc">
                  Passed to cleanup so your polish sounds like you.
                </p>
              </div>
              <span className="pc-toggle" role="img" aria-label="Enabled">
                <span className="pc-toggle-knob" />
              </span>
            </div>

            <div className="pc-field">
              <span className="pc-seed">{SEEDED}</span>{" "}
              {LEARNED.map((clause, i) => (
                <span
                  key={i}
                  className={`pc-learned ${grown ? "in" : ""}`}
                  style={{ transitionDelay: grown ? `${i * 300}ms` : "0ms" }}
                >
                  {clause}{" "}
                </span>
              ))}
              <span className="pc-caret" aria-hidden="true" />
            </div>

            <div className="pc-panel-foot">
              <span className={`pc-status ${grown ? "on" : ""}`}>
                {grown ? "Refreshed just now" : "Auto-updates every 50 dictations"}
              </span>
              <span className="pc-btn">Refresh now</span>
            </div>
          </div>
        </ScrollExpand>

        {/* The oblique competitor line. Accurate as written: other voice
            tools do persist a personal dictionary — that's vocabulary, not
            project state. Don't sharpen this into "they have no memory". */}
        <Reveal delay={140}>
          <p className="pc-versus">
            Other voice tools learn your <em>vocabulary</em>. This one learns
            your <em>project</em>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
