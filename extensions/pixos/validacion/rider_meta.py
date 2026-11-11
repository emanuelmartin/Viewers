import json,collections,urllib.request,zipfile,io,os,sys
D='/Volumes/Respaldo/Datos/validacion-visor/rider-lung'
d=json.load(open(sys.argv[1]))
PTS=['RIDER-1225316081','RIDER-1286684383','RIDER-1332496276','RIDER-1532432635']
by=collections.defaultdict(list)
for x in d: by[x['PatientID']].append(x)
two=[p for p,s in by.items() if len({x['StudyInstanceUID'] for x in s if x['Modality']=='CT'})==2 and p not in PTS]
PTS.append(two[0])
for p in PTS:
    for x in by[p]:
        if x['Modality'] in ('SR','SEG') and ('QIBA' in (x.get('SeriesDescription') or '') or x.get('SeriesDescription')=='Tumor Segmentation'):
            out=f"{D}/{p}/{x['Modality']}-{x['SeriesInstanceUID']}"
            if os.path.exists(out): continue
            z=urllib.request.urlopen(f"https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID={x['SeriesInstanceUID']}").read()
            zipfile.ZipFile(io.BytesIO(z)).extractall(out)
print(PTS)
