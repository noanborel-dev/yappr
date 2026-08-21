"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHead } from "./SectionHead";
import { ClaudeCodeShell, type PromptLine } from "./shells/ClaudeCodeShell";

// Section 01 — plays like a short demo video rather than sitting there as a
// before/after. The sequence:
//   listening  — the ramble streams in word by word, the way you'd say it
//   polishing  — filler strikes through and drops out
//   writing    — the structured prompt types itself, section by section, and
//                as each line lands the phrase it came FROM lights up above
//   hold       — full result, then loop
//
// That last beat is the point of the whole thing: it shows nothing was
// summarised away, it was just moved somewhere.

type Phase = "idle" | "listening" | "polishing" | "writing" | "hold";

const SAID: Array<{ id: string; text: string; drop?: boolean }> = [
  { id: "a", text: "onboarding is broken for google signups," },
  { id: "x1", text: "um,", drop: true },
  { id: "b", text: "they hit the dashboard before the workspace exists so it 404s," },
  { id: "x2", text: "can you", drop: true },
  { id: "c", text: "fix it and add a test," },
  { id: "d", text: "don't touch email signup" },
];

// Flattened to words so the transcript arrives at speaking pace.
const WORDS = SAID.flatMap((chunk) =>
  chunk.text.split(" ").map((w) => ({ w, id: chunk.id, drop: chunk.drop })),
);

// Same PromptLine shape the hero's Claude Code shell renders, so both
// sections show the identical UI — `src` just tags which spoken phrase each
// line came from, for the highlight.
type OutLine = PromptLine & { src?: string };

const OUT: OutLine[] = [
  { kind: "heading", text: "## Goal" },
  { kind: "text", text: "Fix the onboarding redirect for Google sign-ups.", src: "a" },
  { kind: "blank" },
  { kind: "heading", text: "## Context" },
  {
    kind: "text",
    text: "Users reach the dashboard before their workspace exists, so it 404s.",
    src: "b",
  },
  { kind: "blank" },
  { kind: "heading", text: "## Tasks" },
  { kind: "item", text: "Fix the race in the callback handler.", src: "c" },
  { kind: "item", text: "Add a test for a fresh Google signup.", src: "c" },
  { kind: "blank" },
  { kind: "heading", text: "## Constraints" },
  { kind: "bullet", text: "Don't touch the email signup path.", src: "d" },
];

const WORD_MS = 72;
const LINE_MS = 300;

export function PromptShaping() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [spoken, setSpoken] = useState(0);
  const [written, setWritten] = useState(0);
  const [active, setActive] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const at = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const play = useCallback(() => {
    clear();
    setPhase("idle");
    setSpoken(0);
    setWritten(0);
    setActive(null);

    at(() => setPhase("listening"), 350);

    WORDS.forEach((_, i) => {
      at(() => setSpoken(i + 1), 550 + i * WORD_MS);
    });

    const spokeFor = 550 + WORDS.length * WORD_MS;
    at(() => setPhase("polishing"), spokeFor + 400);

    const writeAt = spokeFor + 1250;
    at(() => setPhase("writing"), writeAt);
    OUT.forEach((line, i) => {
      at(() => {
        setWritten(i + 1);
        setActive(line.src ?? null);
      }, writeAt + i * LINE_MS);
    });

    const done = writeAt + OUT.length * LINE_MS;
    at(() => {
      setPhase("hold");
      setActive(null);
    }, done);
    at(play, done + 3400);
  }, [clear, at]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("hold");
      setSpoken(WORDS.length);
      setWritten(OUT.length);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) play();
        else clear();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, [play, clear]);

  const dropping = phase === "polishing" || phase === "writing" || phase === "hold";

  return (
    <section id="features" className="section section--grid">
      <div className="section-inner">
        <SectionHead
          num="01"
          eyebrow="Prompt shaping"
          pro
          title={
            <>
              Rambling in. <em>Sections</em> out.
            </>
          }
          lede="Watch where every piece goes. Nothing is summarised away — it's just filed."
        />

        <div className="ps-stage" ref={hostRef}>
          {/* What you said */}
          <div className={`ps-said ${phase === "idle" ? "dim" : ""}`}>
            <span className="ps-said-label">you said</span>
            <p>
              {WORDS.slice(0, spoken).map((w, i) => (
                <span
                  key={i}
                  className={[
                    "ps-w",
                    w.drop && dropping ? "gone" : "",
                    active && w.id === active ? "lit" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {w.w}{" "}
                </span>
              ))}
              {phase === "listening" && <span className="ps-cursor" />}
            </p>
          </div>

          <div className="ps-mid" aria-hidden="true">
            <span
              className={`ps-link ${phase === "writing" || phase === "hold" ? "on" : ""}`}
            />
          </div>

          {/* What landed — the same Claude Code shell the hero uses, so the
              two sections don't show two different "Claude Code"s. */}
          <div className="ps-out">
            <ClaudeCodeShell
              lines={OUT.slice(0, written)}
              caret={written === 0}
              flashing={false}
              stagger={false}
            />
          </div>
        </div>

        {/* No standalone indicator here. The notch belongs at the top of a
            screen; detached from one it's the wrong shape in the wrong
            place. The sequence already shows state — words streaming,
            filler striking out, the prompt typing itself. */}
      </div>
    </section>
  );
}
