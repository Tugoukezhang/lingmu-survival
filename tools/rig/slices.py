# Prints a model's vertex cloud (tools/blender/dump_points.py .npz, normalised frame) as height slices, to help place
# landmarks: per slice the x / y extent and the centre, overall and for the left (+y) / right (-y) halves.
#   python tools/rig/slices.py <points.npz> [step]
import sys
import numpy as np
P = np.load(sys.argv[1])['p']
step = float(sys.argv[2]) if len(sys.argv) > 2 else 0.05
x, y, z = P.T
print(f'x[{x.min():.2f},{x.max():.2f}] y[{y.min():.2f},{y.max():.2f}] z[0,1]  n={len(P)}')
for z0 in np.arange(0, 1, step):
    m = (z >= z0) & (z < z0 + step)
    if not m.any(): continue
    Q = P[m]
    row = f'z{z0:.2f} n{len(Q):5d} x[{Q[:,0].min():+.2f},{Q[:,0].max():+.2f}] y[{Q[:,1].min():+.2f},{Q[:,1].max():+.2f}] c({Q[:,0].mean():+.2f},{Q[:,1].mean():+.2f})'
    for nm, mm in (('L', Q[:, 1] > 0.12), ('R', Q[:, 1] < -0.12)):
        if mm.sum() > 10:
            S = Q[mm]; row += f' | {nm} x[{S[:,0].min():+.2f},{S[:,0].max():+.2f}] c({S[:,0].mean():+.2f},{S[:,1].mean():+.2f})'
    print(row)
