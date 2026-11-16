# Writes a model's vertices (normalised: 1 unit tall, standing on z = 0, centred on x / y) with their texture colour,
# so tools/rig/views.py can draw front / side / top views for placing a skeleton.
#   blender -b -P tools/blender/dump_points.py -- <model.glb> <out.npz>
import bpy, sys, numpy as np
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
pts, cols = [], []
for o in meshes:
    me = o.data
    mw = o.matrix_world
    img = None
    for slot in o.material_slots:
        if slot.material and slot.material.use_nodes:
            for n in slot.material.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image: img = n.image; break
        if img: break
    px = np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4) if img else None
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    vuv = {}
    if uv:
        for poly in me.polygons:
            for li in poly.loop_indices:
                vuv[me.loops[li].vertex_index] = uv[li].uv
    for v in me.vertices:
        p = mw @ v.co
        pts.append((p.x, p.y, p.z))
        if px is not None and v.index in vuv:
            u, w = vuv[v.index]
            x = min(px.shape[1] - 1, max(0, int(u * px.shape[1]))); y = min(px.shape[0] - 1, max(0, int(w * px.shape[0])))
            cols.append(px[y, x, :3])
        else:
            cols.append((0.7, 0.7, 0.7))
P = np.array(pts); C = np.array(cols)
lo, hi = P.min(0), P.max(0)
s = 1.0 / (hi[2] - lo[2])
P = (P - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])) * s
np.savez(out, p=P, c=C, scale=s, offset=np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]))
print('dumped', out, len(P), 'verts, height', 1 / s)
