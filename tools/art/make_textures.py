# Procedural textures for the islands, drawn from scratch (no third-party art):
#   Art/Ground/grass_detail.png, grass_detail_n.png  tiling grain + normal map laid over the painted ground (crisp up close)
#   (grass tufts, flowers and cloud cards are now painted by the image model: tools/ai/prompts + tools/art/sprite_sheet.py;
#    the old drawn versions below are kept only as a fallback and are no longer called)
#   Art/Sky/cloud_sea.png                             tiling top-down cloud sea
#   python tools/art/make_textures.py
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'unity', 'Assets', 'Art')
os.makedirs(os.path.join(ROOT, 'Ground'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'Sky'), exist_ok=True)
rng = random.Random(20261116)
nrng = np.random.default_rng(20261116)


def tile_noise(n, cells, octaves=4, seed=0):
    """tileable fractal value noise in 0..1"""
    out = np.zeros((n, n), np.float64)
    amp, total = 1.0, 0.0
    g = np.random.default_rng(seed)
    for o in range(octaves):
        c = cells * (2 ** o)
        lat = g.random((c, c))
        xs = np.arange(n) * c / n
        i0 = np.floor(xs).astype(int); f = xs - i0; f = f * f * (3 - 2 * f)
        i1 = (i0 + 1) % c
        a = lat[np.ix_(i0, i0)]; b = lat[np.ix_(i0, i1)]; cc = lat[np.ix_(i1, i0)]; d = lat[np.ix_(i1, i1)]
        fx = f[None, :]; fy = f[:, None]
        v = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy
        out += v * amp; total += amp; amp *= 0.5
    return out / total


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    nrm = np.stack([-dx / l, dy / l, nz / l], -1)
    return ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)


# ---------- ground detail: grass grain seen from above ----------
def grass_detail(n=512):
    S = 3
    big = Image.new('L', (n * S, n * S), 128)
    d = ImageDraw.Draw(big)
    for _ in range(9000):
        x, y = rng.random() * n, rng.random() * n
        ang = rng.gauss(-math.pi / 2, 0.9)
        ln = rng.uniform(5, 16)
        w = rng.choice([1, 1, 2, 2, 3])
        v = int(rng.choice([rng.uniform(150, 205), rng.uniform(55, 100)]))
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                x0, y0 = (x + ox) * S, (y + oy) * S
                x1, y1 = x0 + math.cos(ang) * ln * S, y0 + math.sin(ang) * ln * S
                if -n * S < x0 < 2 * n * S and -n * S < y0 < 2 * n * S:
                    d.line([(x0, y0), (x1, y1)], fill=v, width=w * S)
    img = big.resize((n, n), Image.LANCZOS)
    a = np.asarray(img, np.float64) / 255
    a = a * 0.75 + tile_noise(n, 6, 4, 3) * 0.25
    a = (a - a.mean()) * 1.15 + 0.5          # mean 0.5: neutral for URP's ×2 detail blend
    a = np.clip(a, 0, 1)
    Image.fromarray((np.stack([a] * 3, -1) * 255).astype(np.uint8)).save(os.path.join(ROOT, 'Ground', 'grass_detail.png'))
    h = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float64) / 255
    Image.fromarray(normal_from_height(h, 2.2)).save(os.path.join(ROOT, 'Ground', 'grass_detail_n.png'))


# ---------- a tuft of grass blades (alpha), drawn big then scaled down for smooth edges ----------
def grass_tuft(n=256):
    S = 4; N = n * S
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    blades = 22
    for i in range(blades):
        base_x = N / 2 + rng.gauss(0, N * 0.11)
        lean = rng.gauss(0, 0.35) + (base_x - N / 2) / N * 1.4
        height = N * rng.uniform(0.55, 0.95)
        width = N * rng.uniform(0.035, 0.06)
        bend = rng.gauss(0, 0.18)
        pts_l, pts_r = [], []
        steps = 14
        for s in range(steps + 1):
            t = s / steps
            x = base_x + (lean * t + bend * t * t) * height * 0.6
            y = N - t * height
            w = width * (1 - t) ** 0.9 * 0.5
            pts_l.append((x - w, y)); pts_r.append((x + w, y))
        poly = pts_l + pts_r[::-1]
        dark = (52 + rng.randint(-8, 8), 112 + rng.randint(-12, 12), 40 + rng.randint(-8, 8))
        light = (150 + rng.randint(-15, 15), 196 + rng.randint(-12, 12), 82 + rng.randint(-12, 12))
        # vertical gradient per blade: draw slices
        layer = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.polygon(poly, fill=(255, 255, 255, 255))
        mask = np.asarray(layer)[..., 3].astype(np.float64) / 255
        ys = np.linspace(0, 1, N)[:, None]
        t = np.clip((N - np.arange(N)[:, None]) / height, 0, 1)
        col = np.zeros((N, N, 4))
        for c in range(3): col[..., c] = dark[c] + (light[c] - dark[c]) * t ** 0.8
        col[..., 3] = mask * 255
        blade = Image.fromarray(col.astype(np.uint8), 'RGBA')
        img = Image.alpha_composite(img, blade)
    img = img.resize((n, n), Image.LANCZOS)
    img.save(os.path.join(ROOT, 'Ground', 'grass_tuft.png'))


# ---------- flowers ----------
def flower(name, petal, centre, petals, n=128, petal_len=0.42, petal_w=0.16, shadow=(0, 0, 0)):
    S = 4; N = n * S; c = N / 2
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(petals):
        a = i / petals * math.tau + rng.uniform(-0.08, 0.08)
        L = N * petal_len * rng.uniform(0.9, 1.05); W = N * petal_w
        pts = []
        for s in range(21):
            t = s / 20 * math.pi
            r = math.sin(t)
            px = math.cos(a) * (t / math.pi) * L - math.sin(a) * (r * W * 0.5) * (1 if s < 10 else 1)
            py = math.sin(a) * (t / math.pi) * L + math.cos(a) * (r * W * 0.5)
            pts.append((c + px, c + py))
        for s in range(20, -1, -1):
            t = s / 20 * math.pi
            r = math.sin(t)
            px = math.cos(a) * (t / math.pi) * L + math.sin(a) * (r * W * 0.5)
            py = math.sin(a) * (t / math.pi) * L - math.cos(a) * (r * W * 0.5)
            pts.append((c + px, c + py))
        shade = tuple(int(petal[k] * (0.86 + 0.14 * math.cos(a - 2.3))) for k in range(3))
        d.polygon(pts, fill=shade + (255,))
    d.ellipse([c - N * 0.13, c - N * 0.13, c + N * 0.13, c + N * 0.13], fill=centre + (255,))
    d.ellipse([c - N * 0.07, c - N * 0.09, c + N * 0.03, c + N * 0.0], fill=tuple(min(255, v + 40) for v in centre) + (255,))
    img = img.resize((n, n), Image.LANCZOS)
    img.save(os.path.join(ROOT, 'Ground', name))


# ---------- a soft cumulus puff, lit from above ----------
def cloud_puff(n=512):
    N = n
    yy, xx = np.mgrid[0:N, 0:N] / N
    dens = np.zeros((N, N))
    blobs = [(0.5, 0.58, 0.26), (0.32, 0.62, 0.18), (0.68, 0.62, 0.19), (0.42, 0.45, 0.2), (0.6, 0.44, 0.17), (0.5, 0.36, 0.14), (0.22, 0.68, 0.12), (0.8, 0.68, 0.11)]
    for (bx, by, br) in blobs:
        r = np.sqrt((xx - bx) ** 2 + (yy - by) ** 2) / br
        dens = np.maximum(dens, np.clip(1 - r, 0, 1) ** 0.6)
    dens *= np.clip((0.78 - yy) / 0.08, 0, 1)                      # flat-ish bottom
    noise = tile_noise(N, 8, 5, 11)
    dens = np.clip(dens * (0.75 + 0.5 * noise) - 0.08, 0, 1)
    alpha = np.clip(dens * 2.2, 0, 1)
    light = np.clip(1 - (yy - 0.3) * 1.1, 0.0, 1) * 0.55 + noise * 0.25 + 0.35
    top = np.array([1.0, 1.0, 1.0]); shadow = np.array([0.72, 0.78, 0.9])
    rgb = shadow[None, None, :] + (top - shadow)[None, None, :] * np.clip(light, 0, 1)[..., None]
    out = np.dstack([rgb * 255, alpha * 255]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').filter(ImageFilter.GaussianBlur(1.2)).save(os.path.join(ROOT, 'Sky', 'cloud_puff.png'))


# ---------- tiling cloud sea seen from above ----------
def cloud_sea(n=1024):
    a = tile_noise(n, 5, 6, 21)
    b = tile_noise(n, 12, 4, 22)
    h = np.clip((a * 0.7 + b * 0.3 - 0.35) * 2.4, 0, 1)
    sx = np.roll(h, -3, 1) - h; sy = np.roll(h, -3, 0) - h
    light = np.clip(0.75 + (-sx - sy) * 2.5 + h * 0.25, 0, 1)
    top = np.array([1.0, 1.0, 1.0]); low = np.array([0.74, 0.8, 0.9])
    rgb = low[None, None, :] + (top - low)[None, None, :] * light[..., None]
    Image.fromarray((rgb * 255).astype(np.uint8)).save(os.path.join(ROOT, 'Sky', 'cloud_sea.png'))


grass_detail()
cloud_sea()
print('textures written to', os.path.normpath(ROOT))
