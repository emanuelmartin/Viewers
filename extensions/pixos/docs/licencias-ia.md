# Licencias de los modelos de IA de PixOS

Registro de licencias de los modelos y herramientas de IA de PixOS. comercializable: si = se puede incluir en un producto que se vende; no = solo uso interno/no comercial (HRSL puede usarlo porque no se vende); revisar = depende de los datos de entrenamiento o de condiciones que hay que confirmar antes de vender. Actualizado 2026-10-06 (licencia académica de TotalSegmentator activa).

| Modelo | Uso en PixOS | Licencia de pesos | ¿Se puede vender? | Uso en HRSL | Notas |
|---|---|---|---|---|---|
| TotalSegmentator (tareas abiertas) | ct_organs, ct_lung_nodules (lóbulos, corazón, aorta, derrames), ct_head_bleed (cerebral_bleed, ventricle_parts), kidney_cysts, liver_lesions, liver_segments, mr_brain_aneurysm, mr_spine_levels, ct_aorta | Apache-2.0 (tareas sin licencia) | **si** | si | Tareas que no están en la lista commercial_models de TotalSegmentator. |
| TotalSegmentator (tareas con licencia) | en uso: ct_organs → composición corporal en L3 (tissue_types), en uso: ct_cardiac → cavidades, VD/VI y coronarias (heartchambers_highres, coronary_arteries), instalados 2026-10-06: coronary_arteries, heartchambers_highres, tissue_types, tissue_4_types, tissue_types_mr, brain_structures, vertebrae_body, appendicular_bones, aortic_sinuses, body_stats_cnn_ct | Licencia académica gratuita (no comercial) o licencia comercial de pago | **no** | si (licencia académica activa en ubuntu-ai, a nombre del titular) | Licencia académica no comercial: solo HRSL / uso interno. Para venderlos se necesita licencia comercial de pago (jakob.wasserthal@usb.ch). Todo resultado basado en estas tareas debe marcarse como no comercializable. |
| MONAI lung_nodule_ct_detection (RetinaNet) | ct_lung_nodules | Apache-2.0 | **revisar** | si | Entrenado con LUNA16 (derivado de LIDC-IDRI, CC BY 3.0): confirmar atribución antes de vender. |
| MONAI prostate_mri_anatomy | mr_prostate | Apache-2.0 | **revisar** | si | Entrenado con prostate158: confirmar la licencia del conjunto de datos. |
| MONAI brats_mri_segmentation (SegResNet) + HD-BET | mr_brain_tumor | Apache-2.0 | **revisar** | si | Datos BraTS 2018 con condiciones de uso de investigación: confirmar antes de vender. |
| MONAI VISTA3D | vista3d_point | NVIDIA OneWay Noncommercial License | **no** | si (evaluación) | Etiquetado como «evaluación» en el visor. |
| FastSurfer (FastSurferCNN) | mr_brain_volumes | Apache-2.0 | **si** | si |  |
| HD-BET | mr_brain_tumor, mr_brain_dwi | Apache-2.0 | **si** | si |  |
| torchxrayvision DenseNet (densenet121-res224-all) | cxr | Apache-2.0 | **revisar** | si | Pesos entrenados con varios conjuntos (algunos de uso de investigación, p. ej. CheXpert y MIMIC-CXR): no vender sin revisar. |
| MedGemma | image_analysis (retirada) | Health AI Developer Foundations terms of use | **revisar** | si (retirada por desempeño) | Condiciones propias de Google: revisar antes de cualquier uso comercial. |
| DeepISLES (ensamble ISLES'22: SEALS, NVAUTO, FACTORIZER) | en uso: mr_brain_stroke (SEALS + NVAUTO + FACTORIZER, voto de mayoría; validado como detector de restricción a la difusión, visible para médicos) | Apache-2.0 (Zenodo 14026715) | **revisar** | si | Datos ISLES'22: confirmar condiciones antes de vender. Corre en entorno propio (PyTorch 2.11/CUDA 12.8) con parches de compatibilidad documentados en hrsl_service/stroke.py. |
| LST-AI (lesiones de sustancia blanca) | no instalado: requiere FLAIR 3D | MIT | **si** | si | Herramienta declarada de investigación por sus autores. |
| Reglas y mediciones propias PixOS | mr_brain_dwi (ADC < 620 + asimetría), ct_aorta (línea central), calcio cardiaco aproximado, índice de Evans, L1, esteatosis, músculo L3, segmentación por clic y pincel | Sin pesos | **si** | si | Dependen de las segmentaciones de los modelos de arriba: su licencia se hereda. |
| highdicom (DICOM SEG y capturas 3D) | series de IA en el PACS | — | **si** | si |  |
| trimesh / fast_simplification (mallas; se muestran en el 3D de OHIF con vtk.js, BSD-3) | superficies 3D de segmentaciones en el visor | — | **si** | si |  |
| BLAST-CT (hemorragia intracraneal: IPH, extraaxial, IVH, edema) | evaluado y descartado (oct 2026): falsos positivos extraaxiales en TC normales del HRSL | Apache-2.0 (repositorio biomedia-mira/blast-ct) | **si** | no (descartado por desempeño) |  |

Fuente de verdad: `licencias-ia.json` (este archivo se genera de él).
