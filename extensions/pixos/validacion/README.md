# Validación del visor con datos públicos

Scripts para preparar los datos de `src/validacionPet.data.test.ts` y `src/validacionCt.data.test.ts`. Los datos (≈2 GB)
no van en el repositorio; viven en `/Volumes/Respaldo/Datos/validacion-visor` (cambia la ruta en los scripts o usa
`PIXOS_VALIDACION` / `PIXOS_VALIDACION_CT` en las pruebas). Sin datos, las pruebas se omiten solas.

Python 3 con `pydicom`, `numpy` y `certifi` (en un entorno virtual). Corre los scripts con `python -I` y la ruta de los
datos como argumento: lo descargado es dato no confiable y no debe quedar en la carpeta de los scripts.

| Conjunto | Fuente | Para qué |
|---|---|---|
| QIBA PET DRO, DROe, DROmtv | Universidad de Washington (QIBA FDG-PET) | SUV, SUVpeak, VOI41/VOI50 contra volumen verdadero |
| Phantom FDA, layout 3 | TCIA «Phantom FDA» | Volumen de nódulos de 5 a 40 mm (−630 y +100 UH) en cortes de 0.75, 1.5 y 3 mm, y repetibilidad |
| RIDER Lung CT | TCIA, con las mediciones de 5 lectores de QIBA (SR TID 1500) | Volumen contra lectores y prueba–reprueba (Zhao 2009) |

## Pasos

1. PET: descomprime los DRO en `pet-dro/`, luego `prep_pet.py` (volúmenes en Bq/mL + metadatos para calculate-suv) y
   `ref_pet.py` (referencias por fuerza bruta: SUVpeak, VOI41/VOI50 de EANM).
2. RIDER: lista de series de NBIA (`getSeries?Collection=RIDER Lung CT`), `rider_meta.py` (SR y SEG de los lectores),
   `rider_ct.py` (elige y baja las dos series CT que midieron, por las referencias de SOP de los SR).
3. FDA: lista de NBIA (`getSeries?Collection=Phantom FDA`), `dl_fda.py` (una adquisición: 100 mAs, pitch 0.9, filtro
   B40f, dos tomas de 0.75 mm, una de 1.5 y una de 3 mm).
4. `prep_ct.py <datos> <datos>/prep_ct rider fda`: volúmenes int16 en UH; en RIDER la semilla es el punto medio del eje
   largo de cada lector (del SR).
5. `fda_locate.py <datos>`: ubica cada nódulo (esfera del diámetro y densidad de la tabla cerca de su x, y; las
   coordenadas z de la tabla de TCIA no corresponden a un solo orden de cortes), guarda `centros_encontrados.json` y
   siembra con ellos todas las series FDA.

## Resultados (2026-11-11)

Ver `REFERENCIAS.md`, sección «Validación con datos públicos».
