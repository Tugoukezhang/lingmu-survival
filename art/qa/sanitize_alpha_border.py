#!/usr/bin/env python3
"""Remove ONLY near-invisible alpha leftovers on the outermost pixel border.

Never resizes, crops, recomposes, redraws, recolors, or edits inner pixels.
Abort before any writes if a non-tile asset has meaningful border opacity.
"""
import json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/incoming'
OUT=Path('alpha-edge-fix')
OUT.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'art/qa/manifest.json').read_text(encoding='utf8'))['items']
pending=[]
checks=[]
for item in manifest:
    name=item['filename']
    if name.startswith(('tile_','title_')):
        continue
    p=ART/name
    original=p.read_bytes()
    im=Image.open(p).convert('RGBA')
    arr=np.asarray(im.getchannel('A'),dtype=np.uint8)
    h,w=arr.shape
    outer=np.zeros((h,w),dtype=bool)
    outer[0,:]=1;outer[-1,:]=1;outer[:,0]=1;outer[:,-1]=1
    edgevals=arr[outer]
    bad=int(np.count_nonzero(edgevals))
    if bad==0: continue
    maximum=int(edgevals.max())
    # A high-alpha sprite at the edge could be clipped. Don't silently damage it.
    if maximum>7:
        raise RuntimeError(f'Stopping: {name} has meaningful outer-border alpha {maximum}')
    near=np.zeros((h,w),dtype=bool)
    near[:8,:]=1;near[-8:,:]=1;near[:,:8]=1;near[:,-8:]=1
    if int((arr[near]>=128).sum())>0:
        raise RuntimeError(f'Stopping: {name} has a visible shape within eight pixels of the border')
    fixed=arr.copy();fixed[outer]=0
    assert np.array_equal(arr[~outer],fixed[~outer]),name
    assert int((fixed[outer]>0).sum())==0
    pending.append((p,im,fixed,original,name,bad,maximum))
    checks.append({'name':name,'border_pixels_cleared':bad,'max_original_alpha':maximum,
                   'original_sha256':hashlib.sha256(original).hexdigest()})
assert len(pending)>=20, "Unexpected fringe detection count; inspect before publishing"
for p,im,fixed,old,name,bad,maximum in pending:
    im.putalpha(Image.fromarray(fixed,'L'))
    im.save(p,'PNG',optimize=True)
    with Image.open(p) as after:
        assert after.size==im.size and after.mode=='RGBA'
        rgba=np.asarray(after)
        assert not np.any(rgba[:,:,3][0,:]) and not np.any(rgba[:,:,3][-1,:])
        assert not np.any(rgba[:,:,3][:,0]) and not np.any(rgba[:,:,3][:,-1])
    checks[[x['name'] for x in checks].index(name)]['fixed_sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
(OUT/'report.json').write_text(json.dumps({'fixed_count':len(checks),'assets':checks,
 'statement':'Only alpha in the outermost pixel boundary, of original values 1..7, was set to zero. Body pixels and pixel geometry were preserved.'},
 ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Cleaned low-alpha outermost fringe on',len(checks),'PNG assets; meaningful silhouettes untouched.')
