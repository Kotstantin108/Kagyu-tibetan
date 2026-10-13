"""Builds the app's raster brand assets from two source images.

Usage: python scripts/tools/brand-assets.py <logo.jpg> <background.jpg>

  logo.jpg        square artwork on a rounded navy plate with white corners
                  -> site/icons/icon-512.png, icon-192.png, icon-96.png (corners made
                     transparent), icon-maskable-512.png (navy plate, 80 % safe zone)
  background.jpg  cloud line art -> site/img/bg-clouds.webp (1400 px wide, pre-faded, lossy)

Needs Pillow with WebP support.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "site"
NAVY = (12, 22, 44)
PAPER = (245, 238, 224)
INK = 0.45  # share of the original line art kept in bg-clouds.webp; styles.css sets --clouds-opacity on top


def transparent_corners(im, white=200):
    """Alpha 0 for near-white pixels reachable from the image corners (the plate's rounded corners)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque([(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        m = min(r, g, b)
        if m <= white:
            continue
        # fade: pure white -> 0, slightly tinted edge -> partly opaque
        px[x, y] = (r, g, b, max(0, min(255, int((255 - m) * 255 / (255 - white)))))
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return im


def save_png(im, name, size):
    out = im.resize((size, size), Image.LANCZOS).quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    path = ROOT / "icons" / name
    out.save(path, optimize=True)
    print(f"{path.relative_to(ROOT.parent)}: {path.stat().st_size // 1024} KB")


def main(logo_path, bg_path):
    logo = Image.open(logo_path).convert("RGB")
    logo = transparent_corners(logo)
    save_png(logo, "icon-512.png", 512)
    save_png(logo, "icon-192.png", 192)
    save_png(logo, "icon-96.png", 96)

    # maskable: solid plate, artwork inside the 80 % safe zone
    plate = Image.new("RGBA", (512, 512), NAVY + (255,))
    inner = logo.resize((410, 410), Image.LANCZOS)
    plate.alpha_composite(inner, (51, 51))
    path = ROOT / "icons" / "icon-maskable-512.png"
    plate.convert("RGB").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    print(f"{path.relative_to(ROOT.parent)}: {path.stat().st_size // 1024} KB")

    bg = Image.open(bg_path).convert("RGB")
    w, h = bg.size
    target_w = 1400
    bg = bg.resize((target_w, round(h * target_w / w)), Image.LANCZOS)
    # the page shows the clouds faintly anyway: fade the ink towards the paper colour here,
    # which lets the lossy encoder work on a low-contrast image (about half the bytes)
    paper = Image.new("RGB", bg.size, PAPER)
    bg = Image.blend(paper, bg, INK)
    (ROOT / "img").mkdir(exist_ok=True)
    path = ROOT / "img" / "bg-clouds.webp"
    bg.save(path, "WEBP", quality=32, method=6)
    print(f"{path.relative_to(ROOT.parent)}: {path.stat().st_size // 1024} KB, {bg.size}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
