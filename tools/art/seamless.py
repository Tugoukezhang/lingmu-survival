"""Make a seamless (tileable) ground texture from an AI-generated image.

Takes the largest centred square, blends it with a half-offset copy using a
mask that is 1 in the middle and 0 at the borders (so the borders come from
the offset copy, whose edges wrap continuously), then resizes.
usage: seamless.py <src> <out_png> <preview_png> <size>
"""
import sys
import numpy as np
from PIL import Image

src, out, preview, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
im = Image.open(src).convert("RGB")
s = min(im.size)
left, top = (im.width - s) // 2, (im.height - s) // 2
sq = np.asarray(im.crop((left, top, left + s, top + s))).astype(np.float32)

t = np.linspace(0, 1, s)
tri = 1 - np.abs(2 * t - 1)                      # 0 at edges, 1 in the middle
ramp = np.clip((tri - 0.18) / 0.32, 0, 1)        # narrow transition band
ramp = ramp * ramp * (3 - 2 * ramp)              # smoothstep
# One axis at a time: the offset copy's own seam sits exactly where the
# weight is 1, so it never shows. Doing both axes at once leaks it.
wx = ramp[None, :, None]
tile = sq * wx + np.roll(sq, s // 2, axis=1) * (1 - wx)
wy = ramp[:, None, None]
tile = tile * wy + np.roll(tile, s // 2, axis=0) * (1 - wy)

out_im = Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
out_im.save(out)

grid = Image.new("RGB", (size * 3, size * 3))
for y in range(3):
    for x in range(3):
        grid.paste(out_im, (x * size, y * size))
grid.save(preview)
print("source square", s, "->", size)
