interface Props {
  phase: "idle" | "listening" | "polishing" | "pasted";
  polished: string;
  incoming: string[];
  flashing: boolean;
}

export function ImessageShell({ phase, polished, incoming, flashing }: Props) {
  const showBubble = phase === "pasted";

  return (
    <div className="hero-app h-imsg active" data-app="imsg">
      <div className="sidebar">
        <div className="sb-top">
          <div className="traffic">
            <span className="tl r" />
            <span className="tl y" />
            <span className="tl g" />
          </div>
        </div>
        <div className="search">⌕ Search</div>
        <div className="threads">
          <div className="thread on">
            <div className="av" />
            <div>
              <div className="who">Maya</div>
              <div className="preview">we still on for dinner?</div>
            </div>
          </div>
          <div className="thread">
            <div className="av" />
            <div>
              <div className="who">Trev Smith</div>
              <div className="preview">Gotcha covered!</div>
            </div>
          </div>
          <div className="thread">
            <div className="av" />
            <div>
              <div className="who">Antonio M.</div>
              <div className="preview">Is your mind blown? 🤯</div>
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="head">
          <div className="av">M</div>
          <div className="name">Maya</div>
        </div>
        <div className="feed">
          <div className="ts">Today</div>
          {incoming.map((m, i) => (
            <div key={i} className="bubble in">
              {m}
            </div>
          ))}
          <div className={`bubble out ${showBubble ? "show" : ""}`}>
            {showBubble ? polished : ""}
          </div>
        </div>
        <div className="composer">
          <div className="plus">+</div>
          <div className={`input-shell ${flashing ? "flash" : ""}`} />
          <span className="mic-icon">⏵</span>
        </div>
      </div>
    </div>
  );
}
