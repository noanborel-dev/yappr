"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlackShell } from "./shells/SlackShell";
import { ImessageShell } from "./shells/ImessageShell";
import { GmailShell } from "./shells/GmailShell";
import { Pill } from "./Pill";

// Inline hero caption — keeps the chunk-streaming behavior the hero
// prototype was designed around. The Section-3 Caption is a different
// (simpler) component now.
function HeroCaption({
  show,
  label,
  labelTone = "default",
  rawChunks,
  polished,
  showPolished,
}: {
  show: boolean;
  label: string;
  labelTone?: "default" | "polished";
  rawChunks: Array<{ text: string; strike?: boolean }>;
  polished?: string;
  showPolished: boolean;
}) {
  return (
    <div className={`caption ${show ? "show" : ""}`}>
      <span
        className={`caption-label ${labelTone === "polished" ? "polished" : ""}`}
      >
        {label}
      </span>
      {showPolished && polished ? (
        <div className="polished">{polished}</div>
      ) : (
        <div className="raw">
          {rawChunks.map((c, i) =>
            c.strike ? (
              <span key={i} className="strike">
                {c.text}
              </span>
            ) : (
              <span key={i}>{c.text}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

type AppId = "slack" | "imsg" | "gmail";
type Phase = "idle" | "listening" | "polishing" | "pasted";

interface Scenario {
  id: AppId;
  // chunks of raw transcript that stream into the caption track
  chunks: Array<{ text: string; strike?: boolean }>;
  polished: string;
  // extra props specific to each app shell
  initialMessage?: string; // Slack
  incoming?: string[]; // iMessage
}

const SCENARIOS: Scenario[] = [
  {
    id: "slack",
    chunks: [
      { text: "hey " },
      { text: "um ", strike: true },
      { text: "yeah Friday works " },
      { text: "actually wait " },
      { text: "I have lunch at 12 " },
      { text: "can we do 2 instead?" },
    ],
    polished:
      "Hey, Friday works — actually could we do 2 instead of 12? I have a lunch then.",
    initialMessage: "hey — still good for Friday?",
  },
  {
    id: "imsg",
    chunks: [
      { text: "yes " },
      { text: "totally " },
      { text: "ramen sounds " },
      { text: "perfect " },
      { text: "let's do " },
      { text: "like 7ish?" },
    ],
    polished: "yes totally ramen sounds perfect, let's do like 7ish 🍜",
    incoming: ["we still on for dinner thursday?", "i can do that ramen place if you want 🍜"],
  },
  {
    id: "gmail",
    chunks: [
      { text: "Hi David " },
      { text: "um ", strike: true },
      { text: "those numbers on slide 7 " },
      { text: "are quarter " },
      { text: "over quarter " },
      { text: "I'll add a footnote " },
      { text: "before Tuesday." },
    ],
    polished:
      "Hi David — those numbers on slide 7 are quarter-over-quarter. I'll add a footnote before Tuesday to make it clear. Thanks for catching it.",
  },
];

const APP_TABS = [
  { id: "slack" as const, src: "/logos/slack.png", alt: "Slack" },
  { id: "imsg" as const, src: "/logos/imessage.png", alt: "iMessage" },
  { id: "gmail" as const, src: "/logos/gmail.webp", alt: "Gmail" },
];

export function Hero() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressiveChunks, setProgressiveChunks] = useState<
    Array<{ text: string; strike?: boolean }>
  >([]);
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

  const runScenario = useCallback(
    (idx: number) => {
      cleanup();
      const sc = SCENARIOS[idx];
      setActiveIdx(idx);
      setPhase("idle");
      setProgressiveChunks([]);
      setFlashing(false);
      setShowComposeCard(false);

      // 0.0s — app fades in (handled via CSS .active class on render)
      // 0.4s — Gmail only: compose card slides up
      if (sc.id === "gmail") {
        schedule(() => setShowComposeCard(true), 400);
      }

      // 0.4s — pill rises, listening starts
      schedule(() => setPhase("listening"), 400);

      // 0.7s onward — stream chunks into caption, 220ms apart (matches pill bars cadence)
      const chunkStart = 700;
      const chunkInterval = 320;
      sc.chunks.forEach((chunk, i) => {
        schedule(
          () => setProgressiveChunks((prev) => [...prev, chunk]),
          chunkStart + i * chunkInterval,
        );
      });

      // After last chunk + 500ms buffer, flip to polishing
      const polishingAt = chunkStart + sc.chunks.length * chunkInterval + 500;
      schedule(() => setPhase("polishing"), polishingAt);

      // 600ms later, caption morphs to polished + pill flips to done + paste lands
      schedule(() => {
        setPhase("pasted");
        setFlashing(true);
      }, polishingAt + 600);

      // Drop flash after 0.6s so it can replay next cycle
      schedule(() => setFlashing(false), polishingAt + 1200);

      // Hold ~2.5s, then advance
      schedule(() => {
        runScenario((idx + 1) % SCENARIOS.length);
      }, polishingAt + 3100);
    },
    [cleanup, schedule],
  );

  useEffect(() => {
    runScenario(0);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sc = SCENARIOS[activeIdx];

  const captionLabel =
    phase === "polishing"
      ? "polishing…"
      : phase === "pasted"
        ? "polished"
        : "heard";

  return (
    <section
      id="hero"
      className="max-w-[1340px] mx-auto px-8 pt-10 pb-[12vh] min-h-[92vh] flex flex-col justify-center"
    >
      <div className="hero-grid">
        {/* Left: headline + CTA */}
        <div>
          <h1 className="font-serif font-normal text-[clamp(56px,8vw,92px)] leading-[0.92] tracking-[-0.02em] m-0 mb-6">
            Speak naturally.
            <br />
            Send <em>without</em> editing.
          </h1>
          <p className="text-[18px] text-ink-2 max-w-[440px] leading-[1.5] mb-9 m-0">
            Voice to clean text, anywhere you type.
          </p>
          <a
            href="#download"
            className="inline-flex items-center gap-2.5 bg-ink text-cream px-[24px] py-[14px] rounded-full text-[15.5px] font-semibold no-underline"
          >
            Download for Mac
          </a>
        </div>

        {/* Right: animated stage */}
        <div className="hero-right">
          <div className="hero-stage">
            {/* Mount only the active shell so timeouts don't conflict */}
            {sc.id === "slack" && (
              <SlackShell
                phase={phase}
                polished={sc.polished}
                initialMessage={sc.initialMessage ?? ""}
                flashing={flashing}
              />
            )}
            {sc.id === "imsg" && (
              <ImessageShell
                phase={phase}
                polished={sc.polished}
                incoming={sc.incoming ?? []}
                flashing={flashing}
              />
            )}
            {sc.id === "gmail" && (
              <GmailShell
                phase={phase}
                polished={sc.polished}
                showComposeCard={showComposeCard}
                flashing={flashing}
              />
            )}

            <div className="hero-pill-region">
              <HeroCaption
                show={phase !== "idle"}
                label={captionLabel}
                labelTone={
                  phase === "polishing" || phase === "pasted"
                    ? "polished"
                    : "default"
                }
                rawChunks={progressiveChunks}
                polished={sc.polished}
                showPolished={phase === "pasted"}
              />
              {phase !== "idle" && (
                <Pill
                  state={
                    phase === "listening"
                      ? "listening"
                      : phase === "polishing"
                        ? "polishing"
                        : "done"
                  }
                  label={phase === "pasted" ? "pasted" : undefined}
                />
              )}
            </div>
          </div>

          {/* Tabs as indicators only — no clicks */}
          <div className="hero-tabs">
            {APP_TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${sc.id === t.id ? "on" : ""}`}
                aria-hidden="true"
              >
                <Image src={t.src} alt={t.alt} width={26} height={26} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
