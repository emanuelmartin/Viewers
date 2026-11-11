import glob,json,pydicom,numpy as np
B='/Volumes/Respaldo/Datos/validacion-visor/pet-dro'; O='/Volumes/Respaldo/Datos/validacion-visor/prep'
SETS={'dro':'DRO_20130529/DRO_20130529/20130528_DRO_DICOM_male/DRO_PET_20130528',
      'droe':'DROe_20140714/DROe_20140714/20140731_DROe_emission',
      'mtv_free':'DROmtv_20160428/DROmtv_20160428/DROmtv_20160428_Noise_Free',
      'mtv_noise':'DROmtv_20160428/DROmtv_20160428/DROmtv_20160428_Noise_n_6mmFWHM'}
def load(p):
    ds=[]
    for f in glob.glob(f'{B}/{p}/*'):
        try: d=pydicom.dcmread(f)
        except Exception: continue
        if 'PixelData' in d: ds.append(d)
    ds.sort(key=lambda d: float(d.ImagePositionPatient[2]))
    vol=np.stack([d.pixel_array*float(d.RescaleSlope)+float(d.RescaleIntercept) for d in ds]).astype(np.float32)
    return ds,vol
for k,p in SETS.items():
    ds,vol=load(p); d=ds[0]; r=d.RadiopharmaceuticalInformationSequence[0]
    sp=[float(d.PixelSpacing[1]),float(d.PixelSpacing[0]),abs(float(ds[1].ImagePositionPatient[2])-float(ds[0].ImagePositionPatient[2]))]
    meta={'dims':[vol.shape[2],vol.shape[1],vol.shape[0]],'spacing':sp,'instances':[{
      'SeriesDate':str(x.SeriesDate),'SeriesTime':str(x.SeriesTime),'AcquisitionDate':str(x.AcquisitionDate),'AcquisitionTime':str(x.AcquisitionTime),
      'CorrectedImage':list(x.CorrectedImage),'Units':x.Units,'DecayCorrection':x.DecayCorrection,'PatientWeight':float(x.PatientWeight),
      'PatientSex':str(x.get('PatientSex','')),'PatientSize':float(x.get('PatientSize') or 0) or None,
      'RadionuclideHalfLife':float(r.RadionuclideHalfLife),'RadionuclideTotalDose':float(r.RadionuclideTotalDose),
      'RadiopharmaceuticalStartTime':str(r.RadiopharmaceuticalStartTime)} for x in ds]}
    vol.tofile(f'{O}/{k}.f32'); json.dump(meta,open(f'{O}/{k}.json','w'))
    print(k,vol.shape,sp)
