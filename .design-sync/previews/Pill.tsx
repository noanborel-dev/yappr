import { Pill } from 'yappr';

// The primary variant axis: one row per surface the pill sits on.
export const Variants = () => (
  <div
    style={{
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center',
      padding: 24,
      background: 'var(--cream)',
    }}
  >
    <Pill variant="primary">Start yapping</Pill>
    <Pill variant="secondary">Replace key</Pill>
    <Pill variant="ghost">Cancel</Pill>
    <Pill variant="ok">Connected</Pill>
    <Pill variant="danger">Revoke</Pill>
  </div>
);

// `line` is the dark-surface variant — it only reads on dark.
export const OnDark = () => (
  <div style={{ display: 'flex', gap: 10, padding: 24, background: 'var(--ink)' }}>
    <Pill variant="line">Try the demo</Pill>
    <Pill variant="line">Watch it work</Pill>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 24, background: 'var(--cream)' }}>
    <Pill size="sm">Small</Pill>
    <Pill size="md">Medium</Pill>
  </div>
);

export const Disabled = () => (
  <div style={{ display: 'flex', gap: 10, padding: 24, background: 'var(--cream)' }}>
    <Pill disabled>Checking for updates…</Pill>
    <Pill variant="secondary" disabled>Replace key</Pill>
  </div>
);
