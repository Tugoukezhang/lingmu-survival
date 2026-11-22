# Front views of a pet (both ±Y, flat texture colours) for finding its eyes; prints the camera framing so pixel positions
# can be turned back into rays (tools/blender/eye_uv.py).
#   blender -b --factory-startup -P face_render.py -- <model.fbx> <out_dir>
import bpy, sys, os, json
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], os.path.abspath(argv[1])
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if arm: arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
pts = [m.matrix_world @ v.co for m in meshes for v in m.data.vertices]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (lo + hi) / 2; size = max(hi.x - lo.x, hi.z - lo.z) * 1.05
# flat colours: emission from the base texture
for m in meshes:
    for slot in m.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes: continue
        nt = mat.node_tree
        tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
        outn = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not tex or not outn: continue
        em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8; sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = 768
sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('w'); sc.world.color = (1, 1, 1)
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = size
cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
info = {}
for side, sgn in (('pos', 1), ('neg', -1)):
    cam.location = Vector((c.x, c.y + sgn * (hi.y - lo.y + 2), c.z))
    cam.rotation_euler = (1.5707963, 0, 3.14159265 if sgn > 0 else 0)
    sc.render.filepath = os.path.join(out, f'face_{side}.png')
    bpy.ops.render.render(write_still=True)
    info[side] = {'cam': list(cam.location), 'rot': list(cam.rotation_euler), 'size': size, 'res': 768}
json.dump({'centre': list(c), 'lo': list(lo), 'hi': list(hi), 'views': info}, open(os.path.join(out, 'face.json'), 'w'))
print('FACE', out, 'size', round(size, 3))
