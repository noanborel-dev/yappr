import { PillLogo } from "./PillLogo";

export function FinalCTA() {
  return (
    <section id="download" className="max-w-[1240px] mx-auto px-8 py-16">
      <div
        className="rounded-3xl border border-line text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(170deg,#fbf9f1 0%,#efe9d8 100%)",
          padding: "120px 56px",
        }}
      >
        <h2 className="font-serif font-normal text-[clamp(64px,12vw,120px)] leading-[0.92] tracking-[-0.02em] m-0 mb-6">
          Stop typing.
          <br />
          <em>Start talking.</em>
        </h2>
        <p className="text-[18px] text-ink-2 max-w-[520px] mx-auto mb-9 m-0">
          2,000 words a week, free. Unlimited at $10/mo. Or pay once.
        </p>
        <a
          href="#"
          className="inline-flex items-center gap-2.5 bg-ink text-cream px-[26px] py-4 rounded-full text-[15.5px] font-semibold no-underline"
        >
          Download for Mac
          <span
            className="font-mono font-medium px-[7px] py-[2px] rounded text-[12px]"
            style={{
              background: "rgba(255,255,255,.12)",
              border: "1px solid rgba(255,255,255,.18)",
            }}
          >
            ⌘ ⇧ D
          </span>
        </a>
        <div className="mt-12 flex justify-center">
          <PillLogo size="md" />
        </div>
      </div>
    </section>
  );
}
