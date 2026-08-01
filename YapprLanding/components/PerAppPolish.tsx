"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Three destinations for the same dictation. The polish prompts in the
// app set the register per category — iMessage stays lowercase
// fragments, Slack stays sentence-case, Gmail goes full email prose
// with greetings/signoffs. Same raw transcript, three different outputs.
const RAW =
  "hey um yeah Friday works — actually wait could we do 2 instead of 12? I have a lunch then";

type Lane = {
  id: "imsg" | "slack" | "gmail";
  app: string;
  logo: string;
  rule: string;
  polished: string;
  emoji?: string;
};

const LANES: Lane[] = [
  {
    id: "imsg",
    app: "iMessage",
    logo: "/logos/imessage.png",
    rule: "lowercase · fragments OK · no signoff",
    polished: "yeah friday works — could we do 2 instead of 12? have a lunch then",
    emoji: "🙏",
  },
  {
    id: "slack",
    app: "Slack",
    logo: "/logos/slack.png",
    rule: "sentence case · casual-pro · one line",
    polished:
      "Hey — Friday works, could we do 2 instead of 12? I have a lunch then.",
  },
  {
    id: "gmail",
    app: "Gmail",
    logo: "/logos/gmail.webp",
    rule: "greeting · prose · signoff",
    polished:
      "Hi —\n\nFriday works for me. Could we shift to 2pm instead of 12? I have a lunch conflict at noon.\n\nThanks,\nNoan",
  },
];

export function PerAppPolish() {
  // Trigger a one-shot "reveal" cycle each time the section enters view —
  // raw transcript at top, three polished outputs fan out below.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      id="polish"
      className="max-w-[1240px] mx-auto px-8 py-16"
    >
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-accent mb-3">
        Per-app polish
      </p>
      <h2 className="font-serif font-normal text-[clamp(56px,8vw,80px)] leading-[0.92] tracking-[-0.02em] m-0 mb-4 max-w-[920px]">
        Same words. <em>Different app, different polish.</em>
      </h2>
      <p className="text-[18px] text-ink-2 max-w-[640px] mb-12 leading-[1.5]">
        Yappr knows where you're typing. iMessage stays lowercase. Slack
        stays casual-pro. Gmail gets the greeting and the signoff.
      </p>

      <div className="pap-stage">
        {/* Raw transcript at the top — the "what was said" */}
        <div className={`pap-raw ${revealed ? "in" : ""}`}>
          <span className="pap-raw-label">heard</span>
          <p className="pap-raw-text">"{RAW}"</p>
          <span className="pap-raw-fanout" aria-hidden="true">
            <span /><span /><span />
          </span>
        </div>

        {/* Three polished bubbles fan out below */}
        <div className="pap-grid">
          {LANES.map((lane, i) => (
            <div
              key={lane.id}
              className={`pap-card pap-card--${lane.id} pap-card--delay-${i} ${revealed ? "in" : ""}`}
            >
              <div className="pap-card-head">
                <span className="pap-card-logo">
                  <Image src={lane.logo} alt={lane.app} width={20} height={20} />
                </span>
                <span className="pap-card-app">{lane.app}</span>
                <span className="pap-card-rule">{lane.rule}</span>
              </div>

              <div className={`pap-card-body pap-card-body--${lane.id}`}>
                {lane.id === "gmail" ? (
                  <pre className="pap-gmail-prose">{lane.polished}</pre>
                ) : (
                  <span className={`pap-bubble pap-bubble--${lane.id}`}>
                    {lane.polished}
                    {lane.emoji ? <span className="pap-emoji-tag">{lane.emoji}<span className="pap-emoji-badge">on</span></span> : null}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tiny disclosure: the emoji on the iMessage bubble only renders
          when the user has the messaging-emoji setting turned on. */}
      <p className="text-[13px] text-muted mt-6 text-center">
        Emoji in messaging is opt-in — off by default, on when it fits.
      </p>
    </section>
  );
}
