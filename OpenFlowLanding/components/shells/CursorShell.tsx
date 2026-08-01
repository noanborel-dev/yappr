// Cursor, drawn to match the real editor: activity rail, tab strip,
// gutter line numbers, minimap edge, status bar. The whole point of this
// shell is that it reads as the actual app at a glance — if it looks like
// a generic "code window", it isn't doing its job.

export type CodeLine = { n: number; tokens: Token[] };
export type Token = { t: string; c?: "kw" | "fn" | "str" | "num" | "cmt" | "op" | "var" };

interface Props {
  lines: CodeLine[];
  /** 1-based indices (into `lines`) covered by the selection highlight. */
  selected?: number[];
  fileName?: string;
  flashing?: boolean;
}

export function CursorShell({
  lines,
  selected = [],
  fileName = "pipeline.ts",
  flashing,
}: Props) {
  return (
    <div className="cur2">
      <div className="cur2-title">
        <span className="tl r" />
        <span className="tl y" />
        <span className="tl g" />
        <span className="cur2-title-text">{fileName} — yappr</span>
      </div>

      <div className="cur2-main">
        <nav className="cur2-rail" aria-hidden="true">
          {["files", "search", "git", "debug", "ext"].map((k, i) => (
            <span key={k} className={`cur2-rail-ico ${i === 0 ? "on" : ""}`}>
              <RailIcon kind={i} />
            </span>
          ))}
        </nav>

        <div className="cur2-pane">
          <div className="cur2-tabs">
            <span className="cur2-tab on">
              <span className="cur2-ts" aria-hidden="true">
                TS
              </span>
              {fileName}
              <span className="cur2-dot" aria-hidden="true" />
            </span>
            <span className="cur2-tab">
              <span className="cur2-ts" aria-hidden="true">
                TS
              </span>
              prompts.ts
            </span>
          </div>

          <div className={`cur2-code ${flashing ? "land-flash" : ""}`}>
            {lines.map((ln, i) => (
              <div
                key={ln.n}
                className={`cur2-line ${selected.includes(i + 1) ? "sel" : ""}`}
              >
                <span className="cur2-num">{ln.n}</span>
                <code className="cur2-src">
                  {ln.tokens.map((tk, j) => (
                    <span key={j} className={tk.c ? `t-${tk.c}` : undefined}>
                      {tk.t}
                    </span>
                  ))}
                </code>
              </div>
            ))}
          </div>

          <div className="cur2-status" aria-hidden="true">
            <span className="cur2-branch">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="6" cy="18" r="2.5" />
                <circle cx="18" cy="8" r="2.5" />
                <path d="M6 8.5v7M8.5 7.2h4A3 3 0 0 1 15.5 10v0" strokeLinecap="round" />
              </svg>
              feat/streaming
            </span>
            <span className="cur2-status-sp" />
            <span>TypeScript</span>
            <span>UTF-8</span>
            <span>Ln 42, Col 18</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RailIcon({ kind }: { kind: number }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === 0)
    return (
      <svg {...common}>
        <path d="M4 5h6l2 2h8v12H4z" />
      </svg>
    );
  if (kind === 1)
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-4.5-4.5" />
      </svg>
    );
  if (kind === 2)
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="8" r="2.5" />
        <path d="M6 8.5v7M8.5 7.2h4A3 3 0 0 1 15.5 10" />
      </svg>
    );
  if (kind === 3)
    return (
      <svg {...common}>
        <path d="M12 4v16M6 8l12 8M18 8 6 16" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}
