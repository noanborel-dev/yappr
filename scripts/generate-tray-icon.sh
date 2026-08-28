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
    THE Y IS AN OUTLINE, not text, and this is the whole point of the file.

    The landing page draws this mark in Instrument Serif ITALIC. That is a
    web font: it is not installed on the machine, so sips cannot see it and
    falls back to Georgia without saying so. The first version of this icon
    therefore shipped Georgia's roman Y with a skewX on it, which is a
    synthetic oblique of the wrong letterform — Instrument Serif's italic Y
    has a very different weight distribution and tail, and it looked wrong
    next to the same mark on the site.

    So the glyph is embedded as its own path, lifted straight out of the
    font (Instrument Serif italic, unitsPerEm 1000, glyph "Y"). No font
    dependency, identical output on any machine, and it is the real
    letterform rather than an impression of one.

    Font coordinates are y-UP and SVG is y-DOWN, hence the negative Y
    scale. Glyph bbox is x 57..601, y 0..720, so its centre is (329,360);
    the transform maps that onto the tile's centre (11,11) at a scale that
    gives the letter 11px of height inside the 20px plate.

    To regenerate after a font update:
      python3 -c "from fontTools.ttLib import TTFont; \
        from fontTools.pens.svgPathPen import SVGPathPen; \
        f=TTFont('InstrumentSerif-Italic.ttf'); g=f.getGlyphSet(); \
        p=SVGPathPen(g); g[f.getBestCmap()[ord('Y')]].draw(p); \
        print(p.getCommands())"
  -->
  <path
    transform="translate(5.974,16.5) scale(0.015278,-0.015278)"
    fill="#FFFFFF"
    d="M71 0Q57 0 57 10Q57 21 72 23L119 30Q139 33 149.0 40.5Q159 48 163 69L217 305Q220 317 219.5 327.0Q219 337 216 348L140 656Q136 673 129.5 682.0Q123 691 107 695L99 697Q87 700 87 709Q87 720 105 720H270Q283 720 283 710Q283 698 263 697L243 695Q226 694 217.0 684.0Q208 674 213 653L276 388Q278 381 283.5 380.5Q289 380 294 387L471 632Q490 658 487.5 674.5Q485 691 462 694L441 697Q427 699 427 709Q427 720 443 720H587Q601 720 601 711Q601 700 584 697L573 695Q559 693 545.0 678.5Q531 664 507 631L315 368Q305 354 298.5 341.5Q292 329 288 313L232 69Q228 48 233.5 41.0Q239 34 258 30L297 23Q312 20 312 12Q312 0 294 0Z"
  />
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
