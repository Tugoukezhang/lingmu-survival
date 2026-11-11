#!/usr/bin/env python3
"""Read-only transparency-edge and visual contact-sheet audit."""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import json

ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/incoming'
OUT=Path('edge-qa'); OUT.mkdir(exist_ok=True)
specs=json.loads((ROOT/'art/qa/manifest.json').read_text(encoding='utf-8'))['items']
items=[]
for spec in specs:
    path=ART/spec['filename']
    with Image.open(path) as src:
        im=src.convert('RGBA')
        a=np.asarray(im.getchannel('A'),dtype=np.uint8)
        h,w=a.shape
        border=np.zeros((h,w),dtype=bool)
        border[0,:]=1; border[-1,:]=1; border[:,0]=1; border[:,-1]=1
        outer8=np.zeros((h,w),dtype=bool)
        outer8[:8,:]=1; outer8[-8:,:]=1; outer8[:,:8]=1; outer8[:,-8:]=1
        counts={str(k):int(np.sum(a[border]>=k)) for k in (1,8,32,128,224)}
        b128=Image.fromarray(np.where(a>=128,255,0).astype('uint8')).getbbox()
        b8=Image.fromarray(np.where(a>=8,255,0).astype('uint8')).getbbox()
        items.append({'number':spec['number'],'file':path.name,'width':w,'height':h,
            'on_exact_border':counts,'outer8_128':int(np.sum(a[outer8]>=128)),
            'bbox_alpha8':b8,'bbox_alpha128':b128,
            'corner_alpha':[int(a[0,0]),int(a[0,-1]),int(a[-1,0]),int(a[-1,-1])]})

flags=[it for it in items if it['on_exact_border']['1']]
cols=5; cell_w=218;cell_h=248
rows=(len(flags)+cols-1)//cols
sheet=Image.new('RGB',(cols*cell_w,rows*cell_h),'#f8f8f8')
d=ImageDraw.Draw(sheet)
for j,it in enumerate(flags):
    im=Image.open(ART/it['file']).convert('RGBA')
    im.thumbnail((202,205),Image.Resampling.LANCZOS)
    bg=Image.new('RGBA',(202,205),(238,240,245,255))
    ck=ImageDraw.Draw(bg)
    for y in range(0,205,18):
        for x in range(0,202,18):
            if ((x//18)+(y//18))%2==0:ck.rectangle((x,y,x+17,y+17),fill=(251,251,251,255))
    bg.alpha_composite(im,((202-im.width)//2,(205-im.height)//2))
    ix=(j%cols)*cell_w+8;iy=(j//cols)*cell_h+5
    sheet.paste(bg.convert('RGB'),(ix,iy))
    red=it['on_exact_border']['128'];total=it['on_exact_border']['1']
    d.text((ix+1,iy+206),it['file'][:31],fill='#333333')
    d.text((ix+1,iy+221),f'edge alpha>0: {total}; >=128: {red}',fill='#c30020' if red else '#298051')
sheet.save(OUT/'edge_contact_sheet.jpg',quality=87)
(OUT/'edge_report.json').write_text(json.dumps({'files_checked':len(items),'flags':flags,'all':items},ensure_ascii=False,indent=2)+'\n')
print('Files',len(items),'border flags:',len(flags),'high-alpha border:',sum(bool(x['on_exact_border']['128']) for x in flags))
for z in flags:print(z['file'],z['on_exact_border'],z['outer8_128'])
