# Catch repaints that added things (a badge copied to the wrong side, a new leaf…): both pictures are blurred so fine
# detail doesn't count, and the largest patch whose hue changed a lot is measured (share of the figure); light and
# shade may change freely.
#   python tools/ai/check_views.py <job dir> [threshold]     → one line per view; "SUSPECT" above the threshold
import sys, os, glob
import numpy as np
from PIL import Image, ImageFilter

def patch(orig, new):
    a = Image.open(orig).convert('RGB'); b = Image.open(new).convert('RGB').resize(a.size)
    A = np.asarray(a.filter(ImageFilter.GaussianBlur(5)), np.float32); B = np.asarray(b.filter(ImageFilter.GaussianBlur(5)), np.float32)
    bg = np.median(np.concatenate([A[0], A[-1], A[:, 0], A[:, -1]]), 0)
    fig = np.abs(np.asarray(a, np.float32) - bg).max(-1) > 14
    def chroma(X): return np.stack([X[..., 0] - X[..., 1], (X[..., 0] + X[..., 1]) / 2 - X[..., 2]], -1)   # colour, not brightness
    diff = np.sqrt(((chroma(A) - chroma(B)) ** 2).sum(-1)) > 55          # (shading changes are fine, new colours are not)
    diff &= fig
    # largest connected patch (4-neighbour flood fill on a 4× smaller grid)
    small = diff[::4, ::4]; seen = np.zeros_like(small); best = 0
    H, W = small.shape
    for y, x in zip(*np.nonzero(small)):
        if seen[y, x]: continue
        stack = [(y, x)]; seen[y, x] = 1; n = 0
        while stack:
            cy, cx = stack.pop(); n += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < H and 0 <= nx < W and small[ny, nx] and not seen[ny, nx]: seen[ny, nx] = 1; stack.append((ny, nx))
        best = max(best, n)
    return best * 16 / max(fig.sum(), 1)

if __name__ == '__main__':
    d = sys.argv[1]; t = float(sys.argv[2]) if len(sys.argv) > 2 else 0.006
    for new in sorted(glob.glob(os.path.join(d, '*_new.png'))):
        v = os.path.basename(new)[:-8]; p = patch(os.path.join(d, v + '.png'), new)
        print(f'{v:12s} changed patch {p:.4f}' + ('  SUSPECT' if p > t else ''))
