import { Panel, StackRow, Pill } from 'yappr';

export const WithTextBlock = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <StackRow title="Project overview" desc="Rebuilt from your recent dictations. Injected into every cleanup." last>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            padding: 12,
            borderRadius: 8,
            background: 'var(--paper)',
            border: '1px solid var(--line-soft)',
          }}
        >
          Working on Yappr, a macOS dictation app in Electron and TypeScript. Prefers short
          commits, cites measurements in comments, and calls the recording UI “the pill”.
        </div>
      </StackRow>
    </Panel>
  </div>
);

export const WithAside = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <StackRow
        title="Dictionary"
        desc="Terms Parakeet mishears, corrected downstream on every transcript."
        aside={<Pill variant="secondary" size="sm">Add term</Pill>}
        last
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Parakeet', 'Groq', 'electron-vite', 'Yappr', 'AXTextArea'].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11.5,
                fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
                padding: '4px 9px',
                borderRadius: 999,
                background: 'var(--paper)',
                border: '1px solid var(--line)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </StackRow>
    </Panel>
  </div>
);
