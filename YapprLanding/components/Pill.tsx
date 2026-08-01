"use client";

import { useEffect, useRef } from "react";

type PillState = "listening" | "polishing" | "done";

interface PillProps {
  state: PillState;
  label?: string;
}

const DEFAULT_LABELS: Record<PillState, React.ReactNode> = {
  listening: "listening",
  polishing: "polishing…",
  done: (
    <>
      copied —{" "}
      <span className="font-mono not-italic text-[12px]">⌘V</span> to paste
    </>
  ),
};

export function Pill({ state, label }: PillProps) {
  const barsRef = useRef<HTMLSpanElement>(null);

  // Animate bars only while listening. Random heights every ~90ms.
  useEffect(() => {
    if (state !== "listening" || !barsRef.current) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const spans = barsRef.current.querySelectorAll("span");
    const interval = setInterval(() => {
      spans.forEach((s) => {
        (s as HTMLElement).style.height = `${3 + Math.random() * 11}px`;
      });
    }, 220);
    return () => clearInterval(interval);
  }, [state]);

  const displayLabel = label ?? DEFAULT_LABELS[state];

  return (
    <span
      className="pill"
      role="status"
      aria-label={
        state === "listening"
          ? "Yappr is listening"
          : state === "polishing"
            ? "Yappr is polishing your dictation"
            : "Dictation copied. Press Command V to paste."
      }
    >
      {state === "listening" && <span className="pill-dot" aria-hidden="true" />}

      {state === "listening" && (
        <span className="pill-bars" ref={barsRef} aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </span>
      )}

      {state === "polishing" && (
        <span className="pill-spinner" aria-hidden="true" />
      )}

      {state === "done" && (
        <svg
          className="pill-check"
          viewBox="0 0 11 11"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 5.5 L4.5 8 L9 3"
            stroke="#5A8FE8"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <span
        className={`pill-label ${state === "done" ? "pill-label--done" : ""}`}
      >
        {displayLabel}
      </span>
    </span>
  );
}
