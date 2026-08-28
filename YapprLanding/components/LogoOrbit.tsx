"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PillLogo } from "./PillLogo";

// Where Yappr works, as an orbit rather than a list.
//
// This replaces a "Works in" label with a row of logos after it. The row
// said the same thing, but a row is read left to right and then finished;
// a ring has no end, which is closer to the claim being made.
//
// The motion is a CONVEYOR, not a formation. Each logo rises into the
// ring at the bottom, goes all the way round, and climbs out through the
// top. Nothing settles into a final arrangement.
//
// That is the difference from the version before it, which flew the logos
// up from a line and parked them in a static ring that then span as a
// rigid body. Parking them made the section a diagram: it had a finished
// state, and once you had read it there was nothing left. A conveyor has
// no finished state, which is the actual claim — the list of places this
// works does not end.
//
// Before the ring is full it is an arc filling from the bottom; after,
// an arc emptying through the top. See TRAVEL_DEG.
//
// Scroll-driven with a tall track and a sticky stage, the same mechanism
// FinalCTA uses. No new dependencies and no CSS animation: every logo's
// position is one trig call against scroll progress. Deliberately NO
// guide circle is drawn — the path is legible from the logos on it.

// Everything supplied except Outlook and Google Docs, which were the two
// set aside. Ordered so neighbours on the ring come from different
// worlds — editor, then inbox, then chat — because a run of four coding
// tools reads as a category, and the claim is the opposite of a category.
const APPS: Array<{ name: string; logo: string; invert?: boolean; wide?: boolean }> = [
  { name: "Claude Code", logo: "/logos/claudecode.png" },
  { name: "Gmail", logo: "/logos/gmail.webp" },
  { name: "Cursor", logo: "/logos/cursor.png" },
  { name: "Notion", logo: "/logos/notion.png" },
  { name: "Claude", logo: "/logos/claude.png" },
  { name: "Slack", logo: "/logos/slack.png" },
  { name: "VS Code", logo: "/logos/vscode.webp" },
  { name: "iMessage", logo: "/logos/imessage.png" },
  { name: "ChatGPT", logo: "/logos/chatgpt.webp" },
  { name: "Granola", logo: "/logos/granola.webp" },
  { name: "Replit", logo: "/logos/replit.webp" },
  { name: "Gemini", logo: "/logos/gemini.webp" },
  { name: "Terminal", logo: "/logos/terminal.png" },
  { name: "Lovable", logo: "/logos/lovable.webp" },
  { name: "Codex", logo: "/logos/codex.png", invert: true, wide: true },
];

// Everything below is in DEGREES OF TRAVEL rather than a normalised 0–1
// journey, because the two things that have to be exactly right — where
// a logo joins the path and where it leaves it — are angles.

// Bottom of the ring. Logos rise into the path here.
const ENTRY_ANGLE = 80;

// How far each logo travels before it leaves. A full lap takes it back
// to the bottom it came from; the extra half carries it on to the TOP,
// so arrivals and departures happen at opposite poles instead of piling
// up in the same place.
//
//   80° − 540° = −460° ≡ −100°, which is the top of the circle.
//
// Travel is counter-clockwise on screen (bottom → right → top → left):
// screen y points DOWN, so SUBTRACTING from the angle turns that way.
const TRAVEL_DEG = 540;

// Arrival and departure ramps, in degrees of travel. Long enough to read
// as flying in rather than blinking on, short enough that a logo is at
// full size for the great majority of its trip.
const FADE_DEG = 30;

// Logos arrive from outside the ring and leave the same way — in past
// the bottom edge of the frame, out past the top — rather than appearing
// and vanishing on the path itself. 1 = on the ring.
const ENTRY_RADIUS = 1.3;

// Angular gap between neighbours. Staggering the STARTS by exactly this
// is what makes the ring come out evenly spaced once it is full — and
// what guarantees no two logos ever share an angle, including at the
// moment one passes the entry point while another is arriving there.
const SPACING_DEG = 360 / APPS.length;

// The total sweep the scroll maps onto. The last logo starts a full set
// of gaps behind the first, so the scroll has to cover its stagger AND
// its travel for the ring to fill, turn, and empty exactly once.
const SWEEP_DEG = TRAVEL_DEG + APPS.length * SPACING_DEG;

// Reduced motion parks everything at the midpoint of the window where
// all fifteen are on the path — far enough from either ramp that nothing
// is caught mid-fade.
const STILL_AT = (TRAVEL_DEG + (APPS.length - 1) * SPACING_DEG) / 2;

// The arrivals: the first logo is already entering at zero, the last one
// a full set of gaps later. When the last one lands the circle is closed.
const ARRIVAL_END = (APPS.length - 1) * SPACING_DEG;

// The exodus: the first logo leaves the moment it completes its travel,
// the last one a full set of gaps later. The mark grows across exactly
// this window, so it takes over the frame at the rate the ring vacates
// it rather than on a timer of its own.
const EXODUS_START = TRAVEL_DEG;
const EXODUS_END = TRAVEL_DEG + (APPS.length - 1) * SPACING_DEG;

// How much of the track the orbit gets. The remainder is a hold on the
// closing frame — empty ring, mark at full size, the line already
// written — so the section lands instead of cutting away mid-motion.
const ORBIT_SPAN = 0.93;

// Scale of the centre mark, as a multiple of its rendered size (68px).
//
// BASE is well above 1 throughout: the mark is the thing being orbited,
// and at its natural size it was smaller than the logos going round it,
// which inverts the hierarchy the whole section depends on. At 1.75 it
// is ~119px against 96px logos — clearly the centre, before any growth.
//
// MAX rose with it. The growth has to stay legible as growth, and a
// ratio that shrank as BASE went up would have quietly turned the
// takeover into a nudge.
const MARK_BASE = 1.75;
const MARK_MAX = 2.85;

// Typed one character at a time by the scroll itself — no timer — and in
// step with the ARRIVALS rather than after them.
//
// It ran on the tail at first, writing itself only once the ring had
// emptied. That put the sentence after its own evidence and left the
// first third of the section saying nothing while the logos poured in.
// The line and the logos are the same claim, so they are made together:
// roughly one character per logo (17 across 15), which is why the ring
// closing and the sentence finishing land on the same beat.
const CAPTION = "wherever you type";

// The ring should fill the frame, so it is sized off BOTH axes and takes
// whichever is tighter. Off the short side alone it came out at about a
// third of the screen — a small cluster near the middle with the section
// empty around it.
const RADIUS_W = 0.33;
const RADIUS_H = 0.38;   // clears the sticky nav at the top of the ring

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function LogoOrbit() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [radius, setRadius] = useState(220);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // Reduced motion gets the complete ring and no travel. The point of
    // the section is which apps are supported, and that is only legible
    // in the one frame where all of them are on the path at once.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }

    let frame = 0;
    const measure = () => {
      const stage = stageRef.current;
      if (stage) {
        setRadius(
          Math.max(
            140,
            Math.min(stage.clientWidth * RADIUS_W, stage.clientHeight * RADIUS_H),
          ),
        );
      }
    };
    const update = () => {
      frame = 0;
      const r = track.getBoundingClientRect();
      const scrollable = r.height - window.innerHeight;
      if (scrollable <= 0) return;
      // The whole track, not 80% of it: the last logo should still be
      // leaving as the section scrolls away. Holding p at 1 early would
      // park an empty ring on screen, which reads as a broken section.
      setP(clamp01(-r.top / scrollable));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The orbit runs across ORBIT_SPAN of the track and the remainder holds
  // the closing frame. Everything below is driven off `swept` — degrees
  // travelled — so the arrivals, the exodus and the caption all read off
  // the same clock and cannot drift apart.
  const orbit = still ? 1 : clamp01(p / ORBIT_SPAN);
  const swept = still ? STILL_AT : orbit * SWEEP_DEG;

  // Grows as the ring vacates. Smoothstep, not ease-out: an ease-out put
  // the mark within a few percent of full size while six logos were
  // still on the path, so the growth had visibly finished before the
  // thing it is supposed to be tracking had. Easing at BOTH ends keeps
  // it in step with the exodus — gentle as the first logo leaves, gentle
  // as the last one does.
  const exodus = still
    ? 0
    : clamp01((swept - EXODUS_START) / (EXODUS_END - EXODUS_START));
  const markScale =
    MARK_BASE + (MARK_MAX - MARK_BASE) * (exodus * exodus * (3 - 2 * exodus));

  // Linear, unlike everything else here: typing has a cadence, and an
  // eased one reads as a stutter rather than as someone writing.
  const typed = still
    ? CAPTION.length
    : Math.round(clamp01(swept / ARRIVAL_END) * CAPTION.length);

  return (
    <section id="builders" className="orb" ref={trackRef}>
      <div className="orb-pin">
        <div className="orb-stage" ref={stageRef}>
          <div className="orb-ring">
            {APPS.map((app, i) => {
              // Degrees this logo has travelled. Below 0 it has not risen
              // in at the bottom yet; past TRAVEL_DEG it has already
              // climbed out through the top.
              const travelled = swept - i * SPACING_DEG;
              const onPath = travelled >= 0 && travelled <= TRAVEL_DEG;

              const rad = ((ENTRY_ANGLE - travelled) * Math.PI) / 180;

              // Arrival and departure ramps. Both run 0 → 1 as the logo
              // settles onto the path, so one expression drives opacity,
              // scale and the radial offset.
              const settle = Math.min(
                clamp01(travelled / FADE_DEG),
                clamp01((TRAVEL_DEG - travelled) / FADE_DEG),
              );
              // Ease so it decelerates onto the ring instead of sliding
              // in at constant speed and stopping dead.
              const eased = 1 - Math.pow(1 - settle, 3);

              const r = radius * (ENTRY_RADIUS - (ENTRY_RADIUS - 1) * eased);
              const x = Math.cos(rad) * r;
              const y = Math.sin(rad) * r;

              return (
                <div
                  key={app.name}
                  className="orb-slot"
                  style={{
                    // No rotation anywhere in this transform: the marks
                    // must stay upright. A tumbling Slack logo reads as a
                    // loading spinner, not as an app.
                    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${0.72 + 0.28 * eased})`,
                    opacity: onPath ? eased : 0,
                    // Off-path logos keep their DOM node so the image is
                    // never re-decoded mid-scroll, but must not sit on
                    // top of the centre mark.
                    visibility: onPath ? "visible" : "hidden",
                  }}
                >
                  {/* `invert` is for marks supplied as WHITE artwork —
                      Codex ships as a white wordmark, which is invisible
                      on cream. Inverting a white-on-transparent PNG gives
                      black on transparent, alpha intact, which is the
                      mark as it would be drawn for a light background.
                      `wide` is for wordmarks rather than icons: forcing
                      one into a square box scales it down until it is
                      unreadable, so it gets width instead. */}
                  <div className={`orb-logo ${app.wide ? "is-wide" : ""}`}>
                    <Image
                      src={app.logo}
                      alt={app.name}
                      width={app.wide ? 150 : 96}
                      height={96}
                      style={app.invert ? { filter: "invert(1)" } : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* --mark-scale drives BOTH the mark's transform and the
              caption's offset, so the gap under the mark stays constant
              as it grows. A transform does not change layout, so without
              that the growing mark would simply swallow the line. */}
          <div
            className="orb-core"
            style={{ ["--mark-scale" as string]: markScale }}
          >
            <div className="orb-mark">
              <PillLogo size="lg" shape="square" />
            </div>
            {/* The full line is always in the accessibility tree — a
                screen reader should not get a half-typed word, and it
                has no scroll position to complete it with. */}
            <p className="orb-core-line">
              <span className="sr-only">{CAPTION}</span>
              <span aria-hidden="true">{CAPTION.slice(0, typed)}</span>
              {typed > 0 && typed < CAPTION.length && (
                <i className="orb-caret" aria-hidden="true" />
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
