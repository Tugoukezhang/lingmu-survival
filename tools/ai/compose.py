# Blend the views baked by tools/blender/texture_views.py (project) into one texture: per texel the most head-on views
# win (weight ** power), and where no view faces the surface the old texture stays.
#   python tools/ai/compose.py <dir> <out.jpg> [power]
import sys, os, glob
import numpy as np
from PIL import Image

folder, out = sys.argv[1:3]
power = float(sys.argv[3]) if len(sys.argv) > 3 else 6
orig = np.load(os.path.join(folder, 'bake_orig.npz'))['c'].astype(np.float32) / 255
acc = np.zeros_like(orig); ssum = np.zeros(orig.shape[:2], np.float32); best = np.zeros(orig.shape[:2], np.float32)
for f in sorted(glob.glob(os.path.join(folder, 'bake_*.npz'))):
    if f.endswith('bake_orig.npz'): continue
    d = np.load(f); w = d['w'].astype(np.float32) / 255           # how squarely this view faces the surface (0 = hidden)
    sel = w ** power                                              # among the views, the most head-on one dominates
    acc += d['c'].astype(np.float32) / 255 * sel[..., None]; ssum += sel; best = np.maximum(best, w)
views = acc / np.maximum(ssum, 1e-8)[..., None]
t = np.clip((best - 0.22) / 0.2, 0, 1); alpha = t * t * (3 - 2 * t)  # a surface some view sees well takes the new colours
new = views * alpha[..., None] + orig * (1 - alpha[..., None])
Image.fromarray((np.clip(new[::-1], 0, 1) * 255).astype(np.uint8)).save(out, quality=95)   # Blender rows start at the bottom
print('composed', out, 'texels from the views', round(float((alpha > 0.5).mean()), 3))
