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
  /**
   * Optional. Several sections carry their argument entirely in the
   * demo below the header, and a line of body copy there was restating
   * what the animation was about to show.
   *
   * Without one the header drops to a single column — the two-column
   * split exists to hang the lede beside the headline, and keeping it
   * empty would strand the right third, which is the exact thing this
   * layout was built to avoid.
   */
  lede?: ReactNode;
}) {
  // lede accepts nodes, not just strings — some sections italicise inside it.
  return (
    <Reveal>
      <div className={`sec-head ${lede ? "" : "sec-head--solo"}`}>
        <div>
          <div className="sec-eyb-row">
            <span className="sec-num">{num}</span>
            <p className="sec-eyb">{eyebrow}</p>
            {pro && <span className="pro-tag">Pro</span>}
          </div>
          <h2 className="sec-title">{title}</h2>
        </div>
        {lede && <p className="sec-lede">{lede}</p>}
      </div>
    </Reveal>
  );
}
