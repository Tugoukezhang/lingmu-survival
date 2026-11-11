"""Turn the GPT-made PNGs (already transparent) into game-ready textures.

usage: python -E -P tools/art/normalize.py art/raw/incoming [preview.jpg]

For each entry in MANIFEST below:
  - alpha clean-up: near-opaque (>= 245) becomes fully opaque, near-empty (<= 8) fully empty;
    `fringe` entries also lose a 1-2 px white halo left by a white-background cut-out;
  - trim to the visible pixels, fit into the target box (keeps proportions),
    anchor at the bottom centre (things that stand on the ground) or the centre (icons);
  - write <name>.png at the box size (set ART_2X=1 to also write <name>@2x.png).
Crop strips (3 growth stages side by side) are split into 3 textures with one shared
scale, so the seedling stays small. The skill book is recoloured into 8 versions.
Ground textures go through the same seam blending as tools/art/seamless.py.
Finally game/src/data/art.js is (re)written: the texture keys BootScene loads.
"""
import sys, json, os
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

SRC = Path(sys.argv[1])
PREVIEW = Path(sys.argv[2]) if len(sys.argv) > 2 else None
ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'game/assets'

# (source, key, folder, (w, h) box at 1x, anchor 'bottom' | 'center', options)
FRINGE = {'fringe': True}
MANIFEST = [
  # characters and world props (box = size the old placeholder texture had, so placement code stays the same)
  ('player_down_idle_01', 'player', 'world', (48, 72), 'bottom', {}),
  ('mon_fog_idle_01', 'fogmonster', 'world', (84, 84), 'bottom', {}),
  ('prop_tree_01', 'tree', 'world', (96, 120), 'bottom', {}),
  ('prop_tree_02', 'tree_b', 'world', (88, 126), 'bottom', {}),
  ('prop_tree_03', 'tree_c', 'world', (84, 72), 'bottom', {}),
  ('prop_rock_01', 'rock', 'world', (56, 44), 'bottom', {}),
  ('prop_rock_02', 'rock_b', 'world', (62, 46), 'bottom', {}),
  ('prop_bush_berry', 'bush', 'world', (64, 54), 'bottom', {}),
  ('prop_grass_tuft', 'grass_tuft', 'world', (46, 42), 'bottom', {}),
  ('prop_crystal_ore', 'crystal', 'world', (62, 54), 'bottom', {}),
  ('prop_thorn', 'thorn', 'world', (72, 44), 'bottom', {}),
  ('prop_chest_closed', 'chest', 'world', (60, 50), 'bottom', {}),
  ('prop_chest_open', 'chest_open', 'world', (60, 54), 'bottom', {}),
  ('prop_lostbag', 'lostbag', 'world', (56, 56), 'bottom', {}),
  ('prop_tent', 'tent', 'world', (104, 92), 'bottom', {}),
  ('prop_airship', 'airship', 'world', (190, 150), 'bottom', {}),
  ('prop_seed_stand', 'seedstand', 'world', (76, 66), 'bottom', {}),
  ('prop_shipping_box', 'shipbox', 'world', (66, 60), 'bottom', {}),
  ('prop_storage', 'storage', 'world', (62, 56), 'bottom', {}),
  ('prop_campfire_lit', 'campfire_lit', 'world', (64, 58), 'bottom', {}),
  ('prop_campfire_out', 'campfire_out', 'world', (64, 58), 'bottom', {}),
  ('prop_bridge_rope', 'bridge_rope', 'world', (150, 100), 'center', {}),
  ('prop_bridge_broken', 'bridge_broken', 'world', (150, 100), 'center', {}),
  ('prop_bridge_fixed', 'bridge_fixed', 'world', (150, 100), 'center', {}),
  ('prop_dock', 'dock', 'world', (130, 90), 'bottom', {}),
  ('prop_lamp', 'lamp', 'world', (40, 96), 'bottom', {}),
  ('prop_fountain', 'fountain', 'world', (132, 110), 'bottom', {}),
  ('prop_board', 'board', 'world', (84, 84), 'bottom', {}),
  ('bld_cottage', 'bld_cottage', 'world', (204, 176), 'bottom', {}),
  ('bld_shop_granny', 'bld_shop_granny', 'world', (236, 210), 'bottom', {}),
  ('bld_workshop', 'bld_workshop', 'world', (236, 210), 'bottom', {}),
  ('bld_workshop_broken', 'bld_workshop_broken', 'world', (236, 210), 'bottom', {}),
  ('bld_lab', 'bld_lab', 'world', (236, 210), 'bottom', {}),
  ('bld_lab_broken', 'bld_lab_broken', 'world', (236, 210), 'bottom', {}),
  ('bld_inn', 'bld_inn', 'world', (236, 210), 'bottom', FRINGE),
  ('bld_inn_broken', 'bld_inn_broken', 'world', (236, 210), 'bottom', FRINGE),
  ('bld_market', 'bld_market', 'world', (236, 190), 'bottom', FRINGE),
  ('bld_market_broken', 'bld_market_broken', 'world', (236, 190), 'bottom', FRINGE),
  ('prop_lighthouse_off', 'lighthouse_off', 'world', (130, 200), 'bottom', {}),
  ('prop_lighthouse_on', 'lighthouse_on', 'world', (130, 200), 'bottom', {}),
  ('prop_lighthouse_dune_off', 'lighthouse_dune_off', 'world', (130, 200), 'bottom', {}),
  ('prop_lighthouse_dune_on', 'lighthouse_dune_on', 'world', (130, 200), 'bottom', {}),
  ('prop_cactus', 'cactus', 'world', (64, 80), 'bottom', {}),
  ('prop_sandrock', 'sandrock', 'world', (62, 50), 'bottom', {}),
  ('prop_palm', 'palm', 'world', (96, 130), 'bottom', {}),
  ('boss_mistwood_idle_01', 'boss_mistwood', 'world', (160, 160), 'bottom', {}),
  ('boss_dune_idle_01', 'boss_dune', 'world', (170, 160), 'bottom', {}),
  # residents: small one for the town map, big one for the resident panel
  ('npc_granny', 'npc_granny', 'npcs', (60, 90), 'bottom', {}),
  ('npc_ali', 'npc_ali', 'npcs', (60, 90), 'bottom', {}),
  ('npc_lumi', 'npc_lumi', 'npcs', (60, 90), 'bottom', {}),
  ('npc_innkeeper', 'npc_innkeeper', 'npcs', (60, 90), 'bottom', FRINGE),
  ('npc_granny', 'npc_granny_big', 'npcs', (120, 180), 'bottom', {}),
  ('npc_ali', 'npc_ali_big', 'npcs', (120, 180), 'bottom', {}),
  ('npc_lumi', 'npc_lumi_big', 'npcs', (120, 180), 'bottom', {}),
  ('npc_innkeeper', 'npc_innkeeper_big', 'npcs', (120, 180), 'bottom', FRINGE),
  # pets: same 256 box as the existing idle images
  ('pet_acorn_evo_idle_01', 'pet_acorn_evo', 'pets', (256, 256), 'bottom', {}),
  ('pet_shark_evo_idle_01', 'pet_shark_evo', 'pets', (256, 256), 'bottom', {}),
  ('pet_pup_evo_idle_01', 'pet_pup_evo', 'pets', (256, 256), 'bottom', {}),
  ('pet_fox_evo_idle_01', 'pet_fox_evo', 'pets', (256, 256), 'bottom', {}),
  ('pet_starbear_evo_idle_01', 'pet_starbear_evo', 'pets', (256, 256), 'bottom', {}),
  ('pet_shadecat_evo_idle_01', 'pet_shadecat_evo', 'pets', (256, 256), 'bottom', {}),
  ('pet_new_camel_idle_01', 'pet_camel', 'pets', (256, 256), 'bottom', {}),
  ('pet_new_cactusbunny_idle_01', 'pet_cactusbunny', 'pets', (256, 256), 'bottom', FRINGE),
  ('pet_new_sundial_idle_01', 'pet_sundial', 'pets', (256, 256), 'bottom', FRINGE),
  # furniture (room sprite at the old placeholder size) + its bag icon
  ('furn_bed', 'bed', 'furniture', (96, 100), 'bottom', {}),
  ('furn_chair', 'furn_chair', 'furniture', (48, 60), 'bottom', {}),
  ('furn_table', 'furn_table', 'furniture', (96, 64), 'bottom', {}),
  ('furn_plant', 'furn_plant', 'furniture', (48, 64), 'bottom', {}),
  ('furn_rug', 'furn_rug', 'furniture', (96, 96), 'center', {}),
  ('furn_shelf', 'furn_shelf', 'furniture', (96, 100), 'bottom', {}),
  ('furn_lamp', 'furn_lamp', 'furniture', (48, 80), 'bottom', {}),
  ('furn_chime', 'furn_chime', 'furniture', (48, 80), 'bottom', {}),
  ('furn_horse', 'furn_horse', 'furniture', (60, 56), 'bottom', {}),
  ('furn_petbed', 'furn_petbed', 'furniture', (96, 56), 'bottom', {}),
]
ICONS = ['item_wood', 'item_stone', 'item_grass', 'item_crystal', 'item_cloth', 'item_axe', 'item_pickaxe', 'item_hoe', 'item_can', 'item_torch',
         'item_berry', 'item_berry_roast', 'item_fish', 'item_fish_roast', 'item_soup', 'item_carrot', 'item_strawberry', 'item_sunflower', 'item_starwheat', 'item_pumpkin',
         'item_seed_carrot', 'item_seed_strawberry', 'item_seed_sunflower', 'item_seed_starwheat', 'item_seed_pumpkin',
         'item_evo_forest', 'item_evo_water', 'item_evo_fire', 'item_evo_light', 'item_evo_dark', 'item_foxwick', 'item_fox_bell', 'item_bigbag']
for k in ICONS: MANIFEST.append((k, k, 'items', (128, 128), 'center', {'pad': 0.08}))
for f in ['chair', 'table', 'plant', 'rug', 'shelf', 'lamp', 'chime', 'horse', 'petbed']:
    MANIFEST.append((f'furn_{f}', f'item_furn_{f}', 'items', (128, 128), 'center', {'pad': 0.08}))
MANIFEST.append(('prop_tent', 'item_tent', 'items', (128, 128), 'center', {'pad': 0.08}))
# skill book: one painting, eight cover colours (book id → colour)
BOOKS = {'bubble': (61, 127, 184), 'ember': (217, 87, 43), 'leafy': (79, 125, 58), 'twinkle': (201, 154, 30),
         'shadow': (122, 74, 160), 'heal': (232, 120, 150), 'shell': (150, 104, 60), 'puff': (120, 186, 196)}
CROPS = ['carrot', 'strawberry', 'sunflower', 'starwheat', 'pumpkin']
TILES = [('tile_soil', 'soil', 96), ('tile_soil_wet', 'soil_wet', 96), ('tile_sand', 'sand', 384)]


def load(name):
    im = Image.open(SRC / f'{name}.png').convert('RGBA')
    a = np.asarray(im).astype(np.int16).copy()
    al = a[..., 3]
    al[al >= 245] = 255
    al[al <= 8] = 0
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def defringe(im):
    """Remove the light halo of a white-background cut-out: shrink the alpha by
    2 px and fade edge pixels that are still almost white."""
    a = im.getchannel('A')
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MinFilter(3))
    arr = np.asarray(im).astype(np.int16).copy()
    na = np.asarray(a).astype(np.int16)
    inner = np.asarray(a.filter(ImageFilter.MinFilter(3))).astype(np.int16)
    edge = (na > 0) & (inner < 255)
    rgb = arr[..., :3]
    whiteish = (rgb.min(axis=2) > 205) & (rgb.max(axis=2) - rgb.min(axis=2) < 40)
    na = np.where(edge & whiteish, na // 3, na)
    arr[..., 3] = na
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def trim(im):
    bb = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    return im.crop(bb) if bb else im


def fit(im, box, anchor, pad=0.0, scale=None):
    bw, bh = box
    iw, ih = bw * (1 - 2 * pad), bh * (1 - 2 * pad)
    s = scale if scale is not None else min(iw / im.width, ih / im.height)
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    small = im.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
    x = (bw - w) // 2
    y = (bh - h) // 2 if anchor == 'center' else bh - h - round(bh * pad)
    out.alpha_composite(small, (x, max(0, y)))
    return out


def save(im_src, key, folder, box, anchor, pad=0.0, scale=None):
    d = ASSETS / folder
    d.mkdir(parents=True, exist_ok=True)
    fit(im_src, box, anchor, pad, scale).save(d / f'{key}.png', optimize=True)
    if os.environ.get('ART_2X'):   # the game loads 1x only; originals stay in main:art/incoming/
        big = (box[0] * 2, box[1] * 2)
        fit(im_src, big, anchor, pad, None if scale is None else scale * 2).save(d / f'{key}@2x.png', optimize=True)
    return f'assets/{folder}/{key}.png'


def recolor_book(im, rgb):
    """Tint the cream cover; the gold trim (saturated) stays."""
    arr = np.asarray(im).astype(np.float32).copy()
    c = arr[..., :3]
    mx, mn = c.max(axis=2), c.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    cover = (sat < 0.32) & (mx > 120) & (arr[..., 3] > 0)
    lum = (0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]) / 235.0
    tint = np.array(rgb, np.float32)[None, None, :] * np.clip(lum, 0, 1.15)[..., None]
    k = 0.72
    c[cover] = c[cover] * (1 - k) + tint[cover] * k
    arr[..., :3] = np.clip(c, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def split_strip(im):
    """Three plants side by side → three images (cut at the two widest empty column gaps)."""
    a = np.asarray(im.getchannel('A')) > 16
    cols = a.any(axis=0)
    gaps, x = [], 0
    while x < len(cols):
        if not cols[x]:
            s = x
            while x < len(cols) and not cols[x]: x += 1
            if s > 0 and x < len(cols): gaps.append((x - s, s, x))
        else:
            x += 1
    gaps = sorted(gaps, reverse=True)[:2]
    if len(gaps) < 2:   # plants touch: fall back to thirds
        w = im.width // 3
        cuts = [0, w, 2 * w, im.width]
    else:
        mids = sorted((s + e) // 2 for _, s, e in gaps)
        cuts = [0, mids[0], mids[1], im.width]
    return [trim(im.crop((cuts[i], 0, cuts[i + 1], im.height))) for i in range(3)]


def seamless(src_rgb, size):
    s = min(src_rgb.size)
    left, top = (src_rgb.width - s) // 2, (src_rgb.height - s) // 2
    sq = np.asarray(src_rgb.crop((left, top, left + s, top + s))).astype(np.float32)
    t = np.linspace(0, 1, s)
    tri = 1 - np.abs(2 * t - 1)
    ramp = np.clip((tri - 0.18) / 0.32, 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    wx = ramp[None, :, None]
    tile = sq * wx + np.roll(sq, s // 2, axis=1) * (1 - wx)
    wy = ramp[:, None, None]
    tile = tile * wy + np.roll(tile, s // 2, axis=0) * (1 - wy)
    return Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)


art = {}
previews = []
for src, key, folder, box, anchor, opt in MANIFEST:
    im = load(src)
    if opt.get('fringe'): im = defringe(im)
    im = trim(im)
    art[key] = save(im, key, folder, box, anchor, opt.get('pad', 0.0))
    previews.append((key, ASSETS / folder / f'{key}.png'))

book = trim(load('item_book'))
for b, rgb in BOOKS.items():
    key = f'item_book_{b}'
    art[key] = save(recolor_book(book, rgb), key, 'items', (128, 128), 'center', 0.08)
    previews.append((key, ASSETS / 'items' / f'{key}.png'))

for c in CROPS:
    parts = split_strip(load(f'crop_{c}'))
    box = (48, 56)
    s = min(box[0] * 0.96 / parts[2].width, box[1] * 0.98 / parts[2].height)   # the ripe plant fills the box
    for i, p in enumerate(parts):
        key = f'crop_{c}_{i}'
        art[key] = save(p, key, 'crops', box, 'bottom', 0.0, s)
        previews.append((key, ASSETS / 'crops' / f'{key}.png'))

for src, key, size in TILES:
    img = seamless(Image.open(SRC / f'{src}.png').convert('RGB'), size)
    d = ASSETS / 'tiles'; d.mkdir(parents=True, exist_ok=True)
    img.save(d / f'{key}.png', optimize=True)
    art[key] = f'assets/tiles/{key}.png'
    previews.append((key, d / f'{key}.png'))

js = ['// Generated by tools/art/normalize.py — texture key → image (loaded by BootScene).',
      '// Keys that also have a code-drawn placeholder replace it; do not edit by hand.',
      'export const ART = ' + json.dumps(art, ensure_ascii=False, indent=2) + ';', '']
(ROOT / 'game/src/data/art.js').write_text('\n'.join(js), encoding='utf-8', newline='\n')
print('textures', len(art))

if PREVIEW:
    cell, cols = 132, 12
    rows = (len(previews) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * cell), (40, 46, 40))
    for i, (key, path) in enumerate(previews):
        im = Image.open(path).convert('RGBA'); im.thumbnail((cell - 6, cell - 6))
        bg = Image.new('RGBA', (cell, cell), (70, 84, 70, 255) if (i + i // cols) % 2 else (54, 64, 54, 255))
        bg.alpha_composite(im, ((cell - im.width) // 2, (cell - im.height) // 2))
        sheet.paste(bg.convert('RGB'), ((i % cols) * cell, (i // cols) * cell))
    sheet.save(PREVIEW, quality=86)
