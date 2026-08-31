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

// The setup lines are demo content, but they are shown under the Yappr
// name on a public page, so they doubled as an architecture disclosure —
// naming the inference vendor and, until now, a transcription model the
// product had already retired. Both are the sort of detail that dates the
// page and that no visitor is here to evaluate.
//
// They still have to read like something a developer would actually say,
// or the demo stops being convincing. Specific about the WORK, silent
// about the suppliers.
const PREAMBLE = [
  "I'm building Yappr, a macOS dictation app.",
  "Stack is Electron and TypeScript.",
  "Transcription runs on-device.",
  "The polish pipeline lives in src/main/pipeline.ts.",
  "I'm working with Søren on the streaming refactor.",
];

const ASK = "The pipeline drops chunks under load — why?";

const STACK = ["TypeScript", "Electron", "macOS"];

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
          // No lede, for the second time and the same reason. "Every
          // conversation starts with the same five lines of setup" came
          // out first; "It already knows. You skip to the question." has
          // now followed it. The stage below IS those five lines being
          // struck out one at a time, and the question surviving at the
          // bottom — stating the outcome above the animation turns it
          // into an illustration of the sentence instead of the argument.
        />

        <ScrollExpand from={0.95}>
          <div className="px-stage">
            <div className="px-mem">
              {/* A pulse of light each time a line is absorbed, entering
                  from the document side. Keyed on the strike count so
                  React remounts it and the one-shot animation replays —
                  the alternative is a boolean plus a timeout to clear it,
                  which is state that can desync from the thing it is
                  supposed to be following. */}
              {struck > 0 && <span key={struck} className="px-absorb" aria-hidden="true" />}

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
                  macOS dictation app. Transcription runs on-device.
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
          {/* Stays, and stays exact. Rival tools DO persist a personal
              dictionary, so the honest claim is vocabulary vs project —
              never "they have no memory". */}
          <p className="pc-versus">
            Other voice tools learn your <em>vocabulary</em>. This one learns
            your <em className="is-ours">project</em>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
