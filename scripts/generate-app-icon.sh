#!/usr/bin/env bash
# Generates the macOS app icon from brand/svg/yappr-appicon.svg.
#
# Output: assets/icon.icns (Dock, Finder, Cmd-Tab, About)
#         assets/icon.png  (1024, for anything that wants a flat PNG)
#
# The icon this replaced was the old fully-rounded pill on cream — the
# shape the brand system retired. It survived the rebrand because nothing
# on screen inside the app shows it, so it is easy to forget it is the
# most visible logo the product has.
#
# iconutil needs a .iconset directory with Apple's exact filenames; it
# fails on anything it does not recognise, so the list below is not
# cosmetic.

set -euo pipefail

SRC="brand/svg/yappr-appicon.svg"
SET="$(mktemp -d)/icon.iconset"
mkdir -p "$SET"

# name                  pixels
render() {
  sips -s format png -z "$2" "$2" "$SRC" --out "$SET/$1" >/dev/null
}

render icon_16x16.png        16
render icon_16x16@2x.png     32
render icon_32x32.png        32
render icon_32x32@2x.png     64
render icon_128x128.png     128
render icon_128x128@2x.png  256
render icon_256x256.png     256
render icon_256x256@2x.png  512
render icon_512x512.png     512
render icon_512x512@2x.png 1024

iconutil -c icns "$SET" -o assets/icon.icns
cp "$SET/icon_512x512@2x.png" assets/icon.png

echo "✓ wrote assets/icon.icns"
echo "✓ wrote assets/icon.png"
