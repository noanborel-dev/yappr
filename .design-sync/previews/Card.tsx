import { Card, Row, Toggle, Pill } from 'yappr';

export const WithRows = () => (
  <div style={{ width: 460, padding: 20, background: 'var(--cream)' }}>
    <Card>
      <Row>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Launch at login</div>
        <Toggle on onChange={() => {}} />
      </Row>
      <Row>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Play a sound on paste</div>
        <Toggle on={false} onChange={() => {}} />
      </Row>
      <Row>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Check for updates</div>
        <Pill variant="secondary" size="sm">Check now</Pill>
      </Row>
    </Card>
  </div>
);

export const SingleRow = () => (
  <div style={{ width: 460, padding: 20, background: 'var(--cream)' }}>
    <Card>
      <Row>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Local transcription</div>
        <Toggle on onChange={() => {}} />
      </Row>
    </Card>
  </div>
);
