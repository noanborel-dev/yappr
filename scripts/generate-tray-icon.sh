#!/usr/bin/env bash
# Generates the Yappr menubar (tray) icon directly via SVG → sips.
#
# Output: assets/tray.png (1x) + assets/tray@2x.png (2x).
#
# THE SHAPE IS THE NOTCH, not a pill. This used to be a fully-rounded
# charcoal lozenge — the exact shape the brand system replaced, so it was
# the last place in the product still advertising the old mark.
#
# THE FILL IS BRAND_WING, not BRAND_PLATE. That looks like an
# inconsistency and is not. Two reasons:
#
#   1. The tray icon and the live indicator occupy the same menu bar. A
#      user sees both at once, so they should be the same object. The
#      indicator is black-centred with charcoal wings; matching the
#      brighter logo plate here would put two different Yappr marks
#      inches apart.
#   2. The waveform bars are #5A8FE8 — which is exactly the logo plate's
#      edge colour. On the plate the bars would sit on their own colour
#      and disappear. The wing's dark palette is what keeps them legible.
#
# Anything with a top edge to hang from can carry the notch silhouette;
# the menu bar is the top edge of the screen, so this qualifies.
#
# Maxed out at the menubar's 22px tall cap (44px @2x), full-bleed.

set -euo pipefail

TMP="$(mktemp -d)"
DEST_1X="assets/tray.png"
DEST_2X="assets/tray@2x.png"

# Design space is 54×22. sips -Z constrains the longest dim, so we render
# at @2x explicit dimensions and let sips downscale proportionally.
#
# NOTE: no double hyphen may appear anywhere in this SVG's comments. XML
# forbids it inside a comment and sips rejects the entire file with
# "Cannot extract image from file" rather than pointing at the line.
cat > "$TMP/tray.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 22" width="108" height="44">
  <defs>
    <!-- The wing: charcoal at the ends, true black through the middle.
         Same stops as BRAND_WING in src/renderer/shared/ui/YapprMark.tsx. -->
    <linearGradient id="wing" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="#2B3950"/>
      <stop offset="0.14" stop-color="#172130"/>
      <stop offset="0.32" stop-color="#000000"/>
      <stop offset="0.68" stop-color="#000000"/>
      <stop offset="0.86" stop-color="#172130"/>
      <stop offset="1"    stop-color="#2B3950"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#ffffff" stop-opacity="0.13"/>
      <stop offset="0.46" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="dotGlow" cx="11" cy="11" r="7" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#e84a3a" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#e84a3a" stop-opacity="0"/>
    </radialGradient>
    <!-- Square across the top, rounded only at the bottom. -->
    <clipPath id="notchClip">
      <path d="M0,0 H54 V15 A7,7 0 0 1 47,22 H7 A7,7 0 0 1 0,15 Z"/>
    </clipPath>
  </defs>

  <path d="M0,0 H54 V15 A7,7 0 0 1 47,22 H7 A7,7 0 0 1 0,15 Z" fill="url(#wing)"/>

  <g clip-path="url(#notchClip)">
    <rect x="0" y="0" width="54" height="12" fill="url(#sheen)"/>
  </g>

  <!-- Hairline rim. Kept from the previous icon and still doing real
       work: on a dark menubar a near-black shape has no silhouette
       without it. -->
  <path d="M0.3,0 H53.7 V15 A6.7,6.7 0 0 1 47,21.7 H7 A6.7,6.7 0 0 1 0.3,15 Z"
        fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="0.4"/>

  <!-- Red recording dot, left. The indicator's LEFT wing is input, so
       the dot belongs on this side. -->
  <circle cx="11" cy="11" r="7" fill="url(#dotGlow)"/>
  <circle cx="11" cy="11" r="3.0" fill="#e84a3a"/>

  <!-- Five cobalt waveform bars, frozen mid-animation, across the right. -->
  <rect x="22"    y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
  <rect x="26.5"  y="3"   width="1.8" height="16" rx="0.9" fill="#5a8fe8"/>
  <rect x="31"    y="9"   width="1.8" height="4"  rx="0.9" fill="#5a8fe8"/>
  <rect x="35.5"  y="5"   width="1.8" height="12" rx="0.9" fill="#5a8fe8"/>
  <rect x="40"    y="7"   width="1.8" height="8"  rx="0.9" fill="#5a8fe8"/>
  <rect x="44.5"  y="8.5" width="1.8" height="5"  rx="0.9" fill="#5a8fe8"/>
</svg>
SVG

sips -s format png -z 44 108 "$TMP/tray.svg" --out "$TMP/tray@2x.png" >/dev/null
sips -s format png -z 22 54  "$TMP/tray.svg" --out "$TMP/tray.png"    >/dev/null

cp "$TMP/tray.png"    "$DEST_1X"
cp "$TMP/tray@2x.png" "$DEST_2X"

echo "✓ wrote $DEST_1X"
sips -g pixelWidth -g pixelHeight "$DEST_1X" | tail -2
echo "✓ wrote $DEST_2X"
sips -g pixelWidth -g pixelHeight "$DEST_2X" | tail -2
