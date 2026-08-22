import { Caption } from 'yappr';

// Caption is driven by `show` — the hidden state is genuinely empty, so
// every cell here pins show={true}; the transition is not statically
// renderable and is documented in NOTES.md instead.
export const Raw = () => (
  <div style={{ width: 620, padding: 28, background: 'var(--cream)' }}>
    <Caption
      show
      label="You said"
      text="um so I need to like refactor the cleanup policy so short stuff skips the LLM entirely"
    />
  </div>
);

export const Polished = () => (
  <div style={{ width: 620, padding: 28, background: 'var(--cream)' }}>
    <Caption
      show
      labelTone="polished"
      label="Yappr"
      text="Refactor the cleanup policy so short utterances skip the LLM entirely."
    />
  </div>
);

export const BothStates = () => (
  <div style={{ width: 620, padding: 28, background: 'var(--cream)', display: 'grid', gap: 16 }}>
    <Caption show label="You said" text="can you make the pill sit a bit lower under the notch" />
    <Caption show labelTone="polished" label="Yappr" text="Move the pill slightly lower beneath the notch." />
  </div>
);

export const RateLimited = () => (
  <div style={{ width: 620, padding: 28, background: 'var(--cream)' }}>
    <Caption show label="Demo" text="rate limited — come back tomorrow" />
  </div>
);
