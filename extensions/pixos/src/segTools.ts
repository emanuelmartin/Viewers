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
  // Seed band from the 5×5 neighbourhood
  const vals: number[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x >= 0 && y >= 0 && x < cols && y < rows) vals.push(Number(s0[y * cols + x]));
  }
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  const isCT = (metaData.get('generalSeriesModule', imageIds[k0]) as any)?.modality === 'CT';
  const tol = isCT ? Math.min(80, Math.max(20, 2.5 * sd)) : Math.max(0.12 * Math.abs(mean), 2.5 * sd);
  const lo = mean - tol, hi = mean + tol;
  const rx = Math.ceil(MAX_RADIUS_MM / colSp), ry = Math.ceil(MAX_RADIUS_MM / rowSp), rk = Math.ceil(MAX_RADIUS_MM / sliceSp);
  const visited = new Map<number, Uint8Array>();
  const mark = (k: number) => { let m = visited.get(k); if (!m) { m = new Uint8Array(cols * rows); visited.set(k, m); } return m; };
  const stack: number[] = [sx, sy, k0];
  mark(k0)[sy * cols + sx] = 1;
  let count = 0, sum = 0, leaked = false;
  while (stack.length) {
    const k = stack.pop() as number, y = stack.pop() as number, x = stack.pop() as number;
    count++;
    sum += Number(src(k)![y * cols + x]);
    for (const [nx, ny, nk] of [[x + 1, y, k], [x - 1, y, k], [x, y + 1, k], [x, y - 1, k], [x, y, k + 1], [x, y, k - 1]]) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || nk < 0 || nk >= imageIds.length) continue;
      if (Math.abs(nx - sx) > rx || Math.abs(ny - sy) > ry || Math.abs(nk - k0) > rk) { leaked = true; continue; }
      const m = mark(nk);
      const i = ny * cols + nx;
      if (m[i]) continue;
      const d = src(nk);
      if (!d) continue; // slice not loaded yet: boundary
      const v = Number(d[i]);
      if (v < lo || v > hi) continue;
      m[i] = 1;
      stack.push(nx, ny, nk);
    }
    if (leaked) break;
  }
  if (leaked) return { error: 'La región se extiende más de 6 cm (sale de la lesión). Haga clic más al centro o use el pincel.' };
  if (count < 5) return { error: 'No se encontró una región homogénea en el punto' };
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
