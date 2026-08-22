# Yappr mark

One component, fourteen variations. Replaces three drifting implementations.

Specimen sheet and usage guide:
https://claude.ai/code/artifact/e253ea6f-28cf-4938-8acb-5695a1af842e

## In the app

```tsx
import { YapprMark } from '../shared/ui/YapprMark'

<YapprMark />                                          // pill · dark · button
<YapprMark size="hero" />                              // landing hero
<YapprMark lockup="bare" dot={false} />                // inside the notch
<YapprMark lockup="icon" />                            // app icon, avatar
<YapprMark tone="ink" />                               // single-colour print
<YapprMark recording />                                // live: the dot glows
```

`Wordmark` still resolves to `YapprMark`, so the four existing
`<Wordmark size="inline" />` call sites did not have to change.

## Files

| file | text? | safe to send outside this repo |
|---|---|---|
| `svg/yappr-icon-dark.svg` | no | yes |
| `svg/yappr-icon-light.svg` | no | yes |
| `svg/yappr-icon-circle.svg` | no | yes |
| `svg/yappr-icon-mono-ink.svg` | no | yes |
| `svg/yappr-icon-mono-white.svg` | no | yes |
| `svg/yappr-pill-dark.svg` | **yes** | outline the text first |
| `svg/yappr-pill-light.svg` | **yes** | outline the text first |
| `svg/yappr-wordmark-ink.svg` | **yes** | outline the text first |
| `svg/yappr-wordmark-white.svg` | **yes** | outline the text first |

The icon files are self-contained geometry — a rounded rect and a circle —
so they render identically anywhere.

The lockups with text reference Instrument Serif by name. Anywhere the font
is not installed they fall back to Georgia and the mark is quietly wrong,
which is worse than obviously broken. Outline the text before handing one
to a printer, a deck, or a press kit.

## Values

| | |
|---|---|
| shell | `#0A0B0F` — the pill AND the notch it depicts |
| dot | `#E84A3A` — recording red, deliberately not the terracotta accent |
| ink | `#15161A` |
| on dark | `rgba(255,255,255,.92)` — not `#FFF`, which blooms at small sizes |
