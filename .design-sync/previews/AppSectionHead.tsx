import { AppSectionHead, GroupLabel, Pill } from 'yappr';

export const Numbered = () => (
  <div style={{ width: 620, padding: 24, background: 'var(--cream)' }}>
    <AppSectionHead
      ord="03"
      label="Persistent context"
      headline={<>Yappr learns your <em>project</em>, not just your words.</>}
      body="The overview paragraph is rebuilt from your recent dictations and injected into every cleanup."
    />
  </div>
);

export const WithMeta = () => (
  <div style={{ width: 620, padding: 24, background: 'var(--cream)' }}>
    <AppSectionHead
      ord="05"
      label="Per-app polish"
      headline={<>One sentence, <em>five</em> registers.</>}
      body="Each destination gets the register it expects — iMessage stays lowercase, Gmail keeps its greeting."
      meta={<Pill variant="ok" size="sm">Pro</Pill>}
    />
  </div>
);

export const NoOrdinal = () => (
  <div style={{ width: 620, padding: 24, background: 'var(--cream)' }}>
    <AppSectionHead
      label="Privacy"
      headline={<>Audio goes mic → your provider. <em>Directly.</em></>}
      body="Our servers are not in the path. Transcription is local; cleanup uses your own key."
    />
  </div>
);

export const WithGroupLabel = () => (
  <div style={{ width: 620, padding: 24, background: 'var(--cream)' }}>
    <AppSectionHead
      ord="01"
      label="Dictation"
      headline={<>Hold, speak, <em>release</em>.</>}
      body="Everything before release is free — the clock starts when you let go."
    />
    <GroupLabel>Hotkey</GroupLabel>
  </div>
);
