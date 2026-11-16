# Rigs and animates a chibi pet (an unrigged Tripo model) in Blender, so motion no longer depends on AI auto-rigging:
#   1. normalise the model: 1 unit tall, on the ground, centred; landmarks are read with it facing +X (as Tripo models
#      come in), then it is turned to face +Y, which is what faces +Z (forward) in Unity after the FBX export
#      (measured: an FBX facing Blender +X shows up facing Unity +X, sideways)
#   2. skeleton from landmarks (tools/rig/<pet>.json, see tools/rig/skeleton.py): hips, spine, chest, head, ears
#      (2 bones each), tail (3), arms, legs, optional swaying chains (cap tips, ribbons, fins)
#   3. weights: voxel-remeshed watertight copy → Blender's heat weights → transferred to the real mesh; loose bits
#      the heat weights miss get the nearest bone
#   4. hand-made procedural clips for sitting chibi pets: idle (bouncy breathing, head tilt, ear twitch, tail wag,
#      paw wave), walk (hop: squash on landing, stretch on take-off, legs tuck, ears / tail / chains lag behind),
#      run (bigger, faster hops), happy (little jumps, paws up, wiggle, fast wag); "hold": true keeps the arms still
#      for pets holding something in both paws (it would stretch)
#   5. FBX (one take per clip, armature named "Armature" so Unity's clips are idle / walk / run / happy) + textures
#      in Textures/; optional check renders of a few frames
#   blender -b -P tools/blender/rig_pet.py -- <model.glb> <landmarks.json> <out.fbx> [render_dir]
import bpy, sys, os, json, math
from mathutils import Vector, Quaternion, Matrix
import numpy as np

script = os.path.abspath(sys.argv[sys.argv.index('-P') + 1])
sys.path.insert(0, os.path.join(os.path.dirname(script), '..', 'rig'))
import skeleton

args = sys.argv[sys.argv.index('--') + 1:]
src, lm_path, out = args[:3]
render_dir = args[3] if len(args) > 3 else None
LM = json.load(open(lm_path, encoding='utf-8'))
base = os.path.splitext(os.path.basename(out))[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
bpy.ops.import_scene.gltf(filepath=src)

def select(*objs, active=None):
    for o in bpy.data.objects: o.select_set(o in objs)
    bpy.context.view_layer.objects.active = active or objs[0]

# ---------- 1. one mesh, normalised (the landmark frame: facing +X, +Y = the pet's left, +Z up) ----------
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
select(*meshes)
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = base
for o in list(bpy.data.objects):
    if o is not body: bpy.data.objects.remove(o, do_unlink=True)
body.parent = None
body.data.transform(body.matrix_world); body.matrix_world = Matrix.Identity(4)
co = np.array([v.co[:] for v in body.data.vertices])
lo, hi = co.min(0), co.max(0)
s = 1.0 / (hi[2] - lo[2])
body.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))))
body.data.update()
P = np.array([v.co[:] for v in body.data.vertices])            # landmark frame
J = skeleton.joints(LM, P)
B = skeleton.bones(J, LM)
TURN = Matrix.Rotation(math.pi / 2, 4, 'Z')                     # facing +X → facing +Y
body.data.transform(TURN); body.data.update()
def M(p): return TURN @ Vector(tuple(float(c) for c in p))
F, L, U = Vector((0, 1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))   # the pet's forward / left / up after the turn

# ---------- 2. skeleton ----------
arm_data = bpy.data.armatures.new('Armature')
arm = bpy.data.objects.new('Armature', arm_data)
sc.collection.objects.link(arm)
select(arm)
bpy.ops.object.mode_set(mode='EDIT')
for b in B:
    e = arm_data.edit_bones.new(b['name'])
    e.head, e.tail = M(b['head']), M(b['tail'])
    e.use_deform = b['deform']
    if b['parent']: e.parent = arm_data.edit_bones[b['parent']]; e.use_connect = b['connect']
    d = (e.tail - e.head).normalized()
    e.align_roll(L if abs(d.dot(L)) < 0.9 else F)
bpy.ops.object.mode_set(mode='OBJECT')
names = [b.name for b in arm_data.bones]
def has(n): return n in names

# ---------- 3. weights ----------
# Each vertex belongs to the bone whose capsule it sits in most snugly: distance to the bone ÷ that bone's thickness
# (thickness = median distance of the vertices it owns, refined a few times; "radius" in the json overrides). Close
# rivals share the vertex, then weights are smoothed along the surface, so joints bend softly. Unlike heat weights
# this doesn't let a paw that touches the cheek drag the face along. "weights": "heat" in the json uses heat weights.
deform = [b for b in arm_data.bones if b.use_deform]
V = np.array([v.co[:] for v in body.data.vertices])            # turned frame (bones are too)
Vl = np.stack([V[:, 1], -V[:, 0], V[:, 2]], 1)                  # the same points in the landmark frame (boxes, head shape)
_, same = np.unique(np.round(V, 5), axis=0, return_inverse=True)      # vertices split at UV seams: keep them together
same = same.ravel()
def seam_mean(W):
    acc = np.zeros((same.max() + 1, W.shape[1])); np.add.at(acc, same, W)
    return (acc / np.bincount(same)[:, None])[same]
radii = {}
if LM.get('weights', 'capsule') == 'heat':
    proxy = body.copy(); proxy.data = body.data.copy(); proxy.name = 'proxy'
    sc.collection.objects.link(proxy)
    proxy.data.remesh_voxel_size = LM.get('voxel', 0.011)
    select(proxy); bpy.ops.object.voxel_remesh()
    select(proxy, arm, active=arm); bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    dt = body.modifiers.new('weights', 'DATA_TRANSFER')
    dt.object = proxy; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    select(body); bpy.ops.object.datalayout_transfer(modifier='weights'); bpy.ops.object.modifier_apply(modifier='weights')
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
else:
    A = np.array([b.head_local[:] for b in deform]); Z = np.array([b.tail_local[:] for b in deform])
    def seg_dist(a, b):
        ab = b - a; L2 = max(ab @ ab, 1e-9); t0 = ((V - a) @ ab) / L2; t = np.clip(t0, 0, 1)
        behind = np.maximum(0, -t0) * math.sqrt(L2)            # past the joint, back towards the parent: the parent's
        return np.linalg.norm(V - (a + t[:, None] * ab), axis=1) + 1.5 * behind   # (a scarf under the neck isn't head)
    D = np.stack([seg_dist(A[k], Z[k]) for k in range(len(deform))], 1)
    # bone thickness for chibi proportions (model 1 unit tall); "radius" in the json overrides per bone
    THICK = {'Hips': 0.18, 'Spine': 0.16, 'Chest': 0.13, 'Head': 0.2, 'Ear1': 0.05, 'Ear2': 0.04, 'UpperArm': 0.06,
             'LowerArm': 0.055, 'Thigh': 0.08, 'Shin': 0.06, 'Foot': 0.05, 'Tail1': 0.08, 'Tail2': 0.08, 'Tail3': 0.07}
    over = LM.get('radius', {})
    def thick(n):                                            # "Ear1.L", then "Ear1", then a chain's name ("Cap" for Cap1…)
        for k in (n, n.split('.')[0], n.split('.')[0].rstrip('0123456789')):
            if k in over: return over[k]
        return THICK.get(n.split('.')[0], 0.045)
    r = np.array([thick(b.name) for b in deform])
    S = D / r
    # "force": {"LowerArm.R": [[x0, x1, y0, y1, z0, z1], …]}: vertices in these boxes belong to that bone outright
    # (a hand modelled right next to the face would otherwise stay with the head when the arm moves)
    # Then it spreads along the mesh's own edges to whatever is joined to it within 5 cm of the box: the rest of a hand
    # that touches the hair joins the hand, the hair (not joined to it) stays with the head.
    E = np.array([e.vertices[:] for e in body.data.edges])
    def inbox(b, m=0.0):
        x0, x1, y0, y1, z0, z1 = b
        return (Vl[:, 0] > x0 - m) & (Vl[:, 0] < x1 + m) & (Vl[:, 1] > y0 - m) & (Vl[:, 1] < y1 + m) & (Vl[:, 2] > z0 - m) & (Vl[:, 2] < z1 + m)
    for bn, boxes in (LM.get('force') or {}).items():
        k = [b.name for b in deform].index(bn)
        grow = np.zeros(len(V), bool); near = np.zeros(len(V), bool)
        for b in boxes: grow |= inbox(b); near |= inbox(b, 0.05)
        for _ in range(400):
            nb = np.zeros(len(V), bool); nb[E[grow[E[:, 0]], 1]] = True; nb[E[grow[E[:, 1]], 0]] = True
            g = np.zeros(same.max() + 1, bool); g[same[nb | grow]] = True; nb |= g[same]     # across UV seams too
            new = nb & near & ~grow
            if not new.any(): break
            grow |= new
        S[grow, k] = 0.0
    hs = LM.get('head_shape')       # a chibi head is a big ball, not a capsule: {"center": [x, y, z], "radii": [rx, ry, rz]}
    if hs and has('Head'):
        S[:, [b.name for b in deform].index('Head')] = np.linalg.norm((Vl - np.array(hs['center'])) / np.array(hs['radii']), axis=1)
    # far from every bone (cape corners, a flared coat): the trunk takes it, not the head or a limb
    limb = np.array([b.name not in ('Hips', 'Spine', 'Chest') for b in deform])
    S[:, limb] = np.where(S[:, limb] > 1, S[:, limb] ** 1.5, S[:, limb])
    gap = S - S.min(1, keepdims=True)
    W = np.where(gap < 0.6, np.exp(-gap * LM.get('sharp', 8)), 0.0)
    W /= W.sum(1, keepdims=True)
    E = np.array([e.vertices[:] for e in body.data.edges])
    deg = np.bincount(E.ravel(), minlength=len(V)).astype(float)
    for _ in range(LM.get('smooth', 4)):
        acc = np.zeros_like(W); np.add.at(acc, E[:, 0], W[E[:, 1]]); np.add.at(acc, E[:, 1], W[E[:, 0]])
        W = seam_mean(0.5 * W + 0.5 * acc / np.maximum(deg, 1)[:, None])
    np.put_along_axis(W, np.argsort(-W, 1)[:, 4:], 0, 1)
    W /= W.sum(1, keepdims=True)
    for k, b in enumerate(deform):
        g = body.vertex_groups.new(name=b.name)
        for i in np.nonzero(W[:, k] > 0.002)[0]: g.add([int(i)], float(W[i, k]), 'REPLACE')
    radii = {b.name: round(float(r[k]), 3) for k, b in enumerate(deform)}
gi = {g.index: g.name for g in body.vertex_groups}
body.parent = arm
# which bone owns the vertices in named boxes of the landmark frame ("check": {"name": [x0, x1, y0, y1, z0, z1]})
for rn, (x0, x1, y0, y1, z0, z1) in (LM.get('check') or {}).items():
    idx = np.nonzero((P[:, 0] > x0) & (P[:, 0] < x1) & (P[:, 1] > y0) & (P[:, 1] < y1) & (P[:, 2] > z0) & (P[:, 2] < z1))[0]
    own = {}
    for i in idx:
        gs = body.data.vertices[int(i)].groups
        if len(gs): g = max(gs, key=lambda g: g.weight); own[gi[g.group]] = own.get(gi[g.group], 0) + 1
    print('CHECK', rn, len(idx), ', '.join(f'{k} {100 * v // max(1, len(idx))}%' for k, v in sorted(own.items(), key=lambda kv: -kv[1])[:4]))
    if len(own) > 1 and LM.get('check_detail'):                 # where the second owner's vertices are (to aim a "force" box)
        second = sorted(own.items(), key=lambda kv: -kv[1])[1][0]
        pts = np.array([P[i] for i in idx if (lambda gs: len(gs) and gi[max(gs, key=lambda g: g.weight).group] == second)(body.data.vertices[int(i)].groups)])
        print('   ', second, 'min', np.round(pts.min(0), 3), 'max', np.round(pts.max(0), 3))
body.modifiers.new('rig', 'ARMATURE').object = arm
share = {g.name: 0 for g in body.vertex_groups}
for v in body.data.vertices:
    for g in v.groups:
        if g.weight > 0.5: share[gi[g.group]] += 1

# ---------- 4. clips ----------
arm.animation_data_create()
rest = {b.name: b.matrix_local.to_quaternion() for b in arm_data.bones}
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
# rotations are written in the pet's own terms, about the bone's head:
#   pitch +  = lean forward (up-pointing bones tip forward, a tail / back-pointing bone goes up, a hanging arm swings back)
#   roll +   = lean to the pet's right (up-pointing bones tip right, hanging bones swing left)
#   turn +   = turn to the pet's left
def pitch(d): return (L, d)
def roll(d): return (F, d)
def turn(d): return (U, d)
SIDES = (('L', 1), ('R', -1))

# "pose": {"UpperArm.R": [x, y, z], …} turns bones to point that way before any clip moves them (a model made waving
# gets its arm down to walk); each bone's turn is worked out in its parent's already-turned frame
POSE, posed, acc = LM.get('pose') or {}, {}, {}
for b in arm_data.bones:                                        # parents come before children
    pa = acc[b.parent.name] if b.parent else Quaternion()
    q = Quaternion()
    if b.name in POSE:
        q = (b.tail_local - b.head_local).normalized().rotation_difference(pa.inverted() @ (TURN.to_3x3() @ Vector(POSE[b.name])).normalized())
    posed[b.name], acc[b.name] = q, pa @ q

def key(frame, rots, root_up=0.0, squash=0.0):
    """rots: bone → [(axis, degrees)…]; root_up: hop height; squash: + flattens the whole body (about the ground), − stretches it."""
    for pb in arm.pose.bones:
        q = posed[pb.name]
        for ax, deg in rots.get(pb.name, []): q = Quaternion(ax, math.radians(deg)) @ q
        r = rest[pb.name]
        pb.rotation_quaternion = r.inverted() @ q @ r
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        if pb.name == 'Root':
            pb.location = r.inverted() @ (U * root_up)
            pb.scale = (1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)     # Root points up: local Y is the height
            pb.keyframe_insert('location', frame=frame); pb.keyframe_insert('scale', frame=frame)

def ears(rots, flap, flop):
    """flap: sideways swing (+ = outward), flop: forward / back; the tip bone swings a bit more."""
    for S, sg in SIDES:
        if has(f'Ear1.{S}'): rots[f'Ear1.{S}'] = [roll(-sg * flap), pitch(flop)]
        if has(f'Ear2.{S}'): rots[f'Ear2.{S}'] = [roll(-sg * flap * 1.3), pitch(flop * 1.4)]

def tail(rots, t, wag, wag_speed, lift, lift_phase=0.0):
    for i in range(1, 4):
        if has(f'Tail{i}'):
            rots[f'Tail{i}'] = [turn(wag * math.sin(2 * math.pi * t * wag_speed - i * 0.7)),
                                pitch(lift * math.sin(2 * math.pi * (t - lift_phase) - i * 0.5))]

def chains(rots, t, sway, bob, speed=1):
    for name, ch in (LM.get('chains') or {}).items():
        amp = ch.get('amp', 1.0)
        for i in range(1, len(ch['points'])):
            rots[f'{name}{i}'] = [roll(amp * sway * math.sin(2 * math.pi * t * speed - i * 0.8)),
                                  pitch(amp * bob * math.sin(2 * math.pi * t * speed - 1.2 - i * 0.8))]

def bump(t, at, width): return math.exp(-((t - at) / width) ** 2)
wave = (LM.get('wave') or '').upper()

def idle(t):
    s1 = math.sin(2 * math.pi * t)
    rots = {
        'Spine': [pitch(1.5 * s1)],
        'Chest': [pitch(1.0 * s1)],
        'Head': [roll(5 * math.sin(2 * math.pi * t + 0.8)), pitch(-2 * s1), turn(3 * math.sin(2 * math.pi * t + 2))],
    }
    for S, sg in SIDES:
        if has(f'UpperArm.{S}'): rots[f'UpperArm.{S}'] = [pitch(2.5 * s1), roll(sg * 2 * s1)]
    if wave and has(f'LowerArm.{wave}'):
        sg = 1 if wave == 'L' else -1
        rots[f'LowerArm.{wave}'] = [roll(-sg * 12 * math.sin(4 * math.pi * t))]
    ears(rots, 5 * math.sin(2 * math.pi * t - 0.9), 3 * math.cos(2 * math.pi * t))
    tw = bump(t, 0.62, 0.035)                                   # one quick ear twitch per loop
    for S, k in (('L', 1.0), ('R', 0.5)):
        for i, m in ((1, 1.0), (2, 1.4)):
            if has(f'Ear{i}.{S}'): rots[f'Ear{i}.{S}'].append(pitch(-16 * tw * k * m))
    tail(rots, t, 14, 2, 4)
    chains(rots, t, 5, 3)
    return rots, 0.0, 0.02 * -s1

def hop(height, lean, tuck, air=0.6):
    def fn(t):
        h = math.sin(math.pi * t / air) if t < air else 0.0                  # 0 … 1 … 0 while in the air
        sq = math.sin(math.pi * (t - air) / (1 - air)) if t >= air else 0.0  # landing squash
        st = math.sin(math.pi * t / (air * 0.5)) if t < air * 0.5 else 0.0  # take-off stretch
        body = lean * (0.6 * st + 0.8 * sq) - 0.3 * lean * h
        rots = {
            'Hips': [pitch(body)],
            'Spine': [pitch(3 * sq)],
            'Chest': [pitch(2 * sq)],
            'Head': [pitch(-0.6 * (body + 5 * sq) + 4 * math.sin(2 * math.pi * (t - 0.15))), roll(2 * math.sin(2 * math.pi * t))],
        }
        for S, sg in SIDES:
            if has(f'Thigh.{S}'): rots[f'Thigh.{S}'] = [pitch(-tuck * h + 6 * sq)]
            if has(f'Shin.{S}'): rots[f'Shin.{S}'] = [pitch(tuck * 1.1 * h)]
            if has(f'Foot.{S}'): rots[f'Foot.{S}'] = [pitch(-8 * h)]
            if has(f'UpperArm.{S}'): rots[f'UpperArm.{S}'] = [pitch(-tuck * 0.8 * h + 6 * sq), roll(sg * 12 * h)]
            if has(f'LowerArm.{S}'): rots[f'LowerArm.{S}'] = [pitch(-8 * h)]
        ears(rots, 8 * math.sin(2 * math.pi * (t - 0.25)), 14 * math.sin(2 * math.pi * (t - 0.2)))
        tail(rots, t, 8, 1, 16, 0.25)
        chains(rots, t, 6, 14)
        return rots, height * h, 0.13 * sq - 0.06 * st
    return fn

def happy(t):
    h = max(0.0, math.sin(4 * math.pi * t)); sq = max(0.0, -math.sin(4 * math.pi * t))
    rots = {
        'Hips': [turn(10 * math.sin(2 * math.pi * t))],
        'Spine': [roll(5 * math.sin(2 * math.pi * t)), pitch(3 * sq)],
        'Head': [roll(-9 * math.sin(2 * math.pi * t)), pitch(-7 * h)],
    }
    for S, sg in SIDES:
        if has(f'UpperArm.{S}'): rots[f'UpperArm.{S}'] = [pitch(-55 * h - 10), roll(sg * 28 * h)]
        if has(f'LowerArm.{S}'): rots[f'LowerArm.{S}'] = [pitch(-20 * h)]
        if has(f'Thigh.{S}'): rots[f'Thigh.{S}'] = [pitch(-14 * h)]
    ears(rots, 10 * math.sin(4 * math.pi * t - 1), -8 * h + 6 * sq)
    tail(rots, t, 26, 4, 10)
    chains(rots, t, 8, 10, 2)
    return rots, 0.1 * h, 0.12 * sq

# ---- two-legged characters (the player): legs take turns instead of hopping ----
def stride(t, thigh, knee, arm_swing, elbow, bob, lean, turn_hips, run=False):
    ph = 2 * math.pi * t
    s, c = math.sin(ph), math.cos(ph)                           # left leg forward when s > 0, swinging forward when c > 0
    up = bob * (0.5 - 0.5 * math.cos(2 * ph)) if run else bob * (0.5 + 0.5 * math.cos(2 * ph))   # walk: high when the legs pass; run: high in the air
    rots = {
        'Hips': [turn(-turn_hips * s), roll(-3 * c), pitch(lean)],
        'Spine': [turn(turn_hips * 0.45 * s), pitch(lean * 0.3)],
        'Chest': [turn(turn_hips * 0.55 * s)],
        'Head': [turn(-turn_hips * 0.2 * s), pitch(-lean * 1.1 + 1.5 * math.cos(2 * ph)), roll(1.5 * c)],
    }
    for S, sg in SIDES:
        k = sg                                                  # the right leg is half a cycle behind
        ls, lc = s * k, c * k
        rots[f'Thigh.{S}'] = [pitch(-thigh * ls)]
        rots[f'Shin.{S}'] = [pitch(knee * max(0.0, lc) + 5)]
        rots[f'Foot.{S}'] = [pitch(-knee * 1.05 * max(0.0, lc) - 8 * max(0.0, -ls))]   # foot level while it swings through, less toe-down at push-off
        rots[f'UpperArm.{S}'] = [pitch(arm_swing * ls), roll(sg * 6)]                    # arms swing against the legs
        rots[f'LowerArm.{S}'] = [pitch(-(elbow + 12 * max(0.0, -ls)))]
    chains(rots, t, 4, 10 if run else 6, 2)
    squash = 0.03 * max(0.0, math.cos(2 * ph)) if run else 0.015 * max(0.0, -math.cos(2 * ph))   # lowest point: run mid-stance, walk at heel strike
    return rots, up, squash

def biped_idle(t):
    ph = 2 * math.pi * t; s1 = math.sin(ph)
    rots = {
        'Hips': [roll(2 * s1)],                                 # weight shifts from foot to foot
        'Spine': [roll(-1.2 * s1), pitch(1.0 * math.sin(2 * ph))],
        'Chest': [pitch(1.5 * math.sin(2 * ph))],              # breathing
        'Head': [turn(8 * math.sin(ph + 1.2)), pitch(-2 * math.sin(2 * ph)), roll(-1.5 * s1 + 1.5 * math.sin(ph + 2))],
    }
    for S, sg in SIDES:
        rots[f'Thigh.{S}'] = [roll(-2 * s1)]
        rots[f'UpperArm.{S}'] = [pitch(2.5 * math.sin(2 * ph + sg)), roll(sg * (5 + 1.5 * math.sin(2 * ph)))]
        rots[f'LowerArm.{S}'] = [pitch(-8 - 3 * math.sin(2 * ph))]
    chains(rots, t, 3, 2)
    return rots, 0.0, 0.01 * -math.sin(2 * ph)

def biped_happy(t):
    ph = 2 * math.pi * t; h = max(0.0, math.sin(2 * ph)); sq = max(0.0, -math.sin(2 * ph))
    rots = {'Hips': [pitch(4 * sq)], 'Spine': [pitch(-4 * h)], 'Head': [pitch(-8 * h), roll(6 * math.sin(ph))]}
    for S, sg in SIDES:
        rots[f'UpperArm.{S}'] = [pitch(-120 * h - 20), roll(sg * (12 + 22 * h))]           # cheer: both arms up
        rots[f'LowerArm.{S}'] = [pitch(-25 * h - 10)]
        rots[f'Thigh.{S}'] = [pitch(-18 * h + 8 * sq)]
        rots[f'Shin.{S}'] = [pitch(30 * h + 10 * sq)]
    chains(rots, t, 6, 12, 2)
    return rots, 0.08 * h, 0.08 * sq - 0.03 * h

def make(name, frames, fn):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(frames + 1):                                 # last frame = first: seamless loop
        rots, up, squash = fn((f % frames) / frames)
        if LM.get('hold'):                                      # paws hold something together: arms ride with the chest
            rots = {k: v for k, v in rots.items() if not k.startswith(('UpperArm', 'LowerArm'))}
        key(f, rots, up, squash)
    return act

if LM.get('gait') == 'biped':
    clips = [make('idle', 48, biped_idle),
             make('walk', 16, lambda t: stride(t, thigh=28, knee=40, arm_swing=24, elbow=12, bob=0.02, lean=3, turn_hips=6)),
             make('run', 12, lambda t: stride(t, thigh=42, knee=65, arm_swing=38, elbow=70, bob=0.045, lean=10, turn_hips=9, run=True)),
             make('happy', 24, biped_happy)]
else:
    clips = [make('idle', 48, idle), make('walk', 12, hop(0.07, 6, 20)), make('run', 8, hop(0.11, 10, 30, 0.65)), make('happy', 24, happy)]

# ---------- 5. textures, check renders, FBX ----------
tex_dir = os.path.join(os.path.dirname(os.path.abspath(out)), 'Textures'); os.makedirs(tex_dir, exist_ok=True)
sc.render.image_settings.quality = 92
for i, img in enumerate([im for im in bpy.data.images if im.type == 'IMAGE']):
    path = os.path.join(tex_dir, f'{base}_{i}.jpg')
    img.filepath_raw = path; img.file_format = 'JPEG'
    img.save()
    if img.packed_file: img.unpack(method='REMOVE')
    img.filepath = path

if render_dir:
    os.makedirs(render_dir, exist_ok=True)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 6
    sc.render.resolution_x = sc.render.resolution_y = 260
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.17, 0.2, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.6
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.6, 0.2, 0.6); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.5
    aim = bpy.data.objects.new('aim', None); aim.location = (0, 0, 0.55); sc.collection.objects.link(aim)
    cam.constraints.new('TRACK_TO').target = aim
    # weights picture: every bone its own colour
    import colorsys
    PAL = {'Hips': (0.55, 0.08, 0.08), 'Spine': (0.95, 0.3, 0.15), 'Chest': (0.95, 0.65, 0.3), 'Head': (0.95, 0.45, 0.85),
           'Ear1.L': (1, 1, 0), 'Ear2.L': (0.6, 0.6, 0), 'Ear1.R': (1, 0.55, 0), 'Ear2.R': (0.6, 0.3, 0),
           'UpperArm.L': (0, 0.35, 1), 'LowerArm.L': (0, 0.95, 1), 'UpperArm.R': (0.35, 0.15, 0.9), 'LowerArm.R': (0.6, 0.65, 1),
           'Thigh.L': (0, 0.55, 0), 'Shin.L': (0.3, 0.9, 0.3), 'Foot.L': (0.7, 1, 0.6), 'Thigh.R': (0, 0.45, 0.4),
           'Shin.R': (0.2, 0.8, 0.65), 'Foot.R': (0.6, 1, 0.9), 'Tail1': (0.45, 0, 0.55), 'Tail2': (0.7, 0.2, 0.8), 'Tail3': (0.9, 0.55, 1)}
    cols = {b.name: np.array(PAL.get(b.name, colorsys.hsv_to_rgb((i * 0.618) % 1, 0.3, 1))) ** 2.2 for i, b in enumerate(deform)}
    ca = body.data.color_attributes.new('wcol', 'FLOAT_COLOR', 'POINT')
    for v in body.data.vertices:
        c = sum((cols[gi[g.group]] * g.weight for g in v.groups if gi[g.group] in cols), np.zeros(3))
        ca.data[v.index].color = (*c, 1)
    wm = bpy.data.materials.new('weights'); wm.use_nodes = True
    nt = wm.node_tree; at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'wcol'
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(at.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    bpy.context.view_layer.material_override = wm
    arm.animation_data.action = None
    for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    for view, loc in (('q', (-2.6, 4.2, 2.2)), ('b', (3.4, -3.6, 1.6)), ('f', (0, 5, 1.2))):
        cam.location = loc
        sc.render.filepath = os.path.join(render_dir, f'{base}_w_{view}.png')
        bpy.ops.render.render(write_still=True)
    bpy.context.view_layer.material_override = None
    wl = int(bpy.data.actions['walk'].frame_range[1])
    shots = [('idle', 0), ('idle', 12), ('idle', 30), ('walk', 0), ('walk', wl // 6), ('walk', wl // 3), ('walk', 2 * wl // 3), ('happy', 3)]
    for view, loc in (('q', (-2.6, 4.2, 2.2)), ('b', (3.4, -3.6, 1.6))):
        cam.location = loc
        for name, f in shots:
            arm.animation_data.action = bpy.data.actions[name]
            sc.frame_set(f)
            sc.render.filepath = os.path.join(render_dir, f'{base}_{view}_{name}_{f:02d}.png')
            bpy.ops.render.render(write_still=True)

if render_dir and LM.get('strip'):                              # "strip": ["walk", "run"]: 8 moments of each clip from the side
    cam.location = (5, 0.4, 0.9)
    for name in LM['strip']:
        act = bpy.data.actions[name]; arm.animation_data.action = act; n = int(act.frame_range[1])
        for j in range(8):
            sc.frame_set(round(j * n / 8))
            sc.render.filepath = os.path.join(render_dir, f'{base}_strip_{name}_{j}.png')
            bpy.ops.render.render(write_still=True)

arm.animation_data.action = clips[0]
sc.frame_set(0)
select(arm, body, active=arm)
bpy.ops.export_scene.fbx(filepath=out, use_selection=True, path_mode='RELATIVE', embed_textures=False, add_leaf_bones=False,
                         bake_anim=True, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=True, bake_anim_force_startend_keying=True,
                         apply_scale_options='FBX_SCALE_ALL', object_types={'ARMATURE', 'MESH'})
print('RIGGED', out, 'bones', len(names), 'verts', len(body.data.vertices))
print('MAIN WEIGHT VERTS', sorted(share.items(), key=lambda kv: -kv[1]))
print('RADII', radii)
