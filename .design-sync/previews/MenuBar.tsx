import { MenuBar, NotchMark } from 'yappr';

// MenuBar is a frosted strip — the caller paints the wallpaper behind it.
// Rendered on a bare page it is invisible by construction, so every cell
// supplies a backdrop.
const Desk = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <div style={{ width: 720, height: 150, background: bg, position: 'relative', overflow: 'hidden' }}>
    {children}
  </div>
);

export const OnDesktop = () => (
  <Desk bg="linear-gradient(160deg, #6a7ba2 0%, #3d4c6e 60%, #2b3550 100%)">
    <MenuBar right={<span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.85)' }}>Tue 09:41</span>}>
      <NotchMark />
    </MenuBar>
  </Desk>
);

export const Dark = () => (
  <Desk bg="#111318">
    <MenuBar tone="dark" right={<span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>Tue 09:41</span>}>
      <NotchMark />
    </MenuBar>
  </Desk>
);

export const Light = () => (
  <Desk bg="var(--cream-2)">
    <MenuBar tone="light" right={<span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Tue 09:41</span>}>
      <NotchMark />
    </MenuBar>
  </Desk>
);
