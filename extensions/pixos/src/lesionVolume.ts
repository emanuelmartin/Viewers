/**
 * «Volumen de lesión»: one click on a lesion and the region grows in 3D over the voxels of similar density
 * (6-connected, within ± tolerance of the seed's mean). The result is painted into a «Lesiones» segmentation (so it is
 * seen on every plane and stays editable with the segmentation tools) and reported as mL, mean density and the three
 * axis lengths. A cap stops a fill that leaks into neighbouring tissue.
 */
import { cache, utilities as csUtils } from '@cornerstonejs/core';
import { segmentation as csSeg } from '@cornerstonejs/tools';
import { grow, growWithRetry, lungVolumeWarning, suvPeak, type GrowMode } from './lesionGrow';

export { grow, suvPeak, type GrowMode };

type Services = any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export type LesionResult = {
  index: number;
  label: string;
  ml: number;
  mean: number;
  max: number;
  peak: number | null;
  threshold: number | null;
  axes: [number, number, number];
  leaked: boolean;
  note: string;
  unit: string;
};

function volumeViewports(s: Services): any[] {
  const { viewportGridService, cornerstoneViewportService } = s.services;
  return [...viewportGridService.getState().viewports.keys()]
    .map(id => cornerstoneViewportService.getCornerstoneViewport(id))
    .filter(vp => vp && vp.type === 'orthographic' && vp.getActors?.().length);
}

/** A plane backed by a loaded volume; from plain slices it opens MPR first. */
export async function ensureVolume(s: Services, commandsManager: any): Promise<boolean> {
  if (volumeViewports(s).length) return true;
  commandsManager.runCommand('setHangingProtocol', { protocolId: 'mpr' });
  for (let i = 0; i < 80; i++) {
    await wait(250);
    if (volumeViewports(s).length) return true;
  }
  return false;
}

function volumeOf(vp: any): any {
  const entry = vp.getActors()[0];
  return cache.getVolume(entry.referencedId || entry.uid);
}

/** Waits for the next click on any MPR plane (a tool does not act on it). Resolves the plane and the world point. */
export function pickPoint(s: Services): { promise: Promise<{ vp: any; world: number[] } | null>; cancel: () => void } {
  const planes = volumeViewports(s);
  let done: (v: any) => void = () => {};
  const promise = new Promise<{ vp: any; world: number[] } | null>(r => (done = r));
  const handlers: [HTMLElement, (e: PointerEvent) => void][] = [];
  const cleanup = () => {
    handlers.forEach(([el, h]) => el.removeEventListener('pointerdown', h, true));
    planes.forEach(vp => vp.element.classList.remove('px-picking'));
  };
  for (const vp of planes) {
    const h = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = vp.canvas.getBoundingClientRect();
      const world = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]);
      cleanup();
      done({ vp, world });
    };
    vp.element.addEventListener('pointerdown', h, true);
    vp.element.classList.add('px-picking');
    handlers.push([vp.element, h]);
  }
  return {
    promise,
    cancel: () => {
      cleanup();
      done(null);
    },
  };
}

/** 3D region growing from a world point. Returns the voxel indices (k·nx·ny + j·nx + i) and the stats. */
let lesionSegId: string | null = null;
let nextIndex = 1;

/** Paints the voxels into the «Lesiones» segmentation (created the first time) as a new segment. */
async function paint(s: Services, commandsManager: any, vp: any, volume: any, indices: Int32Array): Promise<number> {
  const { segmentationService, viewportGridService } = s.services;
  if (!lesionSegId || !segmentationService.getSegmentation(lesionSegId)) {
    lesionSegId = await commandsManager.runCommand('createLabelmapForViewport', {
      viewportId: vp.id,
      options: { label: 'Lesiones' },
    });
    nextIndex = 1;
    // Show it on every plane of the same series
    for (const id of viewportGridService.getState().viewports.keys()) {
      if (id === vp.id) continue;
      try {
        await segmentationService.addSegmentationRepresentation(id, { segmentationId: lesionSegId, type: 'Labelmap' });
      } catch {
        // 3D or other series: not shown there
      }
    }
  }
  const index = nextIndex++;
  segmentationService.addSegment(lesionSegId, { segmentIndex: index, label: `Lesión ${index}`, active: true });
  const [nx, ny] = volume.dimensions;
  const slice = nx * ny;
  const imagesBySlice = new Map<number, any>();
  for (let x = 0; x < indices.length; x++) {
    const idx = indices[x];
    const k = Math.floor(idx / slice);
    let image = imagesBySlice.get(k);
    if (image === undefined) {
      const lmId = csSeg.getLabelmapImageIdsForImageId(volume.imageIds[k], lesionSegId!)?.[0];
      image = lmId ? cache.getImage(lmId) : null;
      imagesBySlice.set(k, image);
    }
    image?.voxelManager?.setAtIndex(idx - k * slice, index);
  }
  csSeg.triggerSegmentationEvents.triggerSegmentationDataModified(lesionSegId!);
  return index;
}

/** One lesion: pick, grow, paint and measure. */
export async function measureLesion(
  s: Services,
  commandsManager: any,
  pick: { vp: any; world: number[] },
  mode: GrowMode,
  modality: string
): Promise<LesionResult | string> {
  const volume = volumeOf(pick.vp);
  if (!volume?.voxelManager?.getCompleteScalarDataArray) return 'El volumen aún no termina de cargar';
  if (volume.loadStatus && !volume.loadStatus.loaded) return 'El volumen aún no termina de cargar';
  // CT/MR: a fill that leaks is retried tighter before anything is painted (engineering heuristic, see REFERENCIAS.md).
  // PET follows EANM 2015: VOI41, and if it is not usable VOI50; never an arbitrary threshold.
  const { g, used } = growWithRetry(volume, pick.world, mode);
  if (!g) return 'El punto quedó fuera de la imagen';
  if (g.leaked || (mode.kind === 'pet' && g.lowContrast)) {
    if (mode.kind === 'pet') {
      if (!g.leaked && g.lowContrast) {
        const peak = suvPeak(volume, g.indices);
        return `Contraste bajo contra el tejido vecino (fondo ${g.background?.toFixed(1)}): el volumen por umbral no es confiable (EANM 2015). Reporta SUV máx ${g.max.toFixed(1)}${peak ? ` y SUVpeak ${peak.toFixed(1)}` : ''}.`;
      }
      const peak = suvPeak(volume, g.indices.subarray(0, 1));
      const hottest = volume.voxelManager.getCompleteScalarDataArray()[g.indices[0]];
      return `VOI no confiable (se une a captación vecina). Según EANM 2015 reporta solo SUV máx ${hottest.toFixed(1)}${peak ? ` y SUVpeak ${peak.toFixed(1)}` : ''}.`;
    }
    if (used.kind === 'lung') {
      return 'La lesión se une al mediastino, la pared o un vaso grueso y el umbral no la separa: mídela con el pincel de segmentación o con diámetros.';
    }
    return 'Se desborda hacia el tejido vecino aun con tolerancia baja: elige un punto más central o usa el pincel de segmentación.';
  }
  if (!g.count) return 'No se encontró tejido parecido en ese punto';
  const index = await paint(s, commandsManager, pick.vp, volume, g.indices);
  const [sx, sy, sz] = volume.spacing;
  const b = g.bounds;
  // Extent of the region along the volume's axes (a bounding box, not RECIST diameters)
  const axes = [(b[1] - b[0] + 1) * sx, (b[3] - b[2] + 1) * sy, (b[5] - b[4] + 1) * sz].map(v => v / 10) as [number, number, number];
  axes.sort((a, c) => c - a);
  const ml = (g.count * sx * sy * sz) / 1000;
  const peak = mode.kind === 'pet' ? suvPeak(volume, g.indices) : null;
  return {
    index,
    label: `Lesión ${index}`,
    ml,
    mean: g.mean,
    max: g.max,
    peak,
    threshold: used.kind === 'pet' ? Math.round(used.frac * 100) : used.kind === 'lung' ? Math.round(g.threshold) : null,
    axes,
    leaked: g.leaked,
    note:
      used.kind === 'lung'
        ? `nódulo en pulmón: umbral ${Math.round(g.threshold)} UH, a la mitad entre su centro y el pulmón (${Math.round(g.background ?? 0)} UH)` +
          (g.opening ? `; se separaron vasos o puentes de hasta ${g.opening * 2} mm` : '') +
          (g.lowContrast ? '; borde poco definido (vidrio deslustrado): el volumen es aproximado' : '') +
          (lungVolumeWarning(ml, sz) ? `; ${lungVolumeWarning(ml, sz)}` : '')
        : used === mode
        ? ''
        : used.kind === 'abs'
          ? `tolerancia ajustada a ± ${used.tol} UH`
          : used.kind === 'rel'
            ? `tolerancia ajustada a ± ${Math.round(used.frac * 100)} %`
            : 'VOI41 no confiable, se usó VOI50 (EANM 2015)',
    unit: modality === 'CT' ? 'UH' : modality === 'PT' ? 'SUV' : '',
  };
}

export function describe(r: LesionResult): string {
  const size = r.axes.map(a => a.toFixed(1)).join(' × ');
  const vol = r.ml < 10 ? r.ml.toFixed(2) : r.ml.toFixed(1);
  const note = r.note ? ` (${r.note})` : '';
  if (r.unit === 'SUV') {
    // EANM 2015 reporting: SUVmax, SUVpeak, MTV and TLG of the stated VOI
    const tlg = r.mean * r.ml;
    return `${r.label}: SUV máx ${r.max.toFixed(1)}${r.peak ? `, SUVpeak ${r.peak.toFixed(1)}` : ''}, MTV${r.threshold} ${vol} mL, SUV medio ${r.mean.toFixed(1)}, TLG${r.threshold} ${tlg.toFixed(1)}; extensión ${size} cm${note}`;
  }
  const u = r.unit ? ' ' + r.unit : '';
  return `${r.label}: ${vol} mL, extensión ${size} cm, media ${r.mean.toFixed(0)}${u}${note}`;
}
