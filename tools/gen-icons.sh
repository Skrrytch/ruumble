#!/usr/bin/env bash
# Renders the raster icons in web/public from icon.svg and icon-maskable.svg (docs/development.md#icons).
# Needs ImageMagick (convert). Run after changing either SVG; the output is committed.
set -euo pipefail
cd "$(dirname "$0")/../web/public"

render() { # <svg> <size> <out>
  convert -background none -density 1200 "$1" -resize "$2x$2" -depth 8 -strip "PNG32:$3"
}

render icon.svg 192 icon-192.png
render icon.svg 512 icon-512.png
render icon-maskable.svg 192 icon-maskable-192.png
render icon-maskable.svg 512 icon-maskable-512.png
# iOS rounds the corners itself and ignores transparency, so it gets the full-bleed variant.
render icon-maskable.svg 180 apple-touch-icon.png

tmp=$(mktemp -d)
# 16 px is drawn pixel by pixel (the same plan as icon.svg): its 3/64 strokes would blur below
# one pixel. Rectangle coordinates are inclusive.
convert -size 16x16 xc:none \
  -fill '#003869' -draw 'roundrectangle 0,0 15,15 2,2' \
  -fill white -draw 'rectangle 2,2 12,2' -draw 'rectangle 2,12 12,12' \
  -draw 'rectangle 2,2 2,12' -draw 'rectangle 12,2 12,12' -draw 'rectangle 2,7 12,7' \
  -draw 'rectangle 7,2 7,4' -draw 'rectangle 7,10 7,12' \
  -fill '#fbd200' -draw 'rectangle 4,4 5,5' \
  -depth 8 -strip "PNG32:$tmp/16.png"
for s in 32 48; do render icon.svg "$s" "$tmp/$s.png"; done
convert "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" favicon.ico
rm -r "$tmp"
