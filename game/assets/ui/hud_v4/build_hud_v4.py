#!/usr/bin/env python3
"""Rasterize 97 screenshot-referenced component reconstructions as separate RGBA PNGs.

Purposefully PRESERVES V3 shape and alpha. Adds only subtle watercolor grain.
Not a screenshot pixel extraction and not individually painted GPT Image assets.
"""
import argparse, csv, hashlib, io, json, random, shutil, zipfile
from pathlib import Path
import cairosvg
from PIL import Image, ImageDraw, ImageFont

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True,type=Path)
    p.add_argument("--destination",required=True,type=Path)
    a=p.parse_args()
    source=a.source; dest=a.destination
    manifest=json.loads((source/"Text_And_Layouts"/"asset_manifest.json").read_text(encoding="utf8"))
    if dest.exists(): shutil.rmtree(dest)
    entries=[]
    for item in manifest["assets"]:
        f=source/item["svg"]
        w,h=(int(n) for n in item["generated_resolution"].split("x"))
        raw=cairosvg.svg2png(url=str(f),output_width=w,output_height=h)
        im=Image.open(io.BytesIO(raw)).convert("RGBA")
        seed=int.from_bytes(hashlib.sha256(item["svg"].encode()).digest()[:4],"big")
        rng=random.Random(seed)
        gw=max(4,w//48);gh=max(4,h//48)
        noise=Image.new("L",(gw,gh))
        noise.putdata(bytes(rng.randrange(256) for _ in range(gw*gh)))
        field=noise.resize((w,h),Image.Resampling.BICUBIC)
        base=im.convert("RGB")
        strength=0.011 if item["group"]=="title" else (0.018 if item["type"]=="icon" else 0.023)
        base=Image.blend(base,Image.merge("RGB",(field,field,field)),strength)
        # The reference title-screen utility glyphs are ivory/white, not leaf green.
        # Color correction only; keep original stroke geometry and alpha unmodified.
        if item["group"]=="title" and item["slug"] in ("music","settings","announcement","support"):
            base=Image.blend(base,Image.new("RGB",(w,h),(251,248,231)),0.94)
        base.putalpha(im.getchannel("A"))
        output=dest/item["png"]
        output.parent.mkdir(parents=True,exist_ok=True)
        base.save(output,compress_level=3)
        entries.append({"group":item["group"],"slug":item["slug"],"relative_path":item["png"],"source_svg":item["svg"],"width":w,"height":h,"sha256":hashlib.sha256(output.read_bytes()).hexdigest(),"status":"SVG geometry preserved; painterly raster finish; review against screenshot"})
    (dest/"Engineering").mkdir(parents=True)
    shutil.copy2(source/"Text_And_Layouts"/"coordinate_layout.json",dest/"Engineering"/"reference_layout_1649x928.json")
    shutil.copy2(source/"Text_And_Layouts"/"text_layers.json",dest/"Engineering"/"text_layers.json")
    (dest/"Engineering"/"asset_manifest_v4.json").write_text(json.dumps({"source":"V3 screenshot-referenced reconstructed SVGs, NOT original pixel extraction","count":len(entries),"assets":entries},ensure_ascii=False,indent=2),encoding="utf8")
    with (dest/"Engineering"/"assets.csv").open("w",encoding="utf-8-sig",newline="") as fp:
        wr=csv.DictWriter(fp,fieldnames=entries[0].keys());wr.writeheader();wr.writerows(entries)
    (dest/"README.md").write_text("""# HUD V4 — Individual RGBA assets

Contains **97 separate transparent PNG sprites**, grouped by title, activity, inventory, home decoration, map and shared UI, plus layout references, localized text metadata and asset hashes.

### Fidelity boundary
These are high-resolution **raster-finished reconstructions of the existing SVG assets**, not pixel-perfect extraction from the reference screenshots, nor 97 separately generated GPT Image artworks. The source artwork's geometry, canvas, and alpha are preserved to minimize unexpected redesigns. Validate manually against reference at actual displayed size before finalizing a release.

Keep existing V3 asset IDs and resource paths where possible; to use V4 replace the asset root once, or copy matching PNG filenames in place. If runtime still references .svg, a one-time path update is required. Dynamic text stays outside images.
""",encoding="utf8")
    # compact inspection previews by group, rendering real assets
    out=dest/"Previews";out.mkdir()
    groups={}
    for e in entries:groups.setdefault(e["group"],[]).append(e)
    for group,es in groups.items():
        CW,CH,COLS=240,226,4
        sheet=Image.new("RGB",(CW*COLS,((len(es)+COLS-1)//COLS)*CH+60),(246,246,241))
        d=ImageDraw.Draw(sheet)
        d.text((15,14),group.upper()+"  "+str(len(es))+" transparent sprites",fill=(54,62,54))
        for i,e in enumerate(es):
            x=(i%COLS)*CW;y=(i//COLS)*CH+54
            tile=Image.new("RGB",(224,188),(246,246,241))
            t=ImageDraw.Draw(tile)
            for yy in range(0,188,16):
                for xx in range(0,224,16):
                    if (xx//16+yy//16)%2:t.rectangle((xx,yy,xx+15,yy+15),fill=(234,234,228))
            spr=Image.open(dest/e["relative_path"]).convert("RGBA")
            spr.thumbnail((207,175),Image.Resampling.LANCZOS)
            tile.paste(spr,((224-spr.width)//2,(188-spr.height)//2),spr)
            sheet.paste(tile,(x+8,y))
            d.text((x+12,y+194),e["slug"][:30],fill=(55,65,53))
        sheet.save(out/(group+"_sheet.jpg"),quality=89)
    package=dest/"HUD_V4_97_individual_PNG.zip"
    with zipfile.ZipFile(package,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for f in dest.rglob("*"):
            if f.is_file() and f!=package:z.write(f,f.relative_to(dest))
    with zipfile.ZipFile(package) as z:
        assert z.testzip() is None
    assert len(entries)==97
    print("OK 97 sprites; ZIP",package,package.stat().st_size)

if __name__=="__main__": main()
