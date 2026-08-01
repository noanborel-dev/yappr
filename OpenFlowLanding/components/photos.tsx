import type { Photo } from "./PhotoBand";

// ═══════════════════════════════════════════════════════════════════════
// SHOT LIST — what to source, and why each one earns its place.
//
// The page has no photography today. These are the only three places it
// would add something the app mockups can't. Resist adding more: this is a
// software product, and a page full of stock photos of people at laptops
// reads as a template, not as Apple.
//
// Spec for all three:
//   • 3000px wide minimum, exported as .jpg (quality ~78) or .avif
//   • Shot wide/landscape — these render 21:9 on desktop, 4:5 on mobile,
//     so keep the subject inside the middle 60% horizontally
//   • Warm, natural light. The page is cream; cold blue-grey stock photos
//     fight the palette badly
//   • No readable faces, no screens showing a competitor's UI
//   • Licensed for commercial use
//
// Once a file is in public/photos/, uncomment its entry.
// ═══════════════════════════════════════════════════════════════════════

export const PHOTOS: Record<string, Photo | undefined> = {
  // 1. THE BUILD BENCH — the Claude-ad register you described.
  //    A real workbench mid-project: prototype parts, hand tools, a laptop
  //    pushed to one side, coffee, mess. The point is *making a physical
  //    thing*, with the computer incidental. Goes right after the hero, so
  //    "made for people who build things" has an image behind it.
  //    Search terms: "workshop prototype bench overhead", "maker bench
  //    tools laptop", "engineering prototype workbench natural light".
  buildBench: {
    src: "/photos/build-bench.jpg",
    alt: "A workbench mid-project: prototype parts, hand tools and a laptop pushed to one side.",
    headline: (
      <>
        Made for people who <em>build things</em>.
      </>
    ),
    sub: "Not for dictating memos.",
    align: "left",
    scrim: 0.5,
  },

  // 2. LATE DESK — the "four terminals open" moment, but real: a desk at
  //    night, monitor glow, notes, empty cups. Shot from behind/over the
  //    shoulder so no face is readable. Would sit above the live demo.
  //    Search terms: "developer desk night monitor glow over shoulder".
  lateDesk: {
    src: "/photos/late-desk.jpg",
    alt: "A desk late at night, lit by monitor glow, with notes and empty cups.",
    // Headline-only, no sub-line: this is a recognition beat, and the
    // Statement directly below ("Hold Control. Say anything.") is already
    // doing the explaining.
    //
    // The earlier line here — "You already talk to it all day" — was cut for
    // two reasons worth not repeating: "it" has no referent the image
    // supports (over a shot of someone facing monitors it reads as the
    // computer), and it asserted the outcome as the premise. You don't talk
    // to it yet; you type at it. That's the problem the product solves.
    headline: <>Nobody types their best thinking.</>,
    align: "center",
    // Dark frame already, but the type sits centre over the monitor glow —
    // enough scrim to hold it, not enough to flatten the photo.
    scrim: 0.38,
  },

  // 3. OPTIONAL — hands mid-gesture while talking, close crop, no face.
  //    Only worth it if the first two land well; three photo bands on a
  //    page this length starts to feel like padding.
};
