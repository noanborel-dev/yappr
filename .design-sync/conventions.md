# Building with Yappr

Yappr is **editorial-meets-utility**: a literary-magazine surface that happens
to sell a developer tool. Big italic display serif, generous whitespace, cream
paper. **Light mode only — the cream IS the brand. Never add a dark-mode
variant.** Dark sections exist, but as deliberate full-bleed chapters, not a
theme.

## No provider needed

Components render standalone — import and use them. There is no ThemeProvider,
no context to wrap. Tokens come from the stylesheet, so the only requirement is
that `styles.css` is loaded.

## Two surfaces, one token system

| Group | What it is |
|---|---|
| `Landing` | Marketing page sections — `Hero`, `Pricing`, `FAQ`, `Nav`, `Footer`, `FinalCTA`, `SectionHead`, `Statement` |
| `App Chrome` | CSS-drawn mockups of other apps — `CursorShell`, `SlackShell`, `GmailShell`, `TerminalShell`, `ChatGPTShell`, `ImessageShell`, `ClaudeCodeShell` |
| `App UI` | The macOS app's own primitives — `Panel`, `SettingRow`, `StackRow`, `Card`, `Row`, `Pill`, `Toggle`, `BrandLogo`, `NotchMark`, `MenuBar`, `Wordmark` |

Both surfaces declare the **same token values**, so mixing them is safe.

## Styling idiom: Tailwind utilities + CSS variables

Style your own layout glue with these utility families. They exist in the
shipped CSS — use them rather than inventing names:

| Family | Real classes |
|---|---|
| Surfaces | `bg-cream` `bg-cream2` `bg-paper` `bg-card` `bg-accent` `bg-accent-soft` `bg-cobalt` |
| Text | `text-ink` `text-ink-2` `text-ink-60` `text-ink-45` `text-muted` `text-accent` `text-cream` `text-paper` |
| Borders | `border-line` `border-line-soft` `border-ink-08` `border-ink` |
| Type | `font-serif` (display italic), `font-display`, `font-sans`, `font-mono` |
| Radius | `rounded-pill` `rounded-card` `rounded-input` `rounded-hero` |
| State | `text-ok` `text-danger` `bg-ok` `bg-danger` |

For raw CSS use the variables directly — all defined in the shipped sheet:
`--cream` `--cream-2` `--paper` `--ink` `--ink-2` `--muted` `--line`
`--line-soft` `--accent` `--accent-soft` `--cobalt` `--cobalt-soft`.

Fonts load from Google Fonts via `styles.css`: **Instrument Serif** (display,
has a true italic), **Inter** (UI), **JetBrains Mono** (mono).

## Rules that are not preferences

- **Everything is a pill** — 999px radius, no exceptions, via `Pill` or `rounded-pill`.
- **Liquid Glass belongs to the recording pill and nothing else.** The
  `--pill-*` tokens are reserved for `FloatingPill` / `NotchIndicator`.
- **`SectionHead` hangs its lede on the right**, baseline-aligned with the
  headline. Never stack the lede underneath — it strands the right third.
- **`ScrollExpand` replaces `Reveal`; never nest them.** Both write `transform`
  and will fight. One `Reveal` per section.
- **A section directly under a `Statement` drops its own headline** — two big
  serif lines back to back is the same sentence twice.
- **`overflow: hidden` kills `position: sticky`.** Use `overflow: clip` on any
  container wrapping a pinned element.
- **Anything that types or streams needs a fixed height**, not `min-height`, or
  the section jitters as content fills.

## Where the truth lives

Read `_ds/<folder>/styles.css` and its imports for the full token and utility
set, and each component's `.prompt.md` for its API and intent.

## A build looks like this

```jsx
<section className="bg-cream text-ink px-8 py-20">
  <SectionHead
    num="02"
    eyebrow="Select and rewrite"
    title={<>Fix it by <em>saying</em> what's wrong.</>}
    lede="Highlight the line, hold the key, speak the correction."
  />
  <Reveal>
    <div className="rounded-card border border-line bg-paper p-6">
      <CursorShell />
    </div>
  </Reveal>
</section>
```
