interface Props {
  phase: "idle" | "listening" | "polishing" | "pasted";
  polished: string;
  initialMessage: string;
  flashing: boolean;
  // When true, render the full sidebar + extra messages (used in the live
  // demo). When false (the hero), keep the minimal rail.
  extended?: boolean;
}

export function SlackShell({
  phase,
  polished,
  initialMessage,
  flashing,
  extended = false,
}: Props) {
  const showPolished = phase === "pasted";

  if (!extended) {
    // Hero: minimal rail + single message (unchanged)
    return (
      <div className="hero-app h-slack active" data-app="slack">
        <div className="rail">
          <div className="ws">O</div>
          <div className="ico on">#</div>
          <div className="ico">@</div>
          <div className="ico">⊞</div>
          <div className="add">+</div>
        </div>
        <div className="conv">
          <div className="head">
            <span className="hash">#</span>
            design
            <div className="meta">★ &nbsp;·&nbsp; 4</div>
          </div>
          <div className="feed">
            <div className="msg">
              <div className="av" />
              <div>
                <div className="who">
                  Sydney <span className="ts">2:14 PM</span>
                </div>
                <div className="text">{initialMessage}</div>
              </div>
            </div>
          </div>
          <div
            className={`composer ${showPolished ? "done" : ""} ${flashing ? "flash" : ""}`}
          >
            <div className="formatting">
              <div className="fb" />
              <div className="fb" />
              <div className="fb" />
              <div className="fb" />
            </div>
            <div className="body-text">{showPolished ? polished : ""}</div>
            <div className="actions">
              <div className="ico" />
              <div className="ico" />
              <div className="send">▸</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Extended (demo): rail + channel-list sidebar + populated channel
  return (
    <div className="hero-app h-slack h-slack--ext active" data-app="slack">
      <div className="rail">
        <div className="ws">O</div>
        <div className="ico on">#</div>
        <div className="ico">@</div>
        <div className="ico">⊞</div>
        <div className="add">+</div>
      </div>

      <div className="sb">
        <div className="sb-team">
          <span className="sb-team-name">Yappr</span>
        </div>
        <div className="sb-group">
          <div className="sb-group-head">Channels</div>
          <div className="sb-row">
            <span className="sb-hash">#</span>announcements
          </div>
          <div className="sb-row on">
            <span className="sb-hash">#</span>design
          </div>
          <div className="sb-row">
            <span className="sb-hash">#</span>design-crit
          </div>
          <div className="sb-row">
            <span className="sb-hash">#</span>eng
          </div>
          <div className="sb-row">
            <span className="sb-hash">#</span>launch
            <span className="sb-badge">2</span>
          </div>
        </div>
        <div className="sb-group">
          <div className="sb-group-head">Direct messages</div>
          <div className="sb-row">
            <span className="sb-dot sb-dot--green" />
            Sydney
          </div>
          <div className="sb-row">
            <span className="sb-dot" />
            Mira
          </div>
          <div className="sb-row">
            <span className="sb-dot sb-dot--green" />
            David
          </div>
        </div>
      </div>

      <div className="conv">
        <div className="head">
          <span className="hash">#</span>
          design
          <div className="meta">★ &nbsp;·&nbsp; 4 members</div>
        </div>

        <div className="feed feed--rich">
          <div className="msg">
            <div className="av av--mira" />
            <div>
              <div className="who">
                Mira <span className="ts">1:58 PM</span>
              </div>
              <div className="text">
                btw the new launch page is in <em>#launch</em> if anyone wants
                to weigh in
              </div>
            </div>
          </div>

          <div className="msg">
            <div className="av av--david" />
            <div>
              <div className="who">
                David <span className="ts">2:07 PM</span>
              </div>
              <div className="text">
                will review tonight 👀
              </div>
            </div>
          </div>

          <div className="msg">
            <div className="av" />
            <div>
              <div className="who">
                Sydney <span className="ts">2:14 PM</span>
              </div>
              <div className="text">{initialMessage}</div>
            </div>
          </div>
        </div>

        <div
          className={`composer ${showPolished ? "done" : ""} ${flashing ? "flash" : ""}`}
        >
          <div className="formatting">
            <div className="fb" />
            <div className="fb" />
            <div className="fb" />
            <div className="fb" />
          </div>
          <div className="body-text">{showPolished ? polished : ""}</div>
          <div className="actions">
            <div className="ico" />
            <div className="ico" />
            <div className="send">▸</div>
          </div>
        </div>
      </div>
    </div>
  );
}
