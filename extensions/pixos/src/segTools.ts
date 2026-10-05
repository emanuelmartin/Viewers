import { cache, metaData, utilities as csCoreUtils } from '@cornerstonejs/core';
import { segmentation as csSegmentation } from '@cornerstonejs/tools';

/**
 * Segmentation tools for the PixOS workflows. The HRSL mode (longitudinal)
 * creates labelmaps but registers no tool to draw them, so the extension adds
 * them to every tool group, passive: one-click region segmentation
 * (ClickSegment) and brushes to correct it. They are only activated from the
 * PixOS panel, which is for physicians with a RIS session.
 */
const RADIUS = { minRadius: 0.5, maxRadius: 99.5 };

const SEG_TOOLS = (names: Record<string, string>) => [
  { toolName: names.ClickSegment || 'ClickSegment' },
  { toolName: 'CircularBrush', parentTool: 'Brush', configuration: { activeStrategy: 'FILL_INSIDE_CIRCLE', ...RADIUS } },
  { toolName: 'CircularEraser', parentTool: 'Brush', configuration: { activeStrategy: 'ERASE_INSIDE_CIRCLE', ...RADIUS } },
  {
    toolName: 'ThresholdCircularBrush', parentTool: 'Brush',
    configuration: { activeStrategy: 'THRESHOLD_INSIDE_CIRCLE', ...RADIUS, threshold: { isDynamic: true, dynamicRadius: 3 } },
  },
];

export const SEG_TOOL_NAMES = { click: 'ClickSegment', brush: 'CircularBrush', eraser: 'CircularEraser', threshold: 'ThresholdCircularBrush' };

export function installSegmentationTools(servicesManager: any, extensionManager: any): () => void {
  const { toolGroupService } = servicesManager.services;
  let names: Record<string, string> = {};
  try {
    names = extensionManager.getModuleEntry('@ohif/extension-cornerstone.utilityModule.tools')?.exports?.toolNames || {};
  } catch {
    names = {};
  }
  SEG_TOOL_NAMES.click = names.ClickSegment || 'ClickSegment';
  const add = (toolGroupId: string) => {
    const group: any = toolGroupService.getToolGroup(toolGroupId);
    if (!group) return;
    const missing = SEG_TOOLS(names).filter(t => !group.hasTool?.(t.toolName));
    if (missing.length) toolGroupService.addToolsToToolGroup(toolGroupId, { passive: missing });
  };
  (toolGroupService.getToolGroupIds?.() || []).forEach(add);
  const sub = toolGroupService.subscribe(toolGroupService.EVENTS.TOOLGROUP_CREATED, ({ toolGroupId }) => add(toolGroupId));
  return () => sub.unsubscribe();
}

// ── One-click region growing (stack viewports) ───────────────────────────────
// ClickSegment rejects clicks on stack viewports without a message, and its
// «lesion-like» check discards small cysts, so the PixOS step grows the region
// itself: 3D flood fill from the clicked voxel within an intensity band taken
// from the seed neighbourhood, limited to 60 mm from the seed. A region that
// reaches the limit is a leak into neighbouring tissue and is not written.

const MAX_RADIUS_MM = 60;

type Grow = { ml: number; mean: number | null; voxels: number } | { error: string };

function growRegion(viewport: any, segmentationId: string, segmentIndex: number, world: number[]): Grow {
  const imageIds: string[] = viewport.getImageIds?.() || [];
  const k0: number = viewport.getCurrentImageIdIndex?.() ?? -1;
  if (!imageIds.length || k0 < 0) return { error: 'La vista activa no es una serie de cortes' };
  const plane: any = metaData.get('imagePlaneModule', imageIds[k0]) || {};
  const cols: number = plane.columns, rows: number = plane.rows;
  const rowSp = Number(plane.rowPixelSpacing) || 1, colSp = Number(plane.columnPixelSpacing) || 1;
  let sliceSp = Number(plane.sliceThickness) || 1;
  try { sliceSp = csCoreUtils.calculateSpacingBetweenImageIds(imageIds) || sliceSp; } catch { /* keep thickness */ }
  const [sx, sy] = csCoreUtils.worldToImageCoords(imageIds[k0], world as any).map(Math.round);
  const src = (k: number) => cache.getImage(imageIds[k])?.voxelManager?.getScalarData?.() as ArrayLike<number> | undefined;
  const s0 = src(k0);
  if (!s0 || sx < 0 || sy < 0 || sx >= cols || sy >= rows) return { error: 'El punto no está sobre la imagen' };
  // Values are read through a 3×3 in-plane mean (CT noise of a non-contrast study is ~15 HU, larger than the
  // contrast of many lesions against their organ)
  const val = (d: ArrayLike<number>, x: number, y: number) => {
    let t = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) { t += Number(d[yy * cols + xx]); n++; }
    }
    return t / n;
  };
  const vals: number[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x >= 0 && y >= 0 && x < cols && y < rows) vals.push(val(s0, x, y));
  }
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  const isCT = (metaData.get('generalSeriesModule', imageIds[k0]) as any)?.modality === 'CT';
  const rIn = Math.ceil(MAX_RADIUS_MM / Math.min(colSp, rowSp));
  const N = cols * rows;
  // 2D fill on one slice within [lo, hi], optionally restricted to an allowed mask; null if it leaks
  const fill2d = (d: ArrayLike<number>, seeds: number[], lo: number, hi: number, allowed: Uint8Array | null): Uint8Array | null => {
    const m = new Uint8Array(N);
    const q: number[] = [];
    for (const i of seeds) if (!m[i] && (!allowed || allowed[i])) { const v = val(d, i % cols, (i / cols) | 0); if (v >= lo && v <= hi) { m[i] = 1; q.push(i); } }
    while (q.length) {
      const i = q.pop() as number, x = i % cols, y = (i / cols) | 0;
      if (Math.abs(x - sx) > rIn || Math.abs(y - sy) > rIn) return null;
      for (const j of [x + 1 < cols ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < rows ? i + cols : -1, y > 0 ? i - cols : -1]) {
        if (j < 0 || m[j] || (allowed && !allowed[j])) continue;
        const v = val(d, j % cols, (j / cols) | 0);
        if (v < lo || v > hi) continue;
        m[j] = 1;
        q.push(j);
      }
    }
    return m;
  };
  // 3×3 binary opening, then the component that holds the seed (cuts thin bridges to neighbours)
  const open2d = (m: Uint8Array, keep: number[]): Uint8Array => {
    const er = new Uint8Array(N), out = new Uint8Array(N);
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (m[i] && m[i - 1] && m[i + 1] && m[i - cols] && m[i + cols]) er[i] = 1;
    }
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (er[i] || er[i - 1] || er[i + 1] || er[i - cols] || er[i + cols]) out[i] = m[i];
    }
    const comp = new Uint8Array(N), q = keep.filter(i => out[i]);
    q.forEach(i => { comp[i] = 1; });
    while (q.length) {
      const i = q.pop() as number, x = i % cols, y = (i / cols) | 0;
      for (const j of [x + 1 < cols ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < rows ? i + cols : -1, y > 0 ? i - cols : -1]) {
        if (j >= 0 && out[j] && !comp[j]) { comp[j] = 1; q.push(j); }
      }
    }
    return comp;
  };
  const dilate = (m: Uint8Array, r: number): Uint8Array => {
    let cur = m;
    for (let it = 0; it < r; it++) {
      const nx = cur.slice();
      for (let i = 0; i < N; i++) if (cur[i]) {
        const x = i % cols;
        if (x + 1 < cols) nx[i + 1] = 1; if (x > 0) nx[i - 1] = 1; if (i + cols < N) nx[i + cols] = 1; if (i - cols >= 0) nx[i - cols] = 1;
      }
      cur = nx;
    }
    return cur;
  };
  const area = (m: Uint8Array) => { let c = 0; for (let i = 0; i < N; i++) c += m[i]; return c; };
  // Seed slice: narrow the band until the fill stays inside 6 cm
  const seedIdx = sy * cols + sx;
  let tol = isCT ? Math.min(40, Math.max(8, 2.5 * sd)) : Math.max(0.08 * Math.abs(mean), 2.5 * sd);
  let first: Uint8Array | null = null;
  for (let attempt = 0; attempt < 4 && !first; attempt++, tol *= 0.7) first = fill2d(s0, [seedIdx], mean - tol, mean + tol, null);
  if (!first) return { error: 'La región se extiende más de 6 cm (sale de la lesión). Haga clic más al centro o use el pincel.' };
  tol /= 0.7;
  first = open2d(first, [seedIdx]);
  if (area(first) < 4) return { error: 'No se encontró una región homogénea en el punto' };
  const lo = mean - tol, hi = mean + tol;
  const grow = Math.max(1, Math.round(3 / Math.min(colSp, rowSp)));
  const visited = new Map<number, Uint8Array>([[k0, first]]);
  // Propagate slice by slice inside the previous contour dilated 3 mm; stop when it vanishes or balloons
  for (const dir of [1, -1]) {
    let prev = first, prevArea = area(first);
    for (let k = k0 + dir; k >= 0 && k < imageIds.length && Math.abs(k - k0) * sliceSp <= MAX_RADIUS_MM; k += dir) {
      const d = src(k);
      if (!d) break;
      const allowed = dilate(prev, grow);
      const seeds: number[] = [];
      for (let i = 0; i < N; i++) if (prev[i]) seeds.push(i);
      const m0 = fill2d(d, seeds, lo, hi, allowed);
      if (!m0) break;
      const m = open2d(m0, seeds);
      const a = area(m);
      if (a < Math.max(4, 0.15 * prevArea) || a > 1.8 * prevArea + 20) break;
      visited.set(k, m);
      prev = m;
      prevArea = a;
    }
  }
  let count = 0, sum = 0;
  for (const [k, m] of visited) {
    const d = src(k)!;
    for (let i = 0; i < N; i++) if (m[i]) { count++; sum += Number(d[i]); }
  }
  // Write the region into the labelmap of each slice
  for (const [k, m] of visited) {
    const lmId = csSegmentation.getLabelmapImageIdsForImageId?.(imageIds[k], segmentationId)?.[0];
    const lm = lmId && cache.getImage(lmId)?.voxelManager;
    if (!lm) continue;
    for (let i = 0; i < m.length; i++) if (m[i]) lm.setAtIndex(i, segmentIndex);
  }
  csSegmentation.triggerSegmentationEvents.triggerSegmentationDataModified(segmentationId);
  viewport.render?.();
  return { ml: Math.round((count * rowSp * colSp * sliceSp) / 100) / 10, mean: Math.round((sum / count) * 10) / 10, voxels: count };
}

/**
 * Arms one click on the active viewport: the next click grows the region into
 * the active segment. Returns a cancel function.
 */
export function armClickSegment(servicesManager: any, onResult: (message: string) => void): () => void {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
  const element: HTMLElement | undefined = viewport?.element;
  if (!element) {
    onResult('No hay una vista activa');
    return () => undefined;
  }
  const previousCursor = element.style.cursor;
  element.style.cursor = 'crosshair';
  const handler = (evt: MouseEvent) => {
    element.style.cursor = previousCursor;
    const rect = element.getBoundingClientRect();
    const world = viewport.canvasToWorld([evt.clientX - rect.left, evt.clientY - rect.top]);
    const seg = csSegmentation.activeSegmentation.getActiveSegmentation(viewport.id);
    if (!seg) return onResult('No hay una segmentación activa en esta vista');
    const index = csSegmentation.segmentIndex.getActiveSegmentIndex(seg.segmentationId) || 1;
    const r = growRegion(viewport, seg.segmentationId, index, world);
    onResult('error' in r ? r.error
      : `Región segmentada: ${r.ml} ml${r.mean != null ? `, media ${r.mean}` : ''}. Revise el contorno; corrija con el pincel si hace falta y use «Calcular volúmenes».`);
  };
  element.addEventListener('click', handler, { once: true });
  return () => { element.removeEventListener('click', handler); element.style.cursor = previousCursor; };
}

/** Volume (ml) and mean of a segment of a stack labelmap, counting voxels with the images' real spacing. */
export function stackSegmentStats(segmentationId: string, segmentIndex: number): { ml: number; mean: number | null } | null {
  const seg: any = csSegmentation.state.getSegmentation(segmentationId);
  const lmIds: string[] = seg?.representationData?.Labelmap?.imageIds || [];
  if (!lmIds.length) return null;
  const refIds = lmIds.map(id => (cache.getImage(id) as any)?.referencedImageId).filter(Boolean);
  const plane: any = metaData.get('imagePlaneModule', refIds[0] || lmIds[0]) || {};
  let sliceSp = Number(plane.sliceThickness) || 1;
  try { sliceSp = csCoreUtils.calculateSpacingBetweenImageIds(refIds) || sliceSp; } catch { /* keep thickness */ }
  const voxelMl = ((Number(plane.rowPixelSpacing) || 1) * (Number(plane.columnPixelSpacing) || 1) * sliceSp) / 1000;
  let count = 0, sum = 0, sampled = 0;
  for (const id of lmIds) {
    const img: any = cache.getImage(id);
    const data = img?.voxelManager?.getScalarData?.();
    if (!data) continue;
    const ref = img.referencedImageId && cache.getImage(img.referencedImageId)?.voxelManager?.getScalarData?.();
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== segmentIndex) continue;
      count++;
      if (ref) { sum += Number(ref[i]); sampled++; }
    }
  }
  return { ml: Math.round(count * voxelMl * 100) / 100, mean: sampled ? Math.round((sum / sampled) * 10) / 10 : null };
}
