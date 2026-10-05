/**
 * Reporting workflows per study type. The server picks the workflow id from
 * the study's tags (getStudyWorkflow: modality + region + type); each step
 * is one click in the PixOS panel.
 *
 * Step kinds
 *   window   W/L preset on the active viewport (voi = [lower, upper] HU)
 *   layout   hanging protocol (MPR, 3D…)
 *   slab     MIP / MinIP / average slab (volume viewports)
 *   tool     activates a measurement tool (toolName of the cornerstone tool group)
 *   segment  new segmentation (volumes in the panel)
 *   clicksegment  one-click region segmentation of a lesion (+ brush to correct), then volumes
 *   vista3d  one click → MONAI VISTA3D lesion mask (GPU; evaluation licence; AI roles only)
 *   ai       GPU / AI analysis (BOFH only, for now)
 *   calc     calculator of the panel on the marked measurements
 *   guide    reminder for the report (scale, classification)
 *   send     send measurements and results to the report
 *   section  scrolls to a section of the panel (target = element id)
 */

export type Step =
  | { kind: 'window'; label: string; voi: [number, number] }
  | { kind: 'layout'; label: string; protocolId: string }
  | { kind: 'slab'; label: string; slabId: string }
  | { kind: 'tool'; label: string; toolName: string; hint?: string }
  | { kind: 'segment'; label: string; hint?: string }
  | { kind: 'clicksegment'; label: string; hint?: string }
  | { kind: 'vista3d'; label: string; lesion: string; hint?: string }
  | { kind: 'ai'; label: string; hint?: string }
  | { kind: 'calc'; label: string; calcId: string; hint?: string }
  | { kind: 'guide'; label: string; hint: string }
  | { kind: 'send'; label: string }
  | { kind: 'section'; label: string; target: string; hint?: string }
  | { kind: 'compare'; label: string }
  | { kind: 'priors'; label: string }
  | { kind: 'followup'; label: string; calc: 'recist' | 'growth' | 'ri'; hint?: string };

export type Workflow = { title: string; steps: Step[] };
export type Module = { title: string; steps: Step[] };

// W/L presets as [lower, upper]
const W = {
  brain: [0, 80] as [number, number],
  subdural: [-25, 175] as [number, number],
  bone: [-770, 1730] as [number, number],
  lung: [-1350, 150] as [number, number],
  mediastinum: [-125, 225] as [number, number],
  abdomen: [-160, 240] as [number, number],
  liver: [5, 155] as [number, number],
  angio: [-130, 470] as [number, number],
};

const send: Step = { kind: 'send', label: 'Enviar al informe' };
const length = (hint?: string): Step => ({ kind: 'tool', label: 'Longitud', toolName: 'Length', hint });
const roi = (hint?: string): Step => ({ kind: 'tool', label: 'ROI (densidad/señal)', toolName: 'EllipticalROI', hint });
const bidir = (hint?: string): Step => ({ kind: 'tool', label: 'Bidireccional', toolName: 'Bidirectional', hint });
const mpr: Step = { kind: 'layout', label: 'MPR', protocolId: 'mpr' };
// One-click lesion volume: region growing from the clicked point, brush to correct, then «Calcular volúmenes»
const clickSeg = (label: string, hint?: string): Step => ({ kind: 'clicksegment', label, hint });
const vista = (label: string, lesion: string, hint?: string): Step => ({ kind: 'vista3d', label: `${label} con IA (VISTA3D, evaluación)`, lesion, hint });
const brush: Step = { kind: 'tool', label: 'Pincel (corregir segmentación)', toolName: 'CircularBrush', hint: 'Arrastre para añadir; use el borrador del panel de segmentación para quitar' };

export const WORKFLOWS: Record<string, Workflow> = {
  ct_head: {
    title: 'TC de cráneo',
    steps: [
      { kind: 'window', label: 'Ventana cerebro', voi: W.brain },
      { kind: 'window', label: 'Ventana subdural', voi: W.subdural },
      { kind: 'window', label: 'Ventana ósea', voi: W.bone },
      { kind: 'ai', label: 'Detección de hemorragia (GPU)', hint: 'Volumen de hemorragia intracraneal; verificar siempre' },
      mpr,
      length('Desviación de la línea media / espesor de colección'),
      roi('Densidad de una lesión (UH)'),
      { kind: 'calc', label: 'Volumen de hematoma (ABC/2)', calcId: 'abc2', hint: 'Marque 3 diámetros del hematoma' },
      clickSeg('Volumen de hematoma con un clic', 'Clic dentro del hematoma; el volumen exacto complementa al ABC/2'),
      { kind: 'guide', label: 'ASPECTS', hint: 'Si hay isquemia aguda: ASPECTS en la calculadora del informe' },
      send,
    ],
  },
  ct_chest: {
    title: 'TC de tórax',
    steps: [
      { kind: 'window', label: 'Ventana pulmonar', voi: W.lung },
      { kind: 'window', label: 'Ventana mediastino', voi: W.mediastinum },
      mpr,
      { kind: 'slab', label: 'MIP 10 mm (nódulos)', slabId: 'mip10' },
      { kind: 'ai', label: 'Detectar nódulos (GPU)', hint: 'Candidatos con diámetro; «Ver en imagen» los ubica' },
      bidir('Diámetros del nódulo o lesión'),
      vista('Tumor pulmonar', 'pulmon', 'Clic en el centro de la masa o nódulo sólido: volumen 3D'),
      { kind: 'guide', label: 'Fleischner / Lung-RADS', hint: 'Nódulo incidental: Fleischner; tamizaje: Lung-RADS (calculadora del informe)' },
      send,
    ],
  },
  ct_abdomen: {
    title: 'TC de abdomen y pelvis',
    steps: [
      { kind: 'window', label: 'Ventana abdomen', voi: W.abdomen },
      { kind: 'window', label: 'Ventana hígado', voi: W.liver },
      mpr,
      { kind: 'ai', label: 'Volumetría de órganos (GPU)', hint: 'Hígado, bazo, riñones, páncreas: volumen y UH' },
      roi('Densidad de lesión, hígado o bazo (UH)'),
      bidir('Diámetros de lesiones'),
      { kind: 'calc', label: 'Lavado suprarrenal', calcId: 'washout', hint: 'ROIs en fase simple, venosa y tardía, en ese orden' },
      clickSeg('Volumen de lesión con un clic', 'Clic dentro de la lesión (quiste, masa, colección); corrija con el pincel'),
      vista('Lesión hepática', 'higado', 'Clic en el centro de la lesión hepática'),
      vista('Lesión pancreática', 'pancreas', 'Clic en el centro de la lesión'),
      vista('Lesión ósea', 'hueso', 'Clic en la lesión lítica o blástica'),
      brush,
      { kind: 'guide', label: 'Bosniak / LI-RADS', hint: 'Quiste renal complejo: Bosniak; hígado cirrótico: LI-RADS' },
      { kind: 'guide', label: 'Incidentalomas (ACR)', hint: 'Suprarrenal, hepático, quiste pancreático, aorta: calculadora «Incidentalomas» del informe' },
      { kind: 'guide', label: 'Hallazgos oportunistas', hint: 'L1 ≤ 110 UH sugiere osteoporosis; aorta ≥ 30 mm aneurisma (volumetría GPU)' },
      send,
    ],
  },
  ct_urotac: {
    title: 'UroTAC',
    steps: [
      { kind: 'window', label: 'Ventana abdomen', voi: W.abdomen },
      { kind: 'window', label: 'Ventana ósea (litos)', voi: W.bone },
      mpr,
      { kind: 'slab', label: 'MIP 10 mm', slabId: 'mip10' },
      { kind: 'tool', label: 'Sonda (UH del lito)', toolName: 'Probe' },
      length('Diámetro mayor del lito y distancia a la unión ureterovesical'),
      { kind: 'ai', label: 'Volumetría renal (GPU)', hint: 'Volumen de ambos riñones' },
      send,
    ],
  },
  ct_angio: {
    title: 'Angiotomografía',
    steps: [
      { kind: 'window', label: 'Ventana angio', voi: W.angio },
      mpr,
      { kind: 'slab', label: 'MIP 20 mm', slabId: 'mip20' },
      { kind: 'layout', label: 'MPR + 3D', protocolId: 'mprAnd3DVolumeViewport' },
      length('Calibre del vaso / longitud de estenosis'),
      { kind: 'calc', label: 'Relación VD/VI (TEP)', calcId: 'ratio', hint: 'Marque diámetro del VD y del VI en eje axial: ≥ 1 sugiere sobrecarga' },
      { kind: 'guide', label: 'CAD-RADS / Stanford', hint: 'Coronarias: CAD-RADS; disección aórtica: Stanford A o B' },
      send,
    ],
  },
  ct_spine: {
    title: 'TC de columna',
    steps: [{ kind: 'window', label: 'Ventana ósea', voi: W.bone }, mpr, length('Altura de cuerpos, diámetro del canal'),
      { kind: 'tool', label: 'Ángulo de Cobb', toolName: 'CobbAngle' }, send],
  },
  ct_msk: {
    title: 'TC musculoesquelética',
    steps: [{ kind: 'window', label: 'Ventana ósea', voi: W.bone }, mpr, { kind: 'layout', label: '3D', protocolId: 'only3D' },
      length(), { kind: 'tool', label: 'Ángulo', toolName: 'Angle' }, send],
  },
  mr_brain: {
    title: 'RM de encéfalo',
    steps: [mpr, { kind: 'ai', label: 'Volumetría cerebral (GPU)', hint: 'Hipocampos, ventrículos, sustancia gris y blanca (T1 3D)' },
      length(), roi('Señal de una lesión'), clickSeg('Volumen de lesión con un clic', 'Clic dentro de la lesión en la secuencia donde mejor se delimita'), brush,
      { kind: 'calc', label: 'Índice de Evans', calcId: 'ratio', hint: 'Astas frontales y diámetro interno del cráneo' },
      { kind: 'guide', label: 'Fazekas', hint: 'Lesiones de sustancia blanca: Fazekas en la calculadora del informe' }, send],
  },
  mr_spine: {
    title: 'RM de columna',
    steps: [mpr, length('Protrusión discal, diámetro del canal'), { kind: 'tool', label: 'Ángulo', toolName: 'Angle' }, send],
  },
  mr_msk: { title: 'RM musculoesquelética', steps: [mpr, length(), roi(), send] },
  mr_abdomen: {
    title: 'RM de abdomen / pelvis',
    steps: [mpr, bidir('Diámetros de lesiones'), roi(), { kind: 'calc', label: 'Volumen elipsoide (próstata, lesión)', calcId: 'ellipsoid', hint: '3 diámetros ortogonales' },
      { kind: 'guide', label: 'PI-RADS / LI-RADS', hint: 'Próstata: PI-RADS; hígado: LI-RADS' }, send],
  },
  dx_chest: {
    title: 'Radiografía de tórax',
    steps: [length('Diámetro cardiaco y torácico'),
      { kind: 'calc', label: 'Índice cardiotorácico', calcId: 'ratio', hint: 'Marque las 2 longitudes' },
      { kind: 'ai', label: 'Clasificador de tórax (validación)', hint: 'Probabilidades orientativas' }, send],
  },
  dx_spine: { title: 'Radiografía de columna', steps: [{ kind: 'tool', label: 'Ángulo de Cobb', toolName: 'CobbAngle' }, length('Altura de cuerpos vertebrales'), send] },
  dx_msk: { title: 'Radiografía musculoesquelética', steps: [length(), { kind: 'tool', label: 'Ángulo', toolName: 'Angle' }, send] },
  us_abdomen: {
    title: 'Ultrasonido abdominal',
    steps: [length('Diámetros de órganos y lesiones'), { kind: 'calc', label: 'Volumen elipsoide', calcId: 'ellipsoid', hint: '3 diámetros' }, send],
  },
  us_thyroid: {
    title: 'Ultrasonido de tiroides',
    steps: [length('Diámetros de lóbulos y nódulos'), { kind: 'calc', label: 'Volumen elipsoide (lóbulo)', calcId: 'ellipsoid', hint: '3 diámetros' },
      { kind: 'guide', label: 'ACR TI-RADS', hint: 'Cada nódulo: TI-RADS en la calculadora del informe' }, send],
  },
  us_breast: { title: 'Ultrasonido mamario', steps: [length('Diámetros del nódulo'), { kind: 'guide', label: 'BI-RADS', hint: 'Categoría BI-RADS obligatoria al firmar' }, send] },
  us_pelvis: {
    title: 'Ultrasonido pélvico',
    steps: [length(), { kind: 'calc', label: 'Volumen elipsoide (útero, ovario, próstata, vejiga)', calcId: 'ellipsoid', hint: '3 diámetros' },
      { kind: 'guide', label: 'O-RADS', hint: 'Lesión anexial: O-RADS en la calculadora del informe' }, send],
  },
  us_doppler: {
    title: 'Ultrasonido Doppler',
    steps: [length(), { kind: 'tool', label: 'Sonda', toolName: 'Probe' },
      { kind: 'guide', label: 'Estenosis carotídea (SRU)', hint: 'VPS y VFD de ACI y VPS de ACC: calculadora «Estenosis carotídea» del informe' },
      { kind: 'followup', label: 'Índice de resistencia', calc: 'ri', hint: 'VPS y VFD' }, send],
  },
  us_msk: { title: 'Ultrasonido musculoesquelético', steps: [length(), send] },
  mg_breast: { title: 'Mastografía', steps: [length(), { kind: 'guide', label: 'BI-RADS', hint: 'Categoría BI-RADS y densidad' }, send] },
  us_transplant: {
    title: 'Doppler de injerto renal',
    steps: [
      length('Injerto: longitudinal, transverso y anteroposterior'),
      { kind: 'section', label: 'Volumen del injerto', target: 'pixos-graft', hint: '«De 3 longitudes» (elipsoide)' },
      { kind: 'guide', label: 'Escala de grises', hint: 'Diferenciación corticomedular, ecogenicidad cortical, hidronefrosis (grado y pelvis AP), colecciones perinjerto (linfocele, urinoma, hematoma) con volumen' },
      { kind: 'tool', label: 'Sonda (velocidades)', toolName: 'Probe' },
      { kind: 'guide', label: 'Doppler arterial', hint: 'IR en arterias segmentarias/interlobares de polo superior, medio e inferior (mediana); VPS en la anastomosis y en la iliaca externa; tiempo de aceleración; morfología parvus tardus' },
      { kind: 'guide', label: 'Doppler venoso', hint: 'Vena renal permeable con flujo fásico; diástole arterial invertida + sin flujo venoso = trombosis' },
      { kind: 'section', label: 'Interpretación y evolución', target: 'pixos-graft', hint: 'Estenosis: VPS > 200–250 cm/s, relación > 1.8–3, TA > 0.1 s; IR ≥ 0.80 inespecífico' },
      { kind: 'compare', label: 'Comparar con el previo' },
      send,
    ],
  },
  xa_angio: {
    title: 'Coronariografía / hemodinamia',
    steps: [
      { kind: 'section', label: 'Adquisiciones, proyecciones y dosis', target: 'pixos-xa', hint: 'Clic en una adquisición para verla; «Técnica y dosis al informe»' },
      { kind: 'section', label: 'Bitácora del procedimiento', target: 'pixos-procedure', hint: 'Marque momentos sobre la imagen: acceso, lesiones, FFR/iFR, IVUS/OCT, balones, stents, marcapasos, fármacos, complicaciones; «Relato al informe»' },
      { kind: 'guide', label: 'Dominancia', hint: 'Arteria que da la descendente posterior: derecha, izquierda o codominante' },
      { kind: 'guide', label: 'Revisión por segmentos', hint: 'TCI; DA proximal/media/distal y diagonales; CX y marginales; CD proximal/media/distal, DP y PL; puentes y colaterales (Rentrop)' },
      { kind: 'tool', label: 'Calibración (catéter)', toolName: 'CalibrationLine', hint: 'Sobre el catéter: 5 Fr = 1.67 mm, 6 Fr = 2.0 mm, 7 Fr = 2.33 mm' },
      length('Diámetro de referencia y luminal mínimo; longitud de la lesión'),
      { kind: 'section', label: 'QCA (% de estenosis)', target: 'pixos-qca', hint: '«De las longitudes»; 50–69% intermedia: FFR/iFR' },
      { kind: 'section', label: 'TIMI frame count', target: 'pixos-tfc', hint: 'Cuadro inicial y final de la arteria culpable' },
      { kind: 'guide', label: 'Bifurcaciones y complejidad', hint: 'Medina (rama principal proximal, distal, lateral: 1,1,1…); oclusión crónica (J-CTO); SYNTAX en multivaso o TCI' },
      { kind: 'guide', label: 'Flujo y conclusión', hint: 'TIMI 0–3 por vaso; número de vasos con lesión ≥ 70% (≥ 50% en TCI); FEVI si hubo ventriculografía' },
      { kind: 'section', label: 'Relato del procedimiento', target: 'pixos-procedure', hint: 'Revise el relato generado y envíelo al informe' },
      send,
    ],
  },
  generic: { title: 'Estudio', steps: [length(), roi(), send] },
};


/** Extra steps per clinical scenario (from the order's reason, report and tags). */
export const SCENARIO_MODULES: Record<string, Module> = {
  trauma: {
    title: 'Trauma',
    steps: [
      { kind: 'window', label: 'Ventana ósea (fracturas)', voi: W.bone },
      { kind: 'layout', label: 'Reconstrucción 3D', protocolId: 'only3D' },
      { kind: 'guide', label: 'Revisión sistemática', hint: 'Fracturas, hemorragia, neumotórax, lesión de órgano sólido, líquido libre, columna' },
      { kind: 'guide', label: 'Grado AAST', hint: 'Bazo, hígado o riñón: grado AAST en la calculadora del informe' },
      { kind: 'guide', label: 'Hallazgo crítico', hint: 'Si hay hemorragia, neumotórax o lesión inestable: «Hallazgo crítico» en el informe' },
    ],
  },
  oncologia: {
    title: 'Oncología',
    steps: [
      bidir('Lesiones diana: hasta 5 (2 por órgano); ganglios por eje corto'),
      { kind: 'followup', label: 'RECIST 1.1 contra el basal', calc: 'recist', hint: 'Suma de diámetros actual contra la del estudio basal' },
      clickSeg('Volumen de lesión diana con un clic', 'Volumen 3D complementario al diámetro; compare con el previo'),
      vista('Lesión diana', 'higado', 'VISTA3D para lesión hepática; para pulmón use el paso de TC de tórax'),
      { kind: 'guide', label: 'Lesiones nuevas', hint: 'Una lesión nueva inequívoca es progresión aunque la suma no cambie' },
    ],
  },
  trasplante: {
    title: 'Trasplante',
    steps: [
      length('Tamaño del injerto'),
      { kind: 'followup', label: 'Índice de resistencia', calc: 'ri', hint: 'VPS y VFD del Doppler: IR normal 0.5–0.79' },
      { kind: 'guide', label: 'Revisión del injerto', hint: 'Hidronefrosis, colecciones perinjerto (volumen y evolución), perfusión, anastomosis arterial y vena renal' },
      { kind: 'guide', label: 'En TC/RM', hint: 'Colecciones, hidronefrosis, permeabilidad de la anastomosis (angio), lesiones del injerto y de los riñones nativos (cáncer renal adquirido)' },
    ],
  },
  infeccion: {
    title: 'Infección',
    steps: [roi('Densidad de colección (UH)'), clickSeg('Volumen de colección o absceso con un clic'),
      { kind: 'guide', label: 'Complicaciones', hint: 'Colecciones, gas, trombosis, extensión' }],
  },
  vascular_evc: {
    title: 'Vascular / EVC',
    steps: [{ kind: 'window', label: 'Ventana cerebro', voi: W.brain },
      { kind: 'calc', label: 'Volumen de hematoma (ABC/2)', calcId: 'abc2', hint: '3 diámetros' },
      { kind: 'guide', label: 'ASPECTS / territorio', hint: 'Isquemia: ASPECTS; hemorragia: volumen y extensión ventricular' }],
  },
  litiasis: {
    title: 'Litiasis',
    steps: [{ kind: 'tool', label: 'Sonda (UH del lito)', toolName: 'Probe' }, length('Diámetro mayor del lito'),
      { kind: 'guide', label: 'Obstrucción', hint: 'Hidronefrosis, ubicación (cáliz, pelvis, uréter, UUV) y tamaño' }],
  },
  nodulo_seguimiento: {
    title: 'Nódulo en seguimiento',
    steps: [bidir('Diámetros del nódulo'),
      { kind: 'followup', label: 'Tiempo de duplicación', calc: 'growth', hint: 'Diámetro previo y actual' }],
  },
  postquirurgico: {
    title: 'Posquirúrgico',
    steps: [{ kind: 'window', label: 'Ventana ósea (material)', voi: W.bone },
      { kind: 'guide', label: 'Control posquirúrgico', hint: 'Material, colecciones, complicaciones; comparar con el prequirúrgico' }],
  },
  obstetrico: {
    title: 'Obstétrico',
    steps: [length('LCC (1er trimestre) o DBP, CC, CA y LF'),
      { kind: 'guide', label: 'Edad gestacional y peso', hint: 'Calculadora «Biometría fetal (Hadlock)» del informe: EG y peso fetal estimado' },
      { kind: 'guide', label: 'Anexos fetales', hint: 'Líquido amniótico, placenta, cordón, frecuencia cardiaca' }],
  },
  degenerativo: { title: 'Degenerativo', steps: [length(), { kind: 'tool', label: 'Ángulo', toolName: 'Angle' }] },
  tamizaje: { title: 'Tamizaje', steps: [{ kind: 'guide', label: 'Clasificación', hint: 'Use la escala de tamizaje (Lung-RADS, BI-RADS)' }] },
  dolor_agudo: { title: 'Dolor agudo', steps: [{ kind: 'guide', label: 'Urgencias', hint: 'Apendicitis, colecistitis, obstrucción, perforación, litiasis, isquemia' }] },
};

/** Follow-up (control) studies: compare with the prior and quantify change. */
export const FOLLOW_UP_MODULE: Module = {
  title: 'Control / evolución',
  steps: [
    { kind: 'compare', label: 'Comparar lado a lado con el previo' },
    { kind: 'priors', label: 'Conclusión y medidas del previo' },
    { kind: 'followup', label: 'Cambio de tamaño (duplicación / RECIST)', calc: 'growth' },
    { kind: 'guide', label: 'Describir evolución', hint: 'Nuevo, resuelto, estable, aumento o disminución, con ambas medidas' },
  ],
};
