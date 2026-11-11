/**
 * «Volumen de lesión»: one click on a lesion and the region grows in 3D over the voxels of similar density
 * (6-connected, within ± tolerance of the seed's mean). The result is painted into a «Lesiones» segmentation (so it is
 * seen on every plane and stays editable with the segmentation tools) and reported as mL, mean density and the three
 * axis lengths. A cap stops a fill that leaks into neighbouring tissue.
 */
import { cache, utilities as csUtils } from '@cornerstonejs/core';
import { segmentation as csSeg } from '@cornerstonejs/tools';
import { PEAK_RADIUS_MM } from './clinicalCalc';

type Services = any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const MAX_ML = 1500;

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
export type GrowMode = { kind: 'abs'; tol: number } | { kind: 'rel'; frac: number } | { kind: 'pet'; frac: number };

export function grow(volume: any, world: number[], mode: GrowMode) {
  const [nx, ny, nz] = volume.dimensions;
  const data: ArrayLike<number> = volume.voxelManager.getCompleteScalarDataArray();
  const ijk = csUtils.transformWorldToIndex(volume.imageData, world as any).map(Math.round);
  const [si, sj, sk] = ijk;
  if (si < 0 || sj < 0 || sk < 0 || si >= nx || sj >= ny || sk >= nz) return null;
  const slice = nx * ny;
  // Seed value: mean of the 3×3×3 around the click, so one noisy voxel does not decide the range
  let sum = 0;
  let n = 0;
  for (let dk = -1; dk <= 1; dk++)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const i = si + di, j = sj + dj, k = sk + dk;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
        sum += data[k * slice + j * nx + i];
        n++;
      }
  const seed = sum / n;
  let lo: number;
  let hi: number;
  let start = sk * slice + sj * nx + si;
  if (mode.kind === 'pet') {
    // PET: snap to the hottest voxel within 15 mm of the click (clicking a few mm off a small lesion is normal), then
    // keep everything above a fraction (41 % by default) of it, as for metabolic tumour volume
    const [px, py, pz] = volume.spacing;
    const ri = Math.ceil(15 / px), rj = Math.ceil(15 / py), rk = Math.ceil(15 / pz);
    let best = start;
    for (let dk = -rk; dk <= rk; dk++)
      for (let dj = -rj; dj <= rj; dj++)
        for (let di = -ri; di <= ri; di++) {
          if ((di * px) ** 2 + (dj * py) ** 2 + (dk * pz) ** 2 > 225) continue;
          const i = si + di, j = sj + dj, k = sk + dk;
          if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
          const x = k * slice + j * nx + i;
          if (data[x] > data[best]) best = x;
        }
    start = best;
    lo = data[best] * mode.frac;
    hi = Infinity;
  } else {
    const tol = mode.kind === 'abs' ? mode.tol : Math.abs(seed) * mode.frac;
    lo = seed - tol;
    hi = seed + tol;
  }
  const [sx, sy, sz] = volume.spacing;
  const maxVoxels = Math.floor((MAX_ML * 1000) / (sx * sy * sz));
  const seen = new Uint32Array(Math.ceil((nx * ny * nz) / 32));
  const mark = (x: number) => (seen[x >>> 5] |= 1 << (x & 31));
  const isSeen = (x: number) => (seen[x >>> 5] & (1 << (x & 31))) !== 0;
  let out = new Int32Array(1 << 16);
  let count = 0;
  let total = 0;
  let maxV = -Infinity;
  const k0 = Math.floor(start / slice);
  const j0 = Math.floor((start - k0 * slice) / nx);
  const i0 = start - k0 * slice - j0 * nx;
  const bounds = [i0, i0, j0, j0, k0, k0];
  // Range tests use the mean of the voxel and its 6 neighbours (CT/MR noise would otherwise stop the growth);
  // PET is already smooth and is compared voxel by voxel
  const val =
    mode.kind === 'pet'
      ? (x: number) => data[x]
      : (x: number) => {
          const k = Math.floor(x / slice);
          const r = x - k * slice;
          const j = Math.floor(r / nx);
          const i = r - j * nx;
          let s = data[x];
          let n = 1;
          if (i > 0) { s += data[x - 1]; n++; }
          if (i < nx - 1) { s += data[x + 1]; n++; }
          if (j > 0) { s += data[x - nx]; n++; }
          if (j < ny - 1) { s += data[x + nx]; n++; }
          if (k > 0) { s += data[x - slice]; n++; }
          if (k < nz - 1) { s += data[x + slice]; n++; }
          return s / n;
        };
  if (val(start) < lo || val(start) > hi) return { indices: new Int32Array(0), count: 0, seed, mean: 0, max: 0, bounds, leaked: false };
  mark(start);
  out[count++] = start;
  let head = 0;
  let leaked = false;
  while (head < count) {
    const idx = out[head++];
    total += data[idx];
    if (data[idx] > maxV) maxV = data[idx];
    const k = Math.floor(idx / slice);
    const r = idx - k * slice;
    const j = Math.floor(r / nx);
    const i = r - j * nx;
    if (i < bounds[0]) bounds[0] = i; if (i > bounds[1]) bounds[1] = i;
    if (j < bounds[2]) bounds[2] = j; if (j > bounds[3]) bounds[3] = j;
    if (k < bounds[4]) bounds[4] = k; if (k > bounds[5]) bounds[5] = k;
    const neighbours = [
      i > 0 ? idx - 1 : -1,
      i < nx - 1 ? idx + 1 : -1,
      j > 0 ? idx - nx : -1,
      j < ny - 1 ? idx + nx : -1,
      k > 0 ? idx - slice : -1,
      k < nz - 1 ? idx + slice : -1,
    ];
    // Only spread from voxels inside solid tissue (5 of 6 neighbours in range): a lesion does not escape through a
    // one-voxel bridge into the organ next to it
    if (head > 1) {
      let inside = 0;
      for (const nb of neighbours) if (nb >= 0) { const v = val(nb); if (v >= lo && v <= hi) inside++; }
      if (inside < 5) continue;
    }
    for (const nb of neighbours) {
      if (nb < 0 || isSeen(nb)) continue;
      mark(nb);
      const v = val(nb);
      if (v < lo || v > hi) continue;
      if (count >= maxVoxels) {
        leaked = true;
        break;
      }
      if (count === out.length) {
        const bigger = new Int32Array(out.length * 2);
        bigger.set(out);
        out = bigger;
      }
      out[count++] = nb;
    }
    if (leaked) break;
  }
  return { indices: out.subarray(0, count), count, seed, mean: count ? total / Math.max(head, 1) : 0, max: maxV, bounds, leaked };
}

/**
 * SUVpeak (EANM 2015 / PERCIST): highest mean in a 1.0 mL sphere (1.2 cm diameter) centred inside the lesion. Centres
 * are tried on the lesion's hottest voxels, which is where the peak almost always lies.
 */
export function suvPeak(volume: any, indices: Int32Array): number | null {
  if (!indices.length) return null;
  const data: ArrayLike<number> = volume.voxelManager.getCompleteScalarDataArray();
  const [nx, ny, nz] = volume.dimensions;
  const [sx, sy, sz] = volume.spacing;
  const slice = nx * ny;
  const r = PEAK_RADIUS_MM;
  const ri = Math.floor(r / sx), rj = Math.floor(r / sy), rk = Math.floor(r / sz);
  const centres = Array.from(indices).sort((a, b) => data[b] - data[a]).slice(0, 200);
  let best = -Infinity;
  for (const c of centres) {
    const k0 = Math.floor(c / slice);
    const j0 = Math.floor((c - k0 * slice) / nx);
    const i0 = c - k0 * slice - j0 * nx;
    let sum = 0;
    let n = 0;
    for (let dk = -rk; dk <= rk; dk++)
      for (let dj = -rj; dj <= rj; dj++)
        for (let di = -ri; di <= ri; di++) {
          if ((di * sx) ** 2 + (dj * sy) ** 2 + (dk * sz) ** 2 > r * r) continue;
          const i = i0 + di, j = j0 + dj, k = k0 + dk;
          if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
          sum += data[k * slice + j * nx + i];
          n++;
        }
    if (n && sum / n > best) best = sum / n;
  }
  return Number.isFinite(best) ? best : null;
}

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
  let used = mode;
  let g = grow(volume, pick.world, mode);
  const steps = mode.kind === 'pet' ? (mode.frac < 0.5 ? [0.5] : []) : [0.7, 0.5, 0.35];
  for (const f of steps) {
    if (!g || !g.leaked) break;
    used =
      mode.kind === 'abs'
        ? { kind: 'abs', tol: Math.max(5, Math.round(mode.tol * f)) }
        : mode.kind === 'rel'
          ? { kind: 'rel', frac: mode.frac * f }
          : { kind: 'pet', frac: f };
    g = grow(volume, pick.world, used);
  }
  if (!g) return 'El punto quedó fuera de la imagen';
  if (g.leaked) {
    if (mode.kind === 'pet') {
      const peak = suvPeak(volume, g.indices.subarray(0, 1));
      const hottest = volume.voxelManager.getCompleteScalarDataArray()[g.indices[0]];
      return `VOI no confiable (se une a captación vecina). Según EANM 2015 reporta solo SUV máx ${hottest.toFixed(1)}${peak ? ` y SUVpeak ${peak.toFixed(1)}` : ''}.`;
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
    threshold: used.kind === 'pet' ? Math.round(used.frac * 100) : null,
    axes,
    leaked: g.leaked,
    note:
      used === mode
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
