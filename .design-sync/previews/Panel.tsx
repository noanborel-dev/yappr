import { Panel, SettingRow, StackRow, Toggle, Pill, BrandLogo } from 'yappr';

export const SettingsGroup = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Launch at login" desc="Yappr starts with macOS and waits in the menu bar.">
        <Toggle on onChange={() => {}} />
      </SettingRow>
      <SettingRow title="Local transcription" desc="Runs Parakeet on-device. Nothing leaves the machine.">
        <Toggle on onChange={() => {}} />
      </SettingRow>
      <SettingRow title="Cleanup model" desc="Used only when a dictation needs more than the deterministic passes." last>
        <Pill variant="secondary" size="sm">Groq</Pill>
      </SettingRow>
    </Panel>
  </div>
);

export const WithIcons = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Slack" desc="Sentence case, no sign-off." icon={<BrandLogo brand="slack" size={20} />}>
        <Toggle on onChange={() => {}} />
      </SettingRow>
      <SettingRow title="iMessage" desc="Stays lowercase." icon={<BrandLogo brand="imessage" size={20} />} last>
        <Toggle on onChange={() => {}} />
      </SettingRow>
    </Panel>
  </div>
);

export const WithStackRow = () => (
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

export const MutedRow = () => (
  <div style={{ width: 520, padding: 20, background: 'var(--cream)' }}>
    <Panel>
      <SettingRow title="Dictations this month" desc="Free tier is unlimited." muted>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>1,284</span>
      </SettingRow>
      <SettingRow title="Model cache" desc="Two models stay resident; least-recently-used is evicted." muted last>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>339 MB</span>
      </SettingRow>
    </Panel>
  </div>
);
