"use client";

// The real Yappr indicator, not the old floating pill.
//
// Ported from the app source: src/renderer/indicator/NotchIndicator.tsx and
// notch-states.ts. The organizing rule is from that design handoff and must
// survive any edit here: the shape is asymmetric with fixed meaning —
//   LEFT wing  = input   (what Yappr is hearing)
//   CENTRE     = the physical notch, never moves, paints nothing
//   RIGHT wing = outcome (what Yappr did with it)
//
// Values below are lifted from the app, not eyeballed. If the app changes,
// re-pull rather than approximating:
//   ACCENT #5A8FE8 · DANGER #E84A3A · shell #0A0B0F
//   9 waveform bars, 2px wide, 2.5px gap, 13px max height
//   label: Instrument Serif italic 13.5px
//
// Square at the top, rounded only at the bottom — it hangs from the menu
// bar. A fully rounded pill is the old design and reads as a different app.

const ACCENT = "#5A8FE8";
const DANGER = "#E84A3A";
const BAR_COUNT = 9;
const WAVE_HEIGHT = 13;

export type NotchState =
  | "idle"
  | "peek"
  | "recording"
  | "processing"
  | "done"
  | "error";

// Deterministic bar heights per state — the real one is driven by a live
// analyser, which we obviously don't have on a marketing page. Varied
// enough to read as a voice, stable enough not to flicker between renders.
const WAVE = [0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6, 0.3];

const LABEL: Record<NotchState, string> = {
  idle: "",
  peek: "",
  recording: "listening",
  processing: "polishing…",
  done: "pasted",
  error: "didn’t catch that",
};

export function NotchIndicator({
  state,
  /** Notch width in px. The real centre band tracks the physical housing. */
  notchWidth = 150,
  hotkey = "⌃",
  className = "",
  /**
   * Hand back each waveform bar so a caller can drive it from a live
   * analyser, the way the app does. Without it the bars run on the CSS
   * fallback below — fine for a scripted loop, wrong when a real mic is open.
   */
  barRef,
}: {
  state: NotchState;
  notchWidth?: number;
  hotkey?: string;
  className?: string;
  barRef?: (i: number) => (el: HTMLSpanElement | null) => void;
}) {
  const idle = state === "idle";
  const label = LABEL[state];
  const labelColor =
    state === "done" ? ACCENT : "rgba(255,255,255,.92)";

  const glow =
    state === "recording"
      ? "rgba(90,143,232,.5)"
      : state === "processing" || state === "done"
        ? "rgba(90,143,232,.35)"
        : state === "error"
          ? "rgba(232,74,58,.42)"
          : "transparent";

  return (
    <div className={`ni ${idle ? "ni--idle" : ""} ${className}`}>
      <span className="ni-glow" style={{ background: glow }} aria-hidden="true" />

      {/* Concave fillets sit OUTSIDE the shell, filling the corner against
          the menu bar so it grows out of the bar rather than sitting on it. */}
      <span className={`ni-fillet ni-fillet--l ${idle ? "off" : ""}`} aria-hidden="true" />
      <span className={`ni-fillet ni-fillet--r ${idle ? "off" : ""}`} aria-hidden="true" />

      <div className="ni-shell">
        <div className="ni-row">
          {/* LEFT — input */}
          <div className="ni-wing ni-wing--l">
            {state === "recording" && (
              <>
                <span className="ni-dot" />
                <span className={`ni-wave ${barRef ? "ni-wave--live" : ""}`}>
                  {Array.from({ length: BAR_COUNT }, (_, i) => (
                    <span
                      key={i}
                      ref={barRef?.(i)}
                      style={
                        barRef
                          ? undefined
                          : { height: Math.max(2, WAVE[i] * WAVE_HEIGHT) }
                      }
                    />
                  ))}
                </span>
              </>
            )}
            {state !== "recording" && !idle && <span className="ni-mark">Yappr</span>}
            {state === "peek" && <span className="ni-key">{hotkey}</span>}
          </div>

          {/* CENTRE — the housing. Paints nothing; there are no pixels here. */}
          <div className="ni-notch" style={{ width: notchWidth }} />

          {/* RIGHT — outcome */}
          <div className="ni-wing ni-wing--r">
            {state === "processing" && <span className="ni-spin" />}
            {state === "done" && (
              <svg className="ni-check" viewBox="0 0 11 11" fill="none">
                <path
                  d="M2 5.5 L4.5 8 L9 3"
                  stroke={ACCENT}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {state === "error" && (
              <span className="ni-dot" style={{ background: DANGER }} />
            )}
            {label && (
              <span className="ni-label" style={{ color: labelColor }}>
                {label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
