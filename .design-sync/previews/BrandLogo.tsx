import { BrandLogo } from 'yappr';

const SLUGS = [
  'imessage', 'gmail', 'notion', 'slack', 'claude',
  'claudecode', 'chatgpt', 'cursor', 'groq', 'terminal',
] as const;

export const AllBrands = () => (
  <div
    style={{
      display: 'flex',
      gap: 18,
      flexWrap: 'wrap',
      alignItems: 'center',
      padding: 24,
      background: 'var(--cream)',
    }}
  >
    {SLUGS.map((b) => (
      <div key={b} style={{ display: 'grid', justifyItems: 'center', gap: 6, width: 68 }}>
        <BrandLogo brand={b} size={28} />
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{b}</span>
      </div>
    ))}
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 24, background: 'var(--cream)' }}>
    <BrandLogo brand="slack" size={16} />
    <BrandLogo brand="slack" size={22} />
    <BrandLogo brand="slack" size={32} />
    <BrandLogo brand="slack" size={44} />
  </div>
);
