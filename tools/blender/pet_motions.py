"""Pet motions for Tripo quadruped rigs (round-2 models, docs/21).

The Tripo website only has a "walk" preset for four-legged characters, and its text-to-motion only makes human
motions. This script keeps Tripo's mesh, skin and walk, works out the body parts from where the bones are (the bone
names Tripo gives quadrupeds are not reliable), and keyframes the other motions the game needs:

  idle (loop) · run (loop) · attack · hit · faint · happy · sleep (loop) · eat (loop)

Body parts: legs = the four chains that reach the ground (front / back from the head side, left / right from the
spine line); tail = the chain that starts behind the back legs and stays high; head = the highest bone over the front
legs, neck = its parent chain; ears = children of the head that end above it. Rotations are given about world axes in
the rest pose and turned into each bone's local space, so the same motion code works for every pet.

The rig is turned to face Blender +Y before export (Unity +Z forward with the default FBX axes, see memory notes).

usage: blender -b --factory-startup -P pet_motions.py -- <in.fbx> <out.fbx> [preview_dir]
"""
import bpy, sys, math, functools
print = functools.partial(print, flush=True)
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
bpy.ops.import_scene.fbx(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']

# ---------- face +Y ----------
# where the head is tells which way the model faces; turn the armature (meshes follow as children) to face +Y
def world_head(b): return arm.matrix_world @ b.head_local
def world_tail(b): return arm.matrix_world @ b.tail_local

bones = list(arm.data.bones)
zs = [world_tail(b).z for b in bones] + [world_head(b).z for b in bones]
H = max(zs) - min(zs)                      # model height
ground = min(zs)
top = max(bones, key=lambda b: max(world_head(b).z, world_tail(b).z))
centre = sum((world_head(b) for b in bones), Vector()) / len(bones)
face = (Vector((world_head(top).x, world_head(top).y, 0)) - Vector((centre.x, centre.y, 0)))
yaw = math.atan2(face.x, face.y)           # angle from +Y
if abs(yaw) > math.radians(20):
    rot = Matrix.Rotation(yaw, 4, 'Z')     # turning by +yaw brings the face onto +Y
    arm.matrix_world = rot @ arm.matrix_world
    for m in meshes:
        if m.parent is None: m.matrix_world = rot @ m.matrix_world
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm] + meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    print(f'turned by {math.degrees(yaw):.0f} deg to face +Y')

bones = list(arm.data.bones)
FWD = Vector((0, 1, 0)); UP = Vector((0, 0, 1)); SIDE = Vector((1, 0, 0))   # +X = the pet's right when facing +Y
spine_x = sum(world_head(b).x for b in bones) / len(bones)

# ---------- body parts ----------
def chain_down(b):
    out = [b]
    while len(out[-1].children) == 1: out.append(out[-1].children[0])
    return out

def tip(chain): return world_tail(chain[-1])

# legs: chains (starting at a bone whose parent does not reach the ground) whose tip is near the floor
leg_tips = [b for b in bones if not b.children and world_tail(b).z < ground + 0.08 * H]
legs = []
for t in leg_tips:
    ch = [t]
    while ch[-1].parent and len(ch[-1].parent.children) == 1 and world_head(ch[-1].parent).z < centre.z + 0.15 * H:
        ch.append(ch[-1].parent)
    ch.reverse()
    legs.append(ch)
# head and neck: Tripo names its head chain Head_0 (neck, at the shoulders), Head_1 (the head) …; otherwise the bone at
# the front with the most bones under it that sits high
heads = [b for b in bones if 'Head' in b.name]
def depth(b): return 0 if b.parent is None else 1 + depth(b.parent)
heads.sort(key=depth)
if len(heads) >= 2: neck_b, head = heads[0], heads[1]
elif heads: neck_b, head = heads[0].parent, heads[0]
else:
    head = max([b for b in bones if world_head(b).y > centre.y], key=lambda b: len(b.children_recursive) + world_head(b).z, default=top)
    neck_b = head.parent
front_y = world_head(head).y
leg_info = []
mid_y = (min(world_head(ch[0]).y for ch in legs) + max(world_head(ch[0]).y for ch in legs)) / 2 if legs else centre.y
for ch in legs:
    p = world_head(ch[0])
    leg_info.append({'chain': ch, 'front': p.y > mid_y, 'right': p.x > spine_x})
# tail: a chain starting behind the body, mostly higher than the hips, not a leg
leg_bones = {b.name for li in leg_info for b in li['chain']}
back_y = min(world_head(li['chain'][0]).y for li in leg_info) if leg_info else centre.y
tails = [b for b in bones if b.name not in leg_bones and world_head(b).y < back_y + 0.05 * H and world_tail(b).y < world_head(b).y - 0.02 * H]
tail_root = max(tails, key=lambda b: (world_head(b) - world_tail(b)).length) if tails else None
tail_chain = chain_down(tail_root) if tail_root else []
neck = [neck_b] if neck_b and neck_b.name not in leg_bones and neck_b.parent is not None else []
spine = [b for b in bones if 'Spine' in b.name and b.name not in leg_bones] or ([arm.data.bones[0]] if bones else [])
ears = [c for c in head.children if world_tail(c).z > world_head(head).z]
root = next((b for b in bones if b.parent is None), bones[0])
print('legs', [(li['chain'][0].name, 'F' if li['front'] else 'B', 'R' if li['right'] else 'L') for li in leg_info])
print('head', head.name, 'neck', [b.name for b in neck], 'tail', [b.name for b in tail_chain], 'ears', [b.name for b in ears], 'spine', [b.name for b in spine], 'root', root.name)

# ---------- posing helpers ----------
pose = arm.pose
for pb in pose.bones: pb.rotation_mode = 'QUATERNION'
def local_axis(b, axis_world):
    m = (arm.matrix_world @ b.matrix_local).to_3x3().normalized()
    return (m.inverted() @ axis_world).normalized()

def turn(name, axis_world, deg):
    """rotation about a world axis (rest pose), as a quaternion in the bone's local space"""
    b = arm.data.bones[name]
    return Quaternion(local_axis(b, axis_world), math.radians(deg))

class Pose:
    def __init__(self): self.rot = {}; self.loc = Vector()
    def add(self, bone, axis, deg):
        if bone is None or abs(deg) < 1e-4: return self
        q = turn(bone.name, axis, deg)
        self.rot[bone.name] = q @ self.rot.get(bone.name, Quaternion())
        return self

def key(action_poses, name, loop):
    """action_poses: list of (frame, Pose). Creates an action with every animated bone keyed on every given frame."""
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    # every bone is keyed in every action (rest rotation where the motion leaves it alone): an unkeyed bone would keep
    # whatever another action left in the pose, and the FBX bake would freeze it (the faint's roll leaked into the rest)
    names = {pb.name for pb in pose.bones}
    for f, p in action_poses:
        for pb in pose.bones:
            if pb.name in names:
                pb.rotation_quaternion = p.rot.get(pb.name, Quaternion())
                pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
        rp = pose.bones[root.name]
        # root moves in its own local space: convert the world offset
        m = (arm.matrix_world @ root.matrix_local).to_3x3().normalized()
        rp.location = m.inverted() @ p.loc
        rp.keyframe_insert('location', frame=f, group=root.name)
    for fc in act.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
        if loop: fc.modifiers.new('CYCLES')
    act.use_fake_user = True
    act.frame_range = (action_poses[0][0], action_poses[-1][0])
    return act

def legs_where(front=None, right=None):
    return [li for li in leg_info if (front is None or li['front'] == front) and (right is None or li['right'] == right)]

def swing_legs(p, deg_front, deg_back, alt=True):
    """legs swing about the side axis; alt: diagonal pairs opposite (trot), else front pair vs back pair (bound)"""
    for li in leg_info:
        d = deg_front if li['front'] else deg_back
        if alt and li['right'] != li['front']: d = -d
        p.add(li['chain'][0], SIDE, d)
        if len(li['chain']) > 2: p.add(li['chain'][1], SIDE, -abs(d) * 0.6)   # knee flex
    return p

def wag(p, deg, curl=0.6):
    for i, b in enumerate(tail_chain): p.add(b, UP, deg * (curl ** i) if i == 0 else deg * 0.6)
    return p

def frames(seconds, n):
    return [round(i * seconds * FPS / n) + 1 for i in range(n + 1)]

S = math.sin; TAU = 2 * math.pi

# ---------- motions ----------
acts = []
# idle: breathing, a slow head tilt, ears twitch, tail sways
fs = frames(4.0, 16)
seq = []
for i, f in enumerate(fs):
    t = i / 16
    p = Pose(); p.loc = Vector((0, 0, 0.006 * H * S(TAU * t * 2)))
    for b in spine[:1]: p.add(b, SIDE, 1.5 * S(TAU * t * 2))
    p.add(head, FWD, 6 * S(TAU * t)).add(head, SIDE, 3 * S(TAU * t * 2 + 1))
    for e in ears: p.add(e, FWD, 10 * max(0, S(TAU * t * 3 + 2)) ** 6)
    wag(p, 14 * S(TAU * t * 2))
    seq.append((f, p))
acts.append(key(seq, 'idle', True))

# run: a bounding gallop, front pair and back pair opposite, body flexes, head steadies
fs = frames(0.5, 8)
seq = []
for i, f in enumerate(fs):
    t = i / 8; s = S(TAU * t)
    p = Pose(); p.loc = Vector((0, 0, 0.05 * H * abs(S(TAU * t))))
    swing_legs(p, 32 * s, -32 * s, alt=False)
    for b in spine[:1]: p.add(b, SIDE, 6 * s)
    p.add(head, SIDE, -5 * s)
    wag(p, 8 * S(TAU * t * 2));
    for b in tail_chain[:1]: p.add(b, SIDE, 15)
    seq.append((f, p))
acts.append(key(seq, 'run', True))

# attack: crouch, pounce forward and bite, spring back
def attack_pose(crouch, lunge, bite):
    p = Pose(); p.loc = Vector((0, lunge * 0.35 * H, -crouch * 0.12 * H + max(0, lunge) * 0.08 * H))
    swing_legs(p, -20 * crouch + 25 * lunge, 20 * crouch - 30 * lunge, alt=False)
    for b in spine[:1]: p.add(b, SIDE, -8 * crouch + 6 * lunge)
    p.add(head, SIDE, -10 * crouch - 15 * bite)
    for b in neck: p.add(b, SIDE, -8 * crouch - 10 * bite)
    for e in ears: p.add(e, SIDE, 25 * crouch)
    for b in tail_chain[:1]: p.add(b, SIDE, 20 * crouch - 10 * lunge)
    return p
seq = [(1, attack_pose(0, 0, 0)), (10, attack_pose(1, 0, 0)), (14, attack_pose(0.6, 0.7, 0.3)), (17, attack_pose(0.2, 1, 1)),
       (21, attack_pose(0.1, 0.8, 0.2)), (30, attack_pose(0.3, 0.1, 0)), (38, attack_pose(0, 0, 0))]
acts.append(key(seq, 'attack', False))

# hit: knocked back, head jerks, recovers
def hit_pose(k):
    p = Pose(); p.loc = Vector((0, -0.12 * H * k, 0.02 * H * k))
    for b in spine[:1]: p.add(b, SIDE, 10 * k)
    p.add(head, SIDE, 20 * k).add(head, FWD, 8 * k)
    swing_legs(p, -15 * k, 10 * k, alt=False)
    for e in ears: p.add(e, SIDE, 30 * k)
    return p
seq = [(1, hit_pose(0)), (4, hit_pose(1)), (8, hit_pose(0.8)), (14, hit_pose(0.3)), (20, hit_pose(0))]
acts.append(key(seq, 'hit', False))

# faint: wobble, roll onto the side, lie still
def faint_pose(k, roll):
    p = Pose(); p.loc = Vector((0.18 * H * roll, 0, -0.12 * H * roll))
    if root: p.add(root, FWD, -80 * roll)
    p.add(head, SIDE, 15 * k - 25 * roll)
    swing_legs(p, 20 * roll, -20 * roll, alt=False)
    for b in tail_chain[:1]: p.add(b, UP, 30 * roll)
    for e in ears: p.add(e, SIDE, 35 * k)
    return p
seq = [(1, faint_pose(0, 0)), (8, faint_pose(1, 0)), (14, faint_pose(1, 0.1)), (26, faint_pose(1, 0.95)), (30, faint_pose(1, 1)), (40, faint_pose(1, 1))]
acts.append(key(seq, 'faint', False))

# happy: two hops, head up, tail wags fast
fs = frames(1.0, 12)
seq = []
for i, f in enumerate(fs):
    t = i / 12; hop = max(0, S(TAU * t * 2))
    p = Pose(); p.loc = Vector((0, 0, 0.16 * H * hop))
    swing_legs(p, 18 * hop, -18 * hop, alt=False)
    p.add(head, SIDE, 8 + 6 * hop)
    for e in ears: p.add(e, SIDE, -12 * hop)
    wag(p, 28 * S(TAU * t * 4))
    seq.append((f, p))
acts.append(key(seq, 'happy', False))

# sleep: lying down, legs tucked, head on the front paws, slow breathing, tail curled round
fs = frames(3.0, 12)
seq = []
for i, f in enumerate(fs):
    t = i / 12; br = S(TAU * t)
    p = Pose(); p.loc = Vector((0, 0, -0.2 * H + 0.006 * H * br))
    for li in leg_info:
        p.add(li['chain'][0], SIDE, 70 if li['front'] else -70)
        if len(li['chain']) > 1: p.add(li['chain'][1], SIDE, -40 if li['front'] else 40)
    for b in spine[:1]: p.add(b, SIDE, 2 * br)
    p.add(head, SIDE, -30)
    for b in neck: p.add(b, SIDE, -18)
    for e in ears: p.add(e, SIDE, 20)
    wag(p, 55, curl=1.0)
    seq.append((f, p))
acts.append(key(seq, 'sleep', True))

# eat: head down to the ground, nibbling, tail swishes slowly
fs = frames(2.0, 16)
seq = []
for i, f in enumerate(fs):
    t = i / 16
    p = Pose(); p.loc = Vector((0, 0, -0.02 * H))
    swing_legs(p, -6, 4, alt=False)
    for b in neck: p.add(b, SIDE, -30)
    p.add(head, SIDE, -25 - 8 * max(0, S(TAU * t * 4)))
    wag(p, 10 * S(TAU * t))
    seq.append((f, p))
acts.append(key(seq, 'eat', True))

# keep Tripo's walk (renamed)
for a in bpy.data.actions:
    if 'walk' in a.name and a not in acts:
        a.name = 'walk'; a.use_fake_user = True

# ---------- preview: a few frames of each motion as small Workbench renders ----------
if PREVIEW:
    import os
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    # Cycles on the CPU: Workbench / Eevee use the GPU, which crashes Blender on the dev PC (memory notes)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8; sc.cycles.use_denoising = False
    sc.render.resolution_x = 320; sc.render.resolution_y = 320
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.2
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (0.8, 0.2, 0.6)
    cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = Vector((1.6 * H, 1.2 * H, 0.7 * H)) + Vector((0, 0, ground))
    direction = Vector((0, 0, ground + 0.45 * H)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    for a in [x for x in bpy.data.actions if x.use_fake_user]:
        arm.animation_data.action = a
        f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
        for j, f in enumerate([f0, (f0 + f1) // 2, f1 - 1 if f1 - 1 > f0 else f1]):
            sc.frame_set(f)
            sc.render.filepath = os.path.join(PREVIEW, f'{a.name}_{j}.png')
            bpy.ops.render.render(write_still=True)

# ---------- export: every action as its own take ----------
arm.animation_data.action = None
bpy.ops.object.select_all(action='DESELECT')
for o in [arm] + meshes: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.fbx(filepath=OUT, use_selection=True, add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=True,
                         bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=True, path_mode='COPY', embed_textures=False,
                         mesh_smooth_type='FACE', armature_nodetype='NULL')
print('ACTIONS', [a.name for a in bpy.data.actions if a.use_fake_user])
print('exported', OUT)
