# Like cleanup.py, but for a model that has a skeleton and animations (e.g. Tripo "rig" + "retarget"):
# the bones and clips are kept; the whole figure is put under one parent that makes it 1 unit tall,
# standing on the ground, centred and facing the camera.
#   blender -b -P tools/blender/cleanup_rigged.py -- <input.glb> <name> [--turn -90] [--tex 1024]
# → game/assets/models/<name>.glb   (clips are found by name in src/view3d/kit/pets.js: idle / walk)
import bpy, os, sys, math
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
src, name = args[0], args[1]
opt = {'turn': 0.0, 'tex': 1024}
for i, a in enumerate(args):
    if a.startswith('--') and a[2:] in opt:
        opt[a[2:]] = float(args[i + 1])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bpy.context.view_layer.update()
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if not meshes or not arms:
    raise SystemExit(f'need a mesh and a skeleton, found {len(meshes)} mesh(es), {len(arms)} skeleton(s)')

# size of the figure in its rest pose
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
k = 1.0 / max(hi.z - lo.z, 1e-6)
rot = Matrix.Rotation(math.radians(opt['turn']), 4, 'Z')
root = bpy.data.objects.new('pet', None)
bpy.context.collection.objects.link(root)
for o in [o for o in bpy.data.objects if o.parent is None and o is not root]:
    o.parent = root
foot = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
root.scale = (k, k, k)
root.rotation_euler = (0, 0, math.radians(opt['turn']))
root.location = -(rot @ (foot * k))

for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > opt['tex']:
        s = opt['tex'] / max(w, h)
        img.scale(max(1, int(w * s)), max(1, int(h * s)))

out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game', 'assets', 'models', name + '.glb'))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_animations=True, export_image_format='JPEG', export_jpeg_quality=88)
tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
print(f'cleaned rigged {src} -> {out}: {tris} triangles, {sum(len(a.data.bones) for a in arms)} bones, clips {[a.name for a in bpy.data.actions]}, {os.path.getsize(out) // 1024} KB')
