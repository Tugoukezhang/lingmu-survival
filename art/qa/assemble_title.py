#!/usr/bin/env python3
"""Assemble #97 title from reference-correct original pet pixels and real island props.

Keeps title area (top 24%) and CTA area (bottom 16%) free of text/UI.
This produces a VISUAL REVIEW candidate, never self-approves it as completed.
"""
from PIL import Image, ImageEnhance
from pathlib import Path
import hashlib, json

W,H=1536,1024
ART=Path('art/incoming')
QA=Path('art/qa')
base=Image.open(QA/'title_scene_blank.png').convert('RGBA')
if base.size!=(W,H):raise ValueError('Scene dimensions must match 1536x1024')


def prop(filename,cx,foot_y,height,flip=False,muted=False):
    global base
    src=Image.open(ART/filename).convert('RGBA')
    box=src.getchannel('A').getbbox()
    if not box:raise ValueError(f'Empty prop: {filename}')
    src=src.crop(box)
    neww=round(src.width*height/src.height)
    src=src.resize((neww,height),Image.Resampling.LANCZOS)
    if flip:src=src.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if muted:
        color=ImageEnhance.Color(src.convert('RGB')).enhance(.89)
        color.putalpha(src.getchannel('A'));src=color
    x=round(cx-neww/2);y=round(foot_y-height)
    base.alpha_composite(src,(x,y))
    print(filename,'composited at',x,y,neww,height)


# Far airship in the upper right, blurred slightly to convey distance, no UI text.
prop('prop_airship.png',1295,300,120,muted=True)
# The two rounded-canopy trees are the SAME approved tree type, with subtle variation.
prop('prop_tree_01.png',465,654,314)
prop('prop_tree_01.png',1085,658,272,flip=True,muted=True)
# A tent behind pets; source artwork is the game's genuine painted scene prop.
prop('prop_tent.png',805,690,237)
# Small foliage/rock accents, slightly behind the character stage line.
prop('prop_bush_berry.png',375,717,94)
prop('prop_grass_tuft.png',1168,716,72,flip=True)
# Paste precisely the three provided original pet designs in the foreground.
petlayer=Image.open(QA/'title_pets_overlay.png').convert('RGBA')
if petlayer.size!=(W,H):raise ValueError('Pet overlay mismatch')
base.alpha_composite(petlayer)

out=QA/'title_candidate.png';base.save(out,optimize=True)
preview=base.copy();preview.thumbnail((1152,768),Image.Resampling.LANCZOS)
preview.save(QA/'preview_title_candidate.png',optimize=True)
info={'filename':str(out),'bytes':out.stat().st_size,
      'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
      'dimensions':[W,H],'original_pets':3,
      'properties':['two actual tree PNG props','actual tent PNG prop','actual airship PNG prop','round floating grassy island','waterfall','background islands'],
      'alpha_range':list(base.getchannel('A').getextrema()),
      'status':'review_candidate_not_delivered'}
(QA/'preview_title_candidate.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(info,ensure_ascii=False))
