// A second fact source: read the PROJECT, not just the speech.
//
// project-facts.ts mines durable facts from what the user has dictated,
// and its system prompt forbids inference outright — "if the dictations
// do not say it, it is not a fact". That is the right rule for a model
// reading transcripts, and it leaves a gap: Yappr only knows a project
// uses Framer Motion if the user once said so out loud. So "make me a
// sidebar" comes back generic, because there is nothing in the context
// layer to make it specific.
//
// This module closes that gap without weakening the rule. Nothing here is
// inferred: a fact is emitted only when a dependency or a file is
// actually present. No LLM, no heuristics, no reading of source code.
//
// PRIVACY BOUNDARY — the important part.
//
// Facts are injected into cleanup prompts, and cleanup routes through
// Yappr's proxy. So anything this module emits leaves the user's machine.
// It is therefore restricted, deliberately and permanently, to:
//
//   - dependency NAMES from package.json
//   - the NAMES of config files at the project root
//
// Never file contents, never source code, never paths, never anything
// under a dotfile. The output is a handful of sentences naming public
// open-source packages, which is the least revealing thing that is still
// useful. If a future change wants more, that is a privacy-notice
// decision first and a code change second.

/** What the impure reader is allowed to collect. */
export interface ProjectManifest {
  /** Dependency names, deps + devDeps, no versions. */
  dependencies: readonly string[]
  /** Filenames present at the project root. Names only, never contents. */
  rootFiles: readonly string[]
}

// Ordered by how much the fact changes a generated prompt. A shaped
// prompt that knows the framework and the styling system is already most
// of the way to fitting the codebase; the test runner matters least.
//
// One dependency per fact, and the fact says only what the dependency
// proves. "uses Tailwind" is evidenced; "mobile-first" is not, and is not
// claimed however tempting — see the note on inference above.
const DEPENDENCY_FACTS: ReadonlyArray<{ dep: string; fact: string }> = [
  // Framework — the single most useful thing to know.
  { dep: 'next', fact: 'Built with Next.js.' },
  { dep: 'electron', fact: 'An Electron desktop app.' },
  { dep: 'react-native', fact: 'A React Native mobile app.' },
  { dep: 'expo', fact: 'Built with Expo.' },
  { dep: 'svelte', fact: 'Built with Svelte.' },
  { dep: 'vue', fact: 'Built with Vue.' },
  { dep: '@angular/core', fact: 'Built with Angular.' },
  { dep: 'react', fact: 'Built with React.' },
  // Language.
  { dep: 'typescript', fact: 'Written in TypeScript.' },
  // Styling.
  { dep: 'tailwindcss', fact: 'Styled with Tailwind CSS.' },
  { dep: 'styled-components', fact: 'Styled with styled-components.' },
  { dep: 'sass', fact: 'Styled with Sass.' },
  // Animation — the case that prompted this module.
  { dep: 'framer-motion', fact: 'Uses Framer Motion for animation.' },
  { dep: 'motion', fact: 'Uses Motion for animation.' },
  { dep: 'gsap', fact: 'Uses GSAP for animation.' },
  { dep: '@react-spring/web', fact: 'Uses React Spring for animation.' },
  // Data.
  { dep: 'prisma', fact: 'Uses Prisma for database access.' },
  { dep: 'drizzle-orm', fact: 'Uses Drizzle ORM.' },
  { dep: 'better-sqlite3', fact: 'Uses SQLite via better-sqlite3.' },
  { dep: '@supabase/supabase-js', fact: 'Uses Supabase.' },
  // Testing — least likely to change how a prompt should be written.
  { dep: 'vitest', fact: 'Tested with Vitest.' },
  { dep: 'jest', fact: 'Tested with Jest.' },
  { dep: '@playwright/test', fact: 'Tested with Playwright.' },
]

// React is implied by Next, React Native and Expo, and saying both wastes
// a slot on something the first fact already told the model.
const IMPLIED_BY: Readonly<Record<string, readonly string[]>> = {
  next: ['react'],
  'react-native': ['react'],
  expo: ['react', 'react-native'],
}

/**
 * Cap on emitted facts.
 *
 * These are injected into EVERY cleanup prompt, and constants.ts:324
 * records a cleanup call at ~4,400 tokens already. Four short sentences
 * is a rounding error against that; twenty would not be, and the tail of
 * the table above is the least useful end of it.
 */
export const MAX_PROFILE_FACTS = 4

/**
 * Facts a project's manifest actually proves. Deterministic, ordered by
 * the table above, capped.
 *
 * Returns [] for a manifest with nothing recognisable — the common case
 * for a project that is not a JS app at all, and the caller should store
 * nothing rather than a placeholder.
 */
export function factsFromManifest(manifest: ProjectManifest): string[] {
  const present = new Set(manifest.dependencies.map((d) => d.trim().toLowerCase()))
  if (present.size === 0) return []

  const suppressed = new Set<string>()
  for (const [dep, implies] of Object.entries(IMPLIED_BY)) {
    if (present.has(dep)) for (const i of implies) suppressed.add(i)
  }

  const out: string[] = []
  for (const { dep, fact } of DEPENDENCY_FACTS) {
    if (out.length >= MAX_PROFILE_FACTS) break
    if (!present.has(dep) || suppressed.has(dep)) continue
    out.push(fact)
  }
  return out
}

/**
 * The files the reader may open, and the only ones.
 *
 * package.json is read for dependency names. Everything else is checked
 * for EXISTENCE only — the reader never opens them — which is why config
 * files can be listed here without widening what leaves the machine.
 */
export const READABLE_MANIFEST = 'package.json'
