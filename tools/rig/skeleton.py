# Shared chibi-pet skeleton. Landmarks (tools/rig/<pet>.json) are points on the normalised model — 1 unit tall,
# standing on z = 0, centred on x / y, facing +X, +Y = the pet's left — read off the orthographic views
# (tools/blender/ortho_views.py + tools/rig/grid.py, checked with tools/rig/overlay.py).
# joints() nudges limb joints to the middle of the nearby mesh; bones() turns joints into the bone list.
# Used by tools/blender/rig_pet.py (builds the armature) and tools/rig/overlay.py (draws it on the views).
#
# Landmark keys (all optional except hips / chest / neck / head_top):
#   hips chest neck head_top
#   ear_l ear_l_mid ear_l_tip   (and _r)          2 bones per ear; mid defaults to halfway
#   shoulder_l elbow_l hand_l   (and _r)          arm
#   hip_l knee_l foot_l toe_l   (and _r)          leg
#   tail_0 tail_1 tail_2 tail_tip                 up to 3 tail bones
# Extra swaying chains (ribbons, cap tips, fins): "chains": {"Cap": {"parent": "Head", "points": [[..], [..], ..]}}
import numpy as np

LIMB = ('elbow', 'hand', 'knee', 'foot')

def joints(LM, P):
    """Landmark points → joints. P: the model's vertices in the same normalised frame (N × 3)."""
    r, k = LM.get('snap', 0.06), LM.get('snap_amount', 0.6)
    extra, never = set(LM.get('snap_points', [])), set(LM.get('nosnap', []))
    J = {}
    for key, v in LM['points'].items():
        p = np.array(v, float)
        snap = key in extra or (key not in never and (key.rsplit('_', 1)[0] in LIMB or key in ('tail_1', 'tail_2') or key.endswith('_mid')))
        if snap:
            near = P[np.linalg.norm(P - p, axis=1) < r]
            if len(near) >= 12: p = p + (near.mean(0) - p) * k
        J[key] = p
    return J

def bones(J, LM=None):
    """Joints → [dict(name, head, tail, parent, connect, deform)], parents before children."""
    B = []
    def add(name, h, t, parent=None, connect=False, deform=True):
        h, t = np.asarray(h, float), np.asarray(t, float)
        if np.linalg.norm(t - h) < 0.01: t = h + np.array([0, 0, 0.03])
        B.append(dict(name=name, head=h, tail=t, parent=parent, connect=connect, deform=deform))
    hips, chest, neck = J['hips'], J['chest'], J['neck']
    mid = hips + (chest - hips) * 0.4
    add('Root', [hips[0], hips[1], 0], [hips[0], hips[1], 0.08], deform=False)
    add('Hips', hips, mid, 'Root')
    add('Spine', mid, chest, 'Hips', True)
    add('Chest', chest, neck, 'Spine', True)
    add('Head', neck, J['head_top'], 'Chest', True)
    for s in 'lr':
        S = s.upper()
        if f'ear_{s}' in J:
            b0, t = J[f'ear_{s}'], J[f'ear_{s}_tip']
            m = J.get(f'ear_{s}_mid', (b0 + t) / 2)
            add(f'Ear1.{S}', b0, m, 'Head'); add(f'Ear2.{S}', m, t, f'Ear1.{S}', True)
        if f'shoulder_{s}' in J:
            add(f'UpperArm.{S}', J[f'shoulder_{s}'], J[f'elbow_{s}'], 'Chest')
            add(f'LowerArm.{S}', J[f'elbow_{s}'], J[f'hand_{s}'], f'UpperArm.{S}', True)
        if f'hip_{s}' in J:
            add(f'Thigh.{S}', J[f'hip_{s}'], J[f'knee_{s}'], 'Hips')
            add(f'Shin.{S}', J[f'knee_{s}'], J[f'foot_{s}'], f'Thigh.{S}', True)
            add(f'Foot.{S}', J[f'foot_{s}'], J[f'toe_{s}'], f'Shin.{S}', True)
    tail = [J[k] for k in ('tail_0', 'tail_1', 'tail_2', 'tail_tip') if k in J]
    for i in range(len(tail) - 1):
        add(f'Tail{i + 1}', tail[i], tail[i + 1], 'Hips' if i == 0 else f'Tail{i}', i > 0)
    for name, ch in ((LM or {}).get('chains') or {}).items():
        pts = [np.array(p, float) for p in ch['points']]
        for i in range(len(pts) - 1):
            add(f'{name}{i + 1}', pts[i], pts[i + 1], ch.get('parent', 'Head') if i == 0 else f'{name}{i}', i > 0)
    return B
