"use client";

type PillEvent = "hold-start" | "hold-end" | "tap";
type Listener = (e: PillEvent) => void;

const listeners = new Set<Listener>();

export const pillBus = {
  emit(e: PillEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
