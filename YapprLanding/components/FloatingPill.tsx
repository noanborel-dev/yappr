"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pillBus } from "./pillBus";
import { NotchIndicator } from "./NotchIndicator";

type FloatState = "idle" | "listening" | "polishing" | "done";

// Matches the real app's success label (Indicator.tsx 'done' state).
// The 'clipboard' fallback label "copied — ⌘V to paste" only appears when
// auto-paste isn't possible — not the default path.
const DONE_LABEL = "pasted";

export function FloatingPill() {
  const [state, setState] = useState<FloatState>("idle");
  const [showHint, setShowHint] = useState(true);
  const [interacted, setInteracted] = useState(false);

  // 9 bars — the app's BAR_COUNT, not the 6 the old lozenge drew.
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

    // 9 bars, 13px ceiling — BAR_COUNT and WAVE_HEIGHT from the app.
    const N = 9;
    const MAX = 13;
    const tick = () => {
      const bars = barsRef.current;
      if (useReal && analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < N; i++) {
          const idx = Math.floor((i / N) * data.length);
          const h = Math.max(2, Math.round((data[idx] / 255) * MAX));
          if (bars[i]) bars[i].style.height = `${h}px`;
        }
      } else {
        for (let i = 0; i < N; i++) {
          if (bars[i]) bars[i].style.height = `${2 + Math.random() * (MAX - 2)}px`;
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopWaveform = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    barsRef.current.forEach((b) => {
      if (b) b.style.height = "2px";
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

  // Nothing renders at rest. A notch permanently parked at the top of a
  // marketing page is furniture pretending to be system UI — it isn't the
  // app, and it made the page look broken. It appears only while you're
  // actually holding the key, which is the one moment the feedback earns
  // its place. The keyboard + mic plumbing above stays either way: the
  // live demo listens to pillBus for hold-start / hold-end.
  const active = state !== "idle";

  const notchState =
    state === "listening"
      ? "recording"
      : state === "polishing"
        ? "processing"
        : "done";

  return (
    <>
      {/* Hint only — a small nudge that the page is dictatable, not a fake
          app indicator. */}
      {!interacted && showHint && !active && (
        <div className="notch-hint-solo">
          tap · hold <span className="kbd">⌃</span> to dictate
        </div>
      )}

      {active && (
        <div className="notch-wrap" aria-live="polite">
          <button
            type="button"
            className="notch-hit"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            aria-label={
              state === "listening"
                ? "listening"
                : state === "polishing"
                  ? "polishing"
                  : DONE_LABEL
            }
          >
            <NotchIndicator
              state={notchState}
              notchWidth={132}
              barRef={state === "listening" ? setBarRef : undefined}
            />
          </button>
        </div>
      )}

      {/* Invisible at rest, but still the tap/hold target so the gesture
          works anywhere on the page. */}
      {!active && (
        <button
          type="button"
          className="notch-ghost"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          aria-label="Yappr — tap to jump to the demo, hold to dictate"
        />
      )}
    </>
  );
}
