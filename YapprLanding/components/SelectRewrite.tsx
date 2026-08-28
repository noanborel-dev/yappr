"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHead } from "./SectionHead";
import { ScrollExpand } from "./ScrollExpand";

// Section 02 — one surface, drawn as the real app.
//
// Previously two generic dark windows with traffic lights and a title. That
// reads as "some app", which is the same failure the Cursor mockup had
// before it got a real activity rail and status bar. This is Gmail: the
// compose header, the To/Subject rows, the send button, Google's actual
// greys.
//
// The selection is a macOS text selection, not a highlight that pops in:
// it sweeps left-to-right the way a drag does, because that's the gesture
// being described.
//
// It sweeps word by word rather than as one growing rectangle. A rectangle
// scaled over a wrapping paragraph doesn't follow the lines — it fills the
// first line halfway and the second line completely. Per-word spans wrap
// with the text, which is also how macOS extends a drag selection.

type Beat = "rest" | "select" | "speak" | "done";

const HEAD = "Hi Priya — quick update before Thursday.";
const SEL = "We're on track for the beta and I'll send numbers once they're in.";
const TAIL = "Thanks,\nNoan";
const SAID = "mention the landing page is live and ask if she wants a walkthrough";
const AFTER =
  "We're on track for the beta, and the landing page is live now if you want a look. I'll send numbers once they're in — happy to walk you through it if that's easier.";

const WORDS = SEL.split(" ");
const SWEEP_MS = 42;

export function SelectRewrite() {
  const [beat, setBeat] = useState<Beat>("rest");
  const [lit, setLit] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clear();
    setBeat("rest");
    setLit(0);
    const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

    const dragStart = 900;
    at(() => setBeat("select"), dragStart);
    WORDS.forEach((_, i) => at(() => setLit(i + 1), dragStart + i * SWEEP_MS));

    const dragEnd = dragStart + WORDS.length * SWEEP_MS;
    at(() => setBeat("speak"), dragEnd + 450);
    at(() => setBeat("done"), dragEnd + 2300);
    at(run, dragEnd + 6500);
  }, [clear]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBeat("done");
      setLit(WORDS.length);
      return;
    }
    run();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = beat === "done";

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
          lede="Select the part that's wrong. Say what it should be."
        />

        <ScrollExpand from={0.9}>
          <div className="gm">
            <div className="gm-head">
              <span className="gm-head-title">New Message</span>
              <span className="gm-head-ctl" aria-hidden="true">
                <i /><i /><i />
              </span>
            </div>

            <div className="gm-field">
              <span className="gm-label">To</span>
              <span className="gm-chip">
                <span className="gm-avatar" aria-hidden="true">P</span>
                Priya Raman
              </span>
            </div>
            <div className="gm-field">
              <span className="gm-label">Subject</span>
              <span className="gm-subject">Re: launch timing</span>
            </div>

            <div className="gm-body">
              <p>{HEAD}</p>
              <p className="gm-target">
                {done ? (
                  <span className="gm-text swapped">{AFTER}</span>
                ) : (
                  <span className="gm-text">
                    {WORDS.map((w, i) => (
                      <span key={i} className={`gm-w ${i < lit ? "sel" : ""}`}>
                        {w}
                        {i < WORDS.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </span>
                )}
              </p>
              <p className="gm-sign">{TAIL}</p>
            </div>

            <div className="gm-foot">
              <span className="gm-send">Send</span>
            </div>
          </div>
        </ScrollExpand>

        {/* The spoken instruction, and the one line that explains the
            gesture the section is named after.

            It used to sit beside the Send button, inside the mockup, at
            15.5px in Gmail's own grey — chrome-sized type in chrome
            colours, which made the most important sentence in the
            section the least readable thing in it. It is not part of the
            window; it is the caption for the whole demo, so it belongs
            under the module in the page's voice, not Gmail's.

            It also used to show only during the `speak` beat and vanish
            the moment the text swapped — under two seconds, gone before
            the result it explains had even landed. Now it holds through
            `done`, so the instruction and its outcome are on screen at
            the same time, which is the entire comparison being made. */}
        <div className={`sr-said ${beat === "speak" || done ? "in" : ""}`}>
          <span className="sr-said-label">
            {/* The app's own record dot, not a new one — it says
                "this is being said out loud" without a word of copy. */}
            <i className="pill-dot" aria-hidden="true" />
            What you&rsquo;re saying
          </span>
          <p className="sr-said-quote">&ldquo;{SAID}&rdquo;</p>
        </div>

        {/* "Works on a prompt you're about to send, too — or anything
            else you can select." came out. It was a footnote widening the
            claim after the demo had already made it, and it landed under
            the big spoken-instruction line, which is the thing that
            should close this section. */}
      </div>
    </section>
  );
}
