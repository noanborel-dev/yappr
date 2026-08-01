"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlackShell } from "./shells/SlackShell";
import { ImessageShell } from "./shells/ImessageShell";
import { GmailShell } from "./shells/GmailShell";
import { ClaudeCodeShell, type PromptLine } from "./shells/ClaudeCodeShell";
import { pillBus } from "./pillBus";

type AppId = "term" | "slack" | "imsg" | "gmail";
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
  // Terminal target only: the structured prompt lands in the Claude Code
  // shell rather than in the bubble, so the bubble stays raw-only.
  shaped?: PromptLine[];
  initialMessage?: string;
  incoming?: string[];
}

const SCENARIOS: Record<AppId, Scenario> = {
  // Terminal — the default. Rambling request becomes a sectioned prompt.
  term: {
    prompt:
      "Try saying: “the retry logic is wrong, it retries on 400s too, should only be 429 and 5xx, and cap it at three”",
    diff: [
      { kind: "keep", text: "the retry logic is wrong, " },
      { kind: "remove", text: "um " },
      { kind: "keep", text: "it retries on 400s too, should only be 429 and 5xx, and cap it at three" },
    ],
    polished: "",
    shaped: [
      { kind: "heading", text: "## Goal" },
      { kind: "text", text: "Fix retry logic to only retry on retryable status codes." },
      { kind: "blank" },
      { kind: "heading", text: "## Tasks" },
      { kind: "item", text: "Stop retrying on 4xx responses (currently retries on 400)." },
      { kind: "item", text: "Retry only on 429 and 5xx." },
      { kind: "item", text: "Cap retries at 3 attempts." },
    ],
  },

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

const TARGETS: Array<{ id: AppId; src?: string; glyph?: string; alt: string }> = [
  { id: "term", glyph: "›_", alt: "Terminal" },
  { id: "slack", src: "/logos/slack.png", alt: "Slack" },
  { id: "imsg", src: "/logos/imessage.png", alt: "iMessage" },
  { id: "gmail", src: "/logos/gmail.webp", alt: "Gmail" },
];

type Gesture = { id: "tap" | "hold" | "double"; name: string; label: string };

const GESTURES: Gesture[] = [
  { id: "tap", name: "Tap", label: "toggle recording" },
  { id: "hold", name: "Hold", label: "push to talk" },
  { id: "double", name: "Double-tap", label: "re-paste the last one" },
];

// The old three-panel hotkey section, compressed to a single animated row.
// Each keycap plays its own gesture when it's the active one — a static
// chip row read as dead, which is what it was before.
function GestureRow() {
  const [active, setActive] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [tapped, setTapped] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const at = (fn: () => void, ms: number) => {
      timeouts.current.push(setTimeout(fn, ms));
    };
    const press = (ms: number, dur = 170) => {
      at(() => {
        setPressed(true);
        setTapped(true);
      }, ms);
      at(() => {
        setPressed(false);
        setTapped(false);
      }, ms + dur);
    };

    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    setPressed(false);
    setHolding(false);
    setTapped(false);

    const mode = GESTURES[active].id;
    if (mode === "tap") {
      press(500);
      press(1900);
    } else if (mode === "hold") {
      at(() => {
        setPressed(true);
        setHolding(true);
      }, 500);
      at(() => {
        setPressed(false);
        setHolding(false);
      }, 2200);
    } else {
      press(600, 130);
      press(830, 130);
    }

    at(() => setActive((i) => (i + 1) % GESTURES.length), 3200);
    return () => {
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
    };
  }, [active]);

  return (
    <ul className="demo-gestures" aria-label="Hotkey behaviors">
      {GESTURES.map((g, i) => {
        const on = i === active;
        return (
          <li key={g.id} className={on ? "on" : ""}>
            <span
              className={`tb-keycap tb-keycap--sm ${on && pressed ? "pressed" : ""} ${
                on && holding ? "holding" : ""
              } ${on && tapped ? "tap" : ""}`}
              aria-hidden="true"
            >
              <span className="tb-keycap__ripple" />
              <span className="tb-keycap__glyph">⌃</span>
            </span>
            <span className="demo-gesture-copy">
              <span className="demo-gesture-key">{g.name}</span>
              <span className="demo-gesture-label">{g.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function LiveDemo() {
  const [target, setTarget] = useState<AppId>("term");
  const [phase, setPhase] = useState<Phase>("idle");
  const [flashing, setFlashing] = useState(false);
  const [showComposeCard, setShowComposeCard] = useState(false);

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
        {/* No headline here — the Statement chapter break immediately above
            already says "Enough reading. Hold a key." Two big serif lines
            back to back was the same sentence twice. */}
        {/* The Statement above already says what to do. This is just the
            invitation and the target. */}
        <div className="demo-try">
          <span className="demo-try-label">Try it now</span>
          <span className="demo-keycap demo-keycap--live">
            Control
            <span className="demo-keycap-ring" aria-hidden="true" />
          </span>
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
              {t.src ? (
                <Image src={t.src} alt={t.alt} width={32} height={32} />
              ) : (
                <span className="demo-picker-glyph" aria-hidden="true">
                  {t.glyph}
                </span>
              )}
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
                rawOnly={Boolean(sc.shaped)}
              />
            )}
          </div>

          <div className="app-frame">
            {target === "term" && (
              <div className="hero-app active">
                <ClaudeCodeShell
                  lines={polished ? (sc.shaped ?? []) : []}
                  caret={!polished}
                  flashing={flashing}
                />
              </div>
            )}
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

        <GestureRow />
      </div>
    </section>
  );
}

// Two-line diff bubble:
//   row 1 = raw (with deletions struck through in red)
//   row 2 = polished (with additions highlighted in cobalt)
// Both rows are always laid out — we only swap which is opaque. This
// guarantees the bubble never reflows mid-transition.
//
// `rawOnly` is the terminal case: the polished result is a multi-section
// markdown prompt that lands in the shell below, so a second bubble row
// would just duplicate it.
function DiffBubble({
  show,
  polished,
  tokens,
  rawOnly,
}: {
  show: boolean;
  polished: boolean;
  tokens: DiffToken[];
  rawOnly?: boolean;
}) {
  return (
    <div
      className={`diff-bubble ${show ? "show" : ""} ${
        polished && !rawOnly ? "is-polished" : "is-raw"
      } ${rawOnly ? "is-rawonly" : ""}`}
    >
      <span className="diff-label">
        {polished && !rawOnly ? "polished" : "heard"}
      </span>

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

      {!rawOnly && (
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
      )}
    </div>
  );
}
