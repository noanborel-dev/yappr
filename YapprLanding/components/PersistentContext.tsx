"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHead } from "./SectionHead";
import { Reveal } from "./Reveal";
import { ScrollExpand } from "./ScrollExpand";

// Section 03 — the payoff, then what's behind it.
//
// Left: what Yappr is holding — how you write, and what you're building.
// Right: the preamble tax disappearing because it's holding it.
//
// The cards come first in reading order on purpose. "Stop re-explaining your
// project" is an abstract promise until you can see the two things it
// remembers written down.

const PREAMBLE = [
  "I'm building Yappr, a macOS dictation app.",
  "Stack is Electron + TypeScript, Groq for inference.",
  "Transcription runs locally on whisper-large-v3-turbo.",
  "The polish pipeline lives in src/main/pipeline.ts.",
  "I'm working with Søren on the streaming refactor.",
];

const ASK = "The pipeline drops chunks when Groq 429s — why?";

const STACK = ["TypeScript", "Electron", "Groq", "macOS"];

type Phase = "full" | "striking" | "collapsed";

export function PersistentContext() {
  const [phase, setPhase] = useState<Phase>("full");
  const [struck, setStruck] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clear();
    setPhase("full");
    setStruck(0);
    const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

    at(() => setPhase("striking"), 1400);
    PREAMBLE.forEach((_, i) => at(() => setStruck(i + 1), 1600 + i * 260));
    const done = 1600 + PREAMBLE.length * 260 + 500;
    at(() => setPhase("collapsed"), done);
    at(run, done + 4200);
  }, [clear]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("collapsed");
      setStruck(PREAMBLE.length);
      return;
    }
    run();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collapsed = phase === "collapsed";

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
          lede="Every conversation starts with the same five lines of setup. Yappr already knows them, so you skip to the question."
        />

        <ScrollExpand from={0.95}>
          <div className="px-stage">
            <div className="px-mem">
              {/* Preferences sits above the project card: it's the smaller,
                  more personal of the two, and it's what makes the output
                  sound like you rather than like a model. */}
              <div className="px-card px-card--pref">
                <span className="px-card-label">How you write</span>
                <p>Short prompts. No preamble, no pleasantries.</p>
                <p>
                  You say <em>&ldquo;the pipeline&rdquo;</em> and mean{" "}
                  <code>src/main/pipeline.ts</code>
                </p>
              </div>

              <div className="px-card px-card--proj">
                <span className="px-card-label">What you&rsquo;re building</span>
                <p className="px-proj-name">Yappr</p>
                <p className="px-proj-desc">
                  macOS dictation app. Transcription on-device, polish on Groq.
                </p>
                <div className="px-stack">
                  {STACK.map((t) => (
                    <span key={t} className="px-chip">
                      {t}
                    </span>
                  ))}
                </div>
                <span className="px-saved">
                  <i aria-hidden="true" />
                  Saved on this Mac. Kept up to date as you work.
                </span>
              </div>
            </div>

            <div className="px-right">
              <div className={`px-doc ${collapsed ? "is-collapsed" : ""}`}>
                <span className="px-label">
                  {collapsed ? "what you say now" : "what you type every time"}
                </span>

                <div className="px-lines">
                  {PREAMBLE.map((line, i) => (
                    <p
                      key={i}
                      className={`px-pre ${i < struck ? "struck" : ""} ${
                        collapsed ? "gone" : ""
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                  <p className="px-ask">{ASK}</p>
                </div>
              </div>

              <p className={`px-caption ${collapsed ? "in" : ""}`}>
                Yappr already told it the rest.
              </p>
            </div>
          </div>
        </ScrollExpand>

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
