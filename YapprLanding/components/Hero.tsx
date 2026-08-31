"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClaudeCodeShell, type PromptLine } from "./shells/ClaudeCodeShell";
import { NotchIndicator } from "./NotchIndicator";

// One scenario, looped. The old three-app cycle (Slack → iMessage → Gmail)
// is gone: the structured prompt needs real dwell time to be readable, and
// the cycle was spending those seconds elsewhere.

type Phase = "idle" | "listening" | "polishing" | "landed";

// What lands. This is the real `ai_prompt` output shape from
// src/shared/prompts.ts — sections, not a tidied sentence.
const SHAPED: PromptLine[] = [
  { kind: "heading", text: "## Goal" },
  {
    kind: "text",
    text: "Stream cleanup output instead of waiting for the full transcript.",
  },
  { kind: "blank" },
  { kind: "heading", text: "## Tasks" },
  { kind: "item", text: "Refactor the polish pipeline to stream chunks as they arrive." },
  // Vendor name out. This is a demo of a prompt someone dictates, but it
  // is on our page under our name, and a reader takes it as ours.
  { kind: "item", text: "Fall back to the local model when the API rate-limits." },
  { kind: "blank" },
  { kind: "heading", text: "## Constraints" },
  { kind: "bullet", text: "Don't touch the tests." },
];

// The hero used to stream the raw ramble into a "heard" bubble under the
// terminal, filler struck through as the cleanup dropped it. It is gone.
//
// It invited the wrong kind of attention: a reader arriving at the top of
// the page started auditing the transcript — which words were cut, why
// that one and not this one — before they had been told what the product
// does. The hero has one job, which is to show the gesture: Yappr
// listening, then the prompt landing. The detail of what cleanup removes
// is argued properly further down the page, in prompt shaping, where
// there is room for it and the reader is ready.
//
// Removing it also leaves the notch as the only moving thing up here,
// which is the point — it is the product.
const LEAD_IN_MS = 400;
// Long enough to read as listening rather than as a blink. The notch runs
// its waveform for this whole stretch, and it is now the only thing on
// screen carrying the beat, so it cannot be brief.
const LISTEN_MS = 2400;
const PROCESS_MS = 700;
const FLASH_MS = 600;
// Hold the landed state long enough to actually read the sections.
const HOLD_MS = 6200;

export function Hero() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [flashing, setFlashing] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cleanup = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    timeouts.current.push(setTimeout(fn, delay));
  }, []);

  const run = useCallback(() => {
    cleanup();
    setPhase("idle");
    setFlashing(false);

    // Four beats, each one starting where the last ended: hold, listen,
    // think, land. Written as running totals rather than offsets from a
    // computed midpoint, so changing how long the notch listens for does
    // not silently move the paste.
    const listenAt = LEAD_IN_MS;
    const polishAt = listenAt + LISTEN_MS;
    const landAt = polishAt + PROCESS_MS;

    schedule(() => setPhase("listening"), listenAt);
    schedule(() => setPhase("polishing"), polishAt);
    schedule(() => {
      setPhase("landed");
      setFlashing(true);
    }, landAt);
    schedule(() => setFlashing(false), landAt + FLASH_MS);
    schedule(run, landAt + HOLD_MS);
  }, [cleanup, schedule]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // No loop — show the end state and stop, per MASTER.md motion rules.
      setPhase("landed");
      return;
    }
    run();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const landed = phase === "landed";

  // The cue runs for both beats BEFORE the paste — listening and
  // polishing — and stops the moment the text lands. Covering both rather
  // than just listening avoids a blink in the 700ms while Yappr is
  // thinking, which would read as the cue breaking rather than as a
  // change of state.
  const cueing = phase === "listening" || phase === "polishing";

  return (
    <section
      id="hero"
      className="max-w-[1340px] mx-auto px-8 pt-10 pb-[10vh] min-h-[92vh] flex flex-col justify-center"
    >
      <div className="hero-grid">
        <div>
          <h1 className="font-serif font-normal text-[clamp(52px,7.4vw,88px)] leading-[0.94] tracking-[-0.02em] m-0 mb-6">
            stop writing bad prompts
            <br />
            <em>out loud</em>.
          </h1>
          <p className="text-[18px] text-ink-2 max-w-[440px] leading-[1.5] mb-9 m-0">
            Talk however you talk. It lands as Goal, Context, Tasks, Done when.
          </p>

          {/* No "free, no card" line under the button. Pricing says it
              twice already, and in the hero it answered a question
              nobody has yet — the reader has not been told there is a
              paid tier, so a reassurance about billing is the first
              mention of billing. */}
          <a href="#download" className="btn-primary">
            Start yapping
            <span className="btn-chip">macOS</span>
          </a>
        </div>

        <div className="hero-right">
          {/* Points at the notch while Yappr is listening.
              This replaced a glow-and-ripple treatment on the notch
              itself. That lit the right object but read as atmosphere —
              you noticed the screen was prettier, not that something was
              happening. An arrow is unambiguous: it has a direction, and
              a thing with a direction makes you look where it points.
              It lives OUTSIDE the screen, in the page's own space, because
              .hero-stage clips to the bezel and there is no room inside —
              the terminal window starts about 15px below the notch. */}
          <span
            className={`notch-arrow ${cueing ? "on" : ""}`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 18 46" fill="none" stroke="currentColor">
              <path
                d="M9 2 V 36"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M2.5 29 L 9 37.5 L 15.5 29"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="hero-stage hero-stage--term">
            <div className="hero-app active">
              <ClaudeCodeShell
                lines={landed ? SHAPED : []}
                caret={!landed}
                flashing={flashing}
              />
            </div>

            <div className="hero-menubar" aria-hidden="true" />

            {/* The indicator hangs from the TOP of the screen, in the notch —
                that's where the real app lives. A lozenge floating in the
                middle of a window is the old design and the wrong place. */}
            <div className="hero-notch">
              <NotchIndicator
                state={
                  phase === "idle"
                    ? "idle"
                    : phase === "listening"
                      ? "recording"
                      : phase === "polishing"
                        ? "processing"
                        : "done"
                }
                notchWidth={140}
              />
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
