import { utilities as csToolsUtilities } from '@cornerstonejs/tools';
import { datasetToDicomBlob } from '@ohif/extension-default/src/utils/dicomWriter';
import { callCloud } from './ris';

// ── measurements ────────────────────────────────────────────────────────────

export type ViewerItem = {
  key: string;
  kind: string;
  label: string;
  text: string;
  series?: string;
  values: Record<string, number | string>;
};

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const TOOL_LABELS: Record<string, string> = {
  Length: 'Longitud', Bidirectional: 'Bidireccional', EllipticalROI: 'ROI elíptica', CircleROI: 'ROI circular',
  RectangleROI: 'ROI rectangular', PlanarFreehandROI: 'ROI libre', SplineROI: 'ROI spline', LivewireContour: 'Contorno',
  Angle: 'Ángulo', CobbAngle: 'Ángulo de Cobb', Probe: 'Sonda', ArrowAnnotate: 'Anotación',
};

/** The viewer's measurements as plain items (value, unit, series). */
export function readMeasurements(servicesManager): ViewerItem[] {
  const { measurementService, displaySetService } = servicesManager.services;
  return (measurementService.getMeasurements() || []).map(m => {
    const stats: any = Object.values(m.data || {})[0] || {};
    const values: Record<string, number | string> = {};
    ['length', 'width', 'mean', 'stdDev', 'max', 'min', 'area', 'angle', 'perimeter'].forEach(k => {
      if (typeof stats[k] === 'number' && Number.isFinite(stats[k])) {
        values[k] = round(stats[k], 2);
      }
    });
    if (stats.unit) values.unit = stats.unit;
    if (stats.areaUnit) values.areaUnit = stats.areaUnit;
    if (stats.modalityUnit) values.modalityUnit = stats.modalityUnit;
    const series = displaySetService.getDisplaySetByUID(m.displaySetInstanceUID)?.SeriesDescription || '';
    const primary = (m.displayText?.primary || []).join(' · ');
    const kind = TOOL_LABELS[m.toolName] || m.toolName;
    return {
      key: m.uid,
      kind: m.toolName,
      label: m.label || kind,
      text: `${m.label ? `${m.label}: ` : ''}${kind} ${primary || ''}`.trim(),
      series,
      values,
    };
  });
}

// ── calculators from measurements ───────────────────────────────────────────

export type CalcResult = { title: string; text: string } | { error: string };

const lengthsOf = (items: ViewerItem[]): number[] =>
  items.flatMap(i => (i.kind === 'Bidirectional' ? [i.values.length, i.values.width] : [i.values.length]))
    .filter((v): v is number => typeof v === 'number');

export const CALCULATORS: { id: string; name: string; hint: string; run: (items: ViewerItem[]) => CalcResult }[] = [
  {
    id: 'ratio', name: 'Índice entre dos longitudes (ICT, Evans)', hint: 'Seleccione 2 longitudes',
    run: items => {
      const l = lengthsOf(items.filter(i => i.kind === 'Length'));
      if (l.length !== 2) return { error: 'Seleccione exactamente 2 longitudes' };
      const [a, b] = [Math.min(...l), Math.max(...l)];
      const r = round(a / b, 2);
      return {
        title: `Índice ${r}`,
        text: `Índice ${round(a)} / ${round(b)} mm = ${r}. ICT normal ≤ 0.5; índice de Evans > 0.3 sugiere ventriculomegalia.`,
      };
    },
  },
  {
    id: 'ellipsoid', name: 'Volumen elipsoide', hint: '3 longitudes, o 1 bidireccional + 1 longitud',
    run: items => {
      const l = lengthsOf(items.filter(i => i.kind === 'Length' || i.kind === 'Bidirectional'));
      if (l.length !== 3) return { error: 'Se necesitan 3 diámetros ortogonales' };
      const ml = (0.523 * l[0] * l[1] * l[2]) / 1000;
      return { title: `${round(ml)} ml`, text: `Diámetros de ${l.map(x => round(x / 10, 1)).join(' × ')} cm, volumen estimado de ${round(ml)} ml (elipsoide).` };
    },
  },
  {
    id: 'abc2', name: 'Volumen de hematoma (ABC/2)', hint: '3 diámetros (A, B, C)',
    run: items => {
      const l = lengthsOf(items.filter(i => i.kind === 'Length' || i.kind === 'Bidirectional'));
      if (l.length !== 3) return { error: 'Se necesitan 3 diámetros' };
      const ml = (l[0] * l[1] * l[2]) / 2000;
      return { title: `${round(ml)} ml`, text: `Hematoma de ${l.map(x => round(x / 10, 1)).join(' × ')} cm, volumen estimado de ${round(ml)} ml (ABC/2).` };
    },
  },
  {
    id: 'washout', name: 'Lavado suprarrenal', hint: '3 ROIs en orden: simple, venosa, tardía (o venosa y tardía)',
    run: items => {
      const means = items.map(i => i.values.mean).filter((v): v is number => typeof v === 'number');
      if (means.length < 2 || means.length > 3) return { error: 'Seleccione 2 o 3 ROIs en orden de fase' };
      const [pre, portal, late] = means.length === 3 ? means : [null, means[0], means[1]];
      const rel = round((100 * (portal - late)) / portal);
      const abs = pre != null && portal !== pre ? round((100 * (portal - late)) / (portal - pre)) : null;
      const adenoma = (pre != null && pre <= 10) || (abs != null && abs >= 60) || rel >= 40;
      return {
        title: adenoma ? 'Compatible con adenoma' : 'Indeterminado',
        text: `Lesión suprarrenal${pre != null ? ` de ${round(pre)} UH en fase simple` : ''}, lavado ${abs != null ? `absoluto de ${abs}% y ` : ''}relativo de ${rel}%: ${adenoma ? 'compatible con adenoma' : 'no cumple criterios de adenoma'}.`,
      };
    },
  },
];

// ── reconstructions ─────────────────────────────────────────────────────────

export const LAYOUTS = [
  { id: 'mpr', label: 'MPR' },
  { id: 'mprAnd3DVolumeViewport', label: 'MPR + 3D' },
  { id: 'only3D', label: '3D' },
  { id: 'primaryAxial', label: 'Axial principal' },
  { id: 'default', label: 'Normal' },
];

// Cornerstone BlendModes: 0 composite, 1 MIP, 2 MinIP, 3 average
export const SLABS = [
  { id: 'mip10', label: 'MIP 10 mm', blend: 1, thickness: 10 },
  { id: 'mip20', label: 'MIP 20 mm', blend: 1, thickness: 20 },
  { id: 'minip10', label: 'MinIP 10 mm', blend: 2, thickness: 10 },
  { id: 'avg5', label: 'Promedio 5 mm', blend: 3, thickness: 5 },
  { id: 'none', label: 'Sin slab', blend: 0, thickness: 0 },
];

/** MIP/MinIP/average slab on the active viewport (volume viewports, i.e. MPR). */
export function applySlab(servicesManager, slab: (typeof SLABS)[number]): string | null {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
  if (!viewport?.setBlendMode || !viewport?.setSlabThickness) {
    return 'Active primero MPR: el slab solo aplica a vistas volumétricas';
  }
  viewport.setBlendMode(slab.blend);
  if (slab.thickness) {
    viewport.setSlabThickness(slab.thickness);
  } else if (viewport.resetSlabThickness) {
    viewport.resetSlabThickness();
  } else {
    viewport.setSlabThickness(0.1);
  }
  viewport.render();
  return null;
}

// ── segmentation ────────────────────────────────────────────────────────────

export async function createSegmentation(servicesManager, commandsManager): Promise<void> {
  const { viewportGridService, panelService } = servicesManager.services;
  await commandsManager.runCommand('createLabelmapForViewport', { viewportId: viewportGridService.getActiveViewportId() });
  panelService?.activatePanel?.('@ohif/extension-cornerstone.panelModule.panelSegmentation', true);
}

export type SegmentVolume = { segmentationId: string; segmentation: string; segment: string; ml: number | null; mean?: number | null };

/** Volume (and mean value) of every segment, computed from the labelmaps. */
export async function segmentVolumes(servicesManager): Promise<SegmentVolume[]> {
  const { segmentationService } = servicesManager.services;
  const out: SegmentVolume[] = [];
  for (const seg of segmentationService.getSegmentations() || []) {
    const indices = Object.keys(seg.segments || {}).map(Number).filter(i => i > 0);
    if (!indices.length) continue;
    let stats: any = {};
    try {
      stats = await csToolsUtilities.segmentation.getStatistics({
        segmentationId: seg.segmentationId, segmentIndices: indices, mode: 'individual',
      });
    } catch {
      stats = {};
    }
    for (const index of indices) {
      const s: any = stats?.[index] || {};
      const volume = s.volume?.value;
      const unit = String(s.volume?.unit || 'mm³');
      out.push({
        segmentationId: seg.segmentationId,
        segmentation: seg.label || 'Segmentación',
        segment: seg.segments[index]?.label || `Segmento ${index}`,
        ml: typeof volume === 'number' ? round(/ml/i.test(unit) ? volume : volume / 1000, 2) : null,
        mean: typeof s.mean?.value === 'number' ? round(s.mean.value, 1) : null,
      });
    }
  }
  return out;
}

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/** Stores a segmentation as DICOM SEG in the clinical PACS (through the RIS server). */
export async function saveSegmentation(commandsManager, segmentationId: string, StudyInstanceUID: string) {
  const generated = commandsManager.runCommand('generateSegmentation', { segmentationId });
  const dataset = generated?.dataset;
  if (!dataset) {
    throw new Error('No se pudo generar el DICOM SEG');
  }
  const blob = datasetToDicomBlob(dataset);
  return callCloud('saveViewerDicom', { StudyInstanceUID, kind: 'SEG', dicom: await blobToBase64(blob) });
}

export function studyInstanceUIDs(): string[] {
  return (new URLSearchParams(window.location.search).get('StudyInstanceUIDs') || '').split(',').map(s => s.trim()).filter(Boolean);
}
