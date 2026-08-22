---
category: App UI
---

# AppClaudeCodeShell

Claude Code in a terminal — ported from the landing page's
components/shells/ClaudeCodeShell.tsx so Settings and the site show the
same product, not two different drawings of it.

The prompt box at the bottom is the payload: it renders the structured
markdown an `ai_prompt` cleanup actually produces (## Goal / ## Tasks /
## Constraints), not a tidied sentence.

Styles live in src/shared/index.css under .cc-*, lifted from the site's
globals.css. Re-pull rather than eyeball if the site's version moves.

Source: `src/renderer/shared/ui/ClaudeCodeShell.tsx`
