"use client";

import { useEffect, useState } from "react";
import { NotchIndicator, type NotchState } from "./NotchIndicator";
import { SectionHead } from "./SectionHead";
import { Reveal } from "./Reveal";

// The whole interface, explained. The notch shows up in every mockup on this
// page and nothing ever says what it is — so this section is the one place
// it's the subject rather than the set dressing.
//
// The organizing rule is the app's own (notch-states.ts): the shape is
// asymmetric with fixed meaning. LEFT is always what it's hearing, RIGHT is
// always what it did. That's the thing worth teaching.

type Step = { state: NotchState; when: string; note: string };

const STEPS: Step[] = [
  {
    state: "peek",
    when: "At rest",
    note: "Invisible. It's the notch your Mac already has.",
  },
  {
    state: "recording",
    when: "While you talk",
    note: "Left wing opens with your actual waveform.",
  },
  {
    state: "processing",
    when: "When you let go",
    note: "Right wing takes over — it's working.",
  },
  {
    state: "done",
    when: "Done",
    note: "Pasted where your cursor was. Back to nothing.",
  },
];

const HOLD_MS = 2600;

export function TheNotch() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % STEPS.length), HOLD_MS);
    return () => window.clearInterval(id);
  }, []);

  const step = STEPS[i];

  return (
    <section id="notch" className="section section--dark">
      <div className="section-inner">
        <SectionHead
          num="—"
          eyebrow="The interface"
          title={
            <>
              The whole app is <em>one shape</em>.
            </>
          }
          lede="No window, no menu bar icon. It grows out of the notch, tells you what it's hearing on the left and what it did on the right, then disappears."
        />

        <Reveal delay={60}>
          <div className="tn-stage">
            {/* A slab of screen for it to hang from, so the shape reads the
                way it does on a real Mac rather than floating in space. */}
            <div className="tn-screen">
              <div className="tn-menubar" aria-hidden="true" />
              <div className="tn-notch">
                <NotchIndicator state={step.state} notchWidth={168} />
              </div>

              {/* Wing labels — the load-bearing idea of the whole shape. */}
              <span className="tn-tag tn-tag--l" aria-hidden="true">
                what it hears
              </span>
              <span className="tn-tag tn-tag--r" aria-hidden="true">
                what it did
              </span>
            </div>

            <ol className="tn-steps">
              {STEPS.map((s, n) => (
                <li key={s.when} className={n === i ? "on" : ""}>
                  <span className="tn-when">{s.when}</span>
                  <span className="tn-note">{s.note}</span>
                  <span className="tn-bar" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
