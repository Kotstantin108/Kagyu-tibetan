"""Build site/icons/icon.svg: a navy tile with the syllable OM shaped from Noto Serif Tibetan.

The glyph outlines are embedded as paths, so the icon needs no font.
Usage: python scripts/tools/make-icon.py path/to/NotoSerifTibetan-Regular.ttf
"""
import sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ttf = sys.argv[1]
text = "ཨོཾ"  # ཨོཾ

font = TTFont(ttf)
upem = font["head"].unitsPerEm
glyph_set = font.getGlyphSet()
order = font.getGlyphOrder()

blob = hb.Blob.from_file_path(ttf)
face = hb.Face(blob)
hbfont = hb.Font(face)
buf = hb.Buffer()
buf.add_str(text)
buf.guess_segment_properties()
hb.shape(hbfont, buf)

paths = []
x = 0
y = 0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    pen = SVGPathPen(glyph_set)
    glyph_set[name].draw(pen)
    d = pen.getCommands()
    if d:
        paths.append((d, x + pos.x_offset, y + pos.y_offset))
    x += pos.x_advance
    y += pos.y_advance
advance = x

# bounding box of the shaped text (font units, y up)
from fontTools.pens.boundsPen import BoundsPen
xmin = ymin = 1e9
xmax = ymax = -1e9
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    pass
bx = 0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    bp = BoundsPen(glyph_set)
    glyph_set[name].draw(bp)
    if bp.bounds:
        x0, y0, x1, y1 = bp.bounds
        xmin = min(xmin, x0 + bx + pos.x_offset)
        xmax = max(xmax, x1 + bx + pos.x_offset)
        ymin = min(ymin, y0 + pos.y_offset)
        ymax = max(ymax, y1 + pos.y_offset)
    bx += pos.x_advance

size = 512
box = 0.62 * size  # the glyph fits into this square, centred
w = xmax - xmin
hgt = ymax - ymin
scale = box / max(w, hgt)
tx = (size - w * scale) / 2 - xmin * scale
ty = (size + hgt * scale) / 2 + ymin * scale  # y flips

svg = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">',
    f'<rect width="{size}" height="{size}" rx="{size * 0.22:.0f}" fill="#6e1a28"/>',
    f'<rect x="{size*0.09:.0f}" y="{size*0.09:.0f}" width="{size*0.82:.0f}" height="{size*0.82:.0f}" rx="{size*0.16:.0f}" fill="none" stroke="#d9b65c" stroke-width="{size*0.025:.0f}"/>',
    f'<g fill="#f3cf7a" transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f} {-scale:.5f})">',
]
for d, gx, gy in paths:
    svg.append(f'<path transform="translate({gx} {gy})" d="{d}"/>')
svg.append('</g></svg>')
open("site/icons/icon.svg", "w", encoding="utf-8", newline="\n").write("\n".join(svg) + "\n")
print("written site/icons/icon.svg", len("\n".join(svg)), "bytes")
