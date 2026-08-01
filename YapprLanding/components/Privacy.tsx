// Section 7 — Privacy. Honest framing for managed Free/Pro + BYOK Lifetime + Local mode.
export function Privacy() {
  return (
    <section id="privacy" className="max-w-[1240px] mx-auto px-8 py-16">
      <div
        className="rounded-3xl relative overflow-hidden"
        style={{
          background: "#1a1c22",
          color: "var(--cream)",
          padding: "96px 56px 88px",
          boxShadow: "0 30px 60px -30px rgba(0,0,0,.4)",
        }}
      >
        <div className="text-center">
          <p
            className="font-mono uppercase m-0 mb-5"
            style={{
              color: "#9efba8",
              fontSize: 11,
              letterSpacing: "0.16em",
            }}
          >
            Privacy
          </p>
          <h2
            className="font-serif font-normal text-[clamp(56px,8vw,84px)] leading-[0.95] tracking-[-0.02em] m-0 mx-auto mb-6"
            style={{ color: "var(--cream)", maxWidth: 920 }}
          >
            Your audio is <em>never stored</em>.
          </h2>
          <p
            className="text-[18px] max-w-[720px] mx-auto m-0 leading-[1.55]"
            style={{ color: "#bcb8a8", marginBottom: 64 }}
          >
            Each dictation is transcribed and discarded immediately. Transcripts
            stay on your Mac as recent history — they never leave your machine
            and never reach our database.
          </p>
        </div>

        {/* Three-card story: what happens to your audio under each path */}
        <div
          className="grid gap-4 mx-auto"
          style={{
            maxWidth: 1040,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            marginBottom: 56,
          }}
        >
          {/* Free / Pro — managed cloud */}
          <div
            className="rounded-2xl p-7 flex flex-col gap-3"
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.10)",
            }}
          >
            <span
              className="font-mono uppercase"
              style={{
                color: "#9efba8",
                fontSize: 10,
                letterSpacing: "0.14em",
              }}
            >
              Free · Pro
            </span>
            <p className="font-serif italic text-[24px] leading-[1.05] m-0" style={{ color: "var(--cream)" }}>
              Managed cloud
            </p>
            <p className="text-[14px] leading-[1.55] m-0" style={{ color: "#bcb8a8" }}>
              Audio is forwarded through our proxy to Groq, transcribed, and
              discarded the moment the text comes back. We don&apos;t persist it.
              We don&apos;t train on it.
            </p>
          </div>

          {/* Lifetime — BYOK */}
          <div
            className="rounded-2xl p-7 flex flex-col gap-3"
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.10)",
            }}
          >
            <span
              className="font-mono uppercase"
              style={{
                color: "#9efba8",
                fontSize: 10,
                letterSpacing: "0.14em",
              }}
            >
              Lifetime · BYOK
            </span>
            <p className="font-serif italic text-[24px] leading-[1.05] m-0" style={{ color: "var(--cream)" }}>
              Direct to Groq
            </p>
            <p className="text-[14px] leading-[1.55] m-0" style={{ color: "#bcb8a8" }}>
              With your own key, audio bypasses us entirely — Mac to Groq, over
              TLS. Our servers never see it. Not even in transit.
            </p>
          </div>

          {/* Local */}
          <div
            className="rounded-2xl p-7 flex flex-col gap-3"
            style={{
              background: "rgba(158,251,168,.08)",
              border: "1px solid rgba(158,251,168,.28)",
            }}
          >
            <span
              className="font-mono uppercase"
              style={{
                color: "#9efba8",
                fontSize: 10,
                letterSpacing: "0.14em",
              }}
            >
              Local mode
            </span>
            <p className="font-serif italic text-[24px] leading-[1.05] m-0" style={{ color: "var(--cream)" }}>
              Never leaves your Mac
            </p>
            <p className="text-[14px] leading-[1.55] m-0" style={{ color: "#bcb8a8" }}>
              Whisper runs on-device. No proxy, no cloud, no network call. The
              strongest privacy story we can offer, in two clicks.
            </p>
          </div>
        </div>

        {/* What we DO and DON'T store */}
        <div
          className="grid gap-6 mx-auto"
          style={{
            maxWidth: 880,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <div
            className="rounded-xl p-5"
            style={{
              background: "rgba(232,74,58,.06)",
              border: "1px solid rgba(232,74,58,.22)",
            }}
          >
            <p
              className="font-mono uppercase m-0 mb-2"
              style={{ color: "#e8857a", fontSize: 10, letterSpacing: "0.14em" }}
            >
              Never stored
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-1.5 text-[14px]" style={{ color: "var(--cream)" }}>
              <li>· Your audio, anywhere</li>
              <li>· Transcripts on our servers</li>
              <li>· Training data, ever</li>
            </ul>
          </div>
          <div
            className="rounded-xl p-5"
            style={{
              background: "rgba(158,251,168,.06)",
              border: "1px solid rgba(158,251,168,.22)",
            }}
          >
            <p
              className="font-mono uppercase m-0 mb-2"
              style={{ color: "#9efba8", fontSize: 10, letterSpacing: "0.14em" }}
            >
              Kept only on your Mac
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-1.5 text-[14px]" style={{ color: "var(--cream)" }}>
              <li>· Recent transcripts (your history)</li>
              <li>· Your custom dictionary</li>
              <li>· Settings &amp; preferences</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
