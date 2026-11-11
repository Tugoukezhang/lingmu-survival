#!/usr/bin/env python3
"""Audit the Lingmu 113-PNG art delivery. Never infer subject/style approval from pixels.

Default checks existing files, records missing items but does not mark them delivered.
Run with --require-complete to require 113/113 and --strict-alpha for alpha cutouts.
"""
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path
from PIL import Image, UnidentifiedImageError


def dhash(image):
    """Small visual-near-duplicate alert (NOT a semantic or artistic verdict)."""
    canvas = Image.new("RGBA", image.size, (255, 255, 255, 255))
    canvas.alpha_composite(image)
    tiny = canvas.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    values = list(tiny.getdata())
    return sum((1 << (y * 8 + x)) for y in range(8) for x in range(8)
               if values[y * 9 + x] > values[y * 9 + x + 1])


def audit(manifest_file, incoming_dir, require_complete=False, strict_alpha=False):
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    items = manifest["items"]
    if len(items) != 113 or [x["number"] for x in items] != list(range(1, 114)):
        raise ValueError("Manifest must contain #1–#113 in order")
    expected = {x["filename"]: x for x in items}
    if len(expected) != 113:
        raise ValueError("Duplicate filenames in manifest")
    report = {"expected": 113, "present": 0, "missing": [], "errors": [],
              "warnings": [], "near_duplicates": [], "extra": [], "checked": []}
    hashes, perceptual = defaultdict(list), []
    if not incoming_dir.is_dir():
        raise FileNotFoundError(str(incoming_dir))
    for item in items:
        path = incoming_dir / item["filename"]
        if not path.is_file():
            report["missing"].append({"number": item["number"], "filename": item["filename"]})
            continue
        report["present"] += 1
        try:
            raw = path.read_bytes()
            if raw[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError("Invalid PNG signature")
            with Image.open(path) as check:
                if check.format != "PNG":
                    raise ValueError("Not PNG data")
                check.verify()
            with Image.open(path) as img:
                img.load()
                width, height = img.size
                if (width, height) != (item["width"], item["height"]):
                    raise ValueError(f"Wrong size: {width}x{height}, expected {item['width']}x{item['height']}")
                if img.mode != "RGBA":
                    raise ValueError(f"Wrong pixel mode: {img.mode}, expected RGBA")
                a = img.getchannel("A")
                amin, amax = a.getextrema()
                if amax == 0:
                    raise ValueError("Fully transparent empty asset")
                if amin == 255 and not path.name.startswith(("tile_", "title_")):
                    msg = f"{path.name}: no transparent pixels; requires transparent-cutout review"
                    (report["errors"] if strict_alpha else report["warnings"]).append(msg)
                bbox = a.getbbox()
                if bbox and (bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= width or bbox[3] >= height):
                    if not path.name.startswith(("tile_", "title_")):
                        report["warnings"].append(f"{path.name}: silhouette touches canvas edge")
                hashes[hashlib.sha256(raw).hexdigest()].append(path.name)
                perceptual.append((item["number"],path.name,dhash(img)))
                report["checked"].append({"number": item["number"], "filename": path.name,
                    "size": len(raw), "dimensions": [width, height], "mode": img.mode,
                    "alpha_min": amin, "alpha_max": amax})
        except (OSError, UnidentifiedImageError, ValueError) as e:
            report["errors"].append(f"{path.name}: {e}")
    for h, files in hashes.items():
        if len(files) > 1:
            report["errors"].append(f"Exact duplicate PNG data: {files}")
    for i, (id1, name1, h1) in enumerate(perceptual):
        for id2, name2, h2 in perceptual[i + 1:]:
            distance = (h1 ^ h2).bit_count()
            if distance <= 5:
                report["near_duplicates"].append({"files": [name1, name2], "dhash_distance": distance})
    for p in incoming_dir.glob("*.png"):
        if p.name not in expected:
            report["extra"].append(p.name)
    if require_complete and report["missing"]:
        report["errors"].append(f"Missing {len(report['missing'])} expected PNGs")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("manifest.json"))
    parser.add_argument("--incoming", type=Path, default=Path(__file__).resolve().parents[1] / "incoming")
    parser.add_argument("--require-complete", action="store_true")
    parser.add_argument("--strict-alpha", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = audit(args.manifest, args.incoming, args.require_complete, args.strict_alpha)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Actual PNGs: {result['present']}/113; missing: {len(result['missing'])}; errors: {len(result['errors'])}; warnings: {len(result['warnings'])}")
    print("Missing:", ", ".join(f"#{x['number']} {x['filename']}" for x in result["missing"]) or "none")
    if result["errors"]:
        print("ERRORS:", *result["errors"], sep="\n - ")
    print("Note: subject identity, composition, reference matching and art style still require HUMAN visual approval.")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
