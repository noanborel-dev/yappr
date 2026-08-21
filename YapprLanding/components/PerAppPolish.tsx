"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ScrollExpand } from "./ScrollExpand";
import { SectionHead } from "./SectionHead";

// Section 5 — proof, not pitch. One dictation, three destinations. The
// per-lane "rule" microcopy and the emoji footnote are gone: the outputs
// themselves show the register better than a caption describing it.

const RAW = "hey yeah friday works — actually could we do 2 instead of 12? I have a lunch then";

type Lane = {
  id: "imsg" | "slack" | "gmail";
  app: string;
  logo: string;
  polished: string;
};

const LANES: Lane[] = [
  {
    id: "imsg",
    app: "iMessage",
    logo: "/logos/imessage.png",
    polished: "yeah friday works — could we do 2 instead of 12? have a lunch then",
  },
  {
    id: "slack",
    app: "Slack",
    logo: "/logos/slack.png",
    polished: "Hey — Friday works, could we do 2 instead of 12? I have a lunch then.",
  },
  {
    id: "gmail",
    app: "Gmail",
    logo: "/logos/gmail.webp",
    polished:
      "Hi —\n\nFriday works for me. Could we shift to 2pm instead of 12? I have a lunch conflict at noon.\n\nThanks,\nNoan",
  },
];

export function PerAppPolish() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <section id="polish" className="section section--tint">
      <div className="section-inner">
        <SectionHead
          num="04"
          eyebrow="Per-app polish"
          pro
          title={
            <>
              You don&rsquo;t only talk to <em>machines</em>.
            </>
          }
          lede="One dictation, three destinations."
        />

        <ScrollExpand from={0.93}>
          <div className="pap-stage">
            <div className={`pap-raw ${revealed ? "in" : ""}`}>
              <span className="pap-raw-label">heard</span>
              <p className="pap-raw-text">&ldquo;{RAW}&rdquo;</p>
              <span className="pap-raw-fanout" aria-hidden="true">
                <span /><span /><span />
              </span>
            </div>

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
                  </div>

                  <div className={`pap-card-body pap-card-body--${lane.id}`}>
                    {lane.id === "gmail" ? (
                      <pre className="pap-gmail-prose">{lane.polished}</pre>
                    ) : (
                      <span className={`pap-bubble pap-bubble--${lane.id}`}>
                        {lane.polished}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollExpand>
      </div>
    </section>
  );
}
