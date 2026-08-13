import { PillLogo } from "./PillLogo";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Try it", href: "#demo" },
      { label: "Prompt shaping", href: "#features" },
      { label: "Select and rewrite", href: "#rewrite" },
      { label: "Persistent context", href: "#context" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Blog", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Press", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Contact", href: "mailto:hello@yappr.app" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      className="border-t"
      style={{
        background: "#15161a",
        color: "#9a9789",
        borderColor: "#2a2c33",
        padding: "64px 0 40px",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-8 grid gap-10 grid-cols-1 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <PillLogo size="sm" />
          <p
            className="m-0 mt-4 text-[13.5px] leading-[1.55] max-w-[280px]"
            style={{ color: "#9a9789" }}
          >
            The voice interface for people who build with AI.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4
              className="m-0 mb-4 font-mono text-[11px] tracking-[0.12em] uppercase font-medium"
              style={{ color: "#bcb8a8" }}
            >
              {col.title}
            </h4>
            <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] no-underline transition-colors hover:text-cream"
                    style={{ color: "#9a9789" }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div
          className="col-span-full border-t pt-6 mt-8 space-y-3"
          style={{ borderColor: "#2a2c33" }}
        >
          <div className="flex justify-between font-mono text-[11px] tracking-[0.08em] uppercase">
            <span>© 2026 Yappr Labs</span>
            <span>Made in San Francisco</span>
          </div>
          <p
            className="text-[11px] leading-[1.55] max-w-[820px] m-0"
            style={{ color: "#6a6859" }}
          >
            Built with Llama. Llama 3 is licensed under the{" "}
            <a
              href="https://www.llama.com/llama3_3/license/"
              className="underline underline-offset-2 hover:text-cream"
              style={{ color: "#8a8779" }}
            >
              Llama 3 Community License
            </a>
            , Copyright © Meta Platforms, Inc. All Rights Reserved. Slack, Gmail,
            iMessage, Notion, Cursor, ChatGPT, Claude, Groq, Llama, and Whisper
            are trademarks of their respective owners. Yappr is not
            affiliated with or endorsed by these companies.
          </p>
        </div>
      </div>
    </footer>
  );
}
