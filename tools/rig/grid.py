# Lays a 0.1 grid with labels over the orthographic renders from tools/blender/ortho_views.py and puts the three
# views side by side: front (x right, z up), side (from +X: front = −y on the right... see labels), top (x right, −y up).
#   python tools/rig/grid.py <prefix> <out.png>
import sys
from PIL import Image, ImageDraw
prefix, out = sys.argv[1:3]
S = 520; scale = 1.3                       # ortho_scale: 1.3 units across the 520 px picture
views = []
for name in ('front', 'side', 'top'):
    im = Image.open(f'{prefix}_{name}.png').convert('RGB')
    d = ImageDraw.Draw(im)
    def px(u): return (u / scale + 0.5) * S
    for k in range(-6, 13):
        g = k / 10
        if name == 'top':
            x = px(g); y = S - px(-g)              # top view: x right, world −y up (camera from +z, image up = +y)
            y = px(-g)
            # camera at +z looking down with image up = +y: world y up on the picture
            yy = S - px(g)
            d.line([x, 0, x, S], fill=(80, 84, 96) if k else (120, 120, 140)); d.text((x + 2, S - 12), f'x{g:.1f}', fill=(170, 170, 180))
            d.line([0, yy, S, yy], fill=(80, 84, 96) if k else (120, 120, 140)); d.text((2, yy - 11), f'y{g:.1f}', fill=(170, 170, 180))
        else:
            x = px(g); y = S - px(g - 0.5)        # camera looks at z = 0.5
            d.line([x, 0, x, S], fill=(80, 84, 96) if k else (120, 120, 140))
            lab = f'x{g:.1f}' if name == 'front' else f'y{g:.1f}'
            d.text((x + 2, S - 12), lab, fill=(170, 170, 180))
            if 0 <= g <= 1.1:
                d.line([0, y, S, y], fill=(80, 84, 96)); d.text((2, y - 11), f'z{g:.1f}', fill=(170, 170, 180))
    d.text((4, 4), {'front': 'FRONT from -Y (x right)', 'side': 'SIDE from +X (+y right? see labels)', 'top': 'TOP (x right, +y up)'}[name], fill=(240, 240, 120))
    views.append(im)
sheet = Image.new('RGB', (S * 3 + 20, S), (30, 30, 30))
for i, v in enumerate(views): sheet.paste(v, (i * (S + 10), 0))
sheet.save(out)
