import { Reveal } from "./Reveal";

// Two tiers. The old Lifetime/BYOK card is gone — see
// docs/pricing-and-economics.md. Free is genuinely unlimited: local
// transcription costs nothing and cleanup is rounding-error COGS, so the
// meter isn't the lever. The four Pro features are.

const FREE = [
  "Unlimited dictation, no word caps",
  "Cleanup on every one",
  "Dev dictionary",
  "Tap · hold · double-tap",
];

const PRO = [
  "Everything in Free",
  "Prompt shaping",
  "Select and rewrite",
  "Persistent context",
  "Per-app polish",
];

const TRUST = [
  ["Trial", "No card"],
  ["Audio", "Never stored"],
  ["Training", "Never on your data"],
  ["Cancel", "One click"],
];

function Check({ dark }: { dark?: boolean }) {
  return (
    <svg
      className="pc-check"
      viewBox="0 0 16 16"
      fill="none"
      stroke={dark ? "#f3a08f" : "var(--accent)"}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 5" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="section">
      <div className="section-inner">
        <Reveal>
          <div className="sec-center">
            <h2 className="sec-title">
              Free is <em>actually free</em>.
            </h2>
            <p className="sec-lede">Pay only for the four features that do the work.</p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="pricing-grid">
            {/* Free */}
            <div className="price-card price-card--free">
              <div className="price-head">
                <p className="price-name">Free</p>
                <p className="price-sub">No card · no limit</p>
              </div>

              <div className="price-amount">
                <span className="price-cur">$</span>
                <span className="price-num">0</span>
                <span className="price-per">forever</span>
              </div>

              <ul className="price-list">
                {FREE.map((item) => (
                  <li key={item}>
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <a href="#download" className="price-cta price-cta--dark">
                Start yapping
              </a>
            </div>

            {/* Pro */}
            <div className="price-card price-card--pro">
              <div className="price-head">
                <p className="price-name">Pro</p>
                <p className="price-sub price-sub--light">Everything, unlimited</p>
              </div>

              <div className="price-amount">
                <span className="price-cur price-cur--light">$</span>
                <span className="price-num">9</span>
                <span className="price-per price-per--light">per month</span>
              </div>

              <ul className="price-list price-list--dark">
                {PRO.map((item) => (
                  <li key={item}>
                    <Check dark />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <a href="#download" className="price-cta price-cta--cream">
                Start yapping
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="price-trust">
            {TRUST.map(([k, v]) => (
              <div key={k} className="price-trust-cell">
                <p className="price-trust-k">{k}</p>
                <p className="price-trust-v">{v}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
