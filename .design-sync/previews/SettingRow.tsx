import { Panel, SettingRow, Toggle, Pill, BrandLogo } from 'yappr';

export const Default = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Launch at login" desc="Yappr starts with macOS and waits in the menu bar." last>
        <Toggle on onChange={() => {}} />
      </SettingRow>
    </Panel>
  </div>
);

export const WithIcon = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Gmail" desc="Keeps its greeting and sign-off." icon={<BrandLogo brand="gmail" size={20} />} last>
        <Toggle on onChange={() => {}} />
      </SettingRow>
    </Panel>
  </div>
);

export const Muted = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Average latency" desc="Measured from hotkey release to paste." muted last>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>412 ms</span>
      </SettingRow>
    </Panel>
  </div>
);

export const WithButton = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Groq API key" desc="Yours. Audio is never proxied through our servers." last>
        <Pill variant="secondary" size="sm">Replace</Pill>
      </SettingRow>
    </Panel>
  </div>
);
