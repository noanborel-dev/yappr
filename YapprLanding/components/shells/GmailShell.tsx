import Image from "next/image";

interface Props {
  phase: "idle" | "listening" | "polishing" | "pasted";
  polished: string;
  showComposeCard: boolean;
  flashing: boolean;
}

export function GmailShell({ phase, polished, showComposeCard, flashing }: Props) {
  const showPolished = phase === "pasted";

  return (
    <div className="hero-app h-gmail active" data-app="gmail">
      <div className="topbar">
        <div className="gm-logo">
          <Image
            src="/logos/gmail.webp"
            alt=""
            width={22}
            height={22}
            className="g-icon"
            aria-hidden="true"
          />
          Gmail
        </div>
        <div className="searchbar">⌕ Search mail</div>
      </div>
      <div className="gm-body">
        <div className="gm-sidebar">
          <div className="compose-pill">✎ Compose</div>
          <div className="nav-item on">
            <div className="ico" />
            Inbox
            <span className="count">2,131</span>
          </div>
          <div className="nav-item">
            <div className="ico" />
            Starred
          </div>
          <div className="nav-item">
            <div className="ico" />
            Drafts
            <span className="count">146</span>
          </div>
        </div>
        <div className="gm-main">
          <div className="gm-toolbar">
            <div className="check" />
            <div
              className="count"
              style={{ marginLeft: "auto", fontSize: 12, color: "#5f6368" }}
            >
              1–50 of 25,877
            </div>
          </div>
          <div className="tabs">
            <div className="tab-gm on">Primary</div>
            <div className="tab-gm">Promotions</div>
            <div className="tab-gm">Social</div>
          </div>
          <div className="list">
            <div className="row">
              <div className="check-sm" />
              <div className="sender">David Chen</div>
              <div className="snippet">
                <b>Q3 review · next steps</b> — Hi, thanks for sending the deck…
              </div>
              <div className="when">9:02 AM</div>
            </div>
            <div className="row read">
              <div className="check-sm" />
              <div className="sender">Seeking Alpha</div>
              <div className="snippet">Top income ideas. One day.</div>
              <div className="when">8:56 AM</div>
            </div>
            <div className="row read">
              <div className="check-sm" />
              <div className="sender">Ideabrowser</div>
              <div className="snippet">Idea of the Day: Lego brick scanner</div>
              <div className="when">8:52 AM</div>
            </div>
          </div>

          <div
            className={`compose-card ${showComposeCard ? "show" : ""} ${
              showPolished ? "done" : ""
            }`}
          >
            <div className="cc-head">
              Re: Q3 review
              <div className="actions">— ⤢ ×</div>
            </div>
            <div className="cc-field">
              To <span className="to-name">&nbsp; David Chen</span>
            </div>
            <div
              className="cc-field"
              style={{ color: "#202124", fontWeight: 500 }}
            >
              Re: Q3 review · next steps
            </div>
            <div className={`cc-body ${flashing ? "flash" : ""}`}>
              {showPolished ? polished : ""}
            </div>
            <div className="cc-footer">
              <div className="send-btn">Send</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
