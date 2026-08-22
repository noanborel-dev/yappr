# design-sync notes — Yappr

Repo-specific gotchas for future syncs. Read before re-running.

## Shape

Yappr has **no design-system package**. The DS spans two unrelated source
trees that happen to declare the same tokens:

- `YapprLanding/components/**` — Next.js 16 / React 19, Tailwind **v4** (CSS-driven, `@theme inline`)
- `src/renderer/shared/ui/**` — Electron renderer / React 18, Tailwind **v3** (config-driven)

They are merged into one bundle by `.design-sync/merged-entry.ts`, which is
passed as `--entry`. Component discovery is driven entirely by
`cfg.componentSrcMap` (there is no `dist/` and no `.d.ts` tree, so
`exportedNames` returns nothing).

## Build sequence

```sh
node .design-sync/build-css.mjs          # cfg.buildCmd — MUST run before the converter
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./.design-sync/merged-entry.ts --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

`--node-modules` must be the **repo root** one (React 18.3.1). Do NOT point it
at `YapprLanding/node_modules`: React 19 ships no UMD build, so `vendorReact`
falls back to an esbuild pass. React is externalised to `window.React`, so the
18-vs-19 split across the two trees is not a real conflict — one React serves
both, and no landing component uses a React-19-only hook.

In a fresh worktree, `node_modules` are symlinked from the main checkout rather
than reinstalled (the root install runs `electron-rebuild` on native modules and
is slow). Recreate with:
`ln -sfn <repo>/node_modules ./node_modules` and the same for `YapprLanding/`.

## Two name collisions between the trees

`SectionHead` and `ClaudeCodeShell` exist in BOTH trees. The app-side ones are
re-exported with an `App` prefix in `merged-entry.ts` — `AppSectionHead`,
`AppClaudeCodeShell`. If either tree adds a name the other already has, do the
same thing there; do not rename the source.

## Forks (`cfg.libOverrides`)

- **`source-kit.mjs`** — upstream derives a component's group from its src path.
  Across two trees that yields `yapprlanding` / `shells` / `shared`, which are
  directory names, not DS sections. The fork leaves the group at `general` so
  the `category:` frontmatter in `.design-sync/docs/<Name>.md` wins
  (package-build only applies a doc category when the group is still `general`).
  Groups are therefore edited in the docs, not in code.
- **`dts.mjs`** — `isComponentName` rejects SCREAMING_CASE and anything ending
  in `Context`, which silently dropped `FAQ` and `PersistentContext` — both
  ordinary components. The fork allowlists those two names. **If a future
  component is missing from the output, check this filter first**; the build
  reports it only as `(excluded N enum/type/context/hook exports)`.

Both forks import from `../../.ds-sync/lib/`. They need
`ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` (bare `ts-morph`
import) — gitignored, so recreate it once per clone.

## next/image is shimmed

`next/image`'s module init reads `process.env`. In the single-IIFE bundle there
is no `process`, so importing it threw `ReferenceError: process is not defined`
at load — which blanked **all 48 components**, not just the 6 using `<Image>`.
`.design-sync/shims/next-image.tsx` replaces it with a plain `<img>`, wired via
`cfg.tsconfig` → `.design-sync/tsconfig.shims.json` `paths`. It also removes
`/_next/image?url=` URLs that no DS host could serve. Bundle dropped 1006 → 889 KB.

If another `next/*` import appears in a landing component, expect the same
failure mode and extend that `paths` map.

## Fonts

The brand faces reach the real site through `next/font`, which generates the
`--font-*` variables inside Next. Outside Next neither faces nor variables
exist. `build-css.mjs` prepends a Google Fonts `@import` (Instrument Serif,
Inter, JetBrains Mono, Lato, Roboto, Cormorant Garamond) and defines the five
`--font-*` variables. This turned `[FONT_MISSING]` + `[TOKENS_MISSING]` into an
informational `[FONT_REMOTE]`.

## Source change made by the sync

`src/renderer/shared/logos/gmail.webp` → `gmail.png` (+ the import in
`BrandLogo.tsx`). esbuild has loaders for `.svg/.png/.woff/.woff2` and the
converter exposes no config key to add `.webp`. It was the only non-PNG among
nine logos, and `PolishFanout` imports `BrandLogo`, so excluding it would have
cost two components.

## Known render warns

- 14 components ship the **typographic floor card** — unauthored previews, not
  failures: `AppClaudeCodeShell`, `ClaudeCodeShell`, `CursorShell`,
  `FloatingPill`, `GmailShell`, `GroupLabel`, `ImessageShell`, `NotchIndicator`,
  `NotchMark`, `PhotoBand`, `PillLogo`, `PolishFanout`, `PromptShapingStage`,
  `SlackShell`, `TerminalShell`, `Toggle`, `Wordmark` (any without a file in
  `.design-sync/previews/`). Authoring one is the standing incremental win.
- `Caption` renders only when `show` is true; the show/hide transition is not
  statically renderable, so every cell pins `show`.
- `MenuBar` is a frosted strip and is invisible without a backdrop — its preview
  supplies its own wallpaper.
- `PhotoBand` renders `null` with no `src` by design.

## Re-sync risks

- **`.design-sync/compiled/` is generated and gitignored.** `cfg.cssEntry`
  points into it, so `build-css.mjs` MUST run before the converter or the build
  fails on a missing stylesheet.
- **Tailwind v4 content auto-detection** decides which landing utilities get
  emitted by scanning `YapprLanding/`. A component moved outside that tree
  silently loses its classes — check `landing.css` rule count (~847) after moves.
- **v3 and v4 both emit some utility names** (`.text-sm` etc). The merge order
  in `build-css.mjs` is load-bearing: app (v3) first, landing (v4) second, so
  the brand-critical landing surface wins the cascade. Do not reorder.
- **The two forks drift from upstream.** On re-sync, diff
  `.design-sync/overrides/*.mjs` against `.ds-sync/lib/` and merge changes.
- Previews were **not reviewed by a human** in the run that created them — the
  gate was the render check plus the contact sheets.
- The upload target is pinned in `config.json` (`projectId`), an org project
  named "Design System" that was empty before this sync.
