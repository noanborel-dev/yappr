# Higgsfield brief — Yappr landing page photography

Paste this into a fresh Higgsfield session as context.

---

## 1. What the product is

**Yappr** — a macOS dictation app for people who build software with AI. You
hold a key, talk, and your rambling comes out as a structured prompt in Claude
Code / Cursor / your terminal. Audience is developers and "vibe coders", not
general office users.

Positioning line: *"stop writing bad prompts out loud."*

## 2. What the page looks like (so the images have to belong to it)

- **Palette:** warm cream `#f6f2e7`, ink `#15161a`, terracotta accent `#c8553d`,
  a cobalt `#5a8fe8` used sparingly. Editorial, paper-like, warm.
- **Type:** big italic serif display (Instrument Serif) + Inter body.
- **Feel:** a literary magazine that happens to sell a developer tool.
  Generous whitespace, one idea per screen.
- **Everything else on the page is CSS-drawn app UI** — terminals, editors.
  These photos are the only real-world imagery on the site.

⚠️ **Cold, blue-grey, glossy corporate stock will look pasted on and wrong.**
Warmth is not optional.

## 3. Where the images go — two slots only

### Slot A — "the build bench"
Full-bleed band, sits just under the hero.
Overlaid text: **"Made for people who build things."** / sub: *"Not for
dictating memos."*

The subject: a real workbench mid-project. Prototype parts, hand tools, wire,
a laptop shoved to one side, coffee. Someone is **making a physical thing** and
the computer is incidental to it. Work in progress, not a finished object.

### Slot B — "the late desk"
Full-bleed band, sits above the interactive demo.
Overlaid text: **"You already talk to it all day."**

The subject: a desk late at night, lit by monitor glow. Notes, empty cups, the
debris of a long session. Shot from behind or overhead.

## 4. Art direction — derived from the supplied references

The reference folder splits into two kinds. What to take from each:

**Scene references** (the rocket build in a garage; the overhead design-studio
table covered in drawings; the kid assembling a robot on the floor) — **take
the composition and the honesty from these:**

- **Overhead or wide candid.** Camera is observing, not staging.
- **Genuine mess.** Loose parts, offcuts, scattered paper, cables. Nothing
  tidied for the shot. The mess is the point — it reads as real work.
- **Work in progress**, mid-build, never a finished hero object.
- **Natural / practical light.** Daylight through a garage door, a desk lamp,
  monitor glow. No studio lighting, no rim light, no lens flare.
- **Documentary, not commercial.** Slightly imperfect. Looks like someone
  photographed a real afternoon rather than art-directed a shoot.
- **Muted, warm, slightly desaturated.** Wood, cardboard, kraft paper, denim,
  matte plastic.

**Era/attitude references** (archival founder photos — a young Elon at a CRT,
a collage of Jobs / Gates / Zuckerberg / Page) — **take only the mood:**
early-days, garage-and-dorm-room, scrappy, pre-success, 90s–2000s snapshot
texture. Slight grain, imperfect exposure, on-camera flash feel.

**Do not reproduce those people.** See constraints below.

## 5. Technical spec

| | |
|---|---|
| Aspect | **21:9 landscape** (renders as a full-bleed band) |
| Resolution | **3000px wide minimum** — it spans the full viewport on Retina |
| Composition | Keep the subject in the **middle 60% horizontally.** The outer edges crop off on wide screens, and a portrait crop is taken for phones |
| Bottom third | Keep it visually calm — overlaid headline text sits there and must stay legible |
| Format | JPG (quality ~80) or AVIF |

## 6. Hard constraints

1. **No recognizable faces.** On a product page a real-looking person reads as
   an endorsement they never gave — and generated faces sometimes land close to
   a real person's likeness. Shoot from behind, overhead, or crop at the
   shoulders. Hands and bodies are fine; identifiable faces are not.
2. **No real or famous people.** Not Musk, not Jobs, not any recognizable
   figure. The archival references are for *mood* only.
3. **No readable text or signage** anywhere in frame — image models still
   mangle lettering, and garbled text on a landing page is instantly noticed.
   No brand logos on screens or products.
4. **No prominent close-up hands** mid-gesture — the other thing models still
   get wrong. Hands at a distance, or partially out of frame, are fine.
5. **Commercial use must be permitted** by the Higgsfield plan — this goes on
   a page that sells a product.

## 7. Starting prompts

**Slot A — build bench:**
> Overhead documentary photograph of a cluttered home workshop bench mid-project.
> A partly assembled model rocket, loose electronic components, wire cutters,
> spools of wire, a roll of kraft cardboard tube, a laptop pushed to the edge of
> the frame, a half-drunk mug of coffee. Warm afternoon daylight from one side,
> soft shadows, no studio lighting. Muted warm palette — wood, cardboard, denim,
> matte plastic. Slight film grain. Candid, unstaged, imperfect. No people's
> faces, no readable text or logos. 21:9 wide crop, subject centred.

**Slot B — late desk:**
> Photograph taken from behind a person's shoulder at a desk late at night, lit
> only by monitor glow and a small warm desk lamp. Scattered handwritten notes,
> two empty mugs, a mechanical keyboard, cables. The person is a dark silhouette,
> face not visible. Warm amber and deep shadow, not blue. Slight grain, candid,
> documentary. No readable text on screens, no logos. 21:9 wide crop.

## 8. How to hand results back

Save the chosen file into `OpenFlowLanding/public/photos/` as
`build-bench.jpg` / `late-desk.jpg`, then tell Claude Code — it uncomments the
matching entry in `components/photos.tsx` and the band goes live.
