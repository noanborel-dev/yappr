import Image from "next/image";

const APPS: Array<{ name: string; logo?: string }> = [
  { name: "Claude Code", logo: "/logos/claudecode.png" },
  { name: "Cursor", logo: "/logos/cursor.png" },
  { name: "Claude", logo: "/logos/claude.png" },
  { name: "ChatGPT", logo: "/logos/chatgpt.png" },
  { name: "Slack", logo: "/logos/slack.png" },
  { name: "Gmail", logo: "/logos/gmail.webp" },
  { name: "Notion", logo: "/logos/notion.png" },
  { name: "Terminal" },
  { name: "Warp" },
  { name: "VS Code" },
];

// The compatibility strip: where Yappr works.
//
// This used to be a pinned scroll sequence — a 320vh track holding three
// beats and a mocked-up workspace, headlined "You have four terminals
// open." That claim was the problem: it asserted something about the
// reader that was usually false, and a page that opens by telling you
// what your screen looks like is arguing rather than showing.
//
// The strip below it was never part of that argument, and is the part
// worth keeping — it answers "will this work where I type?", which is the
// question a compatibility band exists to answer.
//
// WorkspaceScene.tsx and the .bfb-track / .bfb-pin / .ws-* CSS are still
// in the repo. Nothing renders them; they are one import away if the
// sequence is ever wanted back.

export function BuiltForBuilders() {
  return (
    <section id="builders" className="bfb">
      <div className="bfb-foot">
        <div className="bfb-apps">
          <span className="bfb-apps-label">Works in</span>
          <ul>
            {APPS.map((a) => (
              <li key={a.name}>
                {a.logo ? (
                  <Image src={a.logo} alt="" width={20} height={20} />
                ) : (
                  <span className="bfb-app-glyph" aria-hidden="true">
                    {a.name.slice(0, 2)}
                  </span>
                )}
                <span>{a.name}</span>
              </li>
            ))}
            <li className="bfb-app-more">+ anywhere you can put a cursor</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
