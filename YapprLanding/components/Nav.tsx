import { PillLogo } from "./PillLogo";

export function Nav() {
  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: "rgba(246,242,231,.78)",
        backdropFilter: "saturate(140%) blur(10px)",
        WebkitBackdropFilter: "saturate(140%) blur(10px)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-10 h-[72px] flex items-center gap-8">
        <a href="#top" aria-label="Yappr home" className="flex items-center">
          <PillLogo size="md" />
        </a>

        <ul className="hidden md:flex gap-7 flex-1 ml-6 list-none">
          {[
            { href: "#demo", label: "Try it" },
            { href: "#hotkey", label: "Hotkey" },
            { href: "#ai-coding", label: "AI coding" },
            { href: "#local", label: "Local" },
            { href: "#privacy", label: "Privacy" },
            { href: "#pricing", label: "Pricing" },
            { href: "#faq", label: "FAQ" },
          ].map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-[14.5px] font-medium text-ink-2 hover:text-ink transition-colors no-underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex gap-3 items-center ml-auto">
          <a
            href="#"
            className="hidden sm:inline-flex items-center px-[18px] py-[11px] rounded-full text-[14.5px] font-semibold border border-line text-ink-2 hover:bg-white transition-colors no-underline"
          >
            Sign in
          </a>
          <a
            href="#download"
            className="inline-flex items-center gap-2 px-[18px] py-[11px] rounded-full text-[14.5px] font-semibold bg-ink text-cream hover:opacity-95 transition-opacity no-underline"
          >
            Download
            <span
              className="font-mono font-medium px-[7px] py-[2px] rounded text-[12px]"
              style={{
                background: "rgba(255,255,255,.12)",
                border: "1px solid rgba(255,255,255,.18)",
              }}
            >
              macOS
            </span>
          </a>
        </div>
      </div>
    </nav>
  );
}
