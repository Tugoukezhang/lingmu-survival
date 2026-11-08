"""Remove the white background from AI-generated sprites and icons.

Default: rembg segmentation model (isnet-general-use).
CUT_UNION=1: also keep everything a border flood-fill through bright,
  low-saturation pixels cannot reach (white fur enclosed by line art), and
  crop by solid pixels to ignore stray specks. Use for white-heavy art.
CUT_MODEL=flood: flood-fill only, no model.
CUT_SIZE=<px>: output size (default 256; @2x file is double).
Output is centred, bottom-aligned, square, transparent, plus a preview on a
dark checkerboard. See tools/art/README.md.
usage: cutout.py <raw_dir> <out_dir> <preview_path> name1 name2 ...
"""
import sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

raw, out, preview = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
names = sys.argv[4:]
out.mkdir(parents=True, exist_ok=True)

def background_mask(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    cand = (mx >= 196) & ((mx - mn) <= 38)
    h, w = cand.shape
    bg = np.zeros_like(cand)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    return bg

import os
MODEL = os.environ.get("CUT_MODEL", "isnet-general-use")
session = None
if MODEL != "flood":
    from rembg import new_session, remove
    session = new_session(MODEL)

tiles = []
for n in names:
    im = Image.open(raw / f"{n}.png").convert("RGB")
    if session is not None:
        model = np.array(remove(im, session=session))[..., 3]
        if os.environ.get("CUT_UNION"):
            # keep anything the border flood-fill could not reach (white fur
            # enclosed by line art) even if the model made it transparent
            flood_bg = background_mask(np.array(im))
            flood = Image.fromarray(np.where(flood_bg, 0, 255).astype("uint8"))
            flood = np.array(flood.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2)))
            model = np.maximum(model, flood)
        rgba = im.copy(); rgba.putalpha(Image.fromarray(model.astype("uint8")))
        bg = model < 128
    else:
        a = np.array(im)
        bg = background_mask(a)
        alpha = Image.fromarray(np.where(bg, 0, 255).astype("uint8"))
        alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
        rgba = im.copy(); rgba.putalpha(alpha)
    solid = np.array(rgba)[..., 3] > 24
    if os.environ.get("CUT_UNION"):
        # drop tiny specks: keep only rows/cols with a meaningful amount of solid pixels
        rows = np.where(solid.sum(1) > 6)[0]; cols = np.where(solid.sum(0) > 6)[0]
        box = (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)
    else:
        box = Image.fromarray(solid.astype("uint8") * 255).getbbox()
    rgba = rgba.crop(box)
    side = int(max(rgba.size) * 1.1)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(rgba, ((side - rgba.width) // 2, side - rgba.height - (side - max(rgba.size)) // 2))
    size = int(os.environ.get("CUT_SIZE", "256"))
    sq.resize((size, size), Image.LANCZOS).save(out / f"{n}.png")
    sq.resize((size * 2, size * 2), Image.LANCZOS).save(out / f"{n}@2x.png")
    tiles.append((n, sq))
    print(n, "bg%", round(bg.mean() * 100, 1), "crop", box)

cell = 360
sheet = Image.new("RGBA", (cell * len(tiles), cell + 24), (60, 60, 70, 255))
d = ImageDraw.Draw(sheet)
for i in range(0, sheet.width, 20):
    for j in range(24, sheet.height, 20):
        if (i // 20 + j // 20) % 2:
            d.rectangle([i, j, i + 19, j + 19], fill=(90, 90, 100, 255))
for k, (n, sq) in enumerate(tiles):
    t = sq.resize((cell, cell), Image.LANCZOS)
    sheet.alpha_composite(t, (k * cell, 24))
    d.text((k * cell + 6, 6), n, fill="white")
sheet.convert("RGB").save(preview, quality=90)
