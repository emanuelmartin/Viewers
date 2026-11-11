import { defaults } from '@ohif/core';
import StudyUnavailable from './StudyUnavailable';

/** Spanish names for the shortcuts dialog (same commands as upstream). */
const LABELS: Record<string, string> = {
  Zoom: 'Zoom',
  'Zoom In': 'Acercar',
  'Zoom Out': 'Alejar',
  'Zoom to Fit': 'Ajustar a la ventana',
  'Rotate Right': 'Girar a la derecha',
  'Rotate Left': 'Girar a la izquierda',
  'Flip Horizontally': 'Voltear horizontal',
  'Flip Vertically': 'Voltear vertical',
  Cine: 'Cine',
  Invert: 'Invertir',
  'Next Image Viewport': 'Siguiente visor',
  'Previous Image Viewport': 'Visor anterior',
  'Previous Series': 'Serie anterior',
  'Next Series': 'Serie siguiente',
  'Next Stage': 'Etapa siguiente',
  'Previous Stage': 'Etapa anterior',
  'Next Image': 'Imagen siguiente',
  'Previous Image': 'Imagen anterior',
  'First Image': 'Primera imagen',
  'Last Image': 'Última imagen',
  Reset: 'Restablecer',
  Cancel: 'Cancelar',
  'Delete Annotation': 'Borrar anotación',
  'Accept Preview': 'Aceptar vista previa',
  Undo: 'Deshacer',
  Redo: 'Rehacer',
  'Interpolate Scroll': 'Interpolar al desplazar',
  'Increase Brush Size': 'Pincel más grande',
  'Decrease Brush Size': 'Pincel más chico',
  Eraser: 'Borrador',
  Brush: 'Pincel',
  'Add New Segment': 'Nuevo segmento',
};

/**
 * Window presets per modality: one click in the W/L menu and keys 1–9 (in
 * this order). Values are the usual radiology windows (width / level, HU for
 * CT).
 */
const windowLevelPresets = {
  CT: [
    { id: 'ct-soft-tissue', description: 'Tejido blando', window: '400', level: '40' },
    { id: 'ct-lung', description: 'Pulmón', window: '1500', level: '-600' },
    { id: 'ct-bone', description: 'Hueso', window: '2500', level: '480' },
    { id: 'ct-brain', description: 'Cerebro', window: '80', level: '40' },
    { id: 'ct-mediastinum', description: 'Mediastino', window: '350', level: '50' },
    { id: 'ct-liver', description: 'Hígado', window: '150', level: '30' },
    { id: 'ct-stroke', description: 'Isquemia (EVC)', window: '40', level: '40' },
    { id: 'ct-subdural', description: 'Subdural', window: '215', level: '75' },
    { id: 'ct-angio', description: 'Angio', window: '600', level: '170' },
  ],
  MR: [
    { id: 'mr-t1', description: 'T1', window: '800', level: '350' },
    { id: 'mr-t2', description: 'T2', window: '2500', level: '1200' },
    { id: 'mr-flair', description: 'FLAIR', window: '2500', level: '1200' },
  ],
  DX: [{ id: 'dx-default', description: 'Estándar', window: '2048', level: '1024' }],
  CR: [{ id: 'cr-default', description: 'Estándar', window: '2048', level: '1024' }],
  PT: [
    { id: 'pt-suv-6', description: 'SUV 0–6', window: '6', level: '3' },
    { id: 'pt-suv-10', description: 'SUV 0–10', window: '10', level: '5' },
    { id: 'pt-suv-15', description: 'SUV 0–15', window: '15', level: '7.5' },
  ],
};

// Space plays/pauses the series (upstream: reset viewport, moved to shift+space).
// Keys 1–9 apply the window presets above by position.
const hotkeyBindings = [
  ...defaults.hotkeyBindings
    .filter(binding => binding.commandName !== 'setWindowLevelPreset')
    .map(binding => ({
      ...binding,
      label: LABELS[binding.label] ?? binding.label,
      ...(binding.commandName === 'resetViewport' ? { keys: ['shift+space'] } : {}),
    })),
  { commandName: 'toggleCinePlayback', label: 'Reproducir / pausar', keys: ['space'] },
  ...Array.from({ length: 9 }, (_, i) => ({
    commandName: 'setWindowLevelPreset',
    commandOptions: { presetIndex: i },
    label: `Ventana ${i + 1} (${windowLevelPresets.CT[i]?.description ?? ''} en TC)`,
    keys: [String(i + 1)],
  })),
];

const SIDE: Record<string, string> = { R: 'Der', L: 'Izq', B: 'Bilat' };
const VIEW: Record<string, string> = { LL: 'LAT', RL: 'LAT', LATERAL: 'LAT', XCCL: 'XCC' };

/** «Der CC», «Izq MLO», «PA», «LAT»: what a radiologist looks for first on a MG/DX/CR thumbnail. */
function viewLabel({ displaySet, instance }: { displaySet: any; instance?: any }): string {
  const modality = displaySet?.Modality;
  if (!['MG', 'DX', 'CR'].includes(modality)) {
    return '';
  }
  const i = instance ?? displaySet?.instance ?? displaySet?.instances?.[0] ?? {};
  const side = String(i.ImageLaterality ?? i.Laterality ?? '').toUpperCase();
  const code = i.ViewCodeSequence?.[0]?.CodeMeaning;
  let view = String(i.ViewPosition ?? '').toUpperCase();
  if (!view && typeof code === 'string') {
    view = /cranio-?caudal/i.test(code)
      ? 'CC'
      : /medio-?lateral oblique/i.test(code)
        ? 'MLO'
        : /lateral/i.test(code)
          ? 'LAT'
          : '';
  }
  view = VIEW[view] ?? view;
  return [modality === 'MG' ? SIDE[side] : '', view].filter(Boolean).join(' ');
}

const thumbnailDetails = [
  {
    id: 'View',
    contentF: viewLabel,
    title: 'Lado y proyección',
  },
  {
    id: 'SeriesNumber',
    label: 'Serie ',
    title: 'Número de serie',
    source: 'seriesNumber',
  },
  {
    id: 'InstanceCount',
    source: 'numInstances',
    title: 'Imágenes',
    iconName: ({ displaySet }) => displaySet?.countIcon || 'InfoSeries',
  },
];

/** Units of SequenceOfUltrasoundRegions (PhysicalUnitsXDirection): 3 = cm. */
export function usCalibration(instance: any): string {
  const regions: any[] = instance?.SequenceOfUltrasoundRegions || [];
  const region = regions.find(
    r => Number(r?.PhysicalUnitsXDirection) === 3 && Number(r?.PhysicalDeltaX) > 0
  );
  if (region) {
    return `Medidas calibradas · ${(Number(region.PhysicalDeltaX) * 10).toFixed(2)} mm/px`;
  }
  const spacing = instance?.PixelSpacing;
  if (spacing && Number(Array.isArray(spacing) ? spacing[0] : spacing) > 0) {
    return 'Medidas en mm (espaciado del equipo)';
  }
  return 'Sin calibración: medidas en píxeles';
}

function getCustomizationModule() {
  return [
    {
      name: 'default',
      value: {
        'studyBrowser.thumbnailMenuItems': [],
        // Spanish, pixOS-styled /notfoundstudy and /notfoundserver
        'ui.studyUnavailable': StudyUnavailable,
        // Ultrasound: say whether lengths and areas come out calibrated (mm) or only in pixels
        'viewportOverlay.topRight': [
          {
            id: 'UsCalibration',
            inheritsFrom: 'ohif.overlayItem',
            label: '',
            title: 'Calibración de la ecografía',
            condition: ({ referenceInstance }) => referenceInstance?.Modality === 'US',
            contentF: ({ referenceInstance }) => usCalibration(referenceInstance),
          },
        ],
        'ohif.hotkeyBindings': hotkeyBindings,
        // Playback rate when the series has no FrameTime / RecommendedDisplayFrameRate.
        // Angiography and ultrasound loops are acquired at ~30 fps; cross-sectional
        // stacks read better slower.
        'cinePlayer.defaultFrameRates': {
          XA: 30,
          RF: 30,
          XRF: 30,
          US: 30,
          CT: 10,
          MR: 8,
          PT: 8,
          NM: 8,
          default: 15,
        },
        'panelSegmentation.hideByDefault': true,
        'cornerstone.windowLevelPresets': windowLevelPresets,
        'studyBrowser.thumbnailDetails': thumbnailDetails,
      },
    },
  ];
}

export default getCustomizationModule;
