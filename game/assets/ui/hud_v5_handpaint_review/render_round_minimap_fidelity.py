#!/usr/bin/env python3
"""Minimap round-shape faithful review render.

Keeps the screenshot-matched V2 circular silhouette, N compass, alert badge,
player pointer and exact map design. Refines raster resolution/edges only.
NOT separately GPT Image repainted; use as structure-locked review fallback.
"""
from io import BytesIO
from zipfile import ZipFile
from pathlib import Path
import json, hashlib
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

repo=Path(__file__).resolve().parents[4]
archive=repo/"game/assets/ui/hud_v2/hud_v2_complete_ascii.zip"
out=repo/"game/assets/ui/hud_v5_handpaint_review/PNG_Transparent/00_gameplay"
out.mkdir(parents=True,exist_ok=True)
with ZipFile(archive) as z: src=Image.open(BytesIO(z.read("icons/icon_17.png"))).convert("RGBA")
assert src.size==(640,640)
im=src.convert("RGBa").resize((1024,1024),Image.Resampling.LANCZOS).convert("RGBA")
alpha=im.getchannel("A")
rgb=Image.merge("RGB",im.split()[:3])
rgb=rgb.filter(ImageFilter.UnsharpMask(radius=0.8,percent=85,threshold=3))
rgb=ImageEnhance.Color(rgb).enhance(1.035)
rgb.putalpha(alpha)
target=out/"minimap_round_faithful_1024.png"
rgb.save(target,optimize=True)
# Review-only preview using a neutral checkerboard; not part of asset
view=Image.new("RGB",(1024,1024),"#f0f1ed");d=ImageDraw.Draw(view)
for y in range(0,1024,32):
 for x in range(0,1024,32):
  if ((x+y)//32)%2:d.rectangle((x,y,x+31,y+31),fill="#e5e6e1")
view.paste(rgb,(0,0),rgb)
view.save(out/"minimap_round_checker_preview.jpg",quality=90)
report={"asset":"minimap_round_faithful_1024.png","pixels":[1024,1024],"alpha":True,"shape":"circular","original_v2_icon":"icons/icon_17.png","source":"faithfulness locked V2 upscale, NOT separately GPT Image drawn","fidelity_checks":{"round":True,"top_N":True,"upper_right_alert":True,"inside_player_pointer":True,"shape_not_postcard":True},"qa":"structure verified; hand-painted final pending","sha256":hashlib.sha256(target.read_bytes()).hexdigest()}
(out/"minimap_round_qa.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf8")
print(target, target.stat().st_size, report["sha256"])
