# Particle textures for fire, embers, smoke and water (unity/Assets/Art/FX/), white so the particles colour them:
#   fx_soft.png   soft round dot (smoke, water drops, glow)
#   fx_flame.png  a flame tongue: wide soft bottom, pointed top, bright core
#   fx_ring.png   a thin soft ring (ripples on water)
#   python tools/art/make_fx.py <out_dir>
import sys, os
import numpy as np
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else 'unity/Assets/Art/FX'
os.makedirs(out, exist_ok=True)

def save(name, a):
    a = np.clip(a, 0, 1)
    rgba = np.dstack([np.full(a.shape, 255, np.uint8)] * 3 + [(a * 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(out, name))

n = 128
y, x = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
r = np.sqrt(x ** 2 + y ** 2)
save('fx_soft.png', (1 - np.clip(r, 0, 1)) ** 2.2)
save('fx_ring.png', np.exp(-((r - 0.78) / 0.09) ** 2) * (r < 1))

h, w = 256, 128
yy, xx = np.mgrid[0:h, 0:w]
v = 1 - yy / (h - 1)                       # 0 at the bottom of the picture, 1 at the top
u = (xx / (w - 1)) * 2 - 1
half = 0.95 * np.clip(np.sin(np.clip(v, 0, 1) * np.pi * 0.92 + 0.12), 0, 1) * (1 - v) ** 0.35   # widest low down, pointed at the top
edge = np.clip(1 - np.abs(u) / np.maximum(half, 1e-3), 0, 1)
flame = edge ** 1.3 * np.clip(v * 6, 0, 1) * (1 - v ** 3)
core = np.exp(-(u / 0.25) ** 2) * np.exp(-((v - 0.3) / 0.22) ** 2) * 0.6
save('fx_flame.png', flame + core)
print('fx textures written to', out)
