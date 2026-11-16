# Draws a pet's skeleton (tools/rig/<pet>.json) over its gridded orthographic views, to place and check bones
# before rigging: grey dots = landmarks as written, yellow = joints after snapping, red = bones.
#   python tools/rig/overlay.py <views prefix> <landmarks.json> <out.png> [zoom]
#   (<prefix>_grid.png from tools/rig/grid.py and <prefix>.npz from tools/blender/dump_points.py)
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skeleton

prefix, lm_path, out = sys.argv[1:4]
zoom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
LM = json.load(open(lm_path, encoding='utf-8'))
P = np.load(f'{prefix}.npz')['p']
J = skeleton.joints(LM, P)
B = skeleton.bones(J, LM)
sheet = Image.open(f'{prefix}_grid.png').convert('RGB')
if zoom != 1: sheet = sheet.resize((int(sheet.width * zoom), int(sheet.height * zoom)), Image.LANCZOS)
d = ImageDraw.Draw(sheet)
S = 520

def px(u): return (u / 1.3 + 0.5) * S
def view(i, p):                       # panel i: 0 front (x, z), 1 side (y, z), 2 top (x, y)
    x, y, z = p
    if i == 0: u, v = px(x), 460 - 400 * z
    elif i == 1: u, v = px(y), 460 - 400 * z
    else: u, v = px(x), 260 - 400 * y
    return ((u + i * (S + 10)) * zoom, v * zoom)

for i in range(3):
    for b in B:
        if not b['deform']: continue
        a, c = view(i, b['head']), view(i, b['tail'])
        d.line([a, c], fill=(255, 50, 50), width=max(2, int(2 * zoom)))
    for key, v in LM['points'].items():
        a, c = view(i, v), view(i, J[key])
        r = 2.5 * zoom
        d.ellipse([a[0] - r, a[1] - r, a[0] + r, a[1] + r], fill=(160, 160, 160))
        d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline=(255, 230, 60), width=2)
        if i < 2 and zoom >= 1.5: d.text((c[0] + 4, c[1] - 6), key, fill=(255, 255, 200))
sheet.save(out)
print('overlay', out, len(B), 'bones')
