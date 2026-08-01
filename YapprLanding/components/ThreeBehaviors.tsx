"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "tap" | "hold" | "double";

interface PanelState {
  pressed: boolean;
  holding: boolean;
  tapped: boolean;
  pillVisible: boolean;
  pillDone: boolean;
  pillLabel: string;
}

const INITIAL_PANEL_STATE: PanelState = {
  pressed: false,
  holding: false,
  tapped: false,
  pillVisible: false,
  pillDone: false,
  pillLabel: "listening",
};

const PANELS: Array<{ mode: Mode; ord: string; name: React.ReactNode; oneLiner: string }> = [
  {
    mode: "tap",
    ord: "01",
    name: <em>Tap</em>,
    oneLiner: "Toggle recording on. Tap again to stop.",
  },
  {
    mode: "hold",
    ord: "02",
    name: <em>Hold</em>,
    oneLiner: "Record while held. Release to finish.",
  },
  {
    mode: "double",
    ord: "03",
    name: <em>Double-tap</em>,
    oneLiner: "Paste your last dictation again.",
  },
];

export function ThreeBehaviors() {
  const [active, setActive] = useState<Mode>("tap");
  const [panels, setPanels] = useState<Record<Mode, PanelState>>({
    tap: { ...INITIAL_PANEL_STATE },
    hold: { ...INITIAL_PANEL_STATE },
    double: {
      ...INITIAL_PANEL_STATE,
      pillDone: true,
      pillLabel: "pasted",
    },
  });

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const barsRef = useRef<HTMLSpanElement | null>(null);

  // Animate bars whenever the active panel's pill is in listening state
  useEffect(() => {
    const isListening =
      panels[active].pillVisible && !panels[active].pillDone;
    if (!isListening || !barsRef.current) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    const spans = barsRef.current.querySelectorAll("span");
    const interval = setInterval(() => {
      spans.forEach((s) => {
        (s as HTMLElement).style.height = `${3 + Math.random() * 8}px`;
      });
    }, 220);
    return () => clearInterval(interval);
  }, [active, panels]);

  useEffect(() => {
    runMode(active);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function cleanup() {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }

  function schedule(fn: () => void, delay: number) {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
  }

  function setPanel(mode: Mode, patch: Partial<PanelState>) {
    setPanels((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }));
  }

  function resetPanel(mode: Mode) {
    if (mode === "double") {
      setPanel(mode, {
        ...INITIAL_PANEL_STATE,
        pillDone: true,
        pillLabel: "pasted",
      });
    } else {
      setPanel(mode, INITIAL_PANEL_STATE);
    }
  }

  function runMode(mode: Mode) {
    cleanup();
    // Reset all panels first so non-active ones return to baseline
    (Object.keys(panels) as Mode[]).forEach((m) => {
      if (m !== mode) resetPanel(m);
    });
    resetPanel(mode);

    if (mode === "tap") {
      // Tap 1: press, start listening
      schedule(() => {
        setPanel("tap", { pressed: true, tapped: true });
      }, 400);
      schedule(() => setPanel("tap", { pressed: false, tapped: false }), 600);
      schedule(
        () => setPanel("tap", { pillVisible: true, pillLabel: "listening" }),
        450,
      );

      // Tap 2: stop, finalize
      schedule(() => {
        setPanel("tap", { pressed: true, tapped: true });
      }, 2800);
      schedule(
        () => setPanel("tap", { pressed: false, tapped: false }),
        3000,
      );
      schedule(
        () =>
          setPanel("tap", {
            pillDone: true,
            pillLabel: "pasted",
          }),
        2900,
      );
    } else if (mode === "hold") {
      schedule(
        () =>
          setPanel("hold", {
            pressed: true,
            holding: true,
            pillVisible: true,
            pillLabel: "listening",
          }),
        400,
      );
      schedule(
        () =>
          setPanel("hold", {
            pressed: false,
            holding: false,
            pillDone: true,
            pillLabel: "pasted",
          }),
        2800,
      );
    } else if (mode === "double") {
      schedule(() => {
        setPanel("double", { pressed: true, tapped: true });
      }, 800);
      schedule(
        () => setPanel("double", { pressed: false, tapped: false }),
        950,
      );
      schedule(() => {
        setPanel("double", { pressed: true, tapped: true });
      }, 1020);
      schedule(
        () => setPanel("double", { pressed: false, tapped: false }),
        1170,
      );
      schedule(() => setPanel("double", { pillVisible: true }), 1030);
    }

    // Advance after 4s
    schedule(() => {
      const order: Mode[] = ["tap", "hold", "double"];
      const next = order[(order.indexOf(mode) + 1) % 3];
      setActive(next);
    }, 4000);
  }

  return (
    <section id="hotkey" className="max-w-[1240px] mx-auto px-8 py-16">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-accent mb-3">
        Section 4 · One key, three behaviors
      </p>
      <h2 className="font-serif font-normal text-[clamp(56px,8vw,80px)] leading-[0.92] tracking-[-0.02em] m-0 mb-4 max-w-[880px]">
        One key. <em>Three</em> behaviors.
      </h2>
      <p className="text-[18px] text-ink-2 max-w-[580px] mb-14 leading-[1.5]">
        Tap for a snippet. Hold for a paragraph. Double-tap to re-paste.
      </p>

      <div
        className="bg-white border border-line rounded-3xl grid grid-cols-1 md:grid-cols-3 min-h-[520px]"
        style={{ boxShadow: "0 30px 60px -30px rgba(20,30,50,.18)" }}
      >
        {PANELS.map((p) => {
          const state = panels[p.mode];
          const isOn = active === p.mode;
          return (
            <div
              key={p.mode}
              className={`tb-panel ${isOn ? "on" : ""}`}
              aria-current={isOn ? "true" : undefined}
            >
              <p
                className={`font-mono text-[11px] tracking-[0.14em] uppercase m-0 transition-colors ${
                  isOn ? "text-accent" : "text-muted"
                }`}
              >
                {p.ord}
              </p>
              <p className="font-serif font-normal text-[54px] leading-[0.95] tracking-[-0.015em] text-ink m-0">
                {p.name}
              </p>
              <p className="text-[16px] leading-[1.45] text-ink-2 -mt-4 m-0">
                {p.oneLiner}
              </p>

              <div className="flex flex-col items-center gap-5 mt-auto">
                <div
                  className={`tb-keycap ${state.pressed ? "pressed" : ""} ${
                    state.holding ? "holding" : ""
                  } ${state.tapped ? "tap" : ""}`}
                  aria-hidden="true"
                >
                  <span className="tb-keycap__ripple" />
                  <span className="tb-keycap__glyph">⌃</span>
                  <span className="tb-keycap__label">Control</span>
                </div>

                <span
                  className={`mini-pill ${state.pillVisible ? "show" : ""}`}
                  role="status"
                >
                  <span
                    className={`mini-pill__dot ${state.pillDone ? "done" : ""}`}
                    aria-hidden="true"
                  />
                  {!state.pillDone && (
                    <span
                      className="mini-pill__bars"
                      ref={isOn ? barsRef : null}
                      aria-hidden="true"
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                  {state.pillDone && (
                    <svg
                      className="mini-pill__check"
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
                    style={{
                      color: state.pillDone
                        ? "var(--cobalt)"
                        : "rgba(255,255,255,.95)",
                    }}
                  >
                    {state.pillLabel}
                  </span>
                </span>
              </div>

              <span className="tb-panel__progress" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
