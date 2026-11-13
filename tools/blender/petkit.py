# Modelling helpers for the pets and people (docs/14): run inside Blender
# (blender -b -P tools/blender/build.py -- <name> …). Everything is built from
# rounded shapes in code, coloured per vertex, split into named parts
# (body, head, tail, earL …) so the game can animate them, and exported as GLB.
#
# Blender axes: x = right, -y = front (the face looks at -y), z = up.
# A finished model is about 1 unit tall and stands on z = 0.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler


def srgb(hexcol):
    """0xRRGGBB (as seen on screen) → linear RGBA tuple (what vertex colours store)."""
    out = []
    for sh in (16, 8, 0):
        c = ((hexcol >> sh) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def mixc(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


_mats = {}


def material(kind='paint', emit=0.0):
    """paint: vertex colours. glow: vertex colours that also shine (flames, stars)."""
    key = (kind, emit)
    if key in _mats and _mats[key].name in bpy.data.materials:
        return _mats[key]
    m = bpy.data.materials.new(kind)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.78
    col = nt.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Col'
    nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    if kind == 'glow':
        nt.links.new(col.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit or 1.5
    _mats[key] = m
    return m


def paint(obj, color):
    """color: RGBA tuple, or fn(Vector local position) → RGBA."""
    me = obj.data
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, v in enumerate(me.vertices):
        attr.data[i].color = color(v.co) if callable(color) else color
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    return obj


def _finish(obj, name, color, parent, mat):
    obj.name = name
    for p in obj.data.polygons:
        p.use_smooth = True
    paint(obj, color)
    obj.data.materials.append(mat or material())
    if parent is not None:
        obj.parent = parent
    return obj


def ball(name, at, radii, color, parent=None, rot=(0, 0, 0), detail=3, mat=None, shape=None):
    """Rounded blob: an icosphere stretched to radii (rx, ry, rz). shape: fn(Vector on the unit ball) → Vector, to push it out of round.
    The object's origin stays at `at` (the joint it turns around), relative to its parent."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=1)
    obj = bpy.context.active_object
    r = Vector(radii if hasattr(radii, '__len__') else (radii,) * 3)
    for v in obj.data.vertices:
        p = shape(v.co.copy()) if shape else v.co
        v.co = Vector((p.x * r.x, p.y * r.y, p.z * r.z))
    obj.location = at
    obj.rotation_euler = Euler(rot)
    return _finish(obj, name, color, parent, mat)


def limb(name, at, to, r0, r1, color, parent=None, mat=None, detail=2):
    """Capsule from the joint `at` toward `to` (both relative to the parent), radius r0 → r1. Origin at the joint."""
    d = Vector(to) - Vector(at)
    L = d.length
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail + 1, radius=1)
    obj = bpy.context.active_object
    for v in obj.data.vertices:
        t = 0.0 if v.co.z < 0 else 1.0            # lower half stays at the joint, upper half moves to the tip
        r = r0 + (r1 - r0) * t
        v.co = Vector((v.co.x * r, v.co.y * r, v.co.z * r + L * t))
    obj.location = at
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return _finish(obj, name, color, parent, mat)


def cone(name, at, r, h, color, parent=None, rot=(0, 0, 0), flat=1.0, mat=None, bend=0.0, segs=12):
    """Soft pointed shape standing on its origin (ears, spikes, tufts, flames). flat < 1 squashes it front to back; bend leans the tip toward +x."""
    bm = bmesh.new()
    rings = 7
    for j in range(rings + 1):
        t = j / rings
        rr = r * (math.cos(t * math.pi / 2) ** 0.8) * (1 - 0.15 * t)
        z = h * t
        for i in range(segs):
            a = i / segs * math.tau
            bm.verts.new((math.cos(a) * rr + bend * t * t, math.sin(a) * rr * flat, z))
    bm.verts.ensure_lookup_table()
    for j in range(rings):
        for i in range(segs):
            a, b = j * segs + i, j * segs + (i + 1) % segs
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[b + segs], bm.verts[a + segs]))
    bm.faces.new([bm.verts[i] for i in reversed(range(segs))])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = Euler(rot)
    return _finish(obj, name, color, parent, mat)


def tube(name, at, pts, radii, color, parent=None, mat=None, segs=12, flat=1.0, steps=5):
    """Smooth tapering tube through pts (relative to the origin `at`), e.g. a tail, a scarf end, a hat tip.
    radii: one per point. color: RGBA, or fn(t along the tube 0…1, around -1…1 where 0 = the side facing -y) → RGBA."""
    P = [Vector(p) for p in pts]
    def cr(i, t):                                     # Catmull-Rom through the points
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[min(i + 1, len(P) - 1)], P[min(i + 2, len(P) - 1)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
    path, rad = [], []
    for i in range(len(P) - 1):
        for k in range(steps):
            t = k / steps
            path.append(cr(i, t)); rad.append(radii[i] + (radii[i + 1] - radii[i]) * (t * t * (3 - 2 * t)))
    path.append(P[-1]); rad.append(radii[-1])
    bm = bmesh.new()
    cols = []
    side = Vector((1, 0, 0))
    n = len(path)
    for j in range(n):
        tan = (path[min(j + 1, n - 1)] - path[max(j - 1, 0)]).normalized()
        side = (side - tan * side.dot(tan)).normalized()       # carry the frame along the curve (no twisting)
        up = tan.cross(side)
        for i in range(segs):
            a = i / segs * math.tau
            bm.verts.new(path[j] + (side * math.cos(a) + up * math.sin(a) * flat) * rad[j])
            cols.append((j / (n - 1), math.sin(a)))
    bm.verts.ensure_lookup_table()
    for j in range(n - 1):
        for i in range(segs):
            a, b = j * segs + i, j * segs + (i + 1) % segs
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[b + segs], bm.verts[a + segs]))
    bm.faces.new([bm.verts[i] for i in reversed(range(segs))])
    bm.faces.new([bm.verts[(n - 1) * segs + i] for i in range(segs)])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    _finish(obj, name, (1, 1, 1, 1), parent, mat)
    if callable(color):
        attr = me.color_attributes['Col']
        for i, (t, around) in enumerate(cols):
            attr.data[i].color = color(t, around)
    else:
        paint(obj, color)
    return obj


def torus(name, at, R, r, color, parent=None, rot=(0, 0, 0), mat=None, squash=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=24, minor_segments=8)
    obj = bpy.context.active_object
    for v in obj.data.vertices:
        v.co = Vector((v.co.x * squash[0], v.co.y * squash[1], v.co.z * squash[2]))
    obj.location = at
    obj.rotation_euler = Euler(rot)
    return _finish(obj, name, color, parent, mat)


def box(name, at, size, color, parent=None, rot=(0, 0, 0), mat=None, bevel=0.25):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = min(size) * bevel
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier='bevel')
    obj.location = at
    obj.rotation_euler = Euler(rot)
    return _finish(obj, name, color, parent, mat)


def empty(name, at=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = at
    if parent is not None:
        e.parent = parent
    return e


# ---------- face ----------
def eye_image(name, iris, size=128):
    """Anime eye drawn into a texture: dark rim, iris lighter toward the bottom, pupil, two highlights."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = (x / (size - 1) - 0.5) * 2, (y / (size - 1) - 0.5) * 2          # v = +1 at the top (image rows go bottom-up in Blender)
    d = np.sqrt(u * u + v * v)
    ir = np.array(srgb(iris)[:3], np.float32)
    dark = ir * 0.22
    t = np.clip((v + 1) / 2, 0, 1)[..., None]                               # 0 bottom … 1 top
    col = ir * 1.25 * (1 - t) + dark * 1.6 * t                              # bright bottom → dark top
    col = np.clip(col, 0, 1)
    pupil = (np.sqrt(u * u + (v - 0.05) ** 2) < 0.38)[..., None]
    col = np.where(pupil, dark * 0.5, col)
    glint = (np.sqrt((u * 0.9) ** 2 + ((v + 0.52) * 1.5) ** 2) < 0.3)[..., None]        # soft light at the bottom of the iris
    col = np.where(glint, np.clip(col + 0.35, 0, 1), col)
    rim = (d > 0.84)[..., None]
    col = np.where(rim, np.array(srgb(0x3a2620)[:3], np.float32), col)
    for cx, cy, r in ((-0.34, 0.42, 0.24), (0.36, -0.2, 0.11)):               # white highlights
        hl = (np.sqrt((u - cx) ** 2 + (v - cy) ** 2) < r)[..., None]
        col = np.where(hl, 1.0, col)
    rgba = np.concatenate([col, np.ones((size, size, 1), np.float32)], axis=2)
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def eye_material(name, iris):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.35
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = eye_image(name, iris)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def eyes(head, x, y, z, rx, rz, iris, tilt=0.0, name='eye'):
    """Two eyes on the front of the head (mirrored). Domed discs, textured, slightly sunk into the face."""
    mat = eye_material(name + '_mat', iris)
    out = []
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1)
        obj = bpy.context.active_object
        me = obj.data
        uv = me.uv_layers.active or me.uv_layers.new()
        for loop in me.loops:
            co = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = (co.x * 0.5 + 0.5, co.z * 0.5 + 0.5)      # looked at from the front
        for v2 in me.vertices:
            v2.co = Vector((v2.co.x * rx, v2.co.y * rx * 0.32, v2.co.z * rz))
        obj.name = f'{name}{"L" if s < 0 else "R"}'
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(mat)
        obj.location = (s * x, y, z)
        obj.rotation_euler = Euler((0, s * tilt, s * 0.32 * (x / max(abs(y), 1e-3))))          # follow the curve of the face
        obj.parent = head
        out.append(obj)
    return out


def face(head, y, z, nose=0x4a2f28, mouth=0xe86a6a, blush=0xffb0a8, w=0.06, open_mouth=True):
    """Nose, little open mouth and blush marks; y = how far forward the face surface is at height z."""
    ball('nose', (0, y - 0.014, z + w * 0.1), (w * 0.3, w * 0.2, w * 0.2), srgb(nose), head, detail=2)
    if open_mouth:
        ball('mouth', (0, y + 0.002, z - w * 0.66), (w * 0.62, w * 0.2, w * 0.5), srgb(mouth), head, detail=2)
        ball('tongue', (0, y - 0.008, z - w * 0.9), (w * 0.36, w * 0.12, w * 0.22), srgb(0xffa6a6), head, detail=2)
    for s in (-1, 1):
        ball('blush', (s * w * 2.6, y + w * 0.75, z - w * 0.2), (w * 0.62, w * 0.14, w * 0.36), srgb(blush), head, rot=(0, 0, s * 0.5), detail=2)


# ---------- finishing ----------
def export(root, path):
    """Join nothing: every named part stays its own node. Writes a GLB with vertex colours, +Y up."""
    bpy.ops.object.select_all(action='DESELECT')
    stack = [root]
    while stack:
        o = stack.pop()
        o.select_set(True)
        stack.extend(o.children)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_animations=False,
                              export_materials='EXPORT', export_image_format='AUTO')
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print(f'exported {path}  ({tris} faces before triangulation)')
