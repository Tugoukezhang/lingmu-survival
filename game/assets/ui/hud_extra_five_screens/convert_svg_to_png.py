from pathlib import Path
import cairosvg
root=Path(__file__).resolve().parent
source=root/'SVG_Editable'
target=root/'PNG_Transparent_HighRes'
for svg in source.rglob('*.svg'):
    out=target/svg.relative_to(source)
    out=out.with_suffix('.png')
    out.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(url=str(svg),write_to=str(out),scale=2.0)
print('Rendered transparent PNG components into',target)
