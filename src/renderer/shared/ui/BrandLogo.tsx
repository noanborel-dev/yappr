// Real brand logos imported as image assets so vite hashes + bundles
// them. Replaces the simple-icons SVG paths which (1) had wrong /
// outdated marks for several brands and (2) were missing Slack and
// other trademark-removed icons entirely.
import imessage from '../logos/imessage.png'
import gmail from '../logos/gmail.webp'
import notion from '../logos/notion.png'
import slack from '../logos/slack.png'
import claude from '../logos/claude.png'
import claudecode from '../logos/claudecode.png'
import chatgpt from '../logos/chatgpt.webp'
import cursor from '../logos/cursor.png'
import groq from '../logos/groq.png'

export type BrandSlug =
  | 'imessage' | 'gmail' | 'notion' | 'slack'
  | 'claude' | 'claudecode' | 'chatgpt' | 'cursor' | 'groq' | 'terminal'

const SOURCES: Record<Exclude<BrandSlug, 'terminal'>, string> = {
  imessage, gmail, notion, slack, claude, claudecode, chatgpt, cursor, groq,
}

const TITLES: Record<BrandSlug, string> = {
  imessage: 'iMessage',
  gmail: 'Gmail',
  notion: 'Notion',
  slack: 'Slack',
  claude: 'Claude',
  claudecode: 'Claude Code',
  chatgpt: 'ChatGPT',
  cursor: 'Cursor',
  groq: 'Groq',
  terminal: 'Terminal',
}

interface Props {
  brand: BrandSlug
  size?: number
  className?: string
}

export function BrandLogo({ brand, size = 22, className = '' }: Props) {
  // Terminal has no vendor mark to ship — `›_` IS the macOS Terminal
  // idiom, and drawing it beats approximating an icon we don't have.
  if (brand === 'terminal') {
    return (
      <span
        role="img"
        aria-label="Terminal"
        className={`inline-flex items-center justify-center font-mono text-ink-60 ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.62, letterSpacing: '-0.05em' }}
      >
        ›_
      </span>
    )
  }
  return (
    <img
      src={SOURCES[brand]}
      alt={TITLES[brand]}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
      draggable={false}
    />
  )
}