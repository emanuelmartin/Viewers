"""Convierte series CT a volúmenes int16 (UH) + JSON con geometría, y saca semillas:
RIDER: centroide de cada SEG de los lectores (y su volumen de máscara); FDA: tabla de verdad del maniquí.
Uso: python -I prep_ct.py <datos> <salida>"""
import sys, os, json, glob
import numpy as np, pydicom

D, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def load_series(folder):
    ds = []
    for f in glob.glob(f'{folder}/**/*.dcm', recursive=True):
        d = pydicom.dcmread(f)
        if 'PixelData' in d:
            ds.append(d)
    ori = np.array(ds[0].ImageOrientationPatient, float)
    nrm = np.cross(ori[:3], ori[3:])
    ds.sort(key=lambda d: float(np.dot(nrm, np.array(d.ImagePositionPatient, float))))
    z = [float(np.dot(nrm, np.array(d.ImagePositionPatient, float))) for d in ds]
    vol = np.stack([d.pixel_array.astype(np.float32) * float(d.RescaleSlope) + float(d.RescaleIntercept) for d in ds])
    vol = np.clip(np.round(vol), -32768, 32767).astype(np.int16)
    ps = [float(x) for x in ds[0].PixelSpacing]  # fila, columna
    dz = float(np.median(np.diff(z))) if len(z) > 1 else float(ds[0].SliceThickness)
    geo = {
        'dims': [int(ds[0].Columns), int(ds[0].Rows), len(ds)],
        'spacing': [ps[1], ps[0], dz],
        'origin': [float(x) for x in ds[0].ImagePositionPatient],
        'orientation': ori.tolist(),
        'normal': nrm.tolist(),
        'thickness': float(ds[0].SliceThickness),
        'kernel': str(getattr(ds[0], 'ConvolutionKernel', '')),
        'series': str(ds[0].SeriesInstanceUID),
        'description': str(getattr(ds[0], 'SeriesDescription', '')),
        'sops': [str(d.SOPInstanceUID) for d in ds],
    }
    return vol, geo


def world_to_ijk(geo, w):
    o = np.array(geo['origin']); r = np.array(geo['orientation'][:3]); c = np.array(geo['orientation'][3:]); n = np.array(geo['normal'])
    v = np.array(w) - o
    return [float(v @ r / geo['spacing'][0]), float(v @ c / geo['spacing'][1]), float(v @ n / geo['spacing'][2])]


def ijk_to_world(geo, ijk):
    o = np.array(geo['origin']); r = np.array(geo['orientation'][:3]); c = np.array(geo['orientation'][3:]); n = np.array(geo['normal'])
    return (o + ijk[0] * geo['spacing'][0] * r + ijk[1] * geo['spacing'][1] * c + ijk[2] * geo['spacing'][2] * n).tolist()


def save(name, vol, geo, extra):
    vol.tofile(f'{OUT}/{name}.i16')
    geo = {**geo, **extra}
    geo.pop('sops', None)
    json.dump(geo, open(f'{OUT}/{name}.json', 'w'), indent=1)


def seg_info(path):
    """Centroide (mundo) y volumen de la máscara de un SEG de un lector, y la serie que referencia."""
    s = pydicom.dcmread(glob.glob(f'{path}/*.dcm')[0])
    ref = str(s.ReferencedSeriesSequence[0].SeriesInstanceUID)
    arr = s.pixel_array
    if arr.ndim == 2:
        arr = arr[None]
    ori = np.array(s.SharedFunctionalGroupsSequence[0].PlaneOrientationSequence[0].ImageOrientationPatient, float)
    pm = s.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence[0]
    ps = [float(x) for x in pm.PixelSpacing]
    th = float(getattr(pm, 'SliceThickness', 0) or 0)
    pts = []
    for f, fr in enumerate(s.PerFrameFunctionalGroupsSequence):
        pos = np.array(fr.PlanePositionSequence[0].ImagePositionPatient, float)
        rr, cc = np.nonzero(arr[f])
        for a, b in zip(rr, cc):
            pts.append(pos + b * ps[1] * ori[:3] + a * ps[0] * ori[3:])
    pts = np.array(pts)
    return ref, pts.mean(0).tolist(), len(pts), ps, th, str(getattr(s, 'SeriesDescription', ''))


def sr_reads(path):
    """Por cada punto de tiempo de un SR de lector (QIBA TID 1500): imagen, extremos del eje largo, volumen y ejes."""
    s = pydicom.dcmread(glob.glob(f'{path}/*.dcm')[0])
    reader = None
    out = []
    def walk(seq, cur):
        nonlocal reader
        for it in seq:
            name = it.ConceptNameCodeSequence[0].CodeMeaning if 'ConceptNameCodeSequence' in it else ''
            t = it.ValueType
            if name == "Identifier within Person Observer's Role" and reader is None:
                reader = it.TextValue
            if t == 'CONTAINER' and name == 'Time Point':
                cur = {}
                out.append(cur)
            if t == 'NUM' and cur is not None:
                if name == 'Time Point Order': cur['tp'] = int(float(it.MeasuredValueSequence[0].NumericValue))
                if name in ('Volume', 'Long Axis', 'Short Axis', 'Pixel Count', 'Area'):
                    cur[name] = float(it.MeasuredValueSequence[0].NumericValue)
                if name == 'Long Axis' and 'ContentSequence' in it:
                    sc = it.ContentSequence[0]
                    cur['line'] = [float(v) for v in sc.GraphicData]
                    cur['sop'] = str(sc.ContentSequence[0].ReferencedSOPSequence[0].ReferencedSOPInstanceUID)
            if 'ContentSequence' in it:
                walk(it.ContentSequence, cur)
    walk(s.ContentSequence, None)
    return [dict(x, reader=reader) for x in out if 'sop' in x]


def rider():
    sel = json.load(open(f'{D}/rider-lung/seleccion.json'))
    allref = {}
    for p, uids in sel.items():
        reads = [r for x in sorted(glob.glob(f'{D}/rider-lung/{p}/SR-*')) for r in sr_reads(x)]
        for u in uids:
            folder = f'{D}/rider-lung/{p}/CT-{u}'
            if not os.path.isdir(folder):
                print('falta', p, u[-8:]); continue
            name = f'rider_{p[-4:]}_{u[-6:]}'
            vol, geo = load_series(folder)
            pos = {sop: k for k, sop in enumerate(geo['sops'])}
            seeds = []
            for r in reads:
                if r['sop'] not in pos: continue
                c0, r0, c1, r1 = r['line']
                seeds.append({**r, 'ijk': [(c0 + c1) / 2, (r0 + r1) / 2, pos[r['sop']]]})
            save(name, vol, geo, {'patient': p, 'seeds': seeds})
            allref[name] = {'patient': p, 'seeds': seeds}
            print(name, geo['dims'], geo['spacing'], len(seeds), flush=True)
    return allref


def fda():
    truth = json.load(open(f'{D}/fda-phantom/verdad_layout3.json'))
    sel = json.load(open(f'{D}/fda-phantom/seleccion.json'))
    vols = {}
    for x in sel:
        folder = f"{D}/fda-phantom/{x['carpeta']}"
        if os.path.isdir(folder):
            vols[x['carpeta']] = load_series(folder)
    # Coordenadas de la tabla: (columna, fila, número de corte desde 1) en la serie de 0.75 mm
    thin = vols['SliceTh-0.75_SliceInc-0.75_r1'][1]
    for name, (vol, geo) in vols.items():
        seeds = []
        for n in truth['nodulos']:
            x, y, z = n['xyz']
            w = ijk_to_world(thin, [x, y, z - 1])
            seeds.append({**n, 'world': w, 'ijk': world_to_ijk(geo, w)})
        out = 'fda_' + name.replace('SliceTh-', 'th').split('_SliceInc')[0] + '_' + name.split('_')[-1]
        save(out, vol, geo, {'seeds': seeds})
        print(out, geo['dims'], geo['spacing'], flush=True)


if 'rider' in sys.argv[3:]:
    rider()
if 'fda' in sys.argv[3:]:
    fda()
