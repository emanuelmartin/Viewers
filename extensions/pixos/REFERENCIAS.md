# Sustento científico de las herramientas del visor pixOS

Revisado el 2026-11-11. Copias de los artículos (uso interno de validación) en iCloud:
`Documentos/Proyectos/Pixos/Visor-validacion-cientifica/papers/`.

Clave: **Verificado** = fórmula o umbral cotejado contra el texto original · **Convención** = práctica de lectura sin
estándar único · **Heurística** = decisión de ingeniería propia, sin validación clínica (se indica en pantalla).

| Herramienta | Qué hace | Fuente | Estado |
|---|---|---|---|
| Edad gestacional por DBP, CC, CA, LF | Regresiones de una medida (cm → semanas) | Hadlock FP et al. *Radiology* 1984;152:497–501, Tabla 1 | Verificado (texto original) |
| Edad gestacional compuesta | MA = 10.85 + 0.060·CC·LF + 0.670·DBP + 0.168·CA | Hadlock 1984, Tabla 1 | Verificado |
| Variabilidad ±2 DE por ventana | Tabla II (12–18, 18–24, 24–30, 30–36, 36–42 sem) | Hadlock 1984, Tabla II | Verificado |
| Peso fetal estimado | CC-CA-LF (principal), DBP-CA-LF o CA-LF | Hadlock FP et al. *Am J Obstet Gynecol* 1985;151:333–7, Tabla II | Verificado |
| Elección del modelo CC-CA-LF | El más exacto entre 70 modelos | Hammami A et al. *Ultrasound Obstet Gynecol* 2018;52:35–43 | Verificado (conclusión) |
| FEVI y volúmenes del VI | Método de discos (Simpson modificado), mono o biplano | Lang RM et al. ASE/EACVI, *J Am Soc Echocardiogr* 2015;28:1–39 | Verificado (resumen oficial ASE 2018) |
| FEVI normal | Hombres 52–72 %, mujeres 54–74 % | ASE/EACVI 2015 | Verificado |
| Fracción de acortamiento | Se muestra con la leyenda «uso desaconsejado» | ASE/EACVI 2015 | Verificado |
| ~~Teichholz~~ | **Retirado**: «Volumes derived from linear measurements should NOT be used» | ASE/EACVI 2015; Teichholz LE et al. *Am J Cardiol* 1976;37:7–11 | Retirado |
| PET: volumen metabólico | Isocontorno 3D al 41 % (VOI41) o 50 % (VOI50) del SUV máx | Boellaard R et al. EANM v2.0, *EJNMMI* 2015;42:328–54 | Verificado (texto original) |
| PET: si VOI41 no sirve | Se usa VOI50; si tampoco, solo SUV máx y SUVpeak | EANM 2015 | Verificado |
| PET: SUVpeak | Esfera de 1.0 mL (1.2 cm de diámetro), media máxima | EANM 2015; Wahl RL et al. PERCIST, *J Nucl Med* 2009;50(S1):122S–150S | Verificado |
| PET: TLG | SUV medio × MTV | EANM 2015 | Verificado |
| PET: escala de lectura | Se abre en SUV 0–10, inversa lineal; misma escala en seguimientos | EANM 2015 (ejemplo del texto) | Verificado |
| PET: ventanas SUV 0–3 … 0–20 | Atajos de escala fija | — | Convención |
| PET: «salta» al foco a ≤15 mm del clic | Busca el vóxel más caliente cerca del clic | — | Heurística |
| Crecimiento de región (TC/RM) | Semilla + tolerancia, conectividad 6, tejido sólido 5/6 | Adams R, Bischof L. *IEEE TPAMI* 1994;16:641–7 (método) | Heurística (tolerancias y reintentos propios; la volumetría semiautomática varía 16–22 % entre programas, por eso se pinta para revisión visual) |
| «Extensión» de la lesión | Caja que la contiene, en los ejes del volumen | — | No son diámetros RECIST; así se rotula |
| Densidades 3D: calcio | ≥130 UH | Agatston AS et al. *J Am Coll Cardiol* 1990;15:827–32 | Verificado (fuentes secundarias) |
| Densidades 3D: grasa | −190 a −30 UH | Yoshizumi T et al. *Radiology* 1999;211:283–6 | Verificado |
| Densidades 3D: enfisema | < −950 UH (LAA-950) | Gevenois PA et al. *Am J Respir Crit Care Med* 1996;154:187–92 | Verificado |
| Densidades 3D: hueso, contraste, tejido blando, pulmón, aire | Rangos de visualización | — | Convención |
| Ventanas de TC (cerebro 80/40, pulmón 1500/−600…) | Atajos W/L | Radiopaedia «Windowing (CT)»; guías ARRT; varían por fuente | Convención |
| Etiqueta de mastografía (LCC, RMLO…) | Lateralidad + proyección desde DICOM | MQSA/ACR (vista estandarizada y lateralidad obligatorias); DICOM PS3.16 CID 4014 | Verificado |
| Mamas enfrentadas, ajuste al tejido | Colgado de lectura | — | Convención |
| PET invertido al abrir | Presentación de lectura | — | Convención |
| Etiquetado de vértebras | Numeración secuencial C1…S1 que pone el médico | — | Sin inferencia automática; el médico decide el nivel (atención a vértebras de transición) |
| 3D de vasos (aorta, tórax, pulmonares, coronarias) | Curvas propias PX-CTA-*: transparente < 110–150 UH, luz con contraste roja (pulmonares azul), hueso > 500 UH marfil | — (umbrales propios; la sangre sin contraste mide ~40 UH, como el músculo) | Convención. Los ajustes de fábrica de VTK/3D Slicer se retiraron: «CT-Chest-Vessels» es opaco desde −1278 UH y «CT-Pulmonary-Arteries» desde −568 UH (todo sale rojo); «CT-Coronary-Arteries-2» pinta la luz con contraste de blanco como hueso |
| Modos de vasos apagados en serie simple | Contraste por (0018,0010) o por la descripción de serie/protocolo («native», «simple», «sin contraste», «calcium score»…) | DICOM PS3.3 C.7.6.4 (Contrast/Bolus) | Heurística: si nada lo dice, se permite con un aviso |

## Del visor al informe
- Las medidas viajan con nombre, valor, unidad, método, referencia, imagen (UID y cuadro) e identificador de lesión
  (L1, L2…). Seguimiento con RECIST 1.1 (Eisenhauer EA et al. *Eur J Cancer* 2009;45:228–47), PERCIST orientativo
  (Wahl 2009) y tiempo de duplicación de volumen (Schwartz M. *Cancer* 1961;14:1272–94).
- Al firmar se guardan en el PACS como DICOM SR (TID 1500, DICOM PS3.16) y la segmentación «Lesiones» como DICOM SEG.
- Revisión por pares con la escala RADPEER 1–4 y significancia a/b (Goldberg-Stein S et al. *J Am Coll Radiol*
  2017;14:1080–6).
- Guardar (medidas, imágenes clave, SR/SEG, crítico, revisión) solo lo puede un radiólogo con sesión de pixOS y
  membresía activa en la organización del estudio; el servidor lo vuelve a revisar.

## Pendiente de validar antes de uso clínico formal
- Validación local de «Volumen de lesión» contra segmentación manual (TC, RM, PET) y en maniquí (perfil QIBA de
  volumetría por TC).
- FEVI por discos contra el equipo de ecocardiografía en una serie de casos.
- Revisión regulatoria: si estas mediciones se usan para diagnóstico, el visor entra como software de dispositivo
  médico (COFEPRIS / FDA SaMD). Mientras tanto se presentan como apoyo y el médico confirma.

## Enlaces oficiales (para descargar lo que no está en la carpeta)
- ASE/EACVI 2015, texto completo: https://www.asecho.org/guideline/cardiac-chamber-quantification-by-echo-in-adults/
  (DOI 10.1016/j.echo.2014.10.003)
- EANM 2015: https://doi.org/10.1007/s00259-014-2961-x (PMC4315529)
- PERCIST: https://jnm.snmjournals.org/content/50/Suppl_1/122S
- Hadlock 1984: https://pubmed.ncbi.nlm.nih.gov/6739822/ · Hadlock 1985: https://pubmed.ncbi.nlm.nih.gov/3881966/
- Hammami 2018: https://doi.org/10.1002/uog.19066
- Teichholz 1976: https://pubmed.ncbi.nlm.nih.gov/1244736/
- Agatston 1990: https://pubmed.ncbi.nlm.nih.gov/2407762/
- Yoshizumi 1999: https://pubmed.ncbi.nlm.nih.gov/?term=Yoshizumi+abdominal+fat+standardized+technique+CT+1999
- Gevenois 1996: https://pubmed.ncbi.nlm.nih.gov/?term=Gevenois+computed+density+microscopic+morphometry+emphysema
- Adams & Bischof 1994: https://doi.org/10.1109/34.295913
- DICOM CID 4014: https://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_CID_4014.html
- ACR, identificación de imágenes de mastografía: https://accreditationsupport.acr.org/support/solutions/articles/11000065937
