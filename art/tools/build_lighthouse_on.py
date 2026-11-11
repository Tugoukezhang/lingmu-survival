#!/usr/bin/env python3
"""Build #96 as a strictly identity-preserving light-on edit of #95.
Only the lantern chamber and nearby glow change. Never redraw the lighthouse.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

root=Path(__file__).resolve().parents[2]
src=root/"art/incoming/prop_lighthouse_dune_off.png"
dst=root/"art/incoming/prop_lighthouse_dune_on.png"
assert src.exists(), "Need actual #95 PNG as source, no placeholder is permitted"
im=Image.open(src).convert("RGBA")
assert im.size == (1024,1536), (im.size,src)
a=np.asarray(im.getchannel("A"))
assert np.count_nonzero(a)==0 is False or np.count_nonzero(a)>15000
# Locate the silhouette and its vertical crest, so light stays at the real lantern.
box=im.getchannel("A").point(lambda x:255 if x>=100 else 0).getbbox()
assert box is not None and box[2]-box[0]>250 and box[3]-box[1]>520,box
cx=(box[0]+box[2])//2
tall=box[3]-box[1]
# The rounded lighthouse top and lamp room occupy the top 12-31% of its sprite.
cy=int(box[1]+tall*0.205)
# Alpha-weighted, yellow-white glints rendered inside lamp chamber only.
base=im.copy()
rad=int(min(box[2]-box[0],tall)*.22)
rad=max(55,min(119,rad))
# Constrain glow in the lantern: do not tint the blue-white ceramic tower body.
window=Image.new("L",im.size,0)
md=ImageDraw.Draw(window)
md.ellipse((cx-rad,cy-rad*.55,cx+rad,cy+rad*.52),fill=208)
window=window.filter(ImageFilter.GaussianBlur(14))
# Mask highlights to original opaque pixels; preserve the silhouette.
p=np.asarray(window,dtype=np.uint8).astype(float)
p=(p*(np.asarray(im.getchannel("A"),dtype=np.uint8)/255)).clip(0,255).astype("uint8")
high=Image.new("RGBA",im.size,(255,210,95,0));high.putalpha(Image.fromarray(p,"L"))
base=Image.alpha_composite(base,high)
# Halo outside room, modest golden warmth; cannot alter stone geometry.
h=Image.new("L",im.size,0); hd=ImageDraw.Draw(h)
hd.ellipse((cx-rad*1.45,cy-rad*1.55,cx+rad*1.45,cy+rad*1.55),fill=135)
h=h.filter(ImageFilter.GaussianBlur(rad*.73))
halo=Image.new("RGBA",im.size,(255,191,58,0));halo.putalpha(h)
base=Image.alpha_composite(halo,base)
# central warm lantern core, diffuse to avoid looking like a pasted yellow circle
core=Image.new("L",im.size,0); d=ImageDraw.Draw(core)
d.ellipse((cx-rad*.35,cy-rad*.38,cx+rad*.35,cy+rad*.36),fill=128)
core=core.filter(ImageFilter.GaussianBlur(rad*.38))
q=np.asarray(core,dtype=np.uint8).astype(float)
q=(q*(np.asarray(im.getchannel("A"),dtype=np.uint8)/255)).clip(0,255).astype("uint8")
lit=Image.new("RGBA",im.size,(255,251,177,0));lit.putalpha(Image.fromarray(q,"L"))
base=Image.alpha_composite(base,lit)
assert base.size == im.size
assert np.count_nonzero(np.asarray(base)!=np.asarray(im))>1000, "No visible changes"
base.save(dst,"PNG",optimize=True)
ch=Image.open(dst)
assert ch.mode=="RGBA" and ch.size==(1024,1536)
print("Built",dst,"bytes",dst.stat().st_size,"source bbox",box,"light center",(cx,cy),"radius",rad)
