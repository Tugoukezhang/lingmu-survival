# Tileable cloud textures for the sea of clouds under the islands (unity/Assets/Art/Sky/):
#   cloud_sea.png    RGB, the lower sea seen from above: billowing puffs, sunlit tops, soft blue-grey shadows between
#   cloud_layer.png  RGBA, the thinner upper layer: separate puffs with soft edges, see-through in between
# Puffs come from random points blurred at three sizes (periodic FFT convolution, so the texture tiles), shaded by
# a light from the upper left.   python tools/art/make_clouds.py <out_dir>
import sys, os
import numpy as np
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else 'unity/Assets/Art/Sky'
N = 1024
rng = np.random.default_rng(20261117)
fy = np.fft.fftfreq(N)[:, None]; fx = np.fft.fftfreq(N)[None, :]

def blur(img, sigma):                      # periodic Gaussian blur in the frequency domain
    return np.real(np.fft.ifft2(np.fft.fft2(img) * np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))))

def puffs(counts):
    h = np.zeros((N, N))
    for n, sigma, w in counts:
        imp = np.zeros((N, N)); idx = rng.integers(0, N, size=(n, 2)); np.add.at(imp, (idx[:, 0], idx[:, 1]), rng.uniform(0.6, 1.4, n))
        b = blur(imp, sigma); h += w * b / b.max()
    h -= h.min(); return h / h.max()

def shade(h, strength):
    gy, gx = np.gradient(blur(h, 2.0))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    l = np.array([-0.55, -0.55, 0.63]); l /= np.linalg.norm(l)
    return np.clip((nx * l[0] + ny * l[1] + nz * l[2]) / np.sqrt(nx ** 2 + ny ** 2 + nz ** 2), 0, 1)

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

os.makedirs(out, exist_ok=True)
white = np.array([1.0, 1.0, 1.0]); shadow = np.array([0.70, 0.77, 0.88])

# the sea: dense, every pixel cloud
h = puffs([(260, 46, 1.0), (900, 20, 0.55), (2600, 8, 0.25)])
s = shade(h, 90)
k = (0.35 + 0.65 * smooth(0.15, 0.85, h))[..., None] * (0.55 + 0.45 * s)[..., None]
rgb = shadow + (white - shadow) * np.clip(k, 0, 1)
Image.fromarray((rgb * 255).astype(np.uint8), 'RGB').save(os.path.join(out, 'cloud_sea.png'))

# the upper layer: separate puffs, alpha fades at their edges
h2 = puffs([(150, 40, 1.0), (500, 17, 0.5), (1400, 7, 0.22)])
s2 = shade(h2, 70)
a = smooth(0.34, 0.66, h2)
k2 = (0.5 + 0.5 * smooth(0.45, 0.9, h2))[..., None] * (0.6 + 0.4 * s2)[..., None]
rgb2 = shadow + (white - shadow) * np.clip(k2, 0, 1)
Image.fromarray(np.dstack([(rgb2 * 255).astype(np.uint8), (a * 255).astype(np.uint8)]), 'RGBA').save(os.path.join(out, 'cloud_layer.png'))
print('clouds written to', out)
