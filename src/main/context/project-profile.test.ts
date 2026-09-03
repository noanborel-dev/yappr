import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { factsFromManifest, MAX_PROFILE_FACTS } from './project-profile'

function m(dependencies: string[], rootFiles: string[] = []) {
  return { dependencies, rootFiles }
}

describe('factsFromManifest', () => {
  it('reads this repo, and says true things about it', () => {
    // Run against the REAL package.json rather than a fixture: the point
    // of this module is that its output matches an actual project, and a
    // fixture would let the table drift from anything that exists.
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
    )
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(factsFromManifest(m(deps))).toEqual([
      'An Electron desktop app.',
      'Built with React.',
      'Written in TypeScript.',
      'Styled with Tailwind CSS.',
    ])
  })

  it('emits the animation fact that prompted this module', () => {
    expect(factsFromManifest(m(['framer-motion']))).toContain(
      'Uses Framer Motion for animation.',
    )
  })

  it('never exceeds the prompt budget', () => {
    // These go into EVERY cleanup prompt. Unbounded growth here is a
    // latency and token cost on dictations that had nothing to do with
    // the project.
    const everything = [
      'next', 'electron', 'typescript', 'tailwindcss', 'framer-motion',
      'gsap', 'prisma', 'vitest', 'jest', 'sass',
    ]
    expect(factsFromManifest(m(everything))).toHaveLength(MAX_PROFILE_FACTS)
  })

  it('orders by what most changes a generated prompt', () => {
    // Framework first, test runner last — a shaped prompt that knows the
    // framework is most of the way to fitting the codebase.
    expect(factsFromManifest(m(['vitest', 'tailwindcss', 'next']))[0])
      .toBe('Built with Next.js.')
  })

  it('does not say React twice via Next', () => {
    const facts = factsFromManifest(m(['next', 'react']))
    expect(facts).toContain('Built with Next.js.')
    expect(facts).not.toContain('Built with React.')
  })

  it('does not say React or React Native twice via Expo', () => {
    const facts = factsFromManifest(m(['expo', 'react-native', 'react']))
    expect(facts).toEqual(['Built with Expo.'])
  })

  it('is deterministic regardless of manifest order', () => {
    const a = factsFromManifest(m(['tailwindcss', 'electron', 'typescript']))
    const b = factsFromManifest(m(['typescript', 'tailwindcss', 'electron']))
    expect(a).toEqual(b)
  })

  it('ignores case and stray whitespace', () => {
    expect(factsFromManifest(m([' TailwindCSS '.toLowerCase().trim()])))
      .toEqual(['Styled with Tailwind CSS.'])
  })

  it('claims nothing for a project it does not recognise', () => {
    // A Rust or Go repo has no package.json worth reading. Storing a
    // placeholder would be inventing a fact, which is the one thing the
    // fact system forbids.
    expect(factsFromManifest(m([]))).toEqual([])
    expect(factsFromManifest(m(['some-internal-package']))).toEqual([])
  })

  it('never claims a convention the manifest does not prove', () => {
    // Tempting and wrong: Tailwind does not prove mobile-first, and a
    // fact nobody stated is exactly what project-facts.ts forbids.
    const facts = factsFromManifest(m(['tailwindcss'])).join(' ')
    expect(facts).not.toMatch(/mobile|responsive|breakpoint/i)
  })
})
