import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

// Every feature section shares one header shape: numbered eyebrow and
// headline on the left, the single line of body copy hung on the right,
// baseline-aligned. It fills the full measure instead of leaving the
// right third empty, and the running number gives the page a spine.

export function SectionHead({
  num,
  eyebrow,
  pro,
  title,
  lede,
}: {
  num: string;
  eyebrow: string;
  pro?: boolean;
  title: ReactNode;
  lede: ReactNode;
}) {
  // lede accepts nodes, not just strings — some sections italicise inside it.
  return (
    <Reveal>
      <div className="sec-head">
        <div>
          <div className="sec-eyb-row">
            <span className="sec-num">{num}</span>
            <p className="sec-eyb">{eyebrow}</p>
            {pro && <span className="pro-tag">Pro</span>}
          </div>
          <h2 className="sec-title">{title}</h2>
        </div>
        <p className="sec-lede">{lede}</p>
      </div>
    </Reveal>
  );
}
