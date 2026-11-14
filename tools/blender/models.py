# The pets and people as code (docs/14): each function builds one model from
# the helpers in petkit.py, after the 2D art in game/assets/pets and npcs.
# Part names the game animates: body, head, tail, earL/R, armL/R, legL/R, orb.
import math
import bpy
from mathutils import Vector
from petkit import *

W = srgb(0xfff6ea)        # warm white fur


def pear(k=0.16):
    """Wider toward the bottom (chubby cheeks, round tummy)."""
    return lambda p: Vector((p.x * (1 + k * max(0.0, -p.z)), p.y * (1 + k * 0.6 * max(0.0, -p.z)), p.z))


def grad(c0, c1, z0, z1):
    """Colour by height inside the part: c0 at z0 … c1 at z1."""
    return lambda p: mixc(c0, c1, (p.z - z0) / (z1 - z0))


def fox():
    """焰尾狐: white fur, red-orange ear tips and paws, big flame tail, red collar with a gold bell, a little fire orb."""
    RED, ORANGE, YEL, PINK = srgb(0xe8432c), srgb(0xf58a2a), srgb(0xffd04a), srgb(0xffc4b4)
    root = empty('fox')
    body = ball('body', (0, 0.02, 0.30), (0.19, 0.17, 0.21), W, root, shape=pear(0.22), detail=4)
    chest = ball('chest', (0, -0.125, 0.10), (0.105, 0.07, 0.09), srgb(0xffffff), body, detail=3)
    fluff(chest, 60, 0.05, seed=3, lean=(0, -0.25, -0.5), lift=0.2)                                 # ruff of fur under the chin
    torus('collar', (0, -0.005, 0.165), 0.132, 0.03, RED, body, rot=(0.18, 0, 0), squash=(1, 0.92, 1))
    ball('bell', (0, -0.15, 0.10), 0.046, srgb(0xf2c23e), body, detail=2)
    ball('bellslit', (0, -0.19, 0.085), (0.02, 0.012, 0.008), srgb(0x8a5a1e), body, detail=1)

    head = ball('head', (0, -0.02, 0.665), (0.27, 0.235, 0.225), W, root, shape=pear(0.2), detail=4)
    fluff(head, 90, 0.058, where=lambda p: abs(p.x) > 0.17 and p.z < 0.02 and p.y > -0.13, seed=5, lean=(0, 0, -0.35), lift=0.1)   # fluffy cheeks
    fluff(head, 50, 0.045, where=lambda p: p.z > 0.17 and p.y > -0.1, seed=6)                              # soft crown
    for s, n in ((-1, 'L'), (1, 'R')):
        cone('cheek' + n, (s * 0.215, 0.0, -0.085), 0.075, 0.13, W, head, rot=(0, s * 1.95, 0), flat=0.6)
        ear = cone('ear' + n, (s * 0.155, 0.03, 0.135), 0.11, 0.31, lambda p: mixc(W, RED, (p.z - 0.13) / 0.05), head, rot=(-0.08, s * 0.36, 0), flat=0.42, segs=16)
        cone('earIn' + n, (0, -0.032, 0.03), 0.066, 0.21, PINK, ear, flat=0.3)
    eyes(head, 0.113, -0.196, 0.0, 0.074, 0.092, 0xf29a2e)
    face(head, -0.226, -0.085, w=0.07, muzzle=0xffffff)
    ball('mark', (0, -0.212, 0.118), (0.028, 0.012, 0.046), RED, head, detail=2)
    for i, (x, z) in enumerate(((-0.05, 0.215), (0.0, 0.235), (0.05, 0.215))):          # tuft of fur on top
        cone(f'tuft{i}', (x, -0.05, z - 0.03), 0.045, 0.085, grad(W, ORANGE, 0.02, 0.08), head, rot=(0.5, x * 6, 0), flat=0.7)

    # the tail: a fat flame curling up behind; lighter belly, red back, yellow tip that glows
    tail = empty('tail', (0, 0.15, 0.2), root)
    glow = material('glow', 1.0)
    def tailcol(t, around):
        c = mixc(ORANGE, RED, min(1.0, t * 2.2)) if t < 0.62 else mixc(RED, YEL, (t - 0.62) / 0.3)
        return mixc(c, YEL, max(0.0, -around) * 0.55 * (1 - abs(t - 0.5)))          # lighter along the inner curve
    tube('tailFur', (0, 0, 0), [(0, 0, 0), (0, 0.1, 0.02), (0.02, 0.21, 0.14), (0.035, 0.265, 0.32), (0.025, 0.24, 0.5), (0, 0.165, 0.64), (0, 0.09, 0.75)],
         [0.05, 0.095, 0.14, 0.16, 0.135, 0.085, 0.012], tailcol, tail, segs=18, steps=7)
    fluff(bpy.data.objects['tailFur'], 240, 0.066, seed=9, lean=(0, 0.1, 0.6), lift=0.3, tip=0.3, out=0.3)       # licks of fur like little flames
    cone('tailTip', (0.0, 0.1, 0.72), 0.05, 0.15, grad(ORANGE, YEL, 0.0, 0.12), tail, rot=(0.6, 0, 0), flat=0.8, mat=glow, bend=0.02)
    for i, (p, rot, h) in enumerate((((-0.12, 0.2, 0.3), (0.2, -1.0, 0), 0.14), ((0.15, 0.22, 0.38), (0.2, 1.0, 0), 0.16), ((0.0, 0.36, 0.26), (-1.1, 0, 0), 0.13))):
        cone(f'wisp{i}', p, 0.055, h, grad(RED, YEL, 0.0, h), tail, rot=rot, flat=0.7, mat=glow, bend=0.03)

    for s, n, to in ((-1, 'L', (-0.25, -0.13, 0.36)), (1, 'R', (0.27, -0.1, 0.55))):   # right paw raised, waving
        at = (s * 0.155, -0.06, 0.42)
        arm = limb('arm' + n, at, to, 0.052, 0.06, W, root)
        L = (Vector(to) - Vector(at)).length
        ball('paw' + n, (0, 0, L + 0.012), (0.074, 0.074, 0.068), RED, arm, detail=3)
        if s > 0:
            pads(root, arm, (to[0] + 0.004, to[1] - 0.012, to[2] + 0.01))
    for s, n in ((-1, 'L'), (1, 'R')):
        leg = limb('leg' + n, (s * 0.1, -0.01, 0.15), (s * 0.115, -0.03, 0.05), 0.085, 0.075, W, root)
        ball('foot' + n, (0, -0.055, 0.1), (0.08, 0.105, 0.052), grad(W, RED, -0.02, 0.06) if False else (lambda p: mixc(W, RED, (-p.y - 0.02) / 0.06)), leg, detail=2)

    orb = empty('orb', (0.37, -0.07, 0.8), root)
    ball('orbCore', (0, 0, 0), 0.058, srgb(0xffb23a), orb, detail=2, mat=glow)
    cone('orbFlame', (0, 0, 0.02), 0.05, 0.13, grad(ORANGE, YEL, 0.0, 0.12), orb, flat=0.8, mat=glow, bend=0.025)
    return root


MODELS = {'fox': fox}
