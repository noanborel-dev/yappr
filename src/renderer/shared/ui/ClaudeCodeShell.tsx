// Claude Code in a terminal — ported from the landing page's
// components/shells/ClaudeCodeShell.tsx so Settings and the site show the
// same product, not two different drawings of it.
//
// The prompt box at the bottom is the payload: it renders the structured
// markdown an `ai_prompt` cleanup actually produces (## Goal / ## Tasks /
// ## Constraints), not a tidied sentence.
//
// Styles live in src/shared/index.css under .cc-*, lifted from the site's
// globals.css. Re-pull rather than eyeball if the site's version moves.

export type PromptLine =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'item'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'blank' }

interface Props {
  lines: PromptLine[]
  /** Blink a caret in the empty prompt box (idle / listening states). */
  caret?: boolean
  /** Window title. Defaults to the site's. */
  tab?: string
  /**
   * Stagger each line's entrance. Turn OFF when a parent feeds lines in
   * one at a time — otherwise late lines inherit a long delay and lag.
   */
  stagger?: boolean
}

export function ClaudeCodeShell({ lines, caret, tab, stagger = true }: Props) {
  let itemNo = 0

  return (
    <div className="cc-window">
      <div className="cc-titlebar">
        <span className="tl r" />
        <span className="tl y" />
        <span className="tl g" />
        <span className="cc-tab">{tab ?? 'claude — 120×32'}</span>
      </div>

      <div className="cc-content">
        <div className="cc-box">
          <span className="cc-header">─ Claude Code ─</span>
          <div className="cc-mascot" aria-hidden="true">
            <svg viewBox="0 0 16 12" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="12" height="2" fill="#c8553d" />
              <rect x="1" y="4" width="14" height="6" fill="#c8553d" />
              <rect x="0" y="6" width="16" height="2" fill="#c8553d" />
              <rect x="4" y="5" width="2" height="2" fill="#1f1d1c" />
              <rect x="10" y="5" width="2" height="2" fill="#1f1d1c" />
              <rect x="2" y="10" width="2" height="1" fill="#c8553d" />
              <rect x="6" y="10" width="2" height="1" fill="#c8553d" />
              <rect x="12" y="10" width="2" height="1" fill="#c8553d" />
            </svg>
          </div>
          <div className="cc-meta">
            <div className="welcome">Welcome back</div>
            <div className="dim">~/Dev/yappr</div>
          </div>
        </div>
      </div>

      <div className="cc-input">
        <span className="cc-chev" aria-hidden="true">&gt;</span>

        <div className="cc-md">
          {lines.map((ln, i) => {
            const delay = { animationDelay: stagger ? `${i * 55}ms` : '0ms' }

            if (ln.kind === 'blank') return <div key={i} className="ln blank" style={delay} />
            if (ln.kind === 'heading') {
              return <div key={i} className="ln h" style={delay}>{ln.text}</div>
            }
            if (ln.kind === 'item') {
              itemNo += 1
              const n = itemNo
              return (
                <div key={i} className="ln li" style={delay}>
                  <span className="num">{n}.</span> {ln.text}
                </div>
              )
            }
            if (ln.kind === 'bullet') {
              return (
                <div key={i} className="ln li" style={delay}>
                  <span className="num">-</span> {ln.text}
                </div>
              )
            }
            return <div key={i} className="ln" style={delay}>{ln.text}</div>
          })}

          {caret && <span className="cc-caret" aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}
