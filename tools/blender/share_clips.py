# Gives a Tripo-rigged model (bind only, no clips) the idle / walk clips of another Tripo model with the same skeleton
# (Tripo biped: BoneRoot, Hip, Pelvis, L_Thigh …). Retargeting is done in world space relative to the rest poses:
# every frame, each target bone gets the rotation its source bone made away from rest (so differently rolled bones
# still move the same way); the hips also move, scaled to the target's hip height. Writes an FBX (one take per clip)
# with its texture in Textures/, and optional pose renders (CPU Cycles) for checking the skinning.
#   blender -b -P tools/blender/share_clips.py -- <target.fbx> <clips.glb> <out.fbx> [render_dir] [step]
import bpy, sys, os, mathutils
from mathutils import Matrix
args = sys.argv[sys.argv.index('--') + 1:]
target, clips_src, out = args[:3]
render_dir = args[3] if len(args) > 3 and args[3] != '-' else None
step = int(args[4]) if len(args) > 4 else 2
base = os.path.splitext(os.path.basename(out))[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=clips_src)
S = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
src_objs = set(bpy.data.objects)
src_images = set(bpy.data.images)
actions = [a for a in bpy.data.actions if 'Armature' in a.name and not a.name.startswith('Icosphere')]
for o in src_objs:
    if o.type == 'MESH': o.hide_render = True
bpy.ops.import_scene.fbx(filepath=target)
T = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o not in src_objs)
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o not in src_objs]
sc = bpy.context.scene

def rest_world(arm, name): return arm.matrix_world @ arm.data.bones[name].matrix_local
common = [b.name for b in T.data.bones if b.name in S.data.bones]
order = []   # parents before children
def walk(b):
    if b.name in common: order.append(b.name)
    for c in b.children: walk(c)
for b in T.data.bones:
    if b.parent is None: walk(b)
hip = 'Hip' if 'Hip' in common else common[0]
k = rest_world(T, hip).translation.z / max(rest_world(S, hip).translation.z, 1e-6)
S.animation_data_create(); T.animation_data_create()
for pb in T.pose.bones: pb.rotation_mode = 'QUATERNION'

new = []
for a in actions:
    short = a.name.split('|')[-1].replace('.001', '').replace('_Armature', '')
    S.animation_data.action = a
    act = bpy.data.actions.new(short); act.use_fake_user = True
    T.animation_data.action = act
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    frames = list(range(f0, f1 + 1, step))
    if frames[-1] != f1: frames.append(f1)
    for f in frames:
        sc.frame_set(f)
        for pb in T.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        for n in order:
            sw = S.matrix_world @ S.pose.bones[n].matrix
            delta = sw.to_quaternion() @ rest_world(S, n).to_quaternion().inverted()
            tw0 = rest_world(T, n)
            rot = delta @ tw0.to_quaternion()
            pb = T.pose.bones[n]
            cur = T.matrix_world @ pb.matrix
            pos = tw0.translation + (sw.translation - rest_world(S, n).translation) * k if n == hip else cur.translation
            pb.matrix = T.matrix_world.inverted() @ Matrix.LocRotScale(pos, rot, cur.to_scale())
            bpy.context.view_layer.update()
        for n in order:
            pb = T.pose.bones[n]
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if n == hip: pb.keyframe_insert('location', frame=f)
    new.append(act)
# drop the source model
for o in src_objs: bpy.data.objects.remove(o, do_unlink=True)
for a in actions: bpy.data.actions.remove(a)
for img in src_images: bpy.data.images.remove(img)

tex_dir = os.path.join(os.path.dirname(os.path.abspath(out)), 'Textures'); os.makedirs(tex_dir, exist_ok=True)
for i, img in enumerate([im for im in bpy.data.images if im.type == 'IMAGE']):
    path = os.path.join(tex_dir, f'{base}_{i}.jpg')
    img.filepath_raw = path; img.file_format = 'JPEG'; img.save()
    if img.packed_file: img.unpack(method='REMOVE')
    img.filepath = path

if render_dir:
    os.makedirs(render_dir, exist_ok=True)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8
    sc.render.resolution_x = sc.render.resolution_y = 320
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 2.4
    T.animation_data.action = None
    for pb in T.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    pts = [m.matrix_world @ mathutils.Vector(c) for m in meshes for c in m.bound_box]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    ctr = (lo + hi) / 2; size = max(hi - lo)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    def shot(name, view):
        off = {'side': mathutils.Vector((size * 2.0, 0, size * 0.25)), 'front': mathutils.Vector((size * 0.5, -size * 2.0, size * 0.35))}[view]
        cam.location = ctr + off; cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(render_dir, f'{base}_{name}.png'); bpy.ops.render.render(write_still=True)
    shot('rest_front', 'front')
    for act in new:
        T.animation_data.action = act
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        for j, (fr, view) in enumerate([(f0 + (f1 - f0) // 4, 'side'), (f0 + (f1 - f0) * 3 // 4, 'front')]):
            sc.frame_set(fr); shot(f'{act.name}_{j}', view)

T.animation_data.action = new[0] if new else None
bpy.ops.export_scene.fbx(filepath=out, path_mode='RELATIVE', embed_textures=False, add_leaf_bones=False,
                         bake_anim=True, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=True, bake_anim_force_startend_keying=True, apply_scale_options='FBX_SCALE_ALL')
print('shared', out, 'bones', len(order), 'clips', [a.name for a in new], 'hip scale', round(k, 3), 'textures', os.listdir(tex_dir))
