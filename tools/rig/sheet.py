# Puts the check renders of tools/blender/rig_pet.py into one picture: weights (each bone a colour) on the first row,
# then each camera angle's frames.   python tools/rig/sheet.py <render_dir> <base> <out.png> [size]
import sys, glob, os
from PIL import Image
d, base, out = sys.argv[1:4]
size = int(sys.argv[4]) if len(sys.argv) > 4 else 220
rows = [sorted(glob.glob(os.path.join(d, f'{base}_w_*.png')))]
order = ['idle_00', 'idle_12', 'idle_30', 'walk_00', 'walk_02', 'walk_04', 'walk_08', 'happy_03']
for v in ('q', 'b'):
    rows.append([os.path.join(d, f'{base}_{v}_{o}.png') for o in order if os.path.exists(os.path.join(d, f'{base}_{v}_{o}.png'))])
cols = max(len(r) for r in rows)
sheet = Image.new('RGB', (cols * size, len(rows) * size), (40, 40, 40))
for y, r in enumerate(rows):
    for x, f in enumerate(r): sheet.paste(Image.open(f).resize((size, size), Image.LANCZOS), (x * size, y * size))
sheet.save(out)
print(out)
