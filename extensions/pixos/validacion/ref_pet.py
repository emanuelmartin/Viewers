import json,numpy as np
from collections import deque
O='/Volumes/Respaldo/Datos/validacion-visor/prep'
def load(k):
    m=json.load(open(f'{O}/{k}.json')); nx,ny,nz=m['dims']
    return m,np.fromfile(f'{O}/{k}.f32',dtype=np.float32).reshape(nz,ny,nx)
def suvf(m):
    i=m['instances'][0]
    hh=lambda t:int(t[:2])*3600+int(t[2:4])*60+float(t[4:])
    dt=hh(i['SeriesTime'])-hh(i['RadiopharmaceuticalStartTime'])
    return i['PatientWeight']*1000/(i['RadionuclideTotalDose']*2**(-dt/i['RadionuclideHalfLife']))
def comps(mask):
    lab=np.zeros(mask.shape,np.int32); n=0
    for start in zip(*np.nonzero(mask)):
        if lab[start]: continue
        n+=1; q=deque([start]); lab[start]=n
        while q:
            z,y,x=q.popleft()
            for dz,dy,dx in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
                a=(z+dz,y+dy,x+dx)
                if all(0<=a[i]<mask.shape[i] for i in range(3)) and mask[a] and not lab[a]: lab[a]=n; q.append(a)
    return lab,n
def grow41(v,seed,frac):
    thr=v[seed]*frac; m=np.zeros(v.shape,bool); q=deque([seed]); m[seed]=True
    while q:
        z,y,x=q.popleft()
        for dz,dy,dx in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
            a=(z+dz,y+dy,x+dx)
            if all(0<=a[i]<v.shape[i] for i in range(3)) and not m[a] and v[a]>=thr: m[a]=True; q.append(a)
    return m
out={}
# MTV objects (noise-free): truth = integral of excess activity / contrast
m,v=load('mtv_free'); f=suvf(m); s=v*f; vox=np.prod(m['spacing'])/1000
bg=float(np.median(s[s>0.5]))
lab,n=comps(s>bg+0.3)
objs=[]
for i in range(1,n+1):
    idx=np.argwhere(lab==i); z0,y0,x0=idx.min(0)-3; z1,y1,x1=idx.max(0)+4
    box=s[max(z0,0):z1,max(y0,0):y1,max(x0,0):x1]
    mx=float(s[lab==i].max()); level=4.0 if mx>3 else 2.0
    if len(idx)<3: continue
    true_ml=float(((box-bg).clip(0)/(level-bg)).sum()*vox)
    seed=tuple(int(c) for c in idx[np.argmax(s[lab==i])])
    plain41=float(grow41(s,seed,0.41).sum()*vox); plain50=float(grow41(s,seed,0.50).sum()*vox)
    objs.append({'seed_zyx':seed,'level':level,'max':mx,'true_ml':true_ml,'voi41_plain_ml':plain41,'voi50_plain_ml':plain50,'slice':seed[0]+1})
out['mtv_free']={'bg':bg,'suv_factor':f,'objects':sorted(objs,key=lambda o:(o['slice'],o['seed_zyx'][2]))}
# noisy: same seeds (hottest voxel within 15 mm is done by the viewer)
out['mtv_noise']={'seeds':[o['seed_zyx'] for o in out['mtv_free']['objects']]}
# DRO: sphere SUV
m,v=load('dro'); f=suvf(m); s=v*f
vals,cnt=np.unique(np.round(s,3),return_counts=True)
out['dro']={'suv_factor':f,'top_values':[[float(a),int(b)] for a,b in zip(vals[-6:],cnt[-6:])],'background_mode':float(vals[np.argmax(cnt*(vals>0.5))])}
# DROe SUVpeak brute force (1 mL sphere, center inclusion), per blob on slice 49
m,v=load('droe'); f=suvf(m); s=v*f; sx,sy,sz=m['spacing']; r=(3/(4*np.pi)*1000)**(1/3)
ri,rj,rk=int(r//sx),int(r//sy),int(r//sz)
off=[(dk,dj,di) for dk in range(-rk,rk+1) for dj in range(-rj,rj+1) for di in range(-ri,ri+1) if (di*sx)**2+(dj*sy)**2+(dk*sz)**2<=r*r]
z=48; sl=s[z]; half=sl.shape[1]//2
blobs=[]
for side,(a,b) in (('izq',(0,half)),('der',(half,sl.shape[1]))):
    sub=sl[:,a:b]; y,x=np.unravel_index(np.argmax(sub),sub.shape); x+=a
    best=-1
    for cz in range(z-3,z+4):
        for cy in range(y-6,y+7):
            for cx in range(x-6,x+7):
                vals=[s[cz+dk,cy+dj,cx+di] for dk,dj,di in off if 0<=cz+dk<s.shape[0]]
                best=max(best,float(np.mean(vals)))
    blobs.append({'side':side,'seed_zyx':[z,int(y),int(x)],'max':float(s[z,y,x]),'peak_bruteforce':best,'n_voxels':len(off)})
out['droe']={'suv_factor':f,'blobs':blobs}
json.dump(out,open(f'{O}/referencias_pet.json','w'),indent=1)
print(json.dumps({k:(v if k!='mtv_free' else {'bg':v['bg'],'objs':[(o['slice'],round(o['true_ml'],3),round(o['voi41_plain_ml'],3),round(o['max'],2)) for o in v['objects']]}) for k,v in out.items() if k!='mtv_noise'},indent=0)[:3000])
