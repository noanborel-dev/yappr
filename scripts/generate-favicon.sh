#!/usr/bin/env bash
# Generates YapprLanding/app/favicon.ico from brand/svg/yappr-tile.svg.
#
# WHY THIS EXISTS AT ALL. Next's App Router serves app/icon.svg as the
# tab icon, which every current browser honours — so a .ico looks
# redundant. It is not: link-preview crawlers (Slack, iMessage, Discord)
# request /favicon.ico by path and do not read the document head. Without
# this file that request 404s and the unfurl has no icon.
#
# It also has to be REGENERATED, not just kept. The stale favicon.ico
# left over from the old mark outranked icon.svg in the browser tab, so
# the site showed the old logo long after everything else had changed.
# A .ico that is not rebuilt with the rest of the brand is worse than
# none.
#
# No ImageMagick on this machine, and sips cannot write .ico. But the
# Vista-era ICO format allows a PNG payload verbatim, so the file is
# assembled here from sips-rendered PNGs: a 6-byte header, one 16-byte
# directory entry per size, then the PNGs.

set -euo pipefail

SRC="brand/svg/yappr-tile.svg"
DEST="YapprLanding/app/favicon.ico"
TMP="$(mktemp -d)"

for size in 16 32 48 64; do
  sips -s format png -z "$size" "$size" "$SRC" --out "$TMP/$size.png" >/dev/null
done

python3 - "$TMP" "$DEST" <<'PY'
import struct, sys, pathlib

tmp, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sizes = [16, 32, 48, 64]
blobs = [(s, (tmp / f"{s}.png").read_bytes()) for s in sizes]

# ICONDIR: reserved=0, type=1 (icon), count
out = struct.pack("<HHH", 0, 1, len(blobs))

# Each ICONDIRENTRY is 16 bytes and they all precede the payloads.
offset = 6 + 16 * len(blobs)
for size, blob in blobs:
    # width/height are single bytes; 0 means 256. Every size here is < 256.
    out += struct.pack(
        "<BBBBHHII",
        size, size,   # width, height
        0,            # palette entries (0 = truecolour)
        0,            # reserved
        1,            # colour planes
        32,           # bits per pixel
        len(blob),    # bytes in resource
        offset,       # offset from the start of the file
    )
    offset += len(blob)

for _, blob in blobs:
    out += blob

dest.write_bytes(out)
print(f"wrote {dest} ({len(out)} bytes, sizes {sizes})")
PY
