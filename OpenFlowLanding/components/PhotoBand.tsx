"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// Full-bleed photographic band, Apple-style: edge-to-edge image, wide crop,
// gradient scrim, one huge line of type sitting on it.
//
// ── HOW TO USE ──────────────────────────────────────────────────────────
// 1. Drop a file in `public/photos/` (see PHOTO_SPEC below for what to shoot
//    or source — resolution and crop matter more than subject).
// 2. Add an entry to PHOTOS in `photos.ts`.
// 3. Render <PhotoBand id="..."> wherever you want it.
// Until step 1 happens the band renders nothing at all — an empty grey box
// on a live page is worse than no band.
//
// ── LICENSING ───────────────────────────────────────────────────────────
// Whatever goes in here must be licensed for commercial use. Do NOT drop in
// an image scraped from another company's site, and do not use a photo of a
// real identifiable person — on a product page that reads as an endorsement
// they never gave.

export type Photo = {
  src: string;
  /** Describe the image for screen readers — never leave this empty. */
  alt: string;
  /** Overlaid headline. Keep it to one line; this is a poster, not a paragraph. */
  headline?: React.ReactNode;
  /** Optional small line under the headline. */
  sub?: string;
  /** Where the subject sits, so the scrim doesn't cover it. */
  align?: "left" | "center";
  /** Darken the image so type stays legible. 0–1, default 0.45. */
  scrim?: number;
};

export function PhotoBand({
  photo,
  priority,
}: {
  photo?: Photo;
  priority?: boolean;
}) {
  const { ref, offset } = useParallax();

  // No asset yet → render nothing rather than a placeholder.
  if (!photo?.src) return null;

  return (
    <section className={`pb pb--${photo.align ?? "left"}`} ref={ref}>
      {/* The image is taller than the band and drifts against the scroll,
          so you appear to be looking through a window rather than at a
          picture stuck to the page. */}
      <div className="pb-media" style={{ transform: `translate3d(0,${offset}px,0)` }}>
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="100vw"
          priority={priority}
          className="pb-img"
        />
        <span
          className="pb-scrim"
          aria-hidden="true"
          style={{ opacity: photo.scrim ?? 0.45 }}
        />
      </div>

      {(photo.headline || photo.sub) && (
        <div className="pb-copy">
          {photo.headline && <h2 className="pb-title">{photo.headline}</h2>}
          {photo.sub && <p className="pb-sub">{photo.sub}</p>}
        </div>
      )}
    </section>
  );
}

/**
 * Scroll-linked vertical drift. The media box is oversized (see .pb-media
 * in globals.css) so the image can move without exposing an edge.
 *
 * Deliberately NOT a background-attachment:fixed — that's jankier, breaks
 * on iOS entirely, and can't be disabled for reduced-motion.
 */
const PARALLAX_RANGE = 46;

function useParallax() {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      // -1 fully below the fold → +1 fully above it.
      const p = 1 - (2 * (r.top + r.height / 2)) / (vh + r.height);
      setOffset(Math.round(p * PARALLAX_RANGE * 100) / 100);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, offset };
}
