# Handoff: Notch Indicator ("Wings")

## Overview
Yappr's dictation status indicator currently renders as a floating liquid-glass pill at the
bottom-center of the screen. This design replaces it entirely: the indicator moves into the
MacBook notch and expands sideways out of it — left and right "wings" — the way the iPhone's
Dynamic Island does.

The organizing rule is **asymmetry with fixed meaning**:

- **Left wing = INPUT.** What Yappr is hearing. Record dot, live waveform, mic glyph.
- **Camera bar (center, 190px) = NEVER MOVES.** It stays exactly the width and position of the
  physical notch, so the hardware camera is never overlapped and the shape reads as an
  extension of the machine rather than a window on top of it.
- **Right wing = OUTCOME.** What Yappr did. Spinner, checkmark, error dot, state label.

## About the Design Files
The file in this bundle is a **design reference created in HTML** — a prototype showing the
intended look, geometry, and motion. It is **not production code to copy directly**.

The task is to **recreate this design in the target codebase's existing environment**. For an
Electron app that means React/CSS in the renderer plus main-process window management; for a
native rewrite it means SwiftUI/AppKit. Use the codebase's established patterns, animation
library, and component conventions. The HTML is the spec, not the implementation.

The prototype renders a **mock desktop** (720×300 wallpaper + menu bar) purely so the notch has
context. None of that chrome ships — only the indicator itself.

## Fidelity
**High-fidelity.** Colors, typography, radii, timings, and easing curves are final and are
listed exactly below. Layout geometry is expressed at the prototype's mock scale (a 190px
notch); see "Scaling to real hardware" for how to map it to a real display.

---

## Scaling to real hardware

The prototype uses a **190px** notch on a **720px** screen. Real values must be read from the
system at runtime — do not hardcode:

| Value | How to get it |
|---|---|
| Notch height | `NSScreen.safeAreaInsets.top` (≈34pt on 14"/16" MacBook Pro; the menu bar measures slightly taller) |
| Notch presence | `NSScreen.safeAreaInsets.top != 0` on macOS 12+ |
| Notch width | Derive from `NSScreen.auxiliaryTopLeftArea` / `auxiliaryTopRightArea` — the unobscured top-corner regions. Notch width = screen width − (left area width + right area width) |

Every dimension below is expressed relative to the notch. Treat the notch width as `N` and the
notch height as `H`; the prototype's numbers assume `N = 190`, `H = 30`.

---

## States

There are nine states. Each state defines a **left wing width (lw)** and **right wing width
(rw)** in px; total shape width is `N + lw + rw`, and the shape is positioned so the center
190px always sits exactly over the notch (`margin-left: -(N/2 + lw)` from screen center).

| State | lw | rw | Height | Left content | Right content | Label |
|---|---|---|---|---|---|---|
| `idle` | 0 | 0 | 30 | — | — | — |
| `peek` | 84 | 238 | 36 | mic glyph + `⌥ SPACE` (mono) | **clickable recent transcript** | — |
| `recording` | 104 | 118 | 36 | record dot + waveform | — | *listening* |
| `processing` | 44 | 124 | 36 | mic glyph | spinner | *polishing…* |
| `done` | 40 | 96 | 36 | mic glyph | checkmark | *pasted* |
| `clipboard` | 40 | 184 | 36 | mic glyph | checkmark | *copied — ⌘V* |
| `copied` | 40 | 160 | 36 | mic glyph | checkmark | *copied — ⌘V* |
| `error` | 40 | 176 | 36 | mic glyph | red dot | *didn't catch that* |
| `expanded` | 150 | 214 | measured | mic glyph | checkmark | *pasted* + panel |

`idle` is a true `N × H` black rectangle — visually indistinguishable from the bare notch.

### peek — hover to reach the last transcript
`peek` fires on hover over the notch when no dictation is running, and returns to `idle` on
mouse-out. It is suppressed while a run is in progress.

It is not a hint state — it is **functional**. The right wing holds the most recent transcript as
a clickable target:

- Container: `flex: 1`, `min-width: 0`, `padding: 5px 8px 5px 10px`, `border-radius: 9px`,
  `background: rgba(255,255,255,.06)`, `border: 1px solid rgba(255,255,255,.08)`, `cursor: pointer`.
- Hover: `background: rgba(90,143,232,.22)`, `border-color: rgba(90,143,232,.4)`, 200ms ease.
- Contents: the transcript at 11.5px `rgba(255,255,255,.88)`, `white-space: nowrap` +
  `text-overflow: ellipsis` (so it truncates rather than wraps), then a 12px copy glyph at
  `rgba(255,255,255,.6)`, `flex: none`.

Clicking it writes the transcript to the clipboard and transitions to `copied` — checkmark plus
*copied — ⌘V* — which auto-returns to `peek` after **1600ms**. The click must
`stopPropagation` so it does not also trigger the notch's own click-to-`expanded` handler.
Leaving the notch during `copied` cancels the timer and goes straight to `idle`.

The hotkey hint `⌥ SPACE` lives in the **left** wing beside the mic glyph, mono, so the right
wing is reserved entirely for the transcript.

`expanded` is the click-to-open state: it drops a panel below the wings (see "Expanded panel").

### Typical run sequence
`peek` (900ms) → `recording` (2600ms) → `processing` (1500ms) → `done` (1600ms) →
`clipboard` (1800ms) → `idle`

---

## Geometry & shape

- **Center spacer**: 190px fixed, `flex: none`. Contains only the lens dot: 5×5px,
  `border-radius: 999px`, `background: #12161C`, `box-shadow: inset 0 0 2px rgba(120,160,200,.5)`.
- **Wings**: `overflow: hidden`, `box-sizing: border-box`, animated `width`. Left wing is
  `justify-content: flex-end` with `gap: 7px` and `padding-right`; right wing is left-aligned
  with `gap: 8px` and `padding-left`. **Padding is state-driven** — `11px` when the wing has
  width, `0px` when collapsed — otherwise the padding survives the collapse and pushes the
  camera spacer off-center in the idle state.
- **Top corners**: square, flush with the top of the screen.
- **Bottom radius**, scales with state:
  - `15px` at idle
  - `19px` with wings out
  - `24px` with the panel open
- **Row height**: `min(shapeHeight, 36px)` — a fixed 36px row inside a 30px idle shape clips and
  decenters the lens.

### Concave fillets (the signature detail)
Two 13×13px elements sit immediately **outside** the shape at `top: 0`, one at `left: -13px` and
one at `right: -13px`. They fill the corner between the shape's side and the menu bar with a
concave curve, so the shape appears to *grow out of* the menu bar rather than sit on it.

```css
/* left fillet  */ background: radial-gradient(circle at 0%   100%, transparent 0 13px, #000 13.5px);
/* right fillet */ background: radial-gradient(circle at 100% 100%, transparent 0 13px, #000 13.5px);
```

`pointer-events: none`. Opacity 0 at idle, 1 whenever either wing has width, transitioning over
360ms `cubic-bezier(.4,0,.2,1)`.

They must live in a **wrapper that does not clip** — the shape itself is `overflow: hidden`, so
the fillets cannot be children of it.

### Material
```css
background: linear-gradient(180deg, #0B0C11 0%, #000 55%);
box-shadow:
  0 16px 40px rgba(0,0,0,.55),
  inset 0 -1px 0 rgba(255,255,255,.07),
  inset 0 0 0 1px rgba(255,255,255,.035);
```
Flat `#000` reads as a hole; the top-weighted gradient plus the hairline rim reads as an object.

### Ambient glow
A blurred colored ellipse behind the shape, inset `8%` left/right, `top: 14px`, `height: 44px`,
`border-radius: 999px`, `filter: blur(26px)`, `pointer-events: none`. Transitions opacity and
color over 420ms.

| State | Glow |
|---|---|
| recording | `rgba(90,143,232,.5)` |
| processing | `rgba(90,143,232,.35)` |
| expanded | `rgba(90,143,232,.3)` |
| error | `rgba(232,74,58,.42)` |
| all others | none (opacity 0) |

---

## Menu bar behavior

This is the part most likely to be got wrong. **Menu bar items collapse inward from the notch —
they are never pushed off the screen edge, and the shape never paints over them.**

Collapse order, innermost first:
- **Left group** (left-anchored): Help → Window → View → Edit → File. The  glyph and the app
  name are never collapsed.
- **Right group** (right-anchored): Wi-Fi → battery → clock.

Each collapsible item is wrapped in a span with `overflow: hidden` animating `max-width`
(0 ↔ its natural width) and `opacity` (0 ↔ 0.86 for text, 0 ↔ 1 for icons), over
`520ms cubic-bezier(.22,1.08,.3,1)` / `300ms cubic-bezier(.4,0,.2,1)`. Its horizontal padding
lives **inside** the wrapper so the spacing collapses with it.

### Derive the thresholds — never hardcode them
The prototype measures the real rendered edges of every menu item on mount (and again on
`document.fonts.ready`), then:

```
shapeLeft  = screenCenter − N/2 − lw − CLEAR      // CLEAR = 8px
shapeRight = screenCenter + N/2 + rw + CLEAR

leftItemOpen(item)  = shapeLeft  >= item.right
rightItemOpen(item) = shapeRight <= item.left
```

Because the left group is left-anchored and the right group is right-anchored, collapsing an
inner item never moves an outer one, so a single measurement pass is valid for all states.

### Hard clamp
Wing widths are clamped so the shape can never reach the app name or the clock:

```
maxLeftWing  = screenCenter − N/2 − CLEAR − appNameRightEdge
maxRightWing = screenRight − margin − CLEAR − screenCenter − N/2
```

The right clamp runs to the screen edge rather than to the clock, because the clock is itself
collapsible — the wide states (`peek`, `clipboard`, `expanded`) need that room, and macOS
already hides menu bar items when space runs out.

The clamp is applied to the configured wing width before anything else is computed. This is what
makes the design safe to edit: raising a wing width in the state table can shorten it to fit,
but can never silently overlap the menu bar.

---

## Expanded panel

Opens below the wing row on click. Three zones separated by vertical hairlines, echoing the
zoning in macOS notch utilities. Container: `flex: none`, `box-sizing: border-box`,
`padding: 0 14px 14px`, `display: flex`, `align-items: stretch`, `gap: 14px`.

1. **Session** — 150px fixed. A 26-bar static sparkline (2px bars, 2.5px gap, `#5A8FE8` at 55%
   opacity, heights 5–18px) over `0:06 · 42 WORDS` in mono 9px, letter-spacing .13em,
   `rgba(255,255,255,.4)`.
2. **Hairline** — 1px, `linear-gradient(180deg, transparent, rgba(255,255,255,.13) 25%, rgba(255,255,255,.13) 75%, transparent)`.
3. **Transcript** — flexible, `min-width: 0`. Body 12.5px / 1.45 line-height,
   `rgba(255,255,255,.9)`, `text-wrap: pretty`. Beneath it a mono 8.5px uppercase caption
   (letter-spacing .16em, `rgba(255,255,255,.3)`) naming the destination, e.g. `PASTED INTO LINEAR`.
4. **Hairline** again.
5. **Action** — 74px fixed. A 44px circular button,
   `background: radial-gradient(120% 120% at 50% 0%, rgba(255,255,255,.14), rgba(255,255,255,.05))`,
   `border: 1px solid rgba(255,255,255,.1)`, containing a 15px copy icon. On hover the fill
   becomes `radial-gradient(120% 120% at 50% 0%, rgba(90,143,232,.4), rgba(90,143,232,.14))`.
   Below it a 10px label, `rgba(255,255,255,.6)`.

**The expanded height must be measured from the panel, not hand-summed.** The prototype reads
`panel.offsetHeight` on update and sets shape height to `rowHeight + panelHeight`. Hand-summing
child heights and gaps was wrong twice — adding a row silently clipped the panel.

---

## Motion

One shared, **direction-dependent** curve drives the shape, both wings, and their padding. Using
different durations for the shape and the wings makes the content visibly lag the container.

| Direction | Duration | Easing |
|---|---|---|
| Growing | 560ms | `cubic-bezier(.22,1.08,.3,1)` — slight overshoot |
| Shrinking | 440ms | `cubic-bezier(.36,0,.18,1)` — decelerate, no bounce |

Opening should feel eager; closing should not bounce. Direction is determined by comparing the
new total width against the previous one.

Animated properties: `width` and `margin-left` on the wrapper, `height` and `border-radius` on
the shape, `width` and `padding` on each wing. Set `will-change` on all three.

**Content entrance** — 420ms `cubic-bezier(.22,1,.36,1)` with a **90ms delay**, so glyphs and
labels appear after the space for them exists rather than popping into a wing mid-expansion:
```css
@keyframes contentIn { from { opacity:0; transform:scale(.9); filter:blur(3px) }
                       to   { opacity:1; transform:none;     filter:blur(0) } }
```

**Panel entrance** — 460ms `cubic-bezier(.22,1,.36,1)`, 120ms delay:
```css
@keyframes panelIn { from { opacity:0; transform:translateY(-8px); filter:blur(3px) }
                     to   { opacity:1; transform:none;             filter:blur(0) } }
```

**Waveform** — 13 bars, 2px wide, 2.5px gap, 16px tall container. Each bar runs one of seven
height keyframes at a duration between .52s and .76s with a staggered negative
`animation-delay` (`-.0s` … `-.12s`) so no two bars are in phase.
`filter: drop-shadow(0 0 5px rgba(90,143,232,.55))` and a
`mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)` so it
dissolves at both ends instead of stopping abruptly.

**Record dot** — 7px, `#E84A3A`, `box-shadow: 0 0 8px rgba(232,74,58,.85)`,
`animation: pulse 2s cubic-bezier(.4,0,.6,1) infinite` (opacity to .45 at 50%).

**Spinner** — 12px circle, `border: 1.5px solid rgba(255,255,255,.18)` with
`border-top-color: #5A8FE8`, `animation: spin .8s linear infinite`.

---

## State management

```
state: 'idle' | 'peek' | 'recording' | 'processing' | 'done' | 'clipboard' | 'copied' | 'error' | 'expanded'
panelHeight: number   // measured from the panel element on update
menuEdges: object     // measured menu item rects; null until first measurement
```

Transitions:
- hover notch while `idle` → `peek`; click the transcript in `peek` → `copied` → (1600ms) `peek`
- hotkey down → `recording`
- hotkey up → `processing` → `done` or `clipboard` or `error` → (auto, ~1.6s) `idle`
- mouse-out from `peek` or `copied` → `idle` (hover is suppressed during a run)
- click → `expanded`; click-out / Esc → previous state

Timers must be cleared on unmount and whenever the state is set manually.

---

## Design tokens

**Colors**
| Token | Value |
|---|---|
| shape body | `linear-gradient(180deg, #0B0C11, #000 55%)` |
| lens | `#12161C` |
| accent / cobalt | `#5A8FE8` |
| volt (UI accent) | `#2B7FFF` |
| danger | `#E84A3A` |
| text primary | `rgba(255,255,255,.92)` |
| text secondary | `rgba(255,255,255,.6)` |
| text tertiary | `rgba(255,255,255,.4)` |
| hairline | `rgba(255,255,255,.13)` |
| surface (panel row) | `rgba(255,255,255,.045)` |

**Typography**
| Role | Stack | Size / style |
|---|---|---|
| State label | `"Instrument Serif", "Cormorant Garamond", Georgia, serif` | 15px, **italic**, letter-spacing .005em, `text-shadow: 0 1px 2px rgba(0,0,0,.35)` |
| Body / transcript | `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif` | 12.5px / 1.45 |
| Menu bar | same sans | 11px |
| Eyebrow / mono | `"SF Mono", ui-monospace, Menlo, monospace` | 8.5–10px, uppercase, letter-spacing .13–.18em |

The italic serif state label is the brand signature — it is the one thing that makes this read as
Yappr rather than as a generic notch utility. Keep it.

**Radii** — 15 / 19 / 24px (shape by state) · 10px (panel rows) · 999px (pills, dots, circle button)

**Shadows** — `0 16px 40px rgba(0,0,0,.55)` (shape) · `inset 0 -1px 0 rgba(255,255,255,.07)` (rim) · `0 0 8px rgba(232,74,58,.85)` (record dot) · `drop-shadow(0 0 5px rgba(90,143,232,.55))` (waveform)

---

## Platform notes (macOS)

Findings from the feasibility pass, for whoever wires this up:

**Prior art.** Boring.Notch (open source, GPL-3.0, SwiftUI) does exactly this class of thing —
a background menu-bar utility that detects hover over the notch and expands. Read it for
technique; do **not** copy code into a closed-source app. NotchNook and Alcove are the
commercial equivalents.

**Window setup.** A borderless, transparent, always-on-top window at `screen-saver` level, with
`visibleOnAllWorkspaces` + `visibleOnFullScreen` so it survives Spaces and fullscreen apps.
Levels from `pop-up-menu` upward sit above the Dock; Apple discourages going more than one level
above `screen-saver`.

**Electron caveats**, if the app stays Electron:
- Getting reliably above the menu bar has been historically flaky —
  `setAlwaysOnTop(true, 'screen-saver')` has put windows above the Dock but not the menu bar, and
  the level can reset after fullscreen transitions. Set `enableLargerThanScreen`, and re-assert
  the level on display and Space changes.
- CSS blur cannot blur the desktop behind an Electron window. Not a problem here — the notch is
  true black, so the shape reads as hardware. The design deliberately does not rely on
  backdrop blur.
- You cannot click through the transparent region of a transparent window. The expanded shape's
  hit region must be updated per state via `setIgnoreMouseEvents(true, { forward: true })`, or
  the menu bar underneath goes dead.
- The overlay will appear in screen shares unless `setContentProtection(true)`.

**Honest verdict:** an Electron overlay gets ~90% there. The last 10% — the expand physics,
menu-bar interaction, and multi-display correctness — is where a small native Swift helper
process pays for itself.

**Out of scope for now:** non-notch Macs and external displays. Boring.Notch draws a simulated
notch under the menu bar for these; that was explicitly deferred.

---

## Assets
None. Every glyph (mic, checkmark, Wi-Fi, battery, copy) is inline SVG defined in the prototype.
Fonts are Google Fonts: **Instrument Serif** and **Cormorant Garamond**. The rest of the stack is
system fonts.

## Files
- `Notch Indicator.dc.html` — the full prototype: all eight states, the mock desktop, the menu
  bar collapse logic, and the state machine. The controls beneath the mock (state chips and
  "Play run") are prototype scaffolding and do not ship.

## How to use this with Claude Code
1. Unzip this folder into your repo (anywhere — e.g. `docs/design_handoff_notch_indicator/`).
2. Open the HTML file in a browser first, so you can see the motion and the hover-to-copy
   interaction. The README describes them, but watching is faster.
3. Point Claude Code at the README:

   `Implement docs/design_handoff_notch_indicator/README.md in this codebase. The HTML is a
   reference, not code to copy — use our existing patterns.`

4. The three things to get right, in order: the derived menu-bar clearance, the measured
   expanded height, and the direction-dependent easing. Each of those was got wrong at least
   once while designing this — the README calls out why.
