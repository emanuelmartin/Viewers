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
| TC: nódulo o masa en pulmón | Si ≥30 % de la cáscara de 10–40 mm es pulmón (< −400 UH): umbral a la mitad entre el centro del nódulo y el pulmón (medias 3×3×3), conectividad 6, apertura morfológica de 1.5 a 8 mm solo si se desborda | Kostis WJ et al. *IEEE TMI* 2003;22:1259–74 (umbral + apertura); Gavrielides MA et al. *Opt Express* 2010;18:15244 (maniquí FDA) | Validado con datos públicos (ver abajo); si se une al mediastino no da volumen |
| TC: aviso de nódulo pequeño | < 0.25 mL, o < 1 mL con cortes > 1.5 mm: «el volumen no es confiable, reporta el diámetro» | Medido en el maniquí FDA (abajo); Fleischner 2017 (diámetro medio en nódulos pequeños) | Validado |
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

## Validación con datos públicos (2026-11-11)
Pruebas `src/validacionPet.data.test.ts` y `src/validacionCt.data.test.ts` con el código real del visor; datos y scripts
en `validacion/`.

**PET, objetos digitales de referencia de QIBA** (Pierce LA et al. *Radiology* 2015;277:538–45):
- Conversión a SUV con `@cornerstonejs/calculate-suv`: 4.000 en las esferas y 1.000 de fondo (exacto, aceptable
  3.999–4.001).
- SUVpeak de 1 mL: igual a la búsqueda por fuerza bruta a 3 decimales; no se deja engañar por un vóxel caliente.
- VOI41 sin ruido: idéntico al isocontorno EANM de referencia.
- Con ruido (6 mm FWHM), contraste 4:1, el VOI41 sobrestima (frontera ruidosa): +27 % en el cubo de 46.7 mL y en la
  esfera de 23.7 mL, +51 % en la de 1.15 mL; con contraste 2:1 y en la esfera de 0.52 mL el visor responde «no
  confiable» en vez de dar un volumen. Es límite del método de umbral fijo (EANM lo advierte), no del cálculo.
- Errores corregidos por la validación: el «salto» al vóxel más caliente elegía una esquina de una meseta y la regla
  5/6 bloqueaba PET (0.03 mL en un cubo de 46.7 mL); ahora gana el vóxel más cercano y PET usa el isocontorno simple.

**TC, maniquí pulmonar de la FDA** (layout 3, 100 mAs, filtro B40f; volumen verdadero conocido):

| Nódulo (−630 / +100 UH) | 0.75 mm (toma 1; la toma 2 difiere ≤ 1 % salvo donde se indica) | 1.5 mm | 3 mm |
|---|---|---|---|
| 40 mm | −1.8 % / 0.0 % | −1.2 % / +0.1 % | −0.9 % / +0.5 % |
| 20 mm | +1.5 % / −0.5 % | +1.7 % / −0.6 % | −3.5 % / −1.1 % |
| 10 mm | +0.8 % (toma 2: +10 %) / −3.2 % | −6.9 % / −8.5 % | +0.4 % / −15 % (ambos con aviso) |
| 8 mm | −37 % / −7.8 % (ambos con aviso) | −19 % / −7.5 % (ambos con aviso) | +112 % / +8 % (ambos con aviso) |
| 5 mm | −79 % / −25 % (ambos con aviso) | −65 % / −31 % (ambos con aviso) | +413 % / +231 % (ambos con aviso) |

De 10 mm en adelante con cortes de hasta 1.5 mm, error ≤ 12 %; de 20 mm en adelante, ≤ 5 % aun con cortes de 3 mm. Por
debajo de 8 mm el visor avisa que el volumen no es confiable (coincide con lo publicado: la volumetría de nódulos
pequeños depende del grosor de corte y del tamaño).

**TC, RIDER Lung CT** (5 pacientes, filtro LUNG de 1.25 mm, dos tomas en 15 min, 5 lectores de QIBA; Zhao B et al.
*Radiology* 2009;252:263–72):
- Nódulo aislado de ~0.6 mL: 584–656 mm³ con el clic de cualquiera de los 5 lectores (los lectores: 419–778 mm³);
  cambio entre toma y retoma −3 % (Zhao: un cambio mayor de ±8 % no es variación de medición).
- Dos masas de 22 y 30 mL unidas al mediastino: el visor responde que se desborda y pide el pincel; no inventa un
  volumen (antes de esta validación daba hasta 940 mL sin aviso).
- Dos lesiones mal definidas en que los lectores difieren 5–15 veces (0.4–7.5 mL): el visor da valores bajos y
  dependientes del punto; nunca más que el lector más alto. Para estas, segmentación manual.
- Errores corregidos: con tolerancia ± 50 UH el filtro LUNG (vecinos que saltan cientos de UH) daba 0–3 mm³; se agregó
  el modo de nódulo en pulmón y las comparaciones usan la media 3×3×3.

## Pendiente de validar antes de uso clínico formal
- «Volumen de lesión» en TC fuera del pulmón (hígado, ganglios) y en RM contra segmentación manual; masas pulmonares
  unidas al mediastino (hoy el visor pide el pincel).
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
