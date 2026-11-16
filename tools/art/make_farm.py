# Farm textures (unity/Assets/Art/Farm/): tilled soil and the leaves / heads of the crops, painted in code.
#   soil.png / soil_n.png   tileable tilled earth with crumbs and pebbles, and its normal map
#   leaf.png                a broad leaf (strawberry, pumpkin, sunflower), stem at the bottom, alpha cut-out
#   leaf_thin.png           a long thin leaf / blade (carrot tops, starwheat)
#   sunflower.png           a sunflower head seen from the front
#   wheat_ear.png           a golden ear of starwheat
#   python tools/art/make_farm.py <out_dir>
import sys, os
import numpy as np
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else 'unity/Assets/Art/Farm'
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(20261117)

def rgba(rgb, a):
    return Image.fromarray(np.dstack([(np.clip(rgb, 0, 1) * 255).astype(np.uint8), (np.clip(a, 0, 1) * 255).astype(np.uint8)]), 'RGBA')

# ---------- soil ----------
N = 512
fy = np.fft.fftfreq(N)[:, None]; fx = np.fft.fftfreq(N)[None, :]
def blur(img, s): return np.real(np.fft.ifft2(np.fft.fft2(img) * np.exp(-2 * (np.pi * s) ** 2 * (fx ** 2 + fy ** 2))))
def noise(s): b = blur(rng.standard_normal((N, N)), s); return (b - b.min()) / (b.max() - b.min())
h = 0.5 * noise(16) + 0.3 * noise(5) + 0.2 * noise(1.6)
pebbles = np.zeros((N, N))
for _ in range(260):
    cy, cx = rng.integers(0, N, 2); r = rng.uniform(2, 6)
    yy, xx = np.ogrid[:N, :N]; d = np.sqrt(((yy - cy + N / 2) % N - N / 2) ** 2 + ((xx - cx + N / 2) % N - N / 2) ** 2)
    pebbles = np.maximum(pebbles, np.clip(1 - d / r, 0, 1) ** 0.6 * rng.uniform(0.5, 1))
height = h * 0.8 + pebbles * 0.5
base = np.array([0.42, 0.28, 0.17]); dark = np.array([0.25, 0.16, 0.10]); light = np.array([0.56, 0.40, 0.26]); stone = np.array([0.58, 0.54, 0.48])
t = np.clip((h - 0.25) / 0.5, 0, 1)[..., None]
col = dark + (light - dark) * t
col = col * (1 - pebbles[..., None] * 0.9) + stone * pebbles[..., None] * 0.9
Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(out, 'soil.png'))
gy, gx = np.gradient(blur(height, 1.0))
n = np.dstack([-gx * 8, -gy * 8, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(os.path.join(out, 'soil_n.png'))

# ---------- leaves ----------
def leaf(w, hgt, width_fn, base_col, tip_col, vein=True):
    yy, xx = np.mgrid[0:hgt, 0:w]
    v = 1 - yy / (hgt - 1)                   # 0 = stem end (bottom), 1 = tip
    u = (xx / (w - 1)) * 2 - 1
    half = width_fn(v)
    inside = np.abs(u) < half
    edge = np.clip((half - np.abs(u)) / 0.06, 0, 1)
    shade = 0.75 + 0.25 * (1 - np.abs(u) / np.maximum(half, 1e-3))     # lighter along the middle
    col = base_col + (tip_col - base_col) * v[..., None]
    col = col * shade[..., None]
    if vein:
        mid = np.exp(-(u / 0.035) ** 2) * (v < 0.95)
        side = np.exp(-(((np.abs(u) - (v - 0.2) * 0.9) % 0.32 - 0.16) / 0.025) ** 2) * (np.abs(u) < half * 0.85) * 0.5
        col = col * (1 + 0.25 * mid[..., None] + 0.12 * side[..., None])
    stem = (np.abs(u) < 0.06) & (v < 0.12)
    col[stem] = base_col * 0.8
    a = np.where(inside, edge, 0) + stem
    return rgba(col, a)

green, green_tip = np.array([0.28, 0.55, 0.20]), np.array([0.50, 0.78, 0.30])
leaf(128, 160, lambda v: 0.9 * np.sin(np.clip((v - 0.06) / 0.94, 0, 1) * np.pi) ** 0.8 * np.clip(1.15 - v * 0.3, 0, 1), green, green_tip).save(os.path.join(out, 'leaf.png'))
leaf(48, 256, lambda v: 0.85 * np.sin(np.clip((v - 0.02) / 0.98, 0, 1) * np.pi * 0.98) ** 0.5 * (1 - v * 0.6), np.array([0.30, 0.58, 0.22]), np.array([0.58, 0.82, 0.34]), vein=False).save(os.path.join(out, 'leaf_thin.png'))

# ---------- sunflower head ----------
n2 = 256
yy, xx = np.mgrid[0:n2, 0:n2] / (n2 - 1) * 2 - 1
r = np.sqrt(xx ** 2 + yy ** 2); ang = np.arctan2(yy, xx)
petal_r = 0.62 + 0.36 * np.abs(np.cos(ang * 9)) ** 0.7
petals = (r < petal_r) & (r > 0.3)
disc = r < 0.42
col = np.zeros((n2, n2, 3))
col[petals] = np.array([0.98, 0.78, 0.18]) * (0.85 + 0.15 * (1 - r[petals]))[:, None]
seeds = (np.sin(xx * 60) * np.sin(yy * 60) > 0)
col[disc] = np.where(seeds[disc][:, None], np.array([0.42, 0.24, 0.10]), np.array([0.30, 0.17, 0.07])) * (0.8 + 0.4 * (0.42 - r[disc]))[:, None]
a = (petals | disc).astype(float) * np.clip((petal_r - r) / 0.04, 0, 1)
a[disc] = 1
rgba(col, a).save(os.path.join(out, 'sunflower.png'))

# ---------- starwheat ear ----------
w3, h3 = 64, 192
yy, xx = np.mgrid[0:h3, 0:w3]
v = 1 - yy / (h3 - 1); u = (xx / (w3 - 1)) * 2 - 1
a = np.zeros((h3, w3)); col = np.zeros((h3, w3, 3))
stalk = (np.abs(u) < 0.07) & (v < 0.45)
a[stalk] = 1; col[stalk] = np.array([0.62, 0.66, 0.30])
for k in range(9):                                 # grains in two rows up the ear
    cy = 0.42 + k * 0.062
    for side in (-1, 1):
        cx = side * 0.28 * (1 - (k / 9) * 0.5)
        d = np.sqrt(((u - cx) / 0.32) ** 2 + ((v - cy) / 0.05) ** 2)
        g = np.clip(1 - d, 0, 1)
        a = np.maximum(a, (g > 0) * np.clip(g * 3, 0, 1))
        col = np.where((g > 0)[..., None], np.array([0.95, 0.82, 0.42]) * (0.75 + 0.35 * g)[..., None], col)
awn = (np.abs(u) < 0.03) & (v > 0.9)
a[awn] = 1; col[awn] = np.array([0.95, 0.88, 0.55])
rgba(col, a).save(os.path.join(out, 'wheat_ear.png'))
print('farm textures written to', out)
