# Sharpen model textures end to end (see tools/blender/texture_views.py):
#   1. render nine unlit colour views of every model      2. the image model repaints each view with finer detail
#   3. each repaint is lined up with its render (a poor fit is asked again once, then left out)
#   4. the views are projected back onto the model's UVs   5. blended into the new texture (tools/ai/compose.py)
# Models are rendered and repainted two at a time while Blender bakes the finished ones, one after another. Steps whose results already exist are
# skipped, so an interrupted run can simply be started again. Work files go to D:\ClaudeTools\ai\jobs\<name>.
#   python tools/ai/enhance_model.py tools/ai/enhance_jobs.json [job name …]
#   python tools/ai/enhance_model.py --redo tools/ai/enhance_jobs.json <job name> <view,view,…>   repaint some views again
# Check repaints with tools/ai/check_views.py <job dir> (flags views whose colours changed in a patch) and by eye.
import sys, os, re, glob, json, subprocess, threading, concurrent.futures as cf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BLENDER = r'D:\ClaudeTools\blender\blender-4.2.23-windows-x64\blender.exe'
WORK = r'D:\ClaudeTools\ai\jobs'
VIEWS = ['front', 'front_left', 'left', 'back_left', 'back', 'back_right', 'right', 'front_right', 'top']
MIN_FIT = 0.86                                            # outline overlap below this → the repaint moved things; ask again
TEMPLATE = ('This image is an unlit, flat-colour orthographic render (seen from the {view} side) of {what}a 3D {desc} on a plain grey background.\n'
            'Re-paint it as a sharper, more detailed version of the SAME picture, like a high-quality hand-painted stylized mobile-game texture: '
            'crisp clean edges; {details}.\n'
            'IMPORTANT: keep exactly the same composition, silhouette, pose, framing, scale and position of every element; keep the same colours '
            'and the same soft baked lighting; do not add cast shadows, black outlines, background details or new objects; keep the plain flat grey background.\n'
            'Do not add, move, copy or replace any accessory or decoration: every badge, button, leaf, ring, lantern, charm and pattern stays exactly '
            'what and where it is in the input, and nothing appears where the input shows plain surface.{note}')
log_lock = threading.Lock()

def log(*a):
    with log_lock: print(*a, flush=True)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0: raise RuntimeError(' '.join(os.path.basename(c) for c in cmd[:5]) + '\n' + r.stdout[-1200:] + r.stderr[-1200:])
    return r.stdout

def path(p): return p if os.path.isabs(p) else os.path.join(ROOT, p)

def folder(j): return os.path.join(WORK, j['name'])

def extra(j):                                             # optional: start from another texture; close-up framing
    return ([f"tex={path(j['tex'])}"] if 'tex' in j else []) + ([f"zoom={j['zoom']}"] if 'zoom' in j else [])

def render(j):
    d = folder(j); os.makedirs(d, exist_ok=True)
    if not os.path.exists(os.path.join(d, 'views.json')):
        run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools/blender/texture_views.py'), '--', 'render', path(j['model']), d] + extra(j))
    log(j['name'], 'views rendered')

def enhance(j, v):
    d = folder(j); new = os.path.join(d, f'{v}_new.png')
    if os.path.exists(new): return 'kept'
    pf = os.path.join(d, f'prompt_{v}.txt')
    open(pf, 'w', encoding='utf-8').write(TEMPLATE.format(view=v.replace('_', ' '), what=j.get('what', ''), desc=j['desc'], details=j['details'], note=(' ' + j['note']) if 'note' in j else ''))
    for attempt in range(2):
        raw = os.path.join(d, f'{v}_raw{attempt or ""}.png')
        if not os.path.exists(raw):
            try: run([sys.executable, os.path.join(ROOT, 'tools/ai/gpt.py'), 'edit', pf, raw, os.path.join(d, f'{v}.png')])
            except RuntimeError as e: log(j['name'], v, 'image request failed', str(e)[-300:]); continue
        tmp = os.path.join(d, f'{v}_fit{attempt}.png')
        msg = run([sys.executable, os.path.join(ROOT, 'tools/ai/align.py'), os.path.join(d, f'{v}.png'), raw, tmp]).strip()
        fit = float(re.search(r'overlap ([\d.]+)', msg).group(1))
        if fit >= MIN_FIT:
            os.replace(tmp, new); return f'fit {fit:.3f}'
        log(j['name'], v, f'poor fit {fit:.3f}, asking again' if attempt == 0 else f'poor fit {fit:.3f}, view left out')
    return 'left out'

def prepare(j):
    render(j)
    with cf.ThreadPoolExecutor(5) as ex:
        res = dict(zip(VIEWS, ex.map(lambda v: enhance(j, v), VIEWS)))
    log(j['name'], 'views:', ', '.join(f'{v} {r}' for v, r in res.items()))

def bake(j):
    d = folder(j)
    done = os.path.join(d, 'baked.ok')                    # written only after a complete bake
    if not os.path.exists(done):
        log(j['name'], 'baking…')
        run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools/blender/texture_views.py'), '--', 'project', path(j['model']), d, 'x', str(j.get('size', 4096))] + extra(j))
        open(done, 'w').write('ok')
    out = path(j['out']); os.makedirs(os.path.dirname(out), exist_ok=True)
    log(run([sys.executable, os.path.join(ROOT, 'tools/ai/compose.py'), d, out]).strip())

def redo(j, views):                                       # throw away some repaints (e.g. ones that added things) and ask again
    d = folder(j)
    for v in views:
        for f in glob.glob(os.path.join(d, f'{v}_raw*.png')) + glob.glob(os.path.join(d, f'{v}_new.png')) + glob.glob(os.path.join(d, f'{v}_fit*.png')):
            os.remove(f)
    for f in [os.path.join(d, 'baked.ok')] + glob.glob(os.path.join(d, 'bake_*.npz')):
        if os.path.exists(f): os.remove(f)
    with cf.ThreadPoolExecutor(5) as ex:
        for v, r in zip(views, ex.map(lambda v: enhance(j, v), views)): log(j['name'], v, r)

if __name__ == '__main__':
    if sys.argv[1] == '--redo':                           # --redo <jobs.json> <job name> <view,view,…>  (repaint only; bake later)
        j = next(j for j in json.load(open(sys.argv[2], encoding='utf-8')) if j['name'] == sys.argv[3])
        redo(j, sys.argv[4].split(',')); sys.exit()
    jobs = json.load(open(sys.argv[1], encoding='utf-8'))
    pick = set(sys.argv[2:]); jobs = [j for j in jobs if not pick or j['name'] in pick]
    with cf.ThreadPoolExecutor(2) as pool:                # two models rendered + repainted at a time (up to 10 image requests)
        prep = [pool.submit(prepare, j) for j in jobs]
        for j, f in zip(jobs, prep):                      # bake in order as each model's views come back
            try: f.result(); bake(j)
            except Exception as e: log('FAILED', j['name'], e)
    log('ALL DONE')
