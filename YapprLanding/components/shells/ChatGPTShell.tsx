import Image from "next/image";

interface Props {
  text: string;
  flashing: boolean;
}

const ASSISTANT_RESPONSE =
  "Sure — edge functions execute on V8 isolates closest to the user, with cold starts under 5ms, while regular serverless spins up a full Node container per request. Trade-off: edge has no Node APIs.";

export function ChatGPTShell({ text, flashing }: Props) {
  return (
    <div className="gpt-window">
      <div className="gpt-titlebar">
        <span className="tl" style={{ background: "#ff5f57" }} />
        <span className="tl" style={{ background: "#febc2e" }} />
        <span className="tl" style={{ background: "#28c840" }} />
      </div>
      <div className="gpt-topbar">
        <div className="gpt-model">
          ChatGPT 5 <span className="chev">▾</span>
        </div>
      </div>
      <div className="gpt-body">
        <div className={`gpt-msg user ${flashing ? "land-flash" : ""}`}>{text}</div>
        {text && (
          <div className="gpt-msg assistant">
            <div className="av">
              <Image
                src="/logos/chatgpt.png"
                alt="ChatGPT"
                width={26}
                height={26}
                style={{ width: 26, height: 26, objectFit: "contain", borderRadius: 999 }}
              />
            </div>
            <div>{ASSISTANT_RESPONSE}</div>
          </div>
        )}
      </div>
      <div className="gpt-composer">
        <div className="plus">+</div>
        <div className="input">Ask anything…</div>
        <div className="mic">⏵</div>
      </div>
    </div>
  );
}
