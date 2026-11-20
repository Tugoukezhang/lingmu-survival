# Ripple normal map for the pond water (Lingmu/Water shader), drawn from scratch: a random height field built in the
# frequency domain (so it tiles perfectly), small soft ripples with a few longer swells, turned into a normal map.
#   python tools/art/make_water.py   → unity/Assets/Art/Water/water_normal.png (512 × 512, tiling)
import os
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(11)
fx = np.fft.fftfreq(N)[None, :]; fy = np.fft.fftfreq(N)[:, None]
k = np.sqrt(fx ** 2 + fy ** 2) * N                     # waves per tile
amp = np.where(k > 0, np.maximum(k, 1e-9) ** -1.6, 0) * np.exp(-(k / 36) ** 2)   # mostly broad soft ripples, fading out at fine detail
amp *= 1 + 0.6 * np.exp(-((k - 9) / 3) ** 2)          # a gentle preferred ripple size
spec = amp * np.exp(2j * np.pi * rng.random((N, N)))
h = np.real(np.fft.ifft2(spec))
h = (h - h.mean()) / h.std()
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2        # tiling-safe slopes
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
strength = 6.0
n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], -1)   # image rows go down, texture v goes up
n /= np.linalg.norm(n, axis=-1, keepdims=True)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'unity', 'Assets', 'Art', 'Water')
os.makedirs(out, exist_ok=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(out, 'water_normal.png'))
print('water normal map written, slope range', round(float(np.abs(gx).max() * strength), 2))
