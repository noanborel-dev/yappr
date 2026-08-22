import { SectionHead } from 'yappr';

// The landing editorial header. Eyebrow + serif headline left, lede hung
// right and baseline-aligned — never stacked under the headline.
export const Numbered = () => (
  <div style={{ width: 900, padding: 32, background: 'var(--cream)' }}>
    <SectionHead
      num="01"
      eyebrow="Prompt shaping"
      title={<>You ramble. It lands <em>structured</em>.</>}
      lede="Filler drops, the goal separates from the constraints, and nothing you said is summarised away."
    />
  </div>
);

export const ProGated = () => (
  <div style={{ width: 900, padding: 32, background: 'var(--cream)' }}>
    <SectionHead
      num="04"
      eyebrow="Per-app polish"
      pro
      title={<>The same sentence, <em>dressed for the room</em>.</>}
      lede="Slack stays sentence-case. iMessage stays lowercase. Gmail keeps its greeting."
    />
  </div>
);

export const LongLede = () => (
  <div style={{ width: 900, padding: 32, background: 'var(--cream)' }}>
    <SectionHead
      num="03"
      eyebrow="Persistent context"
      title={<>A context window for your <em>dictation</em>.</>}
      lede={<>Other tools learn your <em>vocabulary</em>. This learns your <em>project</em>.</>}
    />
  </div>
);
