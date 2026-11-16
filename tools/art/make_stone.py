# Stone texture for the procedural rocks (unity/Assets/Art/Stone/): the rock meshes map u around and v from the bottom
# (0) to the top (1), so this picture is stone below and moss creeping over the top, tiling left to right.
#   stone.png / stone_n.png   python tools/art/make_stone.py <out_dir>
import sys, os
import numpy as np
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else 'unity/Assets/Art/Stone'
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(20261118)
W, H = 512, 256
fx = np.fft.fftfreq(W)[None, :]; fy = np.fft.fftfreq(H)[:, None]
def noise(s):                                 # periodic in both directions (only left-right matters)
    b = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((H, W))) * np.exp(-2 * (np.pi * s) ** 2 * (fx ** 2 + fy ** 2))))
    return (b - b.min()) / (b.max() - b.min())
v = (np.arange(H)[::-1] / (H - 1))[:, None] * np.ones((1, W))     # 0 at the bottom row of the picture, 1 at the top
big, mid, fine = noise(18), noise(6), noise(1.5)
height = 0.5 * big + 0.35 * mid + 0.15 * fine
stone_lo = np.array([0.50, 0.48, 0.46]); stone_hi = np.array([0.74, 0.71, 0.66]); warm = np.array([0.70, 0.62, 0.52])
t = np.clip((height - 0.25) / 0.5, 0, 1)[..., None]
col = stone_lo + (stone_hi - stone_lo) * t
col = col * (1 - 0.25 * noise(30)[..., None]) + warm * 0.25 * noise(30)[..., None]
speck = (fine > 0.83)[..., None]
col = np.where(speck, col * 0.78, col)
moss_line = 0.68 + 0.12 * (mid - 0.5) * 2 + 0.06 * (fine - 0.5)    # moss over the top, ragged edge
moss = np.clip((v - moss_line) / 0.06, 0, 1)[..., None]
moss_col = np.array([0.36, 0.55, 0.22]) * (0.8 + 0.4 * fine[..., None]) + np.array([0.08, 0.1, 0.0]) * big[..., None]
col = col * (1 - moss) + moss_col * moss
crev = np.clip((0.22 - height) / 0.12, 0, 1)[..., None]           # darker cracks
col = col * (1 - 0.35 * crev)
Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(out, 'stone.png'))
h2 = height + moss[..., 0] * 0.15 * fine
gy, gx = np.gradient(h2)
n = np.dstack([-gx * 14, -gy * 14, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(os.path.join(out, 'stone_n.png'))
print('stone textures written to', out)
