# Put finished sharpened textures into the game: each job's result (tools/ai/enhance_jobs.json "out") is saved over the
# texture Unity uses ("unity", same name, so the model keeps pointing at it) and, for rigged characters, recorded in
# their rig file ("rig" → "texture"), so re-rigging with tools/blender/rig_pet.py keeps it.
#   python tools/ai/install_textures.py tools/ai/enhance_jobs.json [job name …]
import sys, os, json
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
jobs = json.load(open(sys.argv[1], encoding='utf-8')); pick = set(sys.argv[2:])
for j in jobs:
    if pick and j['name'] not in pick: continue
    src = os.path.join(ROOT, j['out'])
    if not os.path.exists(src): print('not finished yet:', j['name']); continue
    Image.open(src).convert('RGB').save(os.path.join(ROOT, j['unity']), quality=92)
    if 'rig' in j:
        rp = os.path.join(ROOT, j['rig']); txt = open(rp, encoding='utf-8').read(); lm = json.loads(txt)
        if lm.get('texture') != j['out']:
            # keep the file's own layout: add the field just after the opening brace
            txt = txt.replace('{', '{\n  "texture": ' + json.dumps(j['out']) + ',', 1) if 'texture' not in lm else txt.replace(json.dumps(lm['texture']), json.dumps(j['out']))
            json.loads(txt); open(rp, 'w', encoding='utf-8').write(txt)
    print('installed', j['name'], '→', j['unity'])
