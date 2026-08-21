"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHead } from "./SectionHead";
import { ScrollExpand } from "./ScrollExpand";
import { Reveal } from "./Reveal";

// Section 02 — rewritten around what this is actually for.
//
// It used to demo turning .then() into async/await in an editor. That's a
// thing it CAN do and a thing nobody reaches for a microphone to do — you'd
// just type it, or ask the AI already in your editor.
//
// The real uses are the two below: topping up a prompt you're about to
// send, and amending an email you've already written. Both are cases where
// the text exists, you know the one change you want, and saying it is
// genuinely faster than re-typing the sentence around it.

type Scene = {
  app: "claude" | "gmail";
  chrome: string;
  /** Text before the selection. */
  head: string;
  /** The selected run. */
  sel: string;
  /** Text after the selection. */
  tail: string;
  said: string;
  /** What the selection becomes. */
  after: string;
};

const SCENES: Scene[] = [
  {
    app: "claude",
    chrome: "Claude Code — ~/Dev/yappr",
    head: "Add a retry wrapper around the Groq call. ",
    sel: "Back off exponentially and cap it at three attempts.",
    tail: "",
    said: "also say it should only retry on 429 and 5xx, never 4xx",
    after:
      "Back off exponentially, cap it at three attempts, and only retry on 429 and 5xx — never other 4xx.",
  },
  {
    app: "gmail",
    chrome: "Re: launch timing",
    head: "Hi Priya — quick update before Thursday.\n\n",
    sel: "We're on track for the beta and I'll send numbers once they're in.",
    tail: "\n\nThanks,\nNoan",
    said: "mention the landing page is live and ask if she wants a walkthrough",
    after:
      "We're on track for the beta, and the landing page is live now if you want a look. I'll send numbers once they're in — happy to walk you through it if that's easier.",
  },
];

type Beat = "rest" | "select" | "speak" | "done";

export function SelectRewrite() {
  const [scene, setScene] = useState(0);
  const [beat, setBeat] = useState<Beat>("rest");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clear();
    setBeat("rest");
    const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    at(() => setBeat("select"), 900);
    at(() => setBeat("speak"), 1900);
    at(() => setBeat("done"), 3500);
    at(() => {
      setScene((s) => (s + 1) % SCENES.length);
      run();
    }, 7600);
  }, [clear]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBeat("done");
      return;
    }
    run();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = SCENES[scene];
  const done = beat === "done";
  const selecting = beat === "select" || beat === "speak";

  return (
    <section id="rewrite" className="section section--dark">
      <div className="section-inner">
        <SectionHead
          num="02"
          eyebrow="Select and rewrite"
          pro
          title={
            <>
              Highlight it. <em>Say the change.</em>
            </>
          }
          lede="A prompt you're about to send. An email you've already written. Select the part that's wrong and say what it should be instead."
        />

        <ScrollExpand from={0.9}>
          <div className="sr2" key={scene}>
            <div className={`sr2-win sr2-win--${s.app}`}>
              <div className="sr2-chrome">
                <span className="tl r" /><span className="tl y" /><span className="tl g" />
                <span className="sr2-title">{s.chrome}</span>
              </div>

              <div className="sr2-body">
                <span className="sr2-static">{s.head}</span>
                <span
                  className={`sr2-run ${selecting ? "sel" : ""} ${done ? "new" : ""}`}
                >
                  {done ? s.after : s.sel}
                </span>
                <span className="sr2-static">{s.tail}</span>
              </div>
            </div>

            <div className={`sr2-said ${beat === "speak" ? "in" : ""}`} aria-hidden="true">
              &ldquo;{s.said}&rdquo;
            </div>

            <ul className="sr2-dots" aria-hidden="true">
              {SCENES.map((sc, n) => (
                <li key={sc.app} className={n === scene ? "on" : ""} />
              ))}
            </ul>
          </div>
        </ScrollExpand>

        <Reveal delay={120}>
          <p className="sec-foot">
            Mid-dictation too — say &ldquo;make that smoother&rdquo; while
            you&rsquo;re still talking.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
