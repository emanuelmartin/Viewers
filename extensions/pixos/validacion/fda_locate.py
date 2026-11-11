"""Ubica cada nódulo del maniquí: cerca de su (x, y) de la tabla, la esfera del diámetro y densidad indicados que más
contrasta con su cáscara. Escribe centros en mundo para todas las series de la misma adquisición."""
import json, sys, numpy as np
D = sys.argv[1]
n = 'fda_th0.75_r1'
g = json.load(open(f'{D}/prep_ct/{n}.json'))
v = np.fromfile(f'{D}/prep_ct/{n}.i16', np.int16).reshape(g['dims'][::-1]).astype(np.float32)
sx, sy, sz = g['spacing']
def offsets(r0, r1):
    R = int(np.ceil(r1 / min(sx, sz)))
    o = []
    for dk in range(-R, R + 1):
        for dj in range(-R, R + 1):
            for di in range(-R, R + 1):
                d = np.sqrt((di * sx) ** 2 + (dj * sy) ** 2 + (dk * sz) ** 2)
                if r0 <= d <= r1: o.append((dk, dj, di))
    return np.array(o)
found = []
for s in g['seeds']:
    x, y, _ = s['xyz']; r = s['diam'] / 2
    inner = offsets(0, max(r * 0.6, 1.2)); shell = offsets(r + 1.5, r + 3.5)
    best = None
    W = 4
    for k in range(0, v.shape[0]):
        for j in range(y - W, y + W + 1, 2):
            for i in range(x - W, x + W + 1, 2):
                a = v[np.clip(k + inner[:, 0], 0, v.shape[0] - 1), j + inner[:, 1], i + inner[:, 2]].mean()
                if abs(a - s['hu']) > 120: continue
                b = v[np.clip(k + shell[:, 0], 0, v.shape[0] - 1), j + shell[:, 1], i + shell[:, 2]].mean()
                score = abs(a - s['hu']) - (a - b)
                if best is None or score < best[0]: best = (score, k, j, i, a, b)
    sc, k, j, i, a, b = best
    # refinar a paso 1
    for _ in range(2):
        cand = []
        for dk in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    kk, jj, ii = k + dk, j + dj, i + di
                    a2 = v[np.clip(kk + inner[:, 0], 0, v.shape[0] - 1), jj + inner[:, 1], ii + inner[:, 2]].mean()
                    b2 = v[np.clip(kk + shell[:, 0], 0, v.shape[0] - 1), jj + shell[:, 1], ii + shell[:, 2]].mean()
                    cand.append((abs(a2 - s['hu']) - (a2 - b2), kk, jj, ii, a2, b2))
        sc, k, j, i, a, b = min(cand)
    print(s['pulmon'], s['diam'], s['hu'], 'tabla', s['xyz'], '->', [i, j, k], 'centro', round(a), 'cascara', round(b), flush=True)
    o = np.array(g['origin']); w = (o + np.array([i * sx, j * sy, k * sz])).tolist()  # ejes alineados (orientación identidad)
    found.append({**{q: s[q] for q in ('pulmon', 'diam', 'hu', 'xyz', 'vol_ul')}, 'world': w, 'centro_hu': float(a), 'cascara_hu': float(b)})
assert np.allclose(g['orientation'], [1, 0, 0, 0, 1, 0]), g['orientation']
json.dump(found, open(f'{D}/fda-phantom/centros_encontrados.json', 'w'), indent=1)

# Siembra todas las series FDA de la misma adquisición con los centros encontrados
import glob
for f in glob.glob(f'{D}/prep_ct/fda_*.json'):
    m = json.load(open(f)); o = np.array(m['origin']); sp = np.array(m['spacing'])
    assert np.allclose(m['orientation'], [1, 0, 0, 0, 1, 0]), f
    m['seeds'] = [{**s, 'ijk': ((np.array(s['world']) - o) / sp).tolist()} for s in found]
    m['centros'] = 'localizados con fda_locate.py'
    json.dump(m, open(f, 'w'), indent=1)
    print('sembrada', f.split('/')[-1])
