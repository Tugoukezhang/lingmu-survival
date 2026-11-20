# Sharpen a model's texture with an image model, view by view:
#   render   unlit colour pictures of the model from several sides (orthographic, 1024 px) + views.json
#   project  paint enhanced versions of those pictures back onto the model's own UV texture: each view is projected
#            from its camera, weighted by how squarely the surface faces it (a light along the view, so hidden parts
#            get nothing), and the views are blended; where no view sees the surface the old texture stays.
#   blender -b -P tools/blender/texture_views.py -- render  <model.glb|fbx> <out_dir>
#   blender -b -P tools/blender/texture_views.py -- project <model.glb|fbx> <dir with views.json + *_new.png> <unused> [size]
#   then: python tools/ai/compose.py <dir> <out.jpg>   (blends the baked views over the old texture)
# The model is normalised as in rig_pet.py (1 unit tall, standing on z = 0, centred, facing +X).
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
mode, src, folder = args[:3]
VIEWS = [('front', 0, 8), ('front_left', 45, 10), ('left', 90, 6), ('back_left', 135, 8), ('back', 180, 8),
         ('back_right', 225, 8), ('right', 270, 6), ('front_right', 315, 10), ('top', 0, 60)]   # name, angle round from +X, height (deg)
SIZE, ORTHO = 1024, 1.12

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
if src.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
for o in list(bpy.data.objects):
    if o is not body: bpy.data.objects.remove(o, do_unlink=True)
body.parent = None
body.data.transform(body.matrix_world); body.matrix_world = Matrix.Identity(4)
body.modifiers.clear()
co = np.array([v.co[:] for v in body.data.vertices]); lo, hi = co.min(0), co.max(0); s = 1.0 / (hi[2] - lo[2])
body.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))))
body.data.update()

# the model's colour texture (first image found in its materials)
tex = None
for m in body.data.materials:
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image: tex = n.image; break
    if tex: break
uv_main = body.data.uv_layers.active.name

def camera(name, angle, height):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name)); sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ORTHO
    a, h = math.radians(angle), math.radians(height)
    d = Vector((math.cos(a) * math.cos(h), math.sin(a) * math.cos(h), math.sin(h)))
    cam.location = Vector((0, 0, 0.5)) + d * 5
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()                              # matrix_world is only right after an update
    return cam, d

sc.render.resolution_x = sc.render.resolution_y = SIZE

if mode == 'render':
    os.makedirs(folder, exist_ok=True)
    mat = bpy.data.materials.new('flat'); mat.use_nodes = True; nt = mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = tex
    nt.links.new(ti.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    body.data.materials.clear(); body.data.materials.append(mat)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16      # GPU rendering crashes on this PC
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.5, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1
    info = []
    for name, angle, height in VIEWS:
        cam, d = camera(name, angle, height); sc.camera = cam
        sc.render.filepath = os.path.join(folder, f'{name}.png'); bpy.ops.render.render(write_still=True)
        info.append({'name': name, 'angle': angle, 'height': height})
    json.dump({'views': info, 'size': SIZE, 'ortho': ORTHO}, open(os.path.join(folder, 'views.json'), 'w'), indent=1)
    print('VIEWS rendered', len(info), 'engine', sc.render.engine)

elif mode == 'project':
    out_path = args[3]; tsize = int(args[4]) if len(args) > 4 else tex.size[0]
    info = json.load(open(os.path.join(folder, 'views.json')))
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    sc.render.bake.margin = 8
    tex.reload()
    orig = np.array(tex.pixels[:]).reshape(tex.size[1], tex.size[0], 4)[..., :3]
    if tex.size[0] != tsize:                                     # nearest resample (Blender's Python has no PIL)
        idx = (np.arange(tsize) * tex.size[0] // tsize)
        orig = orig[idx][:, idx]
    np.savez_compressed(os.path.join(folder, 'bake_orig.npz'), c=(np.clip(orig, 0, 1) * 255).astype(np.uint8))
    target = bpy.data.images.new('bake', tsize, tsize, float_buffer=True)
    mat = bpy.data.materials.new('proj'); mat.use_nodes = True; nt = mat.node_tree
    body.data.materials.clear(); body.data.materials.append(mat)
    for v in info['views']:
        img_path = os.path.join(folder, f"{v['name']}_new.png")
        if not os.path.exists(img_path): continue
        cam, d = camera(v['name'], v['angle'], v['height'])
        # projected UVs for this camera
        uvp = body.data.uv_layers.new(name='proj')
        cm = cam.matrix_world.inverted()
        loops = body.data.loops; verts = body.data.vertices
        for li, l in enumerate(loops):
            p = cm @ verts[l.vertex_index].co
            uvp.data[li].uv = (p.x / ORTHO + 0.5, p.y / ORTHO + 0.5)
        for n in list(nt.nodes): nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); ti = nt.nodes.new('ShaderNodeTexImage')
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'proj'
        ti.image = bpy.data.images.load(img_path); ti.extension = 'CLIP'
        nt.links.new(uvn.outputs['UV'], ti.inputs['Vector']); nt.links.new(ti.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        tgt = nt.nodes.new('ShaderNodeTexImage'); tgt.image = target; nt.nodes.active = tgt
        body.data.uv_layers.active = body.data.uv_layers[uv_main]
        for o in bpy.data.objects: o.select_set(o is body)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.bake(type='EMIT', use_clear=True)
        col = np.array(target.pixels[:]).reshape(tsize, tsize, 4)[..., :3].copy()
        col = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, None), 1 / 2.4) - 0.055)   # baked linear → sRGB like the texture
        # weight: a sun along the view, diffuse direct only — facing the camera and not hidden behind another part
        for n in list(nt.nodes):
            if n not in (out, tgt): nt.nodes.remove(n)
        bsdf = nt.nodes.new('ShaderNodeBsdfDiffuse'); bsdf.inputs['Color'].default_value = (1, 1, 1, 1)
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface']); nt.nodes.active = tgt
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
        sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); sun.data.energy = 1.0; sun.data.angle = 0.0
        sc.world = None
        sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = False
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT'}, use_clear=True)
        w = np.array(target.pixels[:]).reshape(tsize, tsize, 4)[..., 0].copy()
        w = np.clip(w / max(w.max(), 1e-6), 0, 1)
        # each view's colour and facing weight are kept, so tools/ai/compose.py can blend them without baking again
        np.savez_compressed(os.path.join(folder, f"bake_{v['name']}.npz"), c=(np.clip(col, 0, 1) * 255).astype(np.uint8), w=(w * 255).astype(np.uint8))
        cover = float((w > 0.3).mean())
        bpy.data.objects.remove(sun, do_unlink=True); bpy.data.objects.remove(cam, do_unlink=True)
        body.data.uv_layers.remove(body.data.uv_layers['proj'])
        print('VIEW baked', v['name'], 'facing', round(cover, 3))
    print('BAKED views into', folder, '(blend them with tools/ai/compose.py)')
