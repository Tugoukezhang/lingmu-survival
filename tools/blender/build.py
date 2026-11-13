# Builds the 3D pets / people and writes game/assets/models/<name>.glb.
#   blender -b -P tools/blender/build.py -- fox pup        (no names = all)
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import petkit, models, critters
importlib.reload(petkit); importlib.reload(models); importlib.reload(critters)
ALL = {**models.MODELS, **critters.MODELS}

names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = os.path.normpath(os.path.join(HERE, '..', '..', 'game', 'assets', 'models'))
os.makedirs(out, exist_ok=True)
for name in names or list(ALL):
    petkit.reset()
    petkit._mats.clear()
    root = ALL[name]()
    petkit.export(root, os.path.join(out, name + '.glb'))
