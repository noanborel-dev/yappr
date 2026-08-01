"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pillBus } from "./pillBus";

type FloatState = "idle" | "listening" | "polishing" | "done";

// Matches the real app's success label (Indicator.tsx 'done' state).
// The 'clipboard' fallback label "copied — ⌘V to paste" only appears when
// auto-paste isn't possible — not the default path.
const DONE_LABEL = "pasted";

export function FloatingPill() {
  const [state, setState] = useState<FloatState>("idle");
  const [showHint, setShowHint] = useState(true);
  const [interacted, setInteracted] = useState(false);

  const barsRef = useRef<HTMLSpanElement[]>([]);
  const setBarRef = (idx: number) => (el: HTMLSpanElement | null) => {
    if (el) barsRef.current[idx] = el;
  };

  const holdingRef = useRef(false);
  const stateRef = useRef<FloatState>("idle");
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tappedRef = useRef(false);

  // Mic capture
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const micRequestedRef = useRef(false);
  const micGrantedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    return pillBus.on((e) => {
      if (e === "hold-start") setState("listening");
      else if (e === "hold-end") setState("polishing");
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== "polishing") return;
    const t = setTimeout(() => setState("done"), 900);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(t);
  }, [state]);

  const ensureMic = useCallback(async () => {
    if (micGrantedRef.current && analyserRef.current) return true;
    if (micRequestedRef.current && !micGrantedRef.current) return false;
    micRequestedRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      micStreamRef.current = stream;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      micGrantedRef.current = true;
      return true;
    } catch (err) {
      console.warn("[Yappr pill] mic permission denied", err);
      return false;
    }
  }, []);

  const startWaveform = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    const analyser = analyserRef.current;
    const useReal = !!analyser;

    const tick = () => {
      const bars = barsRef.current;
      if (useReal && analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < 6; i++) {
          const idx = Math.floor((i / 6) * data.length);
          const h = Math.max(3, Math.round((data[idx] / 255) * 15));
          if (bars[i]) bars[i].style.height = `${h}px`;
        }
      } else {
        for (let i = 0; i < 6; i++) {
          if (bars[i]) bars[i].style.height = `${3 + Math.random() * 11}px`;
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopWaveform = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    barsRef.current.forEach((b) => {
      if (b) b.style.height = "3px";
    });
  }, []);

  useEffect(() => {
    if (state !== "listening") {
      stopWaveform();
      return;
    }
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    startWaveform();
    return () => stopWaveform();
  }, [state, startWaveform, stopWaveform]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const scrollToDemo = () => {
    const el = document.getElementById("demo");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startHold = useCallback(async () => {
    if (holdingRef.current) return;
    if (stateRef.current !== "idle") return;
    holdingRef.current = true;
    setInteracted(true);
    setShowHint(false);
    await ensureMic();
    pillBus.emit("hold-start");
  }, [ensureMic]);

  const endHold = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    pillBus.emit("hold-end");
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    tappedRef.current = true;
    pressTimerRef.current = setTimeout(() => {
      tappedRef.current = false;
      startHold();
    }, 180);
  };
  const onPointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (holdingRef.current) {
      endHold();
    } else if (tappedRef.current) {
      tappedRef.current = false;
      setInteracted(true);
      setShowHint(false);
      pillBus.emit("tap");
      scrollToDemo();
    }
  };
  const onPointerLeave = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (holdingRef.current) endHold();
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== "Control") return;
      if (e.repeat) return;
      startHold();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "Control") return;
      endHold();
    };
    const onBlur = () => endHold();
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [startHold, endHold]);

  return (
    <div className="floating-pill-wrap" aria-live="polite">
      {!interacted && showHint && (
        <div className="floating-pill-hint">
          tap · hold <span className="kbd">⌃</span> to dictate
        </div>
      )}

      <button
        type="button"
        className={`floating-pill state-${state}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        aria-label={
          state === "idle"
            ? "Yappr — tap to scroll to demo, hold to dictate"
            : state === "listening"
              ? "listening"
              : state === "polishing"
                ? "polishing"
                : DONE_LABEL
        }
      >
        {state === "idle" && (
          <>
            <span className="pill-dot" aria-hidden="true" />
            <span className="pill-bars pill-bars--static" aria-hidden="true">
              <span style={{ height: 5 }} />
              <span style={{ height: 8 }} />
              <span style={{ height: 4 }} />
              <span style={{ height: 9 }} />
              <span style={{ height: 6 }} />
            </span>
          </>
        )}

        {state === "listening" && (
          <>
            <span className="pill-dot" aria-hidden="true" />
            <span className="pill-bars" aria-hidden="true">
              <span ref={setBarRef(0)} />
              <span ref={setBarRef(1)} />
              <span ref={setBarRef(2)} />
              <span ref={setBarRef(3)} />
              <span ref={setBarRef(4)} />
              <span ref={setBarRef(5)} />
            </span>
            <span className="floating-pill-label">listening</span>
          </>
        )}

        {state === "polishing" && (
          <>
            <span className="pill-spinner" aria-hidden="true" />
            <span className="floating-pill-label">polishing…</span>
          </>
        )}

        {state === "done" && (
          <>
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
            <span className="floating-pill-label floating-pill-label--done">
              {DONE_LABEL}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
