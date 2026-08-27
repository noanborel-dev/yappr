"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClaudeCodeShell, type PromptLine } from "./shells/ClaudeCodeShell";
import { NotchIndicator } from "./NotchIndicator";

// One scenario, looped. The old three-app cycle (Slack → iMessage → Gmail)
// is gone: the structured prompt needs real dwell time to be readable, and
// the cycle was spending those seconds elsewhere.

type Phase = "idle" | "listening" | "polishing" | "landed";

// What you actually say. `strike` chunks are the filler the cleanup drops.
const RAMBLE: Array<{ text: string; strike?: boolean }> = [
  { text: "ok so the polish pipeline " },
  { text: "um " , strike: true },
  { text: "it waits for the whole transcript before it does anything, " },
  { text: "I want it to stream chunks instead " },
  { text: "and if Groq 429s just fall back to local whisper, " },
  { text: "oh and don't touch the tests" },
];

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
  { kind: "item", text: "Fall back to local whisper.cpp when Groq returns 429." },
  { kind: "blank" },
  { kind: "heading", text: "## Constraints" },
  { kind: "bullet", text: "Don't touch the tests." },
];

const CHUNK_START = 700;
const CHUNK_STEP = 300;

export function Hero() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [chunks, setChunks] = useState<typeof RAMBLE>([]);
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
    setChunks([]);
    setFlashing(false);

    schedule(() => setPhase("listening"), 400);

    RAMBLE.forEach((chunk, i) => {
      schedule(
        () => setChunks((prev) => [...prev, chunk]),
        CHUNK_START + i * CHUNK_STEP,
      );
    });

    const polishAt = CHUNK_START + RAMBLE.length * CHUNK_STEP + 500;
    schedule(() => setPhase("polishing"), polishAt);
    schedule(() => {
      setPhase("landed");
      setFlashing(true);
    }, polishAt + 700);
    schedule(() => setFlashing(false), polishAt + 1300);

    // Hold the landed state long enough to actually read the sections.
    schedule(run, polishAt + 6200);
  }, [cleanup, schedule]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // No loop — show the end state and stop, per MASTER.md motion rules.
      setPhase("landed");
      setChunks(RAMBLE);
      return;
    }
    run();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const landed = phase === "landed";

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

            <div className="hero-pill-region">
              <div className={`caption ${phase !== "idle" ? "show" : ""}`}>
                <span className="caption-label">heard</span>
                <div className="raw">
                  {chunks.map((c, i) =>
                    c.strike ? (
                      <span key={i} className="strike">
                        {c.text}
                      </span>
                    ) : (
                      <span key={i}>{c.text}</span>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
