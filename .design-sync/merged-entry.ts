// Merged DS entry — Yappr spans two surfaces that share one token system
// (see the token block in src/shared/index.css: "the same values as the
// landing page's MASTER.md"). A Claude Design project holds exactly one
// _ds_bundle.js, so both surfaces are re-exported here into one namespace.
//
// Two names collide across the trees. The app-side ones are prefixed `App`:
//   SectionHead      landing editorial header  /  AppSectionHead     settings header
//   ClaudeCodeShell  landing terminal mock     /  AppClaudeCodeShell in-app stage
//
// Not exported: photos.tsx (PHOTOS — image data, not a component) and
// pillBus.ts (an event bus).

// ── Landing sections ──────────────────────────────────────────────────────
export { BuiltForBuilders } from '../YapprLanding/components/BuiltForBuilders';
export { Caption } from '../YapprLanding/components/Caption';
export { FAQ } from '../YapprLanding/components/FAQ';
export { FinalCTA } from '../YapprLanding/components/FinalCTA';
export { FloatingPill } from '../YapprLanding/components/FloatingPill';
export { Footer } from '../YapprLanding/components/Footer';
export { Hero } from '../YapprLanding/components/Hero';
export { LiveDemo } from '../YapprLanding/components/LiveDemo';
export { Nav } from '../YapprLanding/components/Nav';
export { NotchIndicator } from '../YapprLanding/components/NotchIndicator';
export { PerAppPolish } from '../YapprLanding/components/PerAppPolish';
export { PersistentContext } from '../YapprLanding/components/PersistentContext';
export { PhotoBand } from '../YapprLanding/components/PhotoBand';
export { PillLogo } from '../YapprLanding/components/PillLogo';
export { Pricing } from '../YapprLanding/components/Pricing';
export { PromptShaping } from '../YapprLanding/components/PromptShaping';
export { Reveal } from '../YapprLanding/components/Reveal';
export { ScrollExpand } from '../YapprLanding/components/ScrollExpand';
export { ScrollFullBleed } from '../YapprLanding/components/ScrollFullBleed';
export { SectionHead } from '../YapprLanding/components/SectionHead';
export { SectionHeader } from '../YapprLanding/components/SectionHeader';
export { SelectRewrite } from '../YapprLanding/components/SelectRewrite';
export { Statement } from '../YapprLanding/components/Statement';
export { TheNotch } from '../YapprLanding/components/TheNotch';
export { WorkspaceScene } from '../YapprLanding/components/WorkspaceScene';

// ── App-chrome mocks (the shells the landing page animates inside) ────────
export { ChatGPTShell } from '../YapprLanding/components/shells/ChatGPTShell';
export { ClaudeCodeShell } from '../YapprLanding/components/shells/ClaudeCodeShell';
export { CursorShell } from '../YapprLanding/components/shells/CursorShell';
export { GmailShell } from '../YapprLanding/components/shells/GmailShell';
export { ImessageShell } from '../YapprLanding/components/shells/ImessageShell';
export { SlackShell } from '../YapprLanding/components/shells/SlackShell';
export { TerminalShell } from '../YapprLanding/components/shells/TerminalShell';

// ── Yappr app UI primitives (Electron renderer) ───────────────────────────
export { BrandLogo } from '../src/renderer/shared/ui/BrandLogo';
export { Card, Row } from '../src/renderer/shared/ui/Card';
export { ClaudeCodeShell as AppClaudeCodeShell } from '../src/renderer/shared/ui/ClaudeCodeShell';
export { NotchMark, MenuBar } from '../src/renderer/shared/ui/NotchMark';
export { Panel, SettingRow, StackRow } from '../src/renderer/shared/ui/Panel';
export { Pill } from '../src/renderer/shared/ui/Pill';
export { PolishFanout } from '../src/renderer/shared/ui/PolishFanout';
export { PromptShapingStage } from '../src/renderer/shared/ui/PromptShapingStage';
export { SectionHead as AppSectionHead, GroupLabel } from '../src/renderer/shared/ui/SectionHead';
export { Toggle } from '../src/renderer/shared/ui/Toggle';
export { Wordmark } from '../src/renderer/shared/ui/Wordmark';
