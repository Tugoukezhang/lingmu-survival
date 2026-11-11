#!/usr/bin/env python3
"""Generate the on-state from the *same* source dune lighthouse pixel geometry.

No generative replacement, cropping, text, backgrounds, or new architecture.
The light is restricted to the existing glass lantern and its immediate halo.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def build(source, target, preview, report):
    with Image.open(source) as image:
        source_rgba = image.convert('RGBA')
    if source_rgba.size != (1024, 1536):
        raise ValueError('Source must be exactly 1024×1536')
    pixels = np.asarray(source_rgba, dtype=np.float32).copy()
    h, w = pixels.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    yy = yy.astype(np.float32)
    xx = xx.astype(np.float32)

    # Dispersion of the outer sand-haze wisps, without touching the tower body.
    edge_distance = np.minimum(xx, (w - 1) - xx)
    edge_weight = np.clip((230.0 - edge_distance) / 200.0, 0, 1)
    vertical_weight = np.clip((yy - 700.0) / 400.0, 0, 1)
    pixels[:, :, 3] *= (1.0 - 0.38 * edge_weight * vertical_weight)

    # Relight the glass behind the balustrade, retaining its original painted details.
    glass_ellipse = ((xx - 514.0) / 174.0)**2 + ((yy - 554.0) / 144.0)**2
    glass_zone = np.clip((yy - 395) / 48, 0, 1) * np.clip((713 - yy) / 48, 0, 1)
    glass_zone *= np.clip((xx - 300) / 60, 0, 1) * np.clip((739 - xx) / 60, 0, 1)
    falloff = np.exp(-2.4 * glass_ellipse) * glass_zone
    luminance = pixels[:, :, :3].mean(axis=2)
    dark_glass = np.clip((225.0 - luminance) / 160.0, 0, 1)
    warm_mix = (0.20 + 0.43 * dark_glass) * falloff
    warm_color = np.array([255.0, 202.0, 107.0], dtype=np.float32)
    pixels[:, :, :3] = pixels[:, :, :3] * (1.0 - warm_mix[:, :, None]) + warm_color * warm_mix[:, :, None]

    # A focused central lantern glow, with a soft reflected ring in existing glass.
    inner = np.exp(-(((xx - 514) / 61)**2 + ((yy - 550) / 68)**2) * 2.1) * glass_zone
    mix_inner = 0.49 * inner
    pixels[:, :, :3] = pixels[:, :, :3] * (1 - mix_inner[:, :, None]) + np.array([255, 231, 156]) * mix_inner[:, :, None]

    # Low-opacity golden halo BEHIND the existing silhouette, never a new object.
    halo_distance = ((xx - 514) / 184.0)**2 + ((yy - 548) / 188.0)**2
    # Keep the halo extremely subtle: on dark backgrounds a larger halo reads as neon rings.
    halo_alpha = 12 * np.exp(-3.2 * halo_distance)
    halo_alpha *= np.clip((850 - yy) / 150, 0, 1)
    halo = np.zeros((h,w,4), dtype=np.uint8)
    halo[:, :, :3] = (255, 196, 88)
    halo[:, :, 3] = np.clip(halo_alpha, 0, 255).astype('uint8')
    new = np.clip(pixels,0,255).astype('uint8')
    foreground = Image.fromarray(new,'RGBA')
    result = Image.alpha_composite(Image.fromarray(halo,'RGBA'), foreground)
    target.parent.mkdir(parents=True, exist_ok=True)
    result.save(target,optimize=True)

    thumb = result.copy()
    thumb.thumbnail((320, 480), Image.Resampling.LANCZOS)
    preview.parent.mkdir(parents=True, exist_ok=True)
    thumb.save(preview, optimize=True)
    data = {'source':str(source),'target':str(target),'size':list(result.size),
       'alpha_range':list(result.getchannel('A').getextrema()),
       'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
       'bytes':target.stat().st_size,
       'edit':'same-source geometry + in-glass gold relight + halo + reduced outer sand haze',
       'note':'procedural relighting; requires visual signoff'}
    report.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(data,ensure_ascii=False))


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,default=Path('art/incoming/prop_lighthouse_dune_off.png'))
    p.add_argument('--target',type=Path,default=Path('art/incoming/prop_lighthouse_dune_on.png'))
    p.add_argument('--preview',type=Path,default=Path('art/qa/preview_dune_on.png'))
    p.add_argument('--report',type=Path,default=Path('art/qa/preview_dune_on.json'))
    a=p.parse_args()
    build(a.source,a.target,a.preview,a.report)
