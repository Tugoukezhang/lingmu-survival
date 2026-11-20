# Tidy a sprite sheet painted by the image model (a grid of separate things on a see-through background, see
# tools/ai/gpt.py make … transparent): every grid cell's picture is trimmed, scaled to fit a clean cell with a margin
# (standing on the cell's bottom edge, or centred), and the colour is spread into the see-through pixels so the
# edges don't go dark when the texture is shrunk (mipmaps).
#   python tools/art/sprite_sheet.py <sheet.png> <cols>x<rows> <bottom|centre> <cell W>x<cell H> <pad px> <out.png>
#       → one atlas with the same grid
#   … <out1.png,out2.png,…>   (as many names as cells, row by row) → one picture per cell
import sys
import numpy as np
from PIL import Image, ImageFilter

def bleed(img):
    """RGB of see-through pixels = blurred colour of the nearby visible ones (alpha unchanged)."""
    a = np.asarray(img, np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:]
    acc_c, acc_a = rgb * al, al.copy()
    out = rgb.copy()
    for r in (2, 6, 16, 40):
        c = np.asarray(Image.fromarray((np.clip(acc_c, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
        w = np.asarray(Image.fromarray((acc_a[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32)[..., None] / 255
        fill = c / np.maximum(w, 1e-4)
        empty = (al < 0.05) & (w > 0.002)
        out = np.where(empty & (np.abs(out - rgb).sum(-1, keepdims=True) == 0), fill, out)
    res = np.concatenate([np.clip(out, 0, 1), al], -1)
    return Image.fromarray((res * 255).astype(np.uint8), 'RGBA')

def fit(cell, cw, ch, anchor, pad):
    a = np.asarray(cell)[..., 3]
    ys, xs = np.nonzero(a > 10)
    if len(xs) == 0: return Image.new('RGBA', (cw, ch))
    crop = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = min((cw - 2 * pad) / crop.width, (ch - (pad if anchor == 'bottom' else 2 * pad)) / crop.height)
    crop = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (cw, ch))
    x = (cw - crop.width) // 2
    y = ch - crop.height if anchor == 'bottom' else (ch - crop.height) // 2
    out.alpha_composite(crop, (x, y))
    return out

src, grid, anchor, cell, pad, dst = sys.argv[1:7]
cols, rows = map(int, grid.split('x')); cw, ch = map(int, cell.split('x')); pad = int(pad)
sheet = Image.open(src).convert('RGBA')
W, H = sheet.size
cells = []
for r in range(rows):
    for c in range(cols):
        part = sheet.crop((c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows))
        cells.append(fit(part, cw, ch, anchor, pad))
names = dst.split(',')
if len(names) == 1:
    atlas = Image.new('RGBA', (cw * cols, ch * rows))
    for i, im in enumerate(cells): atlas.alpha_composite(im, ((i % cols) * cw, (i // cols) * ch))
    bleed(atlas).save(dst); print('atlas', dst, atlas.size)
else:
    assert len(names) == len(cells), f'{len(cells)} cells, {len(names)} names'
    for n, im in zip(names, cells): bleed(im).save(n); print('sprite', n, im.size)
