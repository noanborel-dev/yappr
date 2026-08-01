import { SectionHeader } from "./SectionHeader";

const ITEMS: Array<{ q: React.ReactNode; a: React.ReactNode }> = [
  {
    q: "Does it work in Claude Code, Cursor, and the terminal?",
    a: "That's what it's built for. Yappr sees which app you're in and whether an AI tool is running there, then picks the right treatment: a prompt gets restructured, actual code stays verbatim. Spoken file paths come out as paths — \"app dot tsx\" becomes app.tsx.",
  },
  {
    q: "What does prompt shaping do to my words?",
    a: "It reorganizes them. Your ramble comes out as Goal, Context, Tasks, Constraints, Done when — with every file name, error code, condition and \"don't touch X\" you spoke still in there. It never summarizes. If you said eight things, eight things land.",
  },
  {
    q: "Does Yappr store my audio?",
    a: "No. Transcription runs locally on your Mac, so the audio doesn't leave the machine at all. Only text goes out for cleanup, and none of it is stored or trained on. Transcripts stay on your Mac as recent history.",
  },
  {
    q: "Can it see my screen?",
    a: "No. Yappr reads the macOS accessibility tree to know which app you're in and what text you've selected. It never takes screenshots.",
  },
  {
    q: (
      <>
        How is this different from <em>Wispr Flow</em>?
      </>
    ),
    a: "Wispr cleans up your speech. So do we, unlimited and free. The difference is what sits on top. Your ramble becomes a structured prompt. You can rewrite any selection by voice. And you get a context window for your dictation — Wispr's personal dictionary learns your vocabulary, but it doesn't know what you're building; ours holds your stack, your files and your teammates' names, and keeps itself current. $9 instead of $15.",
  },
  {
    q: "What do I actually get for free?",
    a: "Unlimited dictation with cleanup — fillers, stutters and false starts removed — plus the dev dictionary and all three hotkey behaviors. No word cap, no card. Pro adds prompt shaping, select-and-rewrite, persistent context, and per-app polish.",
  },
  {
    q: "What runs the cleanup?",
    a: "Whisper large-v3-turbo runs locally for transcription. Cleanup runs on Groq's Llama. No OpenAI dependency.",
  },
  {
    q: "Windows or Linux?",
    a: "macOS is GA. Windows is in private beta. Linux (PipeWire) is coming.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="max-w-[1240px] mx-auto px-8 py-16">
      <SectionHeader
        title={
          <>
            Worth <em>answering</em>.
          </>
        }
        lede="The questions we get asked the most."
      />

      <div
        className="bg-white border border-line rounded-3xl p-14"
        style={{ boxShadow: "0 30px 60px -30px rgba(20,30,50,.18)" }}
      >
        <div className="flex flex-col border-t border-line-soft">
          {ITEMS.map((item, i) => (
            <details
              key={i}
              className="border-b border-line-soft py-5 cursor-pointer group"
              open={i === 0}
            >
              <summary
                className="list-none flex justify-between items-center gap-6 text-ink leading-[1.1]"
                style={{ listStyle: "none" }}
              >
                <span className="font-serif text-[26px] font-normal">
                  {item.q}
                </span>
                <span
                  className="font-mono text-[22px] text-accent flex-none not-italic group-open:hidden"
                  aria-hidden="true"
                >
                  +
                </span>
                <span
                  className="font-mono text-[22px] text-accent flex-none not-italic hidden group-open:inline"
                  aria-hidden="true"
                >
                  −
                </span>
              </summary>
              <p className="mt-3.5 max-w-[780px] text-[15.5px] leading-[1.55] text-ink-2">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
