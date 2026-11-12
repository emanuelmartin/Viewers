import glob,os,json,collections,urllib.request,zipfile,io,pydicom
D='/Volumes/Respaldo/Datos/validacion-visor/rider-lung'
meta={x['SeriesInstanceUID']:x for x in json.load(open(os.environ['RJ']))}
need=collections.defaultdict(set)
for f in glob.glob(f'{D}/*/SEG-*/**/*.dcm',recursive=True):
    ds=pydicom.dcmread(f,stop_before_pixels=True)
    for r in ds.get('ReferencedSeriesSequence',[]): need[f.split('/')[6]].add(r.SeriesInstanceUID)
for f in glob.glob(f'{D}/*/SR-*/**/*.dcm',recursive=True):
    ds=pydicom.dcmread(f,stop_before_pixels=True)
    for e in ds.get('CurrentRequestedProcedureEvidenceSequence',[]):
        for s in e.ReferencedSeriesSequence:
            if meta.get(s.SeriesInstanceUID,{}).get('PatientID')==f.split('/')[6] and meta[s.SeriesInstanceUID]['Modality']=='CT': need[f.split('/')[6]].add(s.SeriesInstanceUID)
tot=0
for p,uids in sorted(need.items()):
    for u in uids:
        m=meta.get(u); 
        if not m: print('missing',u); continue
        print(p,m['Modality'],m.get('StudyDate'),m.get('ImageCount'),round(float(m['FileSize'])/1e6)); tot+=float(m['FileSize'])
print('total MB',round(tot/1e6))
if os.environ.get('GO'):
    for p,uids in need.items():
        for u in uids:
            out=f'{D}/{p}/CT-{u}'
            if os.path.exists(out) or u not in meta: continue
            z=urllib.request.urlopen(f'https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID={u}').read()
            zipfile.ZipFile(io.BytesIO(z)).extractall(out)
    print('downloaded')
