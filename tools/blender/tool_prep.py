# Hand tools from Tripo (axe, pickaxe, hoe, net, watering can) made ready to hold: one mesh, the grip at the origin, the
# handle along +Z (Unity +Y) and the working side towards +Y (Unity +Z). In the game, PlayerMover puts the grip in the fist
# and turns the tool so the handle runs through the fist and the working side faces where the knuckles point.
#   blender -b --factory-startup -P tool_prep.py -- <kind> <in.fbx> <out.fbx>
#   kind: long  (axe, pickaxe, hoe: head on one end, blade to one side)
#         net   (the hoop's opening faces the working side)
#         can   (held by the top handle, spout towards +Y... see below)
import bpy, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
kind, src, dst = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects:
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = meshes[0]
for o in meshes: o.select_set(True)
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [v.co.copy() for v in ob.data.vertices]
n = len(vs)
c = sum(vs, Vector()) / n

def pca(points, centre):
    cov = [[0.0] * 3 for _ in range(3)]
    for p in points:
        d = p - centre
        for i in range(3):
            for j in range(3): cov[i][j] += d[i] * d[j]
    m = Matrix(cov) * (1.0 / max(1, len(points)))
    # power iteration for the three axes
    axes = []
    for k in range(3):
        v = Vector((1, 0.3, 0.1)) if k == 0 else Vector((0.2, 1, 0.3)) if k == 1 else Vector((0.1, 0.2, 1))
        for _ in range(60):
            v = m @ v
            for a in axes: v -= a * v.dot(a)
            if v.length < 1e-12: break
            v.normalize()
        axes.append(v.copy())
    return axes

if kind in ('long', 'net'):
    a1, a2, a3 = pca(vs, c)
    ts = [(p - c).dot(a1) for p in vs]
    t0, t1 = min(ts), max(ts)
    L = t1 - t0
    def spread(lo, hi):
        sel = [p for p, t in zip(vs, ts) if lo <= t <= hi]
        if not sel: return 0
        return sum(((p - c) - a1 * (p - c).dot(a1)).length for p in sel) / len(sel)
    # the head is the end with the wider cross-section
    if spread(t0, t0 + 0.25 * L) > spread(t1 - 0.25 * L, t1): a1 = -a1; ts = [-t for t in ts]; t0, t1 = -t1, -t0
    up = a1
    grip = c + up * (t0 + 0.13 * L)                     # a hand's width from the handle's end
    head = [p for p, t in zip(vs, ts) if t > t1 - 0.3 * L]
    hc = sum(head, Vector()) / len(head)
    if kind == 'long':
        off = (hc - c) - up * (hc - c).dot(up)          # the blade sticks out to one side
        if off.length < 0.02 * L:                        # symmetric head (pickaxe): along its widest direction
            h1, h2, h3 = pca(head, hc); off = h1 - up * h1.dot(up)
        work = off.normalized()
    else:
        h1, h2, h3 = pca(head, hc)                       # the hoop's thinnest direction is its opening
        work = (h3 - up * h3.dot(up)).normalized()
else:  # can: upright as Tripo made it (Z up); the spout is the far reach sideways; held at the top of the handle
    zmax = max(p.z for p in vs); zmin = min(p.z for p in vs); H = zmax - zmin
    far = max(vs, key=lambda p: (p.x - c.x) ** 2 + (p.y - c.y) ** 2)
    spout = Vector((far.x - c.x, far.y - c.y, 0)).normalized()
    top = [p for p in vs if p.z > zmax - 0.08 * H]
    tc = sum(top, Vector()) / len(top)
    grip = Vector((tc.x, tc.y, zmax - 0.05 * H))
    up = Vector((0, 0, 1))                               # in the hand the can hangs: PlayerMover turns it
    work = spout

side = up.cross(work).normalized(); work = side.cross(up).normalized()
# rows: where our axes go — work → +Y, up → +Z, side → +X
R = Matrix((side, work, up)).to_4x4()
ob.data.transform(Matrix.Translation(-grip))
ob.data.transform(R)
ob.data.update()
size = max(ob.dimensions)
print('TOOL', kind, 'verts', n, 'size', round(size, 3), 'dims', [round(d, 3) for d in ob.dimensions])
bpy.ops.export_scene.fbx(filepath=dst, use_selection=False, path_mode='STRIP', embed_textures=False, axis_forward='-Z', axis_up='Y',
                         apply_scale_options='FBX_SCALE_ALL', bake_anim=False)
