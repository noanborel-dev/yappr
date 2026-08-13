"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CursorShell, type CodeLine } from "./shells/CursorShell";
import { Reveal } from "./Reveal";
import { ScrollExpand } from "./ScrollExpand";
import { SectionHead } from "./SectionHead";
import { NotchIndicator } from "./NotchIndicator";

// One surface, done properly, instead of three generic windows on a
// carousel. Range ("works anywhere") is a line of copy — the per-app
// polish section further down carries the visual proof for other apps.

type Beat = "rest" | "select" | "speak" | "rewritten";

const BEFORE: CodeLine[] = [
  { n: 37, tokens: [{ t: "// cleanup runs once transcription settles", c: "cmt" }] },
  { n: 38, tokens: [{ t: "" }] },
  { n: 39, tokens: [{ t: "async function ", c: "kw" }, { t: "polish", c: "fn" }, { t: "(chunks) {" }] },
  { n: 40, tokens: [{ t: "  return", c: "kw" }, { t: " groq." }, { t: "clean", c: "fn" }, { t: "(chunks)." }, { t: "then", c: "fn" }, { t: "((r) => {" }] },
  { n: 41, tokens: [{ t: "    if", c: "kw" }, { t: " (!r.ok) " }, { t: "return", c: "kw" }, { t: " " }, { t: "fallback", c: "fn" }, { t: "(chunks)" }] },
  { n: 42, tokens: [{ t: "    return", c: "kw" }, { t: " r.text" }] },
  { n: 43, tokens: [{ t: "  })" }] },
  { n: 44, tokens: [{ t: "}" }] },
  { n: 45, tokens: [{ t: "" }] },
  { n: 46, tokens: [{ t: "export", c: "kw" }, { t: " { polish }" }] },
];

const AFTER: CodeLine[] = [
  { n: 37, tokens: [{ t: "// cleanup runs once transcription settles", c: "cmt" }] },
  { n: 38, tokens: [{ t: "" }] },
  { n: 39, tokens: [{ t: "async function ", c: "kw" }, { t: "polish", c: "fn" }, { t: "(chunks) {" }] },
  { n: 40, tokens: [{ t: "  const", c: "kw" }, { t: " r = " }, { t: "await", c: "kw" }, { t: " groq." }, { t: "clean", c: "fn" }, { t: "(chunks)" }] },
  { n: 41, tokens: [{ t: "  if", c: "kw" }, { t: " (!r.ok) " }, { t: "return", c: "kw" }, { t: " " }, { t: "fallback", c: "fn" }, { t: "(chunks)" }] },
  { n: 42, tokens: [{ t: "  return", c: "kw" }, { t: " r.text" }] },
  { n: 43, tokens: [{ t: "}" }] },
  { n: 44, tokens: [{ t: "" }] },
  { n: 45, tokens: [{ t: "export", c: "kw" }, { t: " { polish }" }] },
];

// The .then block — lines 40-43, i.e. rows 4-7 of BEFORE.
const SELECTED = [4, 5, 6, 7];

export function SelectRewrite() {
  const [beat, setBeat] = useState<Beat>("rest");
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const run = useCallback(() => {
    clear();
    setBeat("rest");
    timeouts.current.push(setTimeout(() => setBeat("select"), 900));
    timeouts.current.push(setTimeout(() => setBeat("speak"), 1900));
    timeouts.current.push(setTimeout(() => setBeat("rewritten"), 3400));
    timeouts.current.push(setTimeout(run, 8200));
  }, [clear]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBeat("rewritten");
      return;
    }
    run();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rewritten = beat === "rewritten";

  return (
    <section id="rewrite" className="section section--dark">
      <div className="section-inner">
        <SectionHead
          num="02"
          eyebrow="Select and rewrite"
          pro
          title={
            <>
              Highlight it. <em>Say the fix.</em>
            </>
          }
          lede="Any text you can select, in any app. The rewrite replaces it where it sits."
        />

        {/* Runs wide of the text column and grows into that width as you
            scroll — a dark section with edge-to-edge media is the single
            biggest "premium" lever available without photography. */}
        <ScrollExpand from={0.88}>
          <div className="sr-stage bleed">
            <CursorShell
              lines={rewritten ? AFTER : BEFORE}
              selected={beat === "select" || beat === "speak" ? SELECTED : []}
              flashing={rewritten}
            />

            <div className={`sr-say ${beat === "speak" ? "in" : ""}`} aria-hidden="true">
              &ldquo;make this async/await&rdquo;
            </div>

            {/* Menu bar + notch: the indicator can't float in the middle of
                an editor window — it lives at the top of the screen. Giving
                the mockup a menu bar is what makes that placement honest. */}
            <div className="sr-menubar" aria-hidden="true" />
            <div className="sr-notch" aria-hidden="true">
              <NotchIndicator
                state={beat === "speak" ? "recording" : beat === "rewritten" ? "done" : "idle"}
                notchWidth={120}
              />
            </div>
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
