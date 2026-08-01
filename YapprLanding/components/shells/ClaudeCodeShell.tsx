interface Props {
  text: string;
  flashing: boolean;
}

export function ClaudeCodeShell({ text, flashing }: Props) {
  return (
    <div className="cc-window">
      <div className="cc-titlebar">
        <span className="tl r" /><span className="tl y" /><span className="tl g" />
      </div>
      <div className="cc-content">
        <div className="cc-box">
          <span className="cc-header">─ Claude Code v2.0.0 ─</span>
          <div className="cc-left">
            <div className="welcome">Welcome back Noan!</div>
            <div className="cc-mascot">
              <svg viewBox="0 0 16 12" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="12" height="2" fill="#c8553d" />
                <rect x="1" y="4" width="14" height="6" fill="#c8553d" />
                <rect x="0" y="6" width="16" height="2" fill="#c8553d" />
                <rect x="4" y="5" width="2" height="2" fill="#1f1d1c" />
                <rect x="10" y="5" width="2" height="2" fill="#1f1d1c" />
                <rect x="2" y="10" width="2" height="1" fill="#c8553d" />
                <rect x="6" y="10" width="2" height="1" fill="#c8553d" />
                <rect x="12" y="10" width="2" height="1" fill="#c8553d" />
              </svg>
            </div>
            <div style={{ color: "#fff", fontSize: 13, marginTop: 4 }}>Opus 4.7 · Max 20x</div>
            <div style={{ color: "#fff", fontSize: 13 }}>~/Dev/yappr-landing</div>
          </div>
          <div>
            <div className="cc-section">
              <div className="title">Recent activity</div>
              <div className="item">1m ago&nbsp;&nbsp;&nbsp;Updated polish defaults</div>
              <div className="item">8m ago&nbsp;&nbsp;&nbsp;Wired Section 5 logos</div>
              <div className="item">2d ago&nbsp;&nbsp;&nbsp;Brand normalized to cream</div>
              <div className="item more">... /resume for more</div>
            </div>
            <div className="cc-section divider">
              <div className="title">What&apos;s new</div>
              <div className="item">/agents to create subagents</div>
              <div className="item">/security-review for review agent</div>
              <div className="item">ctrl+b to background bashes</div>
              <div className="item more">... /help for more</div>
            </div>
          </div>
        </div>
      </div>
      <div className="cc-prompt">
        <span style={{ color: "#c0bdba" }}>&gt; </span>
        <span className={`text ${flashing ? "land-flash" : ""}`}>{text}</span>
      </div>
    </div>
  );
}
