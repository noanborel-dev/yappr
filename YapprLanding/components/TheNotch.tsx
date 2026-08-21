"use client";

import { useEffect, useState } from "react";
import { NotchIndicator, type NotchState } from "./NotchIndicator";
import { SectionHead } from "./SectionHead";
import { Reveal } from "./Reveal";

// The interface, explained against a real Mac menu bar.
//
// At rest the app is INVISIBLE — idle is { lw: 0, rw: 0 } with a
// transparent background. But invisible doesn't mean an empty menu bar:
// the notch is a physical cutout that's always there. So beat one draws
// the real hardware notch with Yappr's transparent shell over it, and the
// frame reads as an ordinary Mac. If a viewer can spot Yappr there, this
// section is lying; if the notch vanishes, it's lying the other way.
//
// The desktop is drawn in CSS. Apple's own screenshots aren't licensed for
// use on a commercial page, and a real wallpaper would date the shot.

type Beat = {
  state: NotchState;
  when: string;
  note: string;
};

const BEATS: Beat[] = [
  {
    state: "idle",
    when: "At rest",
    note: "Just your notch. Nothing to close.",
  },
  {
    state: "recording",
    when: "While you talk",
    note: "The left wing opens with your live waveform.",
  },
  {
    state: "processing",
    when: "When you let go",
    note: "The right wing takes over.",
  },
  {
    state: "done",
    when: "A second later",
    note: "Pasted where your cursor was. Then it's gone.",
  },
];

const HOLD_MS = 3000;

export function TheNotch() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(1);
      return;
    }
    const id = window.setInterval(() => setI((n) => (n + 1) % BEATS.length), HOLD_MS);
    return () => window.clearInterval(id);
  }, []);

  const beat = BEATS[i];
  const idle = beat.state === "idle";

  return (
    <section id="notch" className="tn">
      <div className="section-inner">
        <SectionHead
          num="—"
          eyebrow="The interface"
          title={
            <>
              You never have to <em>look at it</em>.
            </>
          }
          lede="No window. No menu-bar icon. It grows out of the notch while you talk, then goes back to being your notch."
        />

        <Reveal delay={60}>
          <div className="tn-mac">
            {/* An ordinary Mac menu bar. At rest it should be impossible to
                tell Yappr is installed. */}
            <div className="tn-bar">
              <div className="tn-bar-l">
                <span className="tn-apple" aria-hidden="true">
                  <svg viewBox="0 0 14 17" fill="currentColor">
                    <path d="M11.6 9c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.2 2C.2 8-.8 11.7.5 14c.6 1.1 1.4 2.4 2.4 2.3 1 0 1.3-.6 2.5-.6s1.5.6 2.6.6 1.7-1.1 2.3-2.2c.7-1.2 1-2.4 1-2.5 0 0-2-.8-2-3zM9.6 3.2c.5-.7.9-1.6.8-2.6-.8 0-1.8.6-2.4 1.3-.5.6-1 1.6-.8 2.5.9.1 1.8-.5 2.4-1.2z" />
                  </svg>
                </span>
                <span className="tn-app">Claude Code</span>
                <span className="tn-menu">File</span>
                <span className="tn-menu">Edit</span>
                <span className="tn-menu">View</span>
                <span className="tn-menu">Window</span>
                <span className="tn-menu">Help</span>
              </div>

              <div className="tn-notch-slot">
                {/* The physical notch, always there. Yappr's shell is the
                    same black and grows wings out of it, so at rest what
                    you see IS your Mac's notch — not an absence. */}
                <span className="tn-hw" aria-hidden="true" />
                <NotchIndicator state={beat.state} notchWidth={162} />
              </div>

              <div className="tn-bar-r" aria-hidden="true">
                <Glyph d="M2 5h11a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM17 7v2" />
                <Glyph d="M1 5.5a11 11 0 0 1 14 0M3.5 8.2a7 7 0 0 1 9 0M6 10.9a3 3 0 0 1 4 0M8 13.4h0" />
                <Glyph d="M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11.2 11.2 15 15" />
                <Glyph d="M2 4h5M2 8h5M2 12h5M9 4h5M9 8h5M9 12h5" />
                <span className="tn-clock">Thu 14:32</span>
              </div>
            </div>

            {/* A hint of desktop below, so the bar reads as the top of a
                screen rather than a floating strip. */}
            <div className="tn-desktop">
              <div className={`tn-window ${idle ? "" : "dim"}`} aria-hidden="true">
                <span className="tn-win-bar">
                  <i className="r" /><i className="y" /><i className="g" />
                  <span className="tn-win-title">noan@laptop — claude</span>
                </span>
                <span className="tn-win-body">
                  <span className="tn-line tn-line--h">─ Claude Code v2.0.0 ─</span>
                  <span className="tn-line">Welcome back Noan!</span>
                  <span className="tn-line tn-dim">Opus 4.7 · Max 20x</span>
                  <span className="tn-line tn-dim">~/Dev/yappr</span>
                  <span className="tn-prompt">
                    <span className="tn-chev">&gt;</span>
                    {beat.state === "done" ? (
                      <span className="tn-landed">
                        ## Goal — stream cleanup instead of buffering
                      </span>
                    ) : (
                      <span className="tn-caret" />
                    )}
                  </span>
                </span>
              </div>
            </div>

            {/* Wing labels — only meaningful once wings exist. */}
            <span className={`tn-tag tn-tag--l ${idle ? "off" : ""}`} aria-hidden="true">
              what it hears
            </span>
            <span className={`tn-tag tn-tag--r ${idle ? "off" : ""}`} aria-hidden="true">
              what it did
            </span>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <ol className="tn-beats">
            {BEATS.map((b, n) => (
              <li key={b.when} className={n === i ? "on" : ""}>
                <span className="tn-num">{String(n + 1).padStart(2, "0")}</span>
                <span className="tn-when">{b.when}</span>
                <span className="tn-note">{b.note}</span>
                <span className="tn-rule" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      className="tn-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
