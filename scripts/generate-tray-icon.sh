#!/usr/bin/env bash
# Generates the Yappr menubar (tray) icon directly via SVG → sips.
#
# Output: assets/tray.png (1x) + assets/tray@2x.png (2x).
#
# IT IS THE MARK NOW, not the indicator's contents.
#
# This drew a notch silhouette with the red recording dot and five cobalt
# waveform bars in it. The reasoning was sound at the time and is written
# down here because it explains what changed: the tray icon and the live
# indicator share a menu bar, a user sees both at once, so they were made
# the same object — and the indicator carried a bare wordmark on a dark
# wing, which the plate would have clashed with.
#
# The indicator now carries the square brand mark (YapprMark lockup
# "square", see NotchIndicator.tsx). So the argument now points the other
# way: matching it means showing the plate, and a dot with waveform bars
# is the odd one out — it was also drawing a RECORDING state permanently,
# on an icon that is idle almost all of the time.
#
# One letter, not five. "Yappr" at 22px tall is about 7px of cap height
# and unreadable; the square lockup exists for exactly this, and a Y at
# this size is a shape you recognise rather than text you fail to read.
#
# Square, inset 1px so the plate does not touch the menu bar's edges, with
# the same 22 percent squircle and the same radial plate as the Dock icon
# (brand/svg/yappr-appicon.svg). Full colour: macOS only forces template
# rendering when the file is named *Template.png.

set -euo pipefail

TMP="$(mktemp -d)"
DEST_1X="assets/tray.png"
DEST_2X="assets/tray@2x.png"

# Design space is 22×22 — the menu bar's cap height. sips gets explicit
# @2x dimensions and downscales for 1x.
#
# NOTE: no double hyphen may appear anywhere in this SVG's comments. XML
# forbids it inside a comment and sips rejects the entire file with
# "Cannot extract image from file" rather than pointing at the line.
cat > "$TMP/tray.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="44" height="44">
  <defs>
    <!-- Same stops as the Dock icon and BRAND_PLATE_RADIAL in
         src/renderer/shared/ui/YapprMark.tsx. Alpha over a #151B26 floor
         rather than a colour ramp, so the centre stays near black and the
         edges lift to cobalt. -->
    <!-- r is 0.86 here against 0.62 on the Dock icon, and the ramp starts
         later. Same stops scaled to 20px would put the bright end well
         inside the tile and average out to flat pale blue; at menu bar
         size the plate has to hold a dark core for the white Y to sit
         on. Pushing the bright edge past the corners keeps the centre
         near black and leaves the cobalt as a rim. -->
    <radialGradient id="t-plate" cx="0.5" cy="0.5" r="0.86">
      <stop offset="0"    stop-color="#16305C" stop-opacity="0"/>
      <stop offset="0.34" stop-color="#16305C" stop-opacity="0"/>
      <stop offset="0.50" stop-color="#1C3660" stop-opacity="0.16"/>
      <stop offset="0.64" stop-color="#284676" stop-opacity="0.34"/>
      <stop offset="0.76" stop-color="#365A96" stop-opacity="0.54"/>
      <stop offset="0.88" stop-color="#446EB6" stop-opacity="0.72"/>
      <stop offset="1"    stop-color="#5A8FE8" stop-opacity="0.90"/>
    </radialGradient>
    <linearGradient id="t-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#FFFFFF" stop-opacity="0.15"/>
      <stop offset="0.46" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="t-clip">
      <rect x="1" y="1" width="20" height="20" rx="4.4" ry="4.4"/>
    </clipPath>
  </defs>

  <g clip-path="url(#t-clip)">
    <rect x="1" y="1" width="20" height="20" fill="#151B26"/>
    <rect x="1" y="1" width="20" height="20" fill="url(#t-plate)"/>
    <rect x="1" y="1" width="20" height="20" fill="url(#t-sheen)"/>
  </g>

  <!-- Hairline rim. On a dark menu bar the plate's near black centre has
       no silhouette without it. -->
  <rect x="1.2" y="1.2" width="19.6" height="19.6" rx="4.3" ry="4.3"
        fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="0.4"/>

  <!--
    SKEWED, not font-style="italic".

    sips silently ignores font-style and rasterises roman, and the Yappr
    mark is never upright. Naming the face "Georgia Italic" is worse: it
    matches nothing and falls back to a sans.

    The translate cancels the skew's drift: skewX(a) maps (x,y) to
    (x + y*tan(a), y), so at the y used below (11.6) with a=-11 the glyph
    moves left by 11.6*tan(11) = 2.25. Translating back keeps it centred.

    The Y's diagonal also makes it sit optically left in its box, which is
    why .square-logo on the landing page carries a text-indent. The same
    correction is folded into the translate here.
  -->
  <g transform="translate(2.55,0) skewX(-11)">
    <text
      x="11" y="11.6"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="14.5"
      fill="#FFFFFF"
    >Y</text>
  </g>
</svg>
SVG

sips -s format png -z 44 44 "$TMP/tray.svg" --out "$TMP/tray@2x.png" >/dev/null
sips -s format png -z 22 22 "$TMP/tray.svg" --out "$TMP/tray.png"    >/dev/null

cp "$TMP/tray.png"    "$DEST_1X"
cp "$TMP/tray@2x.png" "$DEST_2X"

echo "✓ wrote $DEST_1X"
sips -g pixelWidth -g pixelHeight "$DEST_1X" | tail -2
echo "✓ wrote $DEST_2X"
sips -g pixelWidth -g pixelHeight "$DEST_2X" | tail -2
