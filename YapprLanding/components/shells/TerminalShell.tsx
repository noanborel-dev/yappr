interface Props {
  text: string;
  flashing: boolean;
}

export function TerminalShell({ text, flashing }: Props) {
  return (
    <div className="term-window">
      <div className="term-titlebar">
        <span className="tl" style={{ background: "#ff5f57" }} />
        <span className="tl" style={{ background: "#febc2e" }} />
        <span className="tl" style={{ background: "#28c840" }} />
        <span className="title">noan@laptop — -zsh — 80×24</span>
      </div>
      <div className="term-body">
        <div>
          <span className="ps">noan@laptop</span>{" "}
          <span className="user">~/dev/yappr</span>{" "}
          <span className="arrow">›</span>{" "}
          <span className={flashing ? "land-flash" : ""}>{text}</span>
        </div>
      </div>
    </div>
  );
}
