interface Props {
  text: string;
  flashing: boolean;
}

export function CursorShell({ text, flashing }: Props) {
  return (
    <div className="cur-window">
      <div className="cur-titlebar">
        <span className="tl" style={{ background: "#ff5f57" }} />
        <span className="tl" style={{ background: "#febc2e" }} />
        <span className="tl" style={{ background: "#28c840" }} />
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 14,
            color: "#7a7a7a",
            fontSize: 14,
          }}
        >
          ▦ ◧ ◨ ⚙
        </div>
      </div>
      <div className="cur-editor">
        <div className="cur-tab-bar">
          <div className="cur-tab">
            <span className="rust-icon" />
            mod.rs
            <span className="close">×</span>
          </div>
        </div>
        <div className={`cur-suggestion ${flashing ? "land-flash" : ""}`}>
          <div className="sugg-text">{text}</div>
          <div className="sugg-actions">
            <span className="pill-btn"><span className="kbd">⌘ ↵</span> Accept</span>
            <span className="pill-btn dim"><span className="kbd">⌘ ⌫</span> Reject</span>
            <span className="followup">
              Follow-up instructions… <span className="kbd">⇧ ⌘ K</span>
            </span>
          </div>
        </div>
        <div className="cur-code">
          <div className="ln"><div className="num">72</div><div><span className="kw">pub</span>(<span className="kw">crate</span>) <span className="kw">struct</span> <span className="nm">TransportStack</span> {"{"}</div></div>
          <div className="ln"><div className="num">73</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="var-c">l4</span>: <span className="nm">ListenerEndpoint</span>,</div></div>
          <div className="ln"><div className="num">74</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="var-c">tls</span>: Option&lt;Arc&lt;<span className="nm">Acceptor</span>&gt;&gt;,</div></div>
          <div className="ln"><div className="num">75</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="cmt">// listeners sent from the old process</span></div></div>
          <div className="ln"><div className="num">76</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="cmt">#[cfg(unix)]</span></div></div>
          <div className="ln del"><div className="num">77</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="var-c">upgrade_listeners</span>: Option&lt;<span className="nm">ListenFds</span>&gt;,</div></div>
          <div className="ln add"><div className="num">77</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="var-c">upgrade_listeners</span>: <span className="nm">ListenFds</span>,</div></div>
          <div className="ln"><div className="num">78</div><div>{"}"}</div></div>
        </div>
      </div>
      <div className="cur-chat">
        <div className="cur-chat-tabs">
          <div className="ct on">Chat</div>
          <div className="ct">Composer</div>
        </div>
        <div className="cur-chat-body">
          <div className="file-pill">
            <span className="rust" />
            mod.rs <span className="tag">Current File</span>
          </div>
          <div className="user-msg">{text}</div>
          {text && (
            <div className="assistant-msg">
              I&apos;ll help modify the code to make certificate switching more
              flexible. The main changes will enhance the{" "}
              <span className="code">TlsAccept</span> trait and how{" "}
              <span className="code">TlsSettings</span> are handled.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
