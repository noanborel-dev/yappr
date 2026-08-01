import { PillLogo } from "./PillLogo";
import { ScrollFullBleed } from "./ScrollFullBleed";

// The last thing on the page, so it gets the biggest gesture: the panel
// starts inset with rounded corners and opens edge-to-edge as you scroll
// into it, corners squaring off. Ends as a full-bleed close rather than
// one more card in a column of cards.

export function FinalCTA() {
  return (
    <section id="download" className="cta-section">
      <ScrollFullBleed inset={136} radius={28}>
        <div className="cta-panel">
          <h2 className="cta-title">
            Go on then.
            <br />
            <em>Start yapping.</em>
          </h2>
          <p className="cta-sub">
            Unlimited dictation, free. $9/mo when you want the rest.
          </p>
          <a href="#" className="btn-primary btn-primary--lg">
            Start yapping
            <span className="btn-chip">macOS</span>
          </a>
          <p className="cta-fine">No card required.</p>
          <div className="cta-mark">
            <PillLogo size="md" />
          </div>
        </div>
      </ScrollFullBleed>
    </section>
  );
}
