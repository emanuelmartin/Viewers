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
 *   ai       GPU / AI analysis (BOFH only, for now)
 *   calc     calculator of the panel on the marked measurements
 *   guide    reminder for the report (scale, classification)
 *   send     send measurements and results to the report
 */

export type Step =
  | { kind: 'window'; label: string; voi: [number, number] }
  | { kind: 'layout'; label: string; protocolId: string }
  | { kind: 'slab'; label: string; slabId: string }
  | { kind: 'tool'; label: string; toolName: string; hint?: string }
  | { kind: 'segment'; label: string; hint?: string }
  | { kind: 'ai'; label: string; hint?: string }
  | { kind: 'calc'; label: string; calcId: string; hint?: string }
  | { kind: 'guide'; label: string; hint: string }
  | { kind: 'send'; label: string };

export type Workflow = { title: string; steps: Step[] };

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

export const WORKFLOWS: Record<string, Workflow> = {
  ct_head: {
    title: 'TC de cráneo',
    steps: [
      { kind: 'window', label: 'Ventana cerebro', voi: W.brain },
      { kind: 'window', label: 'Ventana subdural', voi: W.subdural },
      { kind: 'window', label: 'Ventana ósea', voi: W.bone },
      mpr,
      length('Desviación de la línea media / espesor de colección'),
      roi('Densidad de una lesión (UH)'),
      { kind: 'calc', label: 'Volumen de hematoma (ABC/2)', calcId: 'abc2', hint: 'Marque 3 diámetros del hematoma' },
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
      { kind: 'segment', label: 'Volumen de lesión por segmentación', hint: 'Pinte o use umbral; luego «Calcular volúmenes»' },
      { kind: 'guide', label: 'Bosniak / LI-RADS', hint: 'Quiste renal complejo: Bosniak; hígado cirrótico: LI-RADS' },
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
      { kind: 'guide', label: 'CAD-RADS', hint: 'Coronarias: CAD-RADS en la calculadora del informe' },
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
    steps: [mpr, length(), roi('Señal de una lesión'), { kind: 'segment', label: 'Volumen de lesión por segmentación' },
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
  us_doppler: { title: 'Ultrasonido Doppler', steps: [length(), { kind: 'tool', label: 'Sonda', toolName: 'Probe' }, send] },
  us_msk: { title: 'Ultrasonido musculoesquelético', steps: [length(), send] },
  mg_breast: { title: 'Mastografía', steps: [length(), { kind: 'guide', label: 'BI-RADS', hint: 'Categoría BI-RADS y densidad' }, send] },
  xa_angio: { title: 'Hemodinamia', steps: [length('Calibre y longitud de estenosis'), { kind: 'tool', label: 'Calibración', toolName: 'CalibrationLine' }, send] },
  generic: { title: 'Estudio', steps: [length(), roi(), send] },
};
