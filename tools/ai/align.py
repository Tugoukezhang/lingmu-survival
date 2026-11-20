# Line an enhanced picture up with the render it came from (image models shift and scale a little): the figure is found
# against the flat grey background in both, the enhanced one is scaled and moved so the outlines match best, and the
# outline overlap is reported. Pixels outside the original figure are set to the background grey.
#   python tools/ai/align.py <original.png> <enhanced.png> <out.png>
import sys
import numpy as np
from PIL import Image

def background(a):                                         # the flat backdrop: median of the border pixels
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]); return np.median(edge, axis=0)

def mask(a, t=14):
    return (np.abs(a.astype(int) - background(a)).max(axis=2) > t)

def bbox(m):
    ys, xs = np.nonzero(m); return xs.min(), ys.min(), xs.max(), ys.max()

def iou(a, b): return (a & b).sum() / max((a | b).sum(), 1)

orig_p, new_p, out_p = sys.argv[1:4]
A = np.asarray(Image.open(orig_p).convert('RGB')); N0 = Image.open(new_p).convert('RGB')
W = A.shape[1]
N = np.asarray(N0.resize((W, W), Image.LANCZOS))
ma, mn = mask(A), mask(N)
ax0, ay0, ax1, ay1 = bbox(ma); nx0, ny0, nx1, ny1 = bbox(mn)
best = None
s0 = ((ax1 - ax0) / max(nx1 - nx0, 1) + (ay1 - ay0) / max(ny1 - ny0, 1)) / 2
for ds in np.linspace(-0.02, 0.02, 9):                     # search scale around the bbox ratio, then shift
    s = s0 * (1 + ds)
    size = max(8, int(round(W * s)))
    Ns = np.asarray(Image.fromarray(N).resize((size, size), Image.LANCZOS)); ms = mask(Ns)
    bx0, by0, bx1, by1 = bbox(ms)
    cx = (ax0 + ax1) / 2 - (bx0 + bx1) / 2; cy = (ay0 + ay1) / 2 - (by0 + by1) / 2
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            ox, oy = int(round(cx)) + dx, int(round(cy)) + dy
            canvas = np.zeros_like(ma)
            src = ms[max(0, -oy):max(0, -oy) + W - max(0, oy), max(0, -ox):max(0, -ox) + W - max(0, ox)]
            canvas[max(0, oy):max(0, oy) + src.shape[0], max(0, ox):max(0, ox) + src.shape[1]] = src
            score = iou(ma, canvas)
            if best is None or score > best[0]: best = (score, size, ox, oy)
score, size, ox, oy = best
Ns = np.asarray(Image.fromarray(N).resize((size, size), Image.LANCZOS))
bgc = background(A).astype(np.uint8)
out = np.empty_like(A); out[:] = bgc
src = Ns[max(0, -oy):max(0, -oy) + W - max(0, oy), max(0, -ox):max(0, -ox) + W - max(0, ox)]
out[max(0, oy):max(0, oy) + src.shape[0], max(0, ox):max(0, ox) + src.shape[1]] = src
out[~ma] = bgc
Image.fromarray(out).save(out_p)
print(f'aligned {new_p}: outline overlap {score:.3f}, scale {size / W:.4f}, shift ({ox}, {oy})')
