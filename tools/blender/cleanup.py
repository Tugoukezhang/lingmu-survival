# Takes a 3D model made elsewhere (AI image-to-3D such as Hunyuan3D / Tripo, or
# an artist) and makes it fit the game: one mesh, standing on the ground,
# 1 unit tall, facing the camera, not too heavy, textures not too big.
#   blender -b -P tools/blender/cleanup.py -- <input.glb|.obj|.fbx> <name> [--turn 180] [--tris 20000] [--tex 1024]
# → game/assets/models/<name>.glb   (the game picks it up under that name; see src/view3d/kit/pets.js)
import bpy, os, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, name = args[0], args[1]
opt = {'turn': 0.0, 'tris': 20000, 'tex': 1024}
for i, a in enumerate(args):
    if a.startswith('--') and a[2:] in opt:
        opt[a[2:]] = float(args[i + 1])

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=src)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=src)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=src)
else:
    raise SystemExit('unknown file type: ' + ext)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit('no mesh in ' + src)
# one object, transforms baked in
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = 'body'
for o in list(bpy.data.objects):
    if o is not obj:
        bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if opt['turn']:      # turn about the up axis so the face looks at -y (imported objects use quaternions, so the vertices are turned directly)
    ca, sa = math.cos(math.radians(opt['turn'])), math.sin(math.radians(opt['turn']))
    for v in obj.data.vertices:
        v.co = Vector((v.co.x * ca - v.co.y * sa, v.co.x * sa + v.co.y * ca, v.co.z))

# 1 unit tall, feet on z = 0, centred
pts = [v.co for v in obj.data.vertices]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
k = 1.0 / max(hi.z - lo.z, 1e-6)
cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
for v in obj.data.vertices:
    v.co = Vector(((v.co.x - cx) * k, (v.co.y - cy) * k, (v.co.z - lo.z) * k))

# lighter mesh if needed (phones)
tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
if tris > opt['tris']:
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = opt['tris'] / tris
    bpy.ops.object.modifier_apply(modifier='decimate')
for p in obj.data.polygons:
    p.use_smooth = True

# smaller textures
for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > opt['tex']:
        s = opt['tex'] / max(w, h)
        img.scale(max(1, int(w * s)), max(1, int(h * s)))

out = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game', 'assets', 'models', name + '.glb'))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=88)
after = sum(len(p.vertices) - 2 for p in obj.data.polygons)
print(f'cleaned {src} -> {out}: {tris} -> {after} triangles, {os.path.getsize(out) // 1024} KB')
