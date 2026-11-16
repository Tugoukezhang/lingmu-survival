# Sky for the islands, made from the owner's 混元 world panorama (a 360° view from a grassy hilltop):
# keeps the sky, the cumulus clouds and the floating islands along the horizon; paints the big apple tree and the
# little house out of the sky; replaces the near hill below the horizon with cloud sea; fades to a cloud colour below.
#   python tools/art/make_sky.py <panorama.png>   → unity/Assets/Art/Sky/sky_day.jpg (4096 × 2048, equirectangular)
import os, sys
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None

src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'unity', 'Assets', 'Art', 'Sky', 'sky_day.jpg')
a = np.asarray(Image.open(src).convert('RGB'), np.float64)
H, W, _ = a.shape                 # 3840 × 7680 (row 1920 = horizon); all numbers below are in that size
res = a.copy()
rng = np.random.default_rng(7)

def smooth(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)

# clear-sky colour for every row, from a stretch of sky with nothing in it
profile = np.median(a[:, 2600:3400], axis=1)
profile = np.asarray(Image.fromarray(np.clip(profile[:, None, :].repeat(8, 1), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), np.float64)[:, 0]

# 1. the tree, the house and the bushes: clear sky; its brightness follows the picture on both sides (the sky is
#    lighter towards the sun), and it is feathered in over a wide band
x0, x1, feather = 3600, 5600, 420
for y in range(560, 1960):
    xr = x1 if y < 1800 else 5240          # the floating island right of the tree starts at x 5240 near the horizon
    offL = a[y, x0 - feather - 40:x0 - feather].mean(0) - profile[y]
    offR = a[y, xr + feather:xr + feather + 40].mean(0) - profile[y]
    # a sample that hit a cloud (much brighter than the clear sky) says nothing about the sky colour
    if offL.sum() > 30: offL = np.zeros(3)
    if offR.sum() > 30: offR = offL
    xs = np.arange(x0 - feather, xr + feather)
    u = (xs - xs[0]) / (len(xs) - 1)
    sky = profile[y][None, :] + offL[None, :] * (1 - u[:, None]) + offR[None, :] * u[:, None] + rng.normal(0, 0.6, (len(xs), 3))
    t = np.minimum(smooth((xs - (x0 - feather)) / feather), smooth(((xr + feather) - xs) / feather))
    t = t * smooth((y - 560) / 200)                   # fade in from the top too
    res[y, xs] = a[y, xs] * (1 - t[:, None]) + sky * t[:, None]

# 2. cloud sea below the horizon where the near hill is: a strip from a clean stretch, made to tile seamlessly
top, bottom = 1925, 2560
strip = a[top:2380, 940:1900].copy()
w = strip.shape[1]; blend = 120
t = smooth(np.linspace(0, 1, blend))[None, :, None]
strip[:, :blend] = strip[:, :blend] * t + strip[:, -blend:] * (1 - t)      # ends cross-faded → tiles
strip = strip[:, :w - blend]
w = strip.shape[1]
cloud = np.median(a[2300:2400, 1000:1800].reshape(-1, 3), axis=0)
def clouds(c0, c1, start, fade=50, side=140):
    rows = np.arange(start - fade, bottom)
    ry = rows - top                                   # same depth below the horizon as in the clean stretch
    inside = (ry >= 0) & (ry < strip.shape[0])
    ry = np.clip(ry, 0, strip.shape[0] - 1)
    tt = smooth((rows - (start - fade)) / fade)
    for c in range(c0, c1):
        col = strip[ry, (c - c0) % w].copy()
        col[~inside & (rows >= top)] = cloud            # below the clean stretch: plain cloud colour
        col[rows < top] = profile[rows[rows < top]]     # above the horizon (the hill's crest): clear haze
        k = tt * min(1.0, smooth((c - c0) / side), smooth((c1 - c) / side))
        res[rows, c % W] = res[rows, c % W] * (1 - k[:, None]) + col * k[:, None]
clouds(2620, 6380, 1845)          # centre: the hilltop, the tree's roots, the bushes
clouds(6200, 7500, 2140)          # under the two islands on the right: only below them (their vines end here)
clouds(7380, 7680 + 1060, 1950)   # the near grassy slope and the rocks across the right / left edge

# 3. further down: an even cloud colour (the 3D cloud sea covers this part in the game anyway)
for y in range(2250, H):
    tt = smooth((y - 2250) / 260)
    res[y] = res[y] * (1 - tt) + cloud * tt

img = Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).resize((4096, 2048), Image.LANCZOS)
img.save(out, quality=92)
img.resize((1600, 800)).save(r'D:\ClaudeTools\sky_preview.jpg', quality=88)
print('sky written', os.path.normpath(out))
