# The other pets and the hero (docs/14), built on a shared round-animal body.
# See models.py for the fox and petkit.py for the shapes.
import math
import bpy
from mathutils import Vector
from petkit import *
from models import pear, grad


def critter(name, fur, belly, iris, head_col=None, body_col=None, ears='point', ear_col=None, ear_in=0xffc4b4, paw=None,
            raise_arm=True, cheeks=True, head_r=(0.27, 0.235, 0.225), body_r=(0.19, 0.17, 0.21), ear_h=0.27, mouth=True, fluffy=0, pad=0xffa8b4):
    """Body, big head with eyes and face, ears, arms, legs. Returns the parts so each pet can add what makes it itself."""
    F, B = srgb(fur), srgb(belly)
    paw = srgb(paw) if paw is not None else B
    root = empty(name)
    body = ball('body', (0, 0.02, 0.30), body_r, body_col or (lambda p: mixc(F, B, (-p.y / body_r[1] - 0.25) * 2.2)), root, shape=pear(0.22), detail=4)
    head = ball('head', (0, -0.02, 0.665), head_r, head_col or (lambda p: mixc(F, B, (-p.y / head_r[1] - 0.45) * 3 + (-p.z / head_r[2]) * 0.8)), root, shape=pear(0.2), detail=4)
    if fluffy:   # fluffy cheeks, a soft crown, a ruff on the chest (1 = as fluffy as the fox)
        fluff(head, int(90 * fluffy), 0.058, where=lambda p: abs(p.x) > 0.17 and p.z < 0.02 and p.y > -0.13, seed=5, lean=(0, 0, -0.35), lift=0.1)
        fluff(head, int(50 * fluffy), 0.045, where=lambda p: p.z > 0.17 and p.y > -0.1, seed=6)
        fluff(body, int(70 * fluffy), 0.05, where=lambda p: p.y < -0.06 and p.z > 0.02, seed=3, lean=(0, -0.25, -0.5), lift=0.2)
    ec = ear_col or (lambda p: F)
    for s, n in ((-1, 'L'), (1, 'R')):
        if cheeks:
            cone('cheek' + n, (s * 0.215, 0.0, -0.085), 0.075, 0.13, B, head, rot=(0, s * 1.95, 0), flat=0.6)
        if ears == 'point':
            ear = cone('ear' + n, (s * 0.155, 0.03, 0.135), 0.105, ear_h, ec, head, rot=(-0.08, s * 0.36, 0), flat=0.42)
            cone('earIn' + n, (0, -0.032, 0.03), 0.062, ear_h * 0.68, srgb(ear_in), ear, flat=0.3)
        elif ears == 'round':
            ear = ball('ear' + n, (s * 0.19, 0.02, 0.16), (0.085, 0.05, 0.085), ec, head, detail=2)
            ball('earIn' + n, (0, -0.03, 0.0), (0.052, 0.03, 0.052), srgb(ear_in), ear, detail=2)
        elif ears == 'small':
            ear = ball('ear' + n, (s * 0.2, 0.02, 0.13), (0.055, 0.035, 0.06), ec, head, detail=2)
            ball('earIn' + n, (0, -0.02, 0.0), (0.032, 0.02, 0.036), srgb(ear_in), ear, detail=2)
    eyes(head, 0.113, -0.196, 0.0, 0.074, 0.092, iris)
    if mouth:
        face(head, -0.226, -0.085, w=0.07, muzzle=belly)
    parts = {'root': root, 'body': body, 'head': head}
    for s, n in ((-1, 'L'), (1, 'R')):
        at = (s * 0.155, -0.06, 0.42)
        to = (0.27, -0.1, 0.55) if (raise_arm and s > 0) else (s * 0.25, -0.13, 0.36)
        arm = limb('arm' + n, at, to, 0.052, 0.06, F, root)
        ball('paw' + n, (0, 0, (Vector(to) - Vector(at)).length + 0.012), (0.074, 0.074, 0.068), paw, arm, detail=3)
        if raise_arm and s > 0 and pad is not None:
            pads(root, arm, (to[0] + 0.004, to[1] - 0.012, to[2] + 0.01), color=pad)
        leg = limb('leg' + n, (s * 0.1, -0.01, 0.15), (s * 0.115, -0.03, 0.05), 0.085, 0.075, F, root)
        ball('foot' + n, (0, -0.055, 0.1), (0.08, 0.105, 0.052), lambda p: mixc(F, paw, (-p.y - 0.02) / 0.06), leg, detail=2)
        parts['arm' + n] = arm
        parts['leg' + n] = leg
    return parts


def star(name, at, r, color, parent, rot=(0, 0, 0), thick=0.35, mat=None):
    """Five-pointed puffy star, lying in the x-z plane (facing -y)."""
    c = ball(name, at, (r * 0.55, r * thick, r * 0.55), color, parent, rot=rot, detail=2, mat=mat)
    for i in range(5):
        a = i / 5 * math.tau
        cone(f'{name}p{i}', (math.sin(a) * r * 0.3, 0, math.cos(a) * r * 0.3), r * 0.36, r * 0.75, color, c, rot=(0, a, 0), flat=thick * 1.1, mat=mat)
    return c


def pup():
    """Ice-blue wolf pup: white and blue-grey fluff, cyan eyes, teal scarf with a flower, big brush of a tail."""
    BLUE, WHITE, TEAL = srgb(0x6f8fc4), srgb(0xfafcff), srgb(0x8ed3cf)
    hc = lambda p: mixc(WHITE, BLUE, ((p.z / 0.225 - 0.3) * 2.4 + abs(p.x) / 0.27 * 0.9 - 0.5 + max(0.0, p.y) * 3) * 3)      # blue cap and back of the head, white face (a clear edge)
    P = critter('pup', 0xfafcff, 0xffffff, 0x3fb8d8, head_col=hc, ear_col=lambda p: mixc(WHITE, BLUE, p.z / 0.1 + 0.2), ear_in=0xdfe8fa, paw=0xfafcff, ear_h=0.24, fluffy=1,
                body_col=lambda p: mixc(WHITE, BLUE, (p.y / 0.17 - 0.2) * 4))
    root, body, head = P['root'], P['body'], P['head']
    for i, x in enumerate((-0.07, 0.0, 0.07)):                                              # fringe between the ears
        cone(f'fringe{i}', (x, -0.12, 0.17), 0.06, 0.1, WHITE, head, rot=(1.9, x * 4, 0), flat=0.6)
    torus('scarf', (0, -0.005, 0.165), 0.14, 0.04, TEAL, body, rot=(0.2, 0, 0), squash=(1, 0.95, 1.2))
    cone('scarfEnd', (0.06, -0.15, 0.13), 0.06, 0.15, TEAL, body, rot=(2.9, 0.25, 0), flat=0.35)
    fl = ball('flower', (0, -0.165, 0.13), (0.022, 0.012, 0.022), srgb(0xf8cf48), body, detail=1)
    for i in range(5):
        a = i / 5 * math.tau
        ball(f'petal{i}', (math.sin(a) * 0.035, 0.004, math.cos(a) * 0.035), (0.022, 0.008, 0.022), WHITE, fl, detail=1)
    tail = empty('tail', (0, 0.16, 0.2), root)
    tube('tailFur', (0, 0, 0), [(0, 0, 0), (0, 0.1, 0.03), (0.0, 0.2, 0.16), (0, 0.24, 0.33), (0, 0.2, 0.47), (0, 0.13, 0.55)],
         [0.05, 0.1, 0.15, 0.155, 0.11, 0.015], lambda t, a: mixc(BLUE, WHITE, (t - 0.5) * 6), tail, segs=18, steps=7)
    fluff(bpy.data.objects['tailFur'], 220, 0.066, seed=9, lean=(0, 0.1, 0.6), lift=0.3, out=0.3)
    return root


def acorn():
    """Acorn hedgehog: cream face and tummy, brown spines, pilot cap with goggles, an acorn in its paws."""
    CREAM, BROWN, DARK, CAP = srgb(0xf7e3c4), srgb(0x9a5c34), srgb(0x5e3a22), srgb(0xead9b4)
    P = critter('acorn', 0xf7e3c4, 0xfff3de, 0x5a3a26, ears='small', ear_col=lambda p: CREAM, ear_in=0xf2b8a6, paw=0xf2b8a6, raise_arm=False, cheeks=False,
                body_col=lambda p: mixc(CREAM, BROWN, (p.y / 0.17 - 0.1) * 8), head_col=lambda p: mixc(CREAM, BROWN, (p.y / 0.235 - 0.4) * 9))
    root, body, head = P['root'], P['body'], P['head']
    k = 0
    for zc, n, rr in ((0.62, 7, 0.24), (0.75, 6, 0.2), (0.48, 8, 0.23), (0.34, 8, 0.2), (0.2, 6, 0.16)):   # spines over the back, fanned out
        for i in range(n):
            a = (i / (n - 1) - 0.5) * 2.5
            x, y = math.sin(a) * rr, 0.06 + math.cos(a) * rr * 0.75
            cone(f'spine{k}', (x, y, zc), 0.055, 0.17, lambda p: mixc(BROWN, DARK, p.z / 0.15), root, rot=(-1.15 - (zc - 0.45) * 0.9, 0, -a * 0.9), flat=0.8)
            k += 1
    ball('cap', (0, 0.0, 0.085), (0.245, 0.215, 0.165), CAP, head, detail=3)
    for s in (-1, 1):
        ball('flap', (s * 0.225, 0.02, -0.03), (0.05, 0.09, 0.11), CAP, head, detail=2)
        g = torus('goggle', (s * 0.085, -0.185, 0.13), 0.052, 0.016, srgb(0xb9773f), head, rot=(1.25, 0, 0))
        ball('glass', (0, 0, 0.006), (0.046, 0.046, 0.014), srgb(0x8fd8d8), g, detail=2)
    box('strap', (0, -0.19, 0.125), (0.07, 0.02, 0.024), srgb(0x8a5a36), head, rot=(-0.3, 0, 0))
    ac = ball('nut', (0.0, -0.2, 0.36), (0.07, 0.065, 0.08), srgb(0xc98a4e), root, detail=2)
    ball('nutCap', (0, 0, 0.045), (0.078, 0.072, 0.045), srgb(0x7a4a2c), ac, detail=2)
    cone('nutStem', (0, 0, 0.08), 0.014, 0.04, srgb(0x5e3a22), ac)
    return root


def shark():
    """Sailor shark: navy back, white belly, big grin, sailor cap, life ring, little telescope."""
    NAVY, WHITE = srgb(0x3f5f94), srgb(0xfafcff)
    hc = lambda p: mixc(NAVY, WHITE, ((-p.z / 0.225 - 0.12) * 3 + (-p.y / 0.235 - 0.6) * 1.2) * 4)
    P = critter('shark', 0x3f5f94, 0xfafcff, 0xf2c23e, ears='none', head_col=hc, cheeks=False, mouth=False, paw=0x3f5f94, raise_arm=False,
                body_col=lambda p: mixc(NAVY, WHITE, (-p.y / 0.17 - 0.2) * 8))
    root, body, head = P['root'], P['body'], P['head']
    ball('grin', (0, -0.2, -0.085), (0.13, 0.05, 0.07), srgb(0xc9485a), head, detail=2)       # open mouth with a row of teeth
    for i in range(6):
        cone(f'tooth{i}', ((i - 2.5) * 0.04, -0.238, -0.045), 0.018, 0.04, WHITE, head, rot=(math.pi, 0, 0), flat=0.6)
    for s in (-1, 1):
        ball('blush', (s * 0.185, -0.16, -0.05), (0.04, 0.012, 0.025), srgb(0xffb0a8), head, rot=(0, 0, s * 0.5), detail=2)
    cone('fin', (0, 0.1, 0.17), 0.09, 0.2, NAVY, head, rot=(-0.5, 0, 0), flat=0.3)
    cap = ball('capTop', (0, -0.02, 0.2), (0.2, 0.185, 0.07), WHITE, head, detail=2)
    torus('capBand', (0, 0, -0.035), 0.165, 0.028, srgb(0x2f4470), cap, squash=(1, 0.92, 1))
    ball('capPeak', (0, -0.165, -0.05), (0.12, 0.07, 0.016), srgb(0x2f4470), cap, rot=(0.25, 0, 0), detail=2)
    star('capStar', (0, -0.178, 0.0), 0.05, srgb(0xf2c23e), cap, rot=(-0.2, 0, 0))
    RED = srgb(0xe8544a)
    torus('ring', (0, 0.0, 0.03), 0.2, 0.05, lambda p: RED if (math.atan2(p.y, p.x) % (math.pi / 2)) < math.pi / 4 else WHITE, body, squash=(1, 0.95, 1.1))
    tail = empty('tail', (0, 0.15, 0.22), root)
    tube('tailFur', (0, 0, 0), [(0, 0, 0), (0, 0.1, 0.0), (0, 0.2, 0.06), (0, 0.27, 0.17)], [0.07, 0.085, 0.06, 0.03], lambda t, a: mixc(NAVY, WHITE, max(0.0, -a) * 0.5), tail)
    for s in (-1, 1):
        cone(f'fluke{s}', (0, 0.26, 0.17), 0.05, 0.17, NAVY, tail, rot=(-0.4 - s * 0.9, 0, 0), flat=0.3)
    scope = limb('scope', (0.2, -0.16, 0.36), (0.26, -0.3, 0.42), 0.022, 0.034, srgb(0xc98a4e), root)
    ball('lens', (0, 0, 0.165), (0.034, 0.034, 0.012), srgb(0x8fd8f0), scope, detail=2)
    return root


def starbear():
    """Star bear cub: cream bear, round ears, navy nightcap with a pompom, hugging a star pillow."""
    CREAM, TAN, NAVY, GOLD = srgb(0xf9e7cb), srgb(0xd2a678), srgb(0x3a4a80), srgb(0xf5d24a)
    P = critter('starbear', 0xf9e7cb, 0xfff6e6, 0xd98a2e, ears='round', ear_col=lambda p: TAN, ear_in=0xf2c8a6, paw=0xf2b8a6, raise_arm=False, cheeks=False, fluffy=0.5)
    root, body, head = P['root'], P['body'], P['head']
    ball('muzzle', (0, -0.2, -0.07), (0.09, 0.05, 0.065), srgb(0xfffaf0), head, detail=2)
    NAVY2 = srgb(0x4a5a98)
    hat = cone('hat', (-0.03, 0.01, 0.13), 0.2, 0.36, lambda p: mixc(NAVY, NAVY2, p.z / 0.36), head, rot=(0.1, 0.5, 0), bend=0.12, flat=0.92, segs=16)
    torus('hatBrim', (0, 0, 0.02), 0.19, 0.035, srgb(0xdfd3ee), hat, squash=(1, 0.92, 1))
    ball('pompom', (0.13, 0, 0.355), 0.055, srgb(0xffffff), hat, detail=2)
    for i, (x, z) in enumerate(((-0.1, 0.12), (0.06, 0.2), (-0.02, 0.27))):
        star(f'hatStar{i}', (x, -0.17 + z * 0.3, z), 0.032, GOLD, hat, rot=(-0.2, 0, i * 0.5), mat=material('glow', 1.0))
    star('pillow', (0.0, -0.21, 0.33), 0.16, GOLD, root, rot=(0.1, 0, 0.2), thick=0.42)
    ball('cape', (0, 0.1, 0.33), (0.2, 0.12, 0.2), lambda p: mixc(NAVY, NAVY2, 0.8 if math.sin(p.x * 40) * math.sin(p.z * 40) > 0 else 0.0), root, detail=3)
    tail = empty('tail', (0, 0.2, 0.2), root)
    ball('tailFur', (0, 0.05, 0.02), 0.08, TAN, tail, detail=2)
    return root


def shadecat():
    """Moonshade fox-cat: dusk-purple fur, lavender face and chest, magenta ears, crimson eyes, a big dark tail, a red gem."""
    DARK, LAV, MAG, RED = srgb(0x3d2c52), srgb(0xe2d4f4), srgb(0xc23a78), srgb(0xc22048)
    hc = lambda p: mixc(DARK, LAV, ((-p.y / 0.235 - 0.42) * 3 + (-p.z / 0.225 - 0.1) * 1.4) * 3)                          # lavender mask on the face, dark hood
    P = critter('shadecat', 0x3d2c52, 0xe2d4f4, 0xe83a6a, head_col=hc, ear_col=lambda p: mixc(DARK, MAG, p.z / 0.3 - 0.3), ear_in=0xd95a94, paw=0xe2d4f4, ear_h=0.31, fluffy=1,
                body_col=lambda p: mixc(DARK, LAV, (-p.y / 0.17 - 0.5) * 6))
    root, body, head = P['root'], P['body'], P['head']
    for i, x in enumerate((-0.09, -0.03, 0.04, 0.1)):                                       # spiky fringe
        cone(f'fringe{i}', (x, -0.1, 0.18), 0.055, 0.13, mixc(DARK, MAG, (i % 2) * 0.5), head, rot=(2.0, x * 5, 0), flat=0.55)
    ball('moon', (0, -0.215, 0.105), (0.03, 0.01, 0.03), srgb(0xf7e9a8), head, detail=2, mat=material('glow', 1.0))
    torus('ribbon', (0, -0.005, 0.165), 0.134, 0.028, RED, body, rot=(0.18, 0, 0), squash=(1, 0.92, 1))
    ball('gem', (0, -0.155, 0.09), (0.035, 0.022, 0.05), srgb(0xe83a6a), body, detail=1, mat=material('glow', 0.8))
    tail = empty('tail', (0, 0.15, 0.2), root)
    tube('tailFur', (0, 0, 0), [(0, 0, 0), (0, 0.1, 0.02), (0.03, 0.22, 0.13), (0.06, 0.28, 0.32), (0.05, 0.25, 0.5), (0.02, 0.17, 0.63), (0, 0.1, 0.7)],
         [0.05, 0.1, 0.15, 0.17, 0.14, 0.09, 0.012], lambda t, a: mixc(DARK, MAG, max(0.0, math.sin(a * 6 + t * 9)) * 0.55 * t + max(0.0, t - 0.8) * 2), tail, segs=18, steps=7)
    fluff(bpy.data.objects['tailFur'], 220, 0.07, seed=9, lean=(0, 0.1, 0.6), lift=0.3, tip=0.06, out=0.3)
    WING = mixc(DARK, RED, 0.6)
    for s, n in ((-1, 'L'), (1, 'R')):
        cone('wing' + n, (s * 0.17, 0.1, 0.4), 0.05, 0.22, WING, root, rot=(-0.9, s * 1.1, 0), flat=0.25)
    return root


def player():
    """The hero: curly brown hair, blue cap with a sprout, cream shirt, yellow neckerchief, green dungarees, brown boots, a satchel."""
    SKIN, HAIR, CAPC, SHIRT, GREEN, BOOT = srgb(0xffe0c4), srgb(0x8a5a36), srgb(0x7f9cc4), srgb(0xfbf1dc), srgb(0x7fa84e), srgb(0x8a5a36)
    HAIR2 = srgb(0xb07a45)
    root = empty('player')
    body = ball('body', (0, 0.01, 0.36), (0.15, 0.125, 0.17), lambda p: SHIRT if p.z > -0.02 else GREEN, root, shape=pear(0.12), detail=4)
    for s in (-1, 1):
        box('strap', (s * 0.075, -0.1, 0.07), (0.03, 0.03, 0.17), GREEN, body, rot=(0.25, 0, 0))
    ball('kerchief', (0, -0.085, 0.14), (0.085, 0.04, 0.05), srgb(0xf2c23e), body, detail=2)
    ball('bag', (0.16, -0.04, -0.03), (0.06, 0.05, 0.07), srgb(0xb9773f), body, detail=2)
    head = ball('head', (0, -0.01, 0.7), (0.235, 0.215, 0.215), SKIN, root, shape=pear(0.14), detail=4)
    ball('hairBack', (0, 0.035, 0.01), (0.25, 0.215, 0.225), HAIR, head, detail=3)
    for i in range(9):                                                                      # curls around the face
        a = (i / 8 - 0.5) * 2.7
        ball(f'curl{i}', (math.sin(a) * 0.225, -0.085 - math.cos(a) * 0.05, 0.055 + math.cos(a) * 0.125), 0.062, mixc(HAIR, HAIR2, (i % 2) * 0.5), head, detail=2)
    cap = ball('cap', (0, 0.0, 0.16), (0.25, 0.225, 0.11), CAPC, head, detail=3)
    ball('capPeak', (0, -0.19, -0.03), (0.15, 0.09, 0.02), srgb(0x6a86b0), cap, rot=(0.2, 0, 0), detail=2)
    for s in (-1, 1):
        cone('sprout', (0.12, -0.08, 0.06), 0.03, 0.09, srgb(0x7cc04a), cap, rot=(0.2, s * 0.7, 0), flat=0.35)
    eyes(head, 0.096, -0.182, -0.025, 0.06, 0.076, 0x7a4a2c)
    for s in (-1, 1):                                                                       # eyebrows
        box('brow', (s * 0.098, -0.2, 0.07), (0.06, 0.012, 0.014), HAIR, head, rot=(0, s * 0.18, 0), bevel=0.4)
    face(head, -0.207, -0.085, w=0.06, nose=0xf2b090)
    for s, n in ((-1, 'L'), (1, 'R')):
        ball('ear' + n, (s * 0.225, 0.0, -0.03), (0.035, 0.03, 0.045), SKIN, head, detail=2)
        at = (s * 0.14, -0.02, 0.45)
        to = (0.27, -0.06, 0.58) if s > 0 else (-0.22, -0.05, 0.32)
        arm = limb('arm' + n, at, to, 0.045, 0.04, SHIRT, root)
        ball('hand' + n, (0, 0, (Vector(to) - Vector(at)).length + 0.01), 0.05, SKIN, arm, detail=2)
        leg = limb('leg' + n, (s * 0.075, 0.0, 0.22), (s * 0.08, -0.01, 0.07), 0.07, 0.055, GREEN, root)
        ball('boot' + n, (0, -0.04, 0.16), (0.07, 0.1, 0.06), BOOT, leg, detail=2)
    return root


MODELS = {'pup': pup, 'acorn': acorn, 'shark': shark, 'starbear': starbear, 'shadecat': shadecat, 'player': player}
