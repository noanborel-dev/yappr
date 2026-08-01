import { SectionHeader } from "./SectionHeader";

const ITEMS: Array<{ q: React.ReactNode; a: React.ReactNode }> = [
  {
    q: "Does Yappr store my audio?",
    a: "No. On Free and Pro, audio is forwarded through our proxy to Groq, transcribed, and discarded the same moment — nothing persisted on our side, nothing used for training. On Lifetime/BYOK, audio bypasses us entirely (Mac → Groq, with your key). On Local mode, audio never leaves your Mac at all. Transcripts are kept only on your Mac, as recent history.",
  },
  {
    q: (
      <>
        How is this different from <em>Wispr Flow</em>?
      </>
    ),
    a: "Wispr is $15/mo, every month, forever. Yappr is $10/mo — or pay $99 once and own it. Polish is calibrated per destination app (iMessage stays lowercase, Gmail keeps its greeting). And Local mode actually works — no cloud round-trip if you don't want one.",
  },
  {
    q: "Which providers run the cloud side?",
    a: "Groq for both transcription (whisper-large-v3-turbo) and cleanup (Llama 3.1). Free and Pro use Yappr's managed Groq account. Lifetime users plug in their own Groq key. No OpenAI dependency.",
  },
  {
    q: "Can I run it on-device?",
    a: "Yes. Local mode runs Whisper on your Mac in three tiers — Fast, Balanced, Accurate. Sub-300ms warm latency on Balanced. Transcription stays on your machine; cleanup runs on Groq's Llama unless you skip it. No API key needed for transcription.",
  },
  {
    q: "What's the difference between Pro and Lifetime?",
    a: "Same features. Pro is managed — we run the Groq inference, you don't see a single API key. Lifetime is BYOK — you bring your own Groq key, we charge nothing again, ever. Pro is the right pick if you don't want to deal with keys. Lifetime is the right pick if you do.",
  },
  {
    q: "Does the polish change per app?",
    a: "Yes. iMessage stays lowercase fragments; Slack stays sentence-case; Gmail keeps greetings and signoffs; code stays faithful, never paraphrased. Same dictation, different output, depending on where you're typing.",
  },
  {
    q: "Will it add emojis to my messages?",
    a: "Only if you turn it on. Off by default. When enabled, a parallel judge call decides whether an emoji actually fits — only in messaging apps (iMessage, Slack, etc.), never in email, docs, or code.",
  },
  {
    q: "Does it work inside Cursor, Claude Code, and terminals?",
    a: "Yes — code contexts use a faithful cleanup mode that never paraphrases, recognizes dev jargon, and converts spoken file paths (\"app dot tsx\" → \"app.tsx\"). On Local mode it auto-elevates to the Accurate tier inside IDEs for better handling of technical terms.",
  },
  {
    q: "What about Windows and Linux?",
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
