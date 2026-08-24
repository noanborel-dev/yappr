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
      {/* The mark hangs from the centre of the top edge, where the notch
          is on the machine. It is absolutely positioned rather than a
          flex child so it stays centred on the VIEWPORT regardless of
          how wide the nav links and buttons grow — a centred flex item
          drifts as soon as the two sides are uneven, and a logo that
          moves when you add a nav link is not centred, it is coincidental.

          Taking it out of the flow means it can no longer push the links
          aside, so the links wait for `lg` rather than `md`: at 768px the
          centred mark and the last link occupy the same pixels. */}
      <a
        href="#top"
        aria-label="Yappr home"
        className="absolute left-1/2 top-0 -translate-x-1/2 z-10 flex"
      >
        <PillLogo size="md" />
      </a>

      <div className="max-w-[1240px] mx-auto px-10 h-[72px] flex items-center gap-8">
        <ul className="hidden lg:flex gap-7 flex-1 list-none">
          {[
            { href: "#demo", label: "Try it" },
            { href: "#features", label: "Features" },
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
            Start yapping
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
