import { Card, Row, Toggle, BrandLogo } from 'yappr';

export const Default = () => (
  <div style={{ width: 460, padding: 20, background: 'var(--cream)' }}>
    <Card>
      <Row>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Paste with formatting</div>
        <Toggle on onChange={() => {}} />
      </Row>
    </Card>
  </div>
);

export const WithLogo = () => (
  <div style={{ width: 460, padding: 20, background: 'var(--cream)' }}>
    <Card>
      <Row>
        <BrandLogo brand="slack" size={20} />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Slack</div>
        <Toggle on onChange={() => {}} />
      </Row>
      <Row>
        <BrandLogo brand="gmail" size={20} />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Gmail</div>
        <Toggle on onChange={() => {}} />
      </Row>
    </Card>
  </div>
);
