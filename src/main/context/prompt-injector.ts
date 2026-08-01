// Emits the context block that gets injected into the cleanup system
// prompt. See:
//   docs/superpowers/plans/2026-05-18-feature-4-context-memory-plan.md
//
// Phase 1 emits only the "Who you are" layer (user overview). Phases 2
// and 3 will add the "Recent in {category}" layer.
//
// The block is framed as RESOLUTION CONTEXT, not passive background: the
// model is told to use the overview to resolve vague references in the
// dictation (names, places, projects) while strict anti-echo rules keep
// the 8B model from copying the overview into the output or addressing
// the user about it.

import { getUserOverview } from './store'
import { formatContextBlock, type ContextMode } from './format'

// Build the context block to splice into an LLM system prompt. Returns an
// empty string when there's nothing to inject — caller can safely concat
// without any conditional wrapping. `mode` selects the framing:
//   'cleanup' (default) — dictation pipeline: resolve vague references.
//   'command'           — select-and-rewrite: MAY add facts when the
//                          editing command asks to elaborate/explain.
//
// Hot-path cost: ~1ms total (one cached read + string ops).
export function buildContextBlock(opts: {
  enabled: boolean
  mode?: ContextMode
}): string {
  if (!opts.enabled) return ''
  const overview = getUserOverview()
  if (!overview || overview.trim().length === 0) return ''
  return formatContextBlock(overview, opts.mode ?? 'cleanup')
}
