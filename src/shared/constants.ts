import type { AppCategory, Provider } from './types'

// Default hotkey is any Ctrl key (LEFT or RIGHT). Matcher in hotkeys.ts accepts both.
export const DEFAULT_HOTKEYS = {
  pushToTalk: 'CTRL',
}

// Thresholds for hold-to-talk + double-tap interaction.
//
// dblTapWindowMs (500ms): natural double-clicks frequently span
//   350-450ms; a snappier window made paste-last feel broken.
// holdThresholdMs (150ms): release before this counts as a tap;
//   release after it counts as a hold-release (stop recording).
// startDelayMs (180ms): we DEFER firing fireStart() by this much
//   after DOWN so single tap vs double tap can be disambiguated
//   BEFORE the indicator pill flashes "listening." A real hold
//   feels instant — the user's still pressing when 180ms passes
//   and recording lights up. A double tap (second DOWN within
//   180ms of the first DOWN) cancels the deferred start: the
//   pill never lights up at all, paste-last fires cleanly. A
//   quick tap (release within 180ms) also fires fireStart at
//   release time, immediately entering tap-toggle mode.
export const HOTKEY_TIMING = {
  holdThresholdMs: 150,
  dblTapWindowMs: 500,
  startDelayMs: 180,
}

export const APP_CATEGORY_MAP: Record<string, AppCategory> = {
  'com.tinyspeck.slackmacgap': 'messaging',
  'com.hnc.Discord': 'messaging',
  'com.apple.MobileSMS': 'messaging',
  'ru.keepcoder.Telegram': 'messaging',
  'com.apple.mail': 'email',
  'com.microsoft.Outlook': 'email',
  'com.readdle.smartemail': 'email',
  'com.todesktop.230313mzl4w4u92': 'code',   // Cursor
  'com.exafunction.windsurf': 'code',         // Windsurf
  'com.microsoft.VSCode': 'code',
  'dev.zed.zed': 'code',
  'com.apple.dt.Xcode': 'code',
  'com.apple.Terminal': 'code',
  'com.googlecode.iterm2': 'code',
  'com.google.antigravity': 'code',           // Google Antigravity (Cursor fork)
  'app.warp.dev': 'code',                     // Warp terminal
  'com.github.atom': 'code',
  'org.gnu.Emacs': 'code',
  'com.replit.ReplitDesktop': 'code',
  // The rest of TERMINAL_BUNDLE_IDS (terminal-ai-cli.ts). These were listed
  // for AI-CLI scanning but missing here, so they resolved to 'other' — and
  // since the routing block is gated on category === 'code', the scan could
  // never run for them and they got prose cleanup on shell commands.
  'com.github.wez.wezterm': 'code',           // WezTerm
  'org.alacritty': 'code',                    // Alacritty
  'net.kovidgoyal.kitty': 'code',             // Kitty
  'co.zeit.hyper': 'code',                    // Hyper
  'org.tabby': 'code',                        // Tabby
  'com.mitchellh.ghostty': 'code',            // Ghostty
  'notion.id': 'docs',
  'md.obsidian': 'docs',
  'com.microsoft.Word': 'docs',
  'com.apple.iWork.Pages': 'docs',
}

export const DEFAULT_DEV_MODE_APPS = [
  'com.todesktop.230313mzl4w4u92',   // Cursor
  'com.exafunction.windsurf',         // Windsurf
  'com.microsoft.VSCode',
  'dev.zed.zed',
  'com.apple.dt.Xcode',
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'com.google.antigravity',           // Google Antigravity (Cursor fork)
  'app.warp.dev',                     // Warp terminal
  'com.github.atom',
  'org.gnu.Emacs',
  'com.replit.ReplitDesktop',
]

// Browser bundle IDs — when the focused app is one of these, we look at
// the window title to detect web apps (Gmail in Chrome, Slack in Arc,
// Notion in Safari) so they get routed to the right cleanup category.
export const BROWSER_BUNDLE_IDS = new Set<string>([
  'com.google.Chrome',
  'com.google.Chrome.canary',
  'com.apple.Safari',
  'com.apple.SafariTechnologyPreview',
  'com.microsoft.edgemac',
  'org.mozilla.firefox',
  'company.thebrowser.Browser',  // Arc
  'com.brave.Browser',
  'com.vivaldi.Vivaldi',
  'com.operasoftware.Opera',
])

// Apps with opaque AX trees — Chromium/Electron apps where the focused
// element under a web view often reports 'no-focus' through AX even
// when the user has a text input actively focused. We trust the
// keystroke to land on whatever the OS considers focused at the
// moment of paste rather than blocking on the stale/lying probe.
//
// Browsers are handled separately via BROWSER_BUNDLE_IDS. This set
// covers known Electron-based desktop apps where we've observed the
// same 'no-focus' false-positive blocking paste.
export const AX_OPAQUE_APPS = new Set<string>([
  'com.google.antigravity',           // Google Antigravity (Cursor fork)
  'com.todesktop.230313mzl4w4u92',    // Cursor
  'com.exafunction.windsurf',         // Windsurf
  'com.microsoft.VSCode',             // VS Code
  'com.tinyspeck.slackmacgap',        // Slack
  'com.hnc.Discord',                  // Discord
  'notion.id',                        // Notion
  'com.linear',                       // Linear
  'com.figma.Desktop',                // Figma
])

// Window-title routing for browser-based web apps. Order matters —
// first match wins. Patterns are intentionally lenient because browser
// title formatting varies ("Gmail" alone, "Inbox – Gmail", "(3) Inbox -
// user@gmail.com - Gmail"). Keep tokens specific enough to avoid false
// positives (e.g. "GitHub" stays out of email even though some pages
// say "user@github.com").
//
// TITLE ROUTING IS THE FALLBACK, NOT THE PRIMARY SIGNAL. Chromium
// browsers publish no windows through the accessibility API — with a
// visible Gmail window open, `count of windows of application process
// "Google Chrome"` is 0 and `name of front window` raises -1719, so the
// title arrives empty and nothing here can ever match. Gmail-in-Chrome
// consequently fell through to APP_CATEGORY_MAP and got polished as
// generic prose instead of email. The active tab's URL (read through
// the browser's own AppleScript dictionary — see main/browser-tab.ts)
// is the reliable signal; these patterns still cover Firefox, which
// does expose its window title, and any browser whose automation
// permission the user declined.
export interface BrowserTitleRoute {
  pattern: RegExp
  category: AppCategory
  appName: string
}

export const BROWSER_TITLE_ROUTES: BrowserTitleRoute[] = [
  // Email clients
  { pattern: /\bGmail\b/, category: 'email', appName: 'Gmail' },
  { pattern: /\bOutlook\b/i, category: 'email', appName: 'Outlook' },
  { pattern: /\bFastmail\b/i, category: 'email', appName: 'Fastmail' },
  { pattern: /\bProton ?Mail\b/i, category: 'email', appName: 'ProtonMail' },
  { pattern: /\bHEY\.com\b/i, category: 'email', appName: 'HEY' },
  // Team chat
  { pattern: /\bSlack\b/, category: 'messaging', appName: 'Slack' },
  { pattern: /\bDiscord\b/, category: 'messaging', appName: 'Discord' },
  { pattern: /\b(Microsoft Teams|MS Teams)\b/i, category: 'messaging', appName: 'Microsoft Teams' },
  { pattern: /\bWhatsApp\b/, category: 'messaging', appName: 'WhatsApp' },
  { pattern: /\bMessenger\b/, category: 'messaging', appName: 'Messenger' },
  // Docs / project mgmt
  { pattern: /\bGoogle Docs\b/, category: 'docs', appName: 'Google Docs' },
  { pattern: /\bNotion\b/, category: 'docs', appName: 'Notion' },
  { pattern: /\bConfluence\b/i, category: 'docs', appName: 'Confluence' },
  { pattern: /\bLinear\b/, category: 'docs', appName: 'Linear' },
  { pattern: /\bAsana\b/i, category: 'docs', appName: 'Asana' },
  { pattern: /\bClickUp\b/i, category: 'docs', appName: 'ClickUp' },
  { pattern: /\bMonday\.com\b/i, category: 'docs', appName: 'Monday' },
  { pattern: /\bCoda\b/, category: 'docs', appName: 'Coda' },
  // AI chat surfaces (in browser tabs) — routed to ai_prompt so the
  // dictation gets prompt-engineered (structured into markdown sections,
  // imperative voice, detail-preserving) instead of pasted verbatim.
  // This is the Chrome/Arc/Safari path: the dedicated AI desktop apps
  // (com.openai.chat, com.anthropic.claudefordesktop, ai.perplexity.mac)
  // get the same routing via PRIMARY_AI_CHAT_BUNDLES in pipeline.ts.
  { pattern: /\bClaude\b/, category: 'ai_prompt', appName: 'Claude' },
  { pattern: /\bChatGPT\b/, category: 'ai_prompt', appName: 'ChatGPT' },
  { pattern: /\bGemini\b/, category: 'ai_prompt', appName: 'Gemini' },
  { pattern: /\bPerplexity\b/i, category: 'ai_prompt', appName: 'Perplexity' },
  { pattern: /\b(Cursor|cursor\.com\/dashboard)\b/, category: 'ai_prompt', appName: 'Cursor' },
  { pattern: /\bv0\.dev\b/i, category: 'ai_prompt', appName: 'v0' },
  { pattern: /\bGrok\b/, category: 'ai_prompt', appName: 'Grok' },
  { pattern: /\bMistral\b/i, category: 'ai_prompt', appName: 'Mistral' },
]

// URL routing for browser-based web apps — the PRIMARY browser signal
// (see the note on BROWSER_TITLE_ROUTES for why the title cannot be).
// Matched against the active tab's full URL, first match wins, so
// path-qualified entries come before bare-host ones.
export interface BrowserUrlRoute {
  pattern: RegExp
  category: AppCategory
  appName: string
}

// Build a host matcher: `https://mail.google.com/mail/u/0/#inbox` and
// `http://mail.google.com` match, `https://notmail.google.com.evil.co`
// does not (the host must end at a port, path, query, fragment, or the
// end of the string).
function hostRe(...hosts: string[]): RegExp {
  const alt = hosts.map(h => h.replace(/\./g, '\\.')).join('|')
  return new RegExp(`^https?://(?:www\\.)?(?:${alt})(?:[:/?#]|$)`, 'i')
}

export const BROWSER_URL_ROUTES: BrowserUrlRoute[] = [
  // Email
  { pattern: hostRe('mail.google.com'), category: 'email', appName: 'Gmail' },
  { pattern: hostRe('outlook.office.com', 'outlook.office365.com', 'outlook.live.com', 'outlook.com'), category: 'email', appName: 'Outlook' },
  { pattern: hostRe('mail.proton.me', 'mail.protonmail.com'), category: 'email', appName: 'ProtonMail' },
  { pattern: hostRe('app.fastmail.com', 'fastmail.com'), category: 'email', appName: 'Fastmail' },
  { pattern: hostRe('app.hey.com'), category: 'email', appName: 'HEY' },
  { pattern: hostRe('mail.yahoo.com'), category: 'email', appName: 'Yahoo Mail' },
  { pattern: hostRe('mail.zoho.com'), category: 'email', appName: 'Zoho Mail' },
  { pattern: hostRe('mail.superhuman.com'), category: 'email', appName: 'Superhuman' },
  { pattern: hostRe('app.shortwave.com'), category: 'email', appName: 'Shortwave' },
  // Team chat
  { pattern: hostRe('app.slack.com'), category: 'messaging', appName: 'Slack' },
  { pattern: /^https?:\/\/(?:ptb\.|canary\.)?discord\.com\/(?:channels|app)/i, category: 'messaging', appName: 'Discord' },
  { pattern: hostRe('teams.microsoft.com', 'teams.live.com'), category: 'messaging', appName: 'Microsoft Teams' },
  { pattern: hostRe('web.whatsapp.com'), category: 'messaging', appName: 'WhatsApp' },
  { pattern: hostRe('messenger.com'), category: 'messaging', appName: 'Messenger' },
  { pattern: hostRe('web.telegram.org'), category: 'messaging', appName: 'Telegram' },
  // Docs / project mgmt
  { pattern: hostRe('docs.google.com'), category: 'docs', appName: 'Google Docs' },
  { pattern: hostRe('notion.so', 'notion.com'), category: 'docs', appName: 'Notion' },
  { pattern: hostRe('linear.app'), category: 'docs', appName: 'Linear' },
  { pattern: hostRe('app.asana.com'), category: 'docs', appName: 'Asana' },
  { pattern: hostRe('app.clickup.com'), category: 'docs', appName: 'ClickUp' },
  { pattern: hostRe('coda.io'), category: 'docs', appName: 'Coda' },
  { pattern: /^https?:\/\/(?:[a-z0-9-]+\.)?atlassian\.net\/wiki/i, category: 'docs', appName: 'Confluence' },
  // AI chat surfaces — same routing the desktop apps get via
  // PRIMARY_AI_CHAT_BUNDLES, so a prompt typed at claude.ai in Chrome
  // is shaped like one typed in the Claude app.
  { pattern: hostRe('claude.ai'), category: 'ai_prompt', appName: 'Claude' },
  { pattern: hostRe('chatgpt.com', 'chat.openai.com'), category: 'ai_prompt', appName: 'ChatGPT' },
  { pattern: hostRe('gemini.google.com', 'aistudio.google.com'), category: 'ai_prompt', appName: 'Gemini' },
  { pattern: hostRe('perplexity.ai'), category: 'ai_prompt', appName: 'Perplexity' },
  { pattern: hostRe('grok.com'), category: 'ai_prompt', appName: 'Grok' },
  { pattern: hostRe('chat.mistral.ai'), category: 'ai_prompt', appName: 'Mistral' },
  { pattern: hostRe('v0.dev', 'v0.app'), category: 'ai_prompt', appName: 'v0' },
  { pattern: /^https?:\/\/github\.com\/copilot/i, category: 'ai_prompt', appName: 'Copilot' },
  // Browser app-builders. These are AGENTIC, not chat: each one owns a
  // project it can read, edit and deploy, so a prompt aimed at them should
  // be shaped the way one aimed at Claude Code is — see AGENTIC_AI_HOSTS.
  { pattern: hostRe('lovable.dev', 'lovable.app'), category: 'ai_prompt', appName: 'Lovable' },
  { pattern: hostRe('replit.com'), category: 'ai_prompt', appName: 'Replit' },
  { pattern: hostRe('bolt.new'), category: 'ai_prompt', appName: 'Bolt' },
  { pattern: hostRe('firebase.studio', 'idx.google.com'), category: 'ai_prompt', appName: 'Firebase Studio' },
  { pattern: hostRe('app.base44.com'), category: 'ai_prompt', appName: 'Base44' },
  { pattern: hostRe('create.xyz'), category: 'ai_prompt', appName: 'Create' },
  { pattern: hostRe('tempo.new'), category: 'ai_prompt', appName: 'Tempo' },
]

// Which AI surfaces can actually READ and RUN a project.
//
// The distinction drives prompt shaping: an agentic tool gets told to use
// @file references, check git history and run tests; a chat assistant is
// told it can do none of those. Getting it backwards means either wasted
// instructions or instructions the tool cannot follow.
//
// App-builders sit on the agentic side despite running in a browser —
// Lovable, Replit and Bolt each own a codebase they can edit and deploy.
export const AGENTIC_AI_APP_NAMES: ReadonlySet<string> = new Set([
  'Lovable', 'Replit', 'Bolt', 'v0', 'Firebase Studio', 'Base44',
  'Create', 'Tempo', 'Copilot',
])

// IDEs with @-mention chip support in their AI chat panes. Used to
// switch the cleanup prompt into IDE-aware formatting mode (variable
// backticks + file tagging).
export type IdeEditor = 'cursor' | 'windsurf' | 'vscode'

export const IDE_EDITORS: Record<string, IdeEditor> = {
  'com.todesktop.230313mzl4w4u92': 'cursor',
  'com.exafunction.windsurf': 'windsurf',
  'com.microsoft.VSCode': 'vscode',
}

export const MODELS: Record<
  Provider,
  { transcription: string; cleanup: string; reformat?: string; background?: string }
> = {
  groq: {
    // whisper-large-v3-turbo (NOT v3). Same accuracy on clean
    // dictation audio (2.2% vs 2.4% WER per Groq's public eval),
    // 2.78x cheaper ($0.04/hr vs $0.111/hr), measurably faster on
    // typical 5-20s clips. The earlier comment claiming v3 was
    // "meaningfully more accurate on noisy/accented audio" was from
    // an earlier Groq turbo release; current turbo has caught up.
    // Re-bench with scripts/bench-groq-whisper.mjs before any future
    // swap-back.
    transcription: 'whisper-large-v3-turbo',
    // 8B-instant runs roughly 3× faster than 70B-versatile on Groq;
    // for "remove fillers + fix capitalization" tasks the quality
    // delta is negligible while the latency win is large.
    // Groq decommissioned the entire llama-3.x line; llama-3.1-8b-instant
    // started returning 404 and every cleanup fell back to the raw
    // transcript. Chosen from what Groq actually serves, measured on a
    // real dictation and on a dictation that READS like an instruction
    // (the classic failure is a model answering it instead of cleaning
    // it): gpt-oss-20b 566ms clean, gpt-oss-120b 553ms clean,
    // qwen3.6-27b 3524ms and leaks <think> reasoning into the output.
    // 20b over 120b: same latency, smaller and cheaper.
    cleanup: 'openai/gpt-oss-20b',
    // Reformat (the ai_prompt register) restructures a rambling sentence
    // into ## Goal / ## Context / ## Tasks.
    //
    // This was briefly groq/compound-mini, on a test that concluded gpt-oss
    // "will not shape". That test was wrong: it never set reasoning_effort,
    // so the model spent its output budget reasoning internally and
    // returned little or nothing. With reasoning_effort:'low' the SAME
    // model shapes correctly in ~630ms with 33 characters of reasoning.
    //
    // compound-mini did work, but it routes to llama-3.3-70b-versatile:
    // 8x the input price, 2.6x the output price, ~5x slower, and capped
    // per DAY (100k tokens) rather than per minute — which is what made
    // shaping die for hours at a time.
    //
    //   gpt-oss-20b   ~630ms   $0.075/$0.30 per 1M   TPM cap, resets in 60s
    //   compound-mini ~3240ms  $0.59 /$0.79 per 1M   TPD cap, resets in hours
    reformat: 'openai/gpt-oss-20b',
    // BACKGROUND context compaction — rewriting the user-overview
    // paragraph from the last 50 dictations. Deliberately the 120B, not
    // the 20B the hot path uses, for two reasons:
    //
    //   1. Nothing is waiting on it. Compaction runs once per 50
    //      dictations, only while the machine is idle, capped at 600
    //      output tokens. Summarising 50 dictations into one paragraph
    //      rewards the bigger model and costs nothing the user feels.
    //
    //   2. Groq meters rate limits PER MODEL. On an 8,000 TPM tier a
    //      single cleanup call is already ~4,400 tokens, so a background
    //      job on the same model competes with dictation for the budget
    //      the user IS waiting on. Putting it on a different model gives
    //      it its own bucket instead of stealing from the hot path.
    //
    // Measured at 553ms against 20b's 566ms, so "heavier" costs no wall
    // clock here either.
    background: 'openai/gpt-oss-120b',
  },
  local: {
    // whisper.cpp model filename (without path). The model lives in
    // userData/models/ and is downloaded on demand — see
    // src/main/local-models.ts. Cleanup is delegated to whichever cloud
    // key the user has configured; local LLM cleanup is out of scope.
    transcription: 'ggml-large-v3-turbo-q5_0.bin',
    cleanup: '',
  },
}

export const HISTORY_LIMIT = 10

// Curated list of brand names and technical terms that Whisper commonly
// mistranscribes (e.g. "cloud" → "Claude", "open AI" → "OpenAI"). Passed
// as the transcription `prompt` so Whisper biases toward these spellings.
// Keep this short — Whisper's prompt has a 224-token cap.
// Phonetic mis-hearings -> canonical spelling.
//
// The dictionary replacer only matches a term's own spelling (plus
// spacing variants), so it can turn "type script" into "TypeScript" but
// can never turn "Yapper" into "Yappr" — different letters, not different
// spacing. Whisper had a bias PROMPT that made the right spelling more
// likely up front; Parakeet takes no prompt, so that lever is gone and
// this table is the only thing left that can fix a mis-heard name.
//
// It matters most on SHORT dictations, which skip the LLM entirely — a
// three-word "ship it in Yappr" gets no model pass at all, so if this
// doesn't correct it, nothing will.
//
// Keys are lowercase and matched whole-word, case-insensitively.
export const DICTIONARY_ALIASES: Record<string, string> = {
  // The product's own name — the one it got wrong most often.
  'yapper': 'Yappr',
  'yappers': 'Yappr',
  'yapr': 'Yappr',
  // The transcription engine, heard in these shapes in real logs.
  'periki': 'Parakeet',
  'paraquet': 'Parakeet',
  'parakeets': 'Parakeet',
  // Long-standing offenders that the bias prompt used to cover.
  'clawed': 'Claude',
  'grok': 'Groq',
  'gronk': 'Groq',
  'super base': 'Supabase',
  'superbase': 'Supabase',
}

export const BUILTIN_DICTIONARY: string[] = [
  // The product and the engine that transcribes it.
  'Yappr', 'Parakeet',
  // AI labs / products. Multi-word phrases bias Whisper toward the bigram,
  // which helps it pick "Claude Code" instead of "cloud code" etc.
  'Claude', 'Claude Code', 'Claude Sonnet', 'Claude Opus', 'Claude Haiku',
  'Anthropic', 'OpenAI', 'ChatGPT', 'GPT-4', 'GPT-5', 'Sonnet', 'Opus', 'Haiku',
  'Gemini', 'Llama', 'Mistral', 'DeepSeek', 'Grok', 'Perplexity', 'Cursor', 'Copilot',
  'Whisper', 'Groq', 'Hugging Face', 'LangChain',
  // Dev tools
  'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Swift', 'Kotlin',
  'React', 'Vue', 'Svelte', 'Next.js', 'Vite', 'Tailwind', 'Prisma', 'tRPC',
  'Node.js', 'Deno', 'Bun', 'pnpm', 'Yarn', 'Vercel', 'Netlify', 'Cloudflare',
  'Supabase', 'Firebase', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite',
  'GitHub', 'GitLab', 'Bitbucket', 'Linear', 'Notion', 'Figma',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'S3', 'EC2', 'Lambda',
  'VS Code', 'JetBrains', 'WebStorm', 'IntelliJ', 'Xcode', 'Zed',
  // Common acronyms Whisper confuses
  'API', 'SDK', 'CLI', 'CRUD', 'REST', 'GraphQL', 'JSON', 'YAML', 'OAuth', 'JWT',
  'SSH', 'HTTPS', 'WebSocket', 'tRPC', 'CORS', 'CDN', 'DNS',
  // Apple ecosystem
  'macOS', 'iOS', 'iPadOS', 'tvOS', 'watchOS', 'visionOS', 'SwiftUI', 'AppKit', 'UIKit',
  'TestFlight', 'Xcode', 'Apple Silicon', 'M1', 'M2', 'M3', 'M4',
]

// Default local transcription tier, in shared/ so main AND renderer read
// the same value. Onboarding previously hardcoded its own 'small', which
// is how a new install could disagree with the app about its own default.
//
// Parakeet: ~24ms on a 1s clip vs ~170ms (small) and ~825ms
// (large-v3-turbo), measured on M5 Pro, with matching English output. It
// also scales with audio length instead of paying whisper's fixed
// 30-second encoder window.
export const DEFAULT_LOCAL_MODEL_ID = 'parakeet-tdt-0.6b-v3' as const
