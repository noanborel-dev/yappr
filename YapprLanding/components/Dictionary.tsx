import { SectionHeader } from "./SectionHeader";

const WORDS: Array<{ term: string; pron: string; tag: string }> = [
  { term: "Anthropic", pron: "an-THROW-pic", tag: "Company" },
  { term: "Groq", pron: "grock", tag: "Provider" },
  { term: "Søren", pron: "SUH-ren", tag: "Name" },
  { term: "k8s", pron: "kates", tag: "Jargon" },
  { term: "OAuth", pron: "oh-AUTH", tag: "Built-in" },
  { term: "Whisper-v3-turbo", pron: "verbatim", tag: "Model" },
  { term: "Cursor", pron: "cursor", tag: "App" },
  { term: "pnpm", pron: "pee-en-pee-em", tag: "Tool" },
  { term: "Vercel", pron: "ver-CELL", tag: "Built-in" },
];

export function Dictionary() {
  return (
    <section id="dictionary" className="max-w-[1240px] mx-auto px-8 py-16">
      <div
        className="bg-white border border-line rounded-3xl p-14"
        style={{ boxShadow: "0 30px 60px -30px rgba(20,30,50,.18)" }}
      >
        <div className="flex justify-between items-end mb-9 flex-wrap gap-6">
          <div className="max-w-[600px]">
            <h2 className="font-serif text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.02em] m-0 mb-3">
              Names &amp; jargon,{" "}
              <em className="text-accent">finally heard</em>.
            </h2>
            <p className="text-[15px] text-ink-2 leading-[1.5] max-w-[520px] m-0">
              Add the words Whisper keeps fumbling — coworker names, indie
              products, your acronyms. They get spelled right, every time.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className="px-[22px] py-[11px] rounded-full text-[14px] italic font-sans"
              style={{
                background: "var(--paper)",
                border: "1px dashed var(--line)",
                color: "#9b9b9b",
                minWidth: 220,
              }}
            >
              Add a word…
            </div>
            <button
              className="inline-flex items-center gap-1.5 bg-ink text-cream px-5 py-[11px] rounded-full text-[13.5px] font-semibold cursor-pointer border-0"
              type="button"
            >
              + Add
            </button>
          </div>
        </div>

        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {WORDS.map((w) => (
            <div key={w.term} className="dict-card">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="font-serif italic text-[26px] text-ink leading-none">
                  {w.term}
                </span>
                <span
                  className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-accent px-2 py-0.5 rounded-md"
                  style={{ background: "var(--accent-soft)" }}
                >
                  {w.tag}
                </span>
              </div>
              <p className="font-mono text-[11.5px] text-muted m-0">
                <span className="text-accent">· </span>
                {w.pron}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
