# Orthographic front / side / top renders of a model, normalised to 1 unit tall on z = 0 and centred (CPU Cycles, works
# on PCs whose GPU can't run Blender's viewport renderer). tools/rig/grid.py lays a 0.1 grid over them.
# Optional skeleton (rig json) is drawn as thin red cylinders so bone placement can be checked.
#   blender -b -P tools/blender/ortho_views.py -- <model.glb|fbx> <out_prefix> [rig.json]
import bpy, sys, json, math, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
src, prefix = args[:2]
rig = json.load(open(args[2], encoding='utf-8')) if len(args) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
s = 1.0 / (hi.z - lo.z)
root = bpy.data.objects.new('norm', None); bpy.context.scene.collection.objects.link(root)
for o in bpy.data.objects:
    if o.parent is None and o is not root: o.parent = root
root.location = (-(lo.x + hi.x) / 2 * s, -(lo.y + hi.y) / 2 * s, -lo.z * s); root.scale = (s, s, s)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 6
sc.render.resolution_x = sc.render.resolution_y = 520
sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.17, 0.2, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.6
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.6, 0.2, -0.6); sc.collection.objects.link(sun)
if rig:
    mat = bpy.data.materials.new('bone'); mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 0.1, 0.1, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 4
    for b in rig['bones']:
        h = mathutils.Vector(b['head']); t = mathutils.Vector(b['tail']); d = t - h
        bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=max(d.length, 1e-3), location=(h + t) / 2)
        c = bpy.context.object; c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); c.data.materials.append(mat)
        c.show_in_front = True
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.3
for name, loc, rot in [('front', (0, -5, 0.5), (math.pi / 2, 0, 0)), ('side', (5, 0, 0.5), (math.pi / 2, 0, math.pi / 2)), ('top', (0, 0, 5), (0, 0, 0))]:
    cam.location = loc; cam.rotation_euler = rot
    sc.render.filepath = f'{prefix}_{name}.png'
    bpy.ops.render.render(write_still=True)
print('views', prefix, 'scale', s)
