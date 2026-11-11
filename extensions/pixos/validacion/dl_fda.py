import json,urllib.request,zipfile,io,os,sys
D='/Volumes/Respaldo/Datos/validacion-visor/fda-phantom'
d=json.load(open(sys.argv[1]))
l=[x for x in d if x['PatientID']=='NoduleLayout_3' and x['StudyDesc']=='Scanner-SIEMENS_Exp-100_Pitch-0.9_SlCol-64x0.6mm']
pick=[]
for want,n in (('SliceTh-0.75_SliceInc-0.75_ReconFilter-B40f',2),('SliceTh-1.5_SliceInc-1.5_ReconFilter-B40f',1),('SliceTh-3_SliceInc-3_ReconFilter-B40f',1)):
    c=sorted([x for x in l if x['SeriesDescription']==want],key=lambda x:int(x['SeriesNumber']))
    for i,x in enumerate(c[:n]): pick.append({**{k:x[k] for k in ('SeriesInstanceUID','SeriesDescription','SeriesNumber','ImageCount')},'carpeta':f"{want.split('_Recon')[0]}_r{i+1}"})
json.dump(pick,open(f'{D}/seleccion.json','w'),indent=1)
for x in pick:
    out=f"{D}/{x['carpeta']}"
    if os.path.exists(out): continue
    z=urllib.request.urlopen(f"https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID={x['SeriesInstanceUID']}",timeout=900).read()
    zipfile.ZipFile(io.BytesIO(z)).extractall(out+'.tmp'); os.rename(out+'.tmp',out); print('fda',x['carpeta'],flush=True)
print('LISTO')
