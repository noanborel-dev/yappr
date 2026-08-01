"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlackShell } from "./shells/SlackShell";
import { ImessageShell } from "./shells/ImessageShell";
import { GmailShell } from "./shells/GmailShell";
import { pillBus } from "./pillBus";

type AppId = "slack" | "imsg" | "gmail";
type Phase = "idle" | "listening" | "polishing" | "pasted";

type DiffToken =
  | { kind: "keep"; text: string }
  | { kind: "remove"; text: string } // present in raw, gone in polished
  | { kind: "add"; text: string }; // not in raw, appears in polished

interface Scenario {
  prompt: string;
  // Tokenized version of the spoken transcript — used to render an inline
  // diff bubble that morphs from raw to polished. `keep` stays in both
  // states; `remove` strikes through and fades out; `add` fades in on polish.
  diff: DiffToken[];
  polished: string;
  initialMessage?: string;
  incoming?: string[];
}

const SCENARIOS: Record<AppId, Scenario> = {
  // Slack — false starts + filler get removed; sentence stays casual but tight.
  slack: {
    prompt:
      "Try saying: “um yeah v2 polish should be ready Friday, actually let's just ship it Friday morning”",
    diff: [
      { kind: "remove", text: "um yeah " },
      { kind: "keep", text: "v2 polish " },
      { kind: "remove", text: "should be ready Friday, actually let's just " },
      { kind: "add", text: "is ready — " },
      { kind: "keep", text: "ship it Friday morning" },
      { kind: "add", text: "." },
    ],
    polished: "v2 polish is ready — ship it Friday morning.",
    initialMessage: "anyone have an ETA on the v2 polish?",
  },

  imsg: {
    prompt:
      "Try saying: “yeah 7pm works — actually wait let's do 8, I have a call running late”",
    diff: [
      { kind: "keep", text: "yeah 7pm works " },
      { kind: "remove", text: "— actually wait " },
      { kind: "add", text: "— actually " },
      { kind: "keep", text: "let's do 8" },
      { kind: "keep", text: ", " },
      { kind: "remove", text: "I " },
      { kind: "add", text: "i " },
      { kind: "keep", text: "have a call running late" },
      { kind: "add", text: " 🙏" },
    ],
    polished: "yeah 7pm works — actually let's do 8, i have a call running late 🙏",
    incoming: ["we still on for dinner thursday?"],
  },

  gmail: {
    prompt:
      "Try saying: “hey David those slide 7 numbers are quarter over quarter, actually wait they're year over year, I'll add a footnote before Tuesday”",
    diff: [
      { kind: "remove", text: "hey David " },
      { kind: "add", text: "Hi David,\n\n" },
      { kind: "keep", text: "those slide 7 numbers are " },
      { kind: "remove", text: "quarter over quarter, actually wait they're " },
      { kind: "keep", text: "year over year" },
      { kind: "add", text: " (not quarter-over-quarter — " },
      { kind: "keep", text: ", I'll add a footnote before Tuesday" },
      { kind: "remove", text: "" },
      { kind: "add", text: " to make that clear)." },
      { kind: "add", text: "\n\nThanks,\nNoan" },
    ],
    polished:
      "Hi David,\n\nThe numbers on slide 7 are year-over-year (not quarter-over-quarter — I'll add a footnote before Tuesday to make that clear).\n\nThanks,\nNoan",
  },
};

const TARGETS: Array<{ id: AppId; src: string; alt: string }> = [
  { id: "slack", src: "/logos/slack.png", alt: "Slack" },
  { id: "imsg", src: "/logos/imessage.png", alt: "iMessage" },
  { id: "gmail", src: "/logos/gmail.webp", alt: "Gmail" },
];

export function LiveDemo() {
  const [target, setTarget] = useState<AppId>("slack");
  const [phase, setPhase] = useState<Phase>("idle");
  const [flashing, setFlashing] = useState(false);
  const [showComposeCard, setShowComposeCard] = useState(target === "gmail");

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cleanup = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);
  const schedule = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
  }, []);

  useEffect(() => {
    if (phase === "idle") {
      setShowComposeCard(target === "gmail");
    }
  }, [target, phase]);

  const resetVisuals = useCallback(() => {
    cleanup();
    setPhase("idle");
    setFlashing(false);
    setShowComposeCard(target === "gmail");
  }, [cleanup, target]);

  const runMockedDemo = useCallback(() => {
    cleanup();
    setPhase("listening");
    setFlashing(false);
    if (target === "gmail") setShowComposeCard(true);

    schedule(() => setPhase("polishing"), 1100);
    schedule(() => {
      setPhase("pasted");
      setFlashing(true);
    }, 2400);
    schedule(() => setFlashing(false), 3000);
    schedule(() => resetVisuals(), 8500);
  }, [cleanup, schedule, target, resetVisuals]);

  useEffect(() => {
    const holdingRef = { current: false };
    return pillBus.on((e) => {
      if (e === "hold-start") {
        holdingRef.current = true;
      } else if (e === "hold-end" && holdingRef.current) {
        holdingRef.current = false;
        runMockedDemo();
      }
    });
  }, [runMockedDemo]);

  useEffect(() => () => cleanup(), [cleanup]);

  const sc = SCENARIOS[target];
  const showDiff = phase === "polishing" || phase === "pasted";
  const polished = phase === "pasted";

  return (
    <section id="demo" className="demo-section">
      <div className="demo-inner">
        <h2 className="demo-title">
          Try it. <em>Right here.</em>
        </h2>

        <div className="demo-cta">
          <span className="demo-cta-prefix">Hold</span>
          <span className="demo-keycap">Control</span>
          <span className="demo-cta-suffix">to see it work</span>
        </div>

        <div className="demo-picker-row demo-picker-row--bare">
          <span className="lbl">Target</span>
          {TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`demo-picker ${target === t.id ? "on" : ""}`}
              onClick={() => {
                setTarget(t.id);
                resetVisuals();
              }}
              aria-pressed={target === t.id}
              aria-label={`Target ${t.alt}`}
            >
              <Image src={t.src} alt={t.alt} width={32} height={32} />
            </button>
          ))}
        </div>

        <div className="demo-stage-bare">
          <div className="demo-diff-region">
            {phase === "idle" ? (
              <p className="demo-prompt">{sc.prompt}</p>
            ) : (
              <DiffBubble
                show={showDiff}
                polished={polished}
                tokens={sc.diff}
              />
            )}
          </div>

          <div className="app-frame">
            {target === "slack" && (
              <SlackShell
                phase={phase}
                polished={sc.polished}
                initialMessage={sc.initialMessage ?? ""}
                flashing={flashing}
                extended
              />
            )}
            {target === "imsg" && (
              <ImessageShell
                phase={phase}
                polished={sc.polished}
                incoming={sc.incoming ?? []}
                flashing={flashing}
              />
            )}
            {target === "gmail" && (
              <GmailShell
                phase={phase}
                polished={sc.polished}
                showComposeCard={showComposeCard}
                flashing={flashing}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Two-line diff bubble:
//   row 1 = raw (with deletions struck through in red)
//   row 2 = polished (with additions highlighted in cobalt)
// Both rows are always laid out — we only swap which is opaque. This
// guarantees the bubble never reflows mid-transition.
function DiffBubble({
  show,
  polished,
  tokens,
}: {
  show: boolean;
  polished: boolean;
  tokens: DiffToken[];
}) {
  return (
    <div
      className={`diff-bubble ${show ? "show" : ""} ${polished ? "is-polished" : "is-raw"}`}
    >
      <span className="diff-label">{polished ? "polished" : "heard"}</span>

      <div className="diff-row diff-row--raw">
        {tokens
          .filter((t) => t.kind !== "add")
          .map((t, i) =>
            t.kind === "remove" ? (
              <span key={i} className="t-remove">
                {t.text}
              </span>
            ) : (
              <span key={i} className="t-keep">
                {t.text}
              </span>
            ),
          )}
      </div>

      <div className="diff-row diff-row--polished">
        {tokens
          .filter((t) => t.kind !== "remove")
          .map((t, i) =>
            t.kind === "add" ? (
              <span key={i} className="t-add">
                {t.text}
              </span>
            ) : (
              <span key={i} className="t-keep">
                {t.text}
              </span>
            ),
          )}
      </div>
    </div>
  );
}
