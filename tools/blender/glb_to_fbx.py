# GLB (with skeleton and animations) → FBX for Unity. The GLB's packed textures are saved as files in a Textures
# folder next to the FBX (that is where Unity looks for them, and where the 1024 size cap applies).
#   blender -b -P tools/blender/glb_to_fbx.py -- <in.glb> <out.fbx>
import bpy, sys, os
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
tex_dir = os.path.join(os.path.dirname(os.path.abspath(out)), 'Textures')
os.makedirs(tex_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
base = os.path.splitext(os.path.basename(out))[0]
for i, img in enumerate(bpy.data.images):
    if img.type != 'IMAGE' or not img.has_data and not img.packed_file:
        continue
    path = os.path.join(tex_dir, f'{base}_{i}.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    if img.packed_file:
        img.unpack(method='REMOVE')
    img.filepath = path
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
# keep every clip as its own take: put each action on an NLA track of the armature
if arms:
    a = arms[0]
    a.animation_data_create()
    for act in bpy.data.actions:
        if not any(t.name == act.name for t in a.animation_data.nla_tracks):
            tr = a.animation_data.nla_tracks.new(); tr.name = act.name
            tr.strips.new(act.name, int(act.frame_range[0]), act)
    a.animation_data.action = None
bpy.ops.export_scene.fbx(filepath=out, path_mode='RELATIVE', embed_textures=False, add_leaf_bones=False,
                         bake_anim=True, bake_anim_use_nla_strips=True, bake_anim_use_all_actions=False, apply_scale_options='FBX_SCALE_ALL')
print('fbx written', out, 'bones', sum(len(x.data.bones) for x in arms), 'clips', [x.name for x in bpy.data.actions], 'textures', os.listdir(tex_dir))
