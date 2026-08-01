"use client";

import { useState } from "react";
import { SectionHeader } from "./SectionHeader";

const FREE_FEATURES = [
  "2,000 words / week of cloud dictation",
  "Unlimited local Whisper (Fast & Balanced)",
  "Light cleanup + brand-name fixes",
  "Tap · hold · double-tap",
  "macOS — Windows & Linux soon",
];

const PRO_FEATURES = [
  "Everything in Free, no weekly cap",
  "Unlimited cloud transcription",
  "Full LLM polish at every strictness",
  "Command mode — rewrite my selection",
  "Emoji in messages, on demand",
  "Accurate local tier (large-v3-turbo)",
  "Priority queue at peak hours",
];

const LIFETIME_FEATURES = [
  "Everything in Pro, forever",
  "Bring your own Groq key",
  "Audio bypasses our servers entirely",
  "Every future Pro feature included",
  "One payment. No renewals. Ever.",
];

export function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const proPrice = billing === "annual" ? 8 : 10;
  const proPeriod = billing === "annual" ? "/ mo, billed annually" : "/ mo";
  // Payments aren't live yet — keep Pro CTA as an interest signal so
  // users don't get sent to a #download anchor expecting to be charged.
  const proCTA = "Notify me when Pro launches";

  return (
    <section id="pricing" className="max-w-[1240px] mx-auto px-8 py-16">
      <SectionHeader
        title={
          <>
            Honest pricing. <em>No catch.</em>
          </>
        }
        lede="Most dictation apps charge $15/mo, every month, forever. We charge $10 — or let you pay once and own it. Free tier is genuinely free, weekly limit only."
      />

      {/* Billing toggle */}
      <div className="flex justify-center mb-8">
        <div
          className="inline-flex items-center p-1 rounded-full"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--line)",
          }}
          role="tablist"
          aria-label="Billing period"
        >
          <button
            type="button"
            role="tab"
            aria-selected={billing === "monthly"}
            onClick={() => setBilling("monthly")}
            className="px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors"
            style={{
              background: billing === "monthly" ? "var(--ink)" : "transparent",
              color: billing === "monthly" ? "var(--cream)" : "var(--ink-2)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={billing === "annual"}
            onClick={() => setBilling("annual")}
            className="px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors inline-flex items-center gap-2"
            style={{
              background: billing === "annual" ? "var(--ink)" : "transparent",
              color: billing === "annual" ? "var(--cream)" : "var(--ink-2)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Annual
            <span
              className="font-mono text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full"
              style={{
                background:
                  billing === "annual"
                    ? "rgba(158,251,168,.18)"
                    : "rgba(45,122,79,.10)",
                color: billing === "annual" ? "#9efba8" : "#2d7a4f",
              }}
            >
              −20%
            </span>
          </button>
        </div>
      </div>

      <div
        className="bg-white border border-line rounded-3xl p-10"
        style={{
          boxShadow: "0 30px 60px -30px rgba(20,30,50,.18)",
        }}
      >
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
        >
          {/* Free */}
          <div
            className="rounded-[18px] border border-line p-[28px] flex flex-col"
            style={{
              background: "linear-gradient(170deg,#fbf9f1,#efe9d8)",
            }}
          >
            <p className="font-serif italic text-[26px] leading-none mb-1">
              Free
            </p>
            <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted mb-6">
              No card · weekly limit
            </p>
            <div className="font-serif flex items-baseline gap-1.5 mb-2">
              <span className="text-[28px] text-muted leading-none">$</span>
              <span className="text-[76px] leading-none tracking-[-0.02em]">
                0
              </span>
            </div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted mb-7">
              2,000 words / week
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[14px] mb-7 flex-1">
              {FREE_FEATURES.map((item) => (
                <li key={item} className="flex gap-2 items-start">
                  <span className="text-accent font-bold text-[18px] leading-[1]">
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-[18px] py-3 rounded-full text-[13.5px] font-semibold no-underline self-stretch"
            >
              Download free
            </a>
          </div>

          {/* Pro — highlighted */}
          <div
            className="relative rounded-[18px] p-[28px] flex flex-col overflow-hidden"
            style={{
              background: "linear-gradient(170deg,#1a1c22,#0e1118)",
              color: "var(--cream)",
              boxShadow: "0 24px 48px -24px rgba(20,30,50,.55)",
              transform: "translateY(-8px)",
            }}
          >
            {/* Subtle accent glow */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -80,
                right: -60,
                width: 240,
                height: 240,
                borderRadius: 999,
                background:
                  "radial-gradient(closest-side, rgba(200,85,61,.20), transparent 70%)",
                pointerEvents: "none",
              }}
            />

            <span
              className="absolute font-mono text-[10.5px] tracking-[0.12em] uppercase"
              style={{
                top: 18,
                right: 22,
                padding: "4px 9px",
                borderRadius: 999,
                background: "rgba(200,85,61,.25)",
                color: "#f3a08f",
                border: "1px solid rgba(200,85,61,.40)",
              }}
            >
              Coming soon
            </span>

            <p className="font-serif italic text-[26px] leading-none mb-1">
              Pro
            </p>
            <p
              className="font-mono text-[10.5px] tracking-[0.12em] uppercase mb-6"
              style={{ color: "#bcb8a8" }}
            >
              Managed cloud · unlimited
            </p>
            <div className="font-serif flex items-baseline gap-1.5 mb-2">
              <span
                className="text-[28px] leading-none"
                style={{ color: "#bcb8a8" }}
              >
                $
              </span>
              <span className="text-[76px] leading-none tracking-[-0.02em]">
                {proPrice}
              </span>
              <span
                className="font-mono text-[11px] tracking-[0.08em] uppercase ml-2 mb-2"
                style={{ color: "#bcb8a8", alignSelf: "flex-end" }}
              >
                {proPeriod}
              </span>
            </div>
            <p
              className="font-mono text-[11px] tracking-[0.1em] uppercase mb-7"
              style={{ color: "#bcb8a8" }}
            >
              {billing === "annual"
                ? "$96 / year — save $24"
                : "Switch to annual, save $24"}
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[14px] mb-7 flex-1">
              {PRO_FEATURES.map((item, i) => (
                <li key={item} className="flex gap-2 items-start">
                  <span
                    className="font-bold text-[18px] leading-[1]"
                    style={{ color: i === 0 ? "#bcb8a8" : "#f3a08f" }}
                  >
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="mailto:hello@yappr.app?subject=Notify%20me%20when%20Pro%20launches"
              className="inline-flex items-center justify-center gap-2 px-[18px] py-3 rounded-full text-[13.5px] font-semibold no-underline self-stretch"
              style={{
                background: "var(--cream)",
                color: "var(--ink)",
              }}
            >
              {proCTA}
            </a>
            <p
              className="text-[12px] mt-3 m-0 text-center"
              style={{ color: "#9a9789" }}
            >
              Wispr &amp; Willow charge $15. We&rsquo;ll charge ${proPrice}.
            </p>
          </div>

          {/* Lifetime */}
          <div
            className="relative rounded-[18px] border p-[28px] flex flex-col overflow-hidden"
            style={{
              background: "linear-gradient(170deg,#fff,#f6f2e7)",
              borderColor: "var(--line)",
            }}
          >
            <span
              className="absolute font-mono text-[10.5px] tracking-[0.12em] uppercase"
              style={{
                top: 18,
                right: 22,
                padding: "4px 9px",
                borderRadius: 999,
                background: "rgba(45,122,79,.10)",
                color: "#2d7a4f",
                border: "1px solid rgba(45,122,79,.28)",
              }}
            >
              Coming soon
            </span>
            <p className="font-serif italic text-[26px] leading-none mb-1">
              Lifetime
            </p>
            <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted mb-6">
              Pay once · BYOK forever
            </p>
            <div className="font-serif flex items-baseline gap-1.5 mb-2">
              <span className="text-[28px] text-muted leading-none">$</span>
              <span className="text-[76px] leading-none tracking-[-0.02em]">
                99
              </span>
              <span
                className="font-mono text-[11px] tracking-[0.08em] uppercase text-muted ml-2 mb-2"
                style={{ alignSelf: "flex-end" }}
              >
                / forever
              </span>
            </div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted mb-7">
              your Groq key · no renewals
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[14px] mb-7 flex-1">
              {LIFETIME_FEATURES.map((item, i) => (
                <li key={item} className="flex gap-2 items-start">
                  <span
                    className="font-bold text-[18px] leading-[1]"
                    style={{
                      color: i === 0 ? "var(--muted)" : "var(--accent)",
                    }}
                  >
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="mailto:hello@yappr.app?subject=Notify%20me%20when%20Lifetime%20launches"
              className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-[18px] py-3 rounded-full text-[13.5px] font-semibold no-underline self-stretch"
            >
              Notify me when it launches
            </a>
            <p className="text-[12px] mt-3 m-0 text-center text-muted">
              Cheaper than Pro after 10 months. Forever after that.
            </p>
          </div>
        </div>

        {/* Trust strip — what every plan gets */}
        <div
          className="mt-10 pt-8 grid gap-6 text-center"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          {[
            { k: "Audio", v: "Never stored" },
            { k: "Training", v: "Never on your data" },
            { k: "Cancel", v: "One click, any time" },
            { k: "Local mode", v: "Works on every plan" },
          ].map((cell) => (
            <div key={cell.k}>
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted m-0 mb-1.5">
                {cell.k}
              </p>
              <p className="font-serif italic text-[18px] leading-[1.1] m-0">
                {cell.v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
