/**
 * How each modality opens, the way a radiologist expects it.
 *
 * - Mammography (MG): the two breasts face each other, as on a mammography workstation. Right-breast views
 *   show the chest wall on the right edge of their pane, left-breast views on the left edge, so RCC|LCC and
 *   RMLO|LMLO read as a mirror. The side is taken from PatientOrientation and, when the equipment did not send
 *   it, from where the tissue is (the chest wall is the brightest edge). The image slides to touch that edge.
 * - PET (PT) alone: opens inverted (black uptake on white), the usual way to read a PET. Fused PET over CT is
 *   left alone (colour map on top of the CT).
 *
 * Applied once per pane and series; anything changed by hand afterwards stays.
 */
import { cache, utilities as csUtils } from '@cornerstonejs/core';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Which edge holds the chest wall in the stored image, from the pixels: the half with more tissue. */
export function chestWallSide(
  pixels: ArrayLike<number>,
  columns: number,
  rows: number,
  invert: boolean
): 'left' | 'right' {
  let left = 0;
  let right = 0;
  const band = Math.max(1, Math.floor(columns * 0.15));
  const rowStep = Math.max(1, Math.floor(rows / 200));
  for (let r = 0; r < rows; r += rowStep) {
    const base = r * columns;
    for (let c = 0; c < band; c++) {
      left += pixels[base + c];
      right += pixels[base + columns - 1 - c];
    }
  }
  const leftHasTissue = invert ? left < right : left > right;
  return leftHasTissue ? 'left' : 'right';
}

/** From PatientOrientation's row direction: A means going right is toward the nipple, so the wall is on the left. */
export function chestWallFromOrientation(orientation: any): 'left' | 'right' | null {
  const raw = Array.isArray(orientation)
    ? orientation[0]
    : String(orientation || '').split('\\')[0];
  const row = String(raw || '').toUpperCase();
  if (row.startsWith('A')) return 'left';
  if (row.startsWith('P')) return 'right';
  return null;
}

function laterality(inst: any): 'R' | 'L' | null {
  const v = String(inst?.ImageLaterality || inst?.Laterality || '').toUpperCase();
  return v === 'R' || v === 'L' ? v : null;
}

/** Bounding box of the breast tissue in image pixels (background and labels outside it are ignored). */
export function tissueBox(
  pixels: ArrayLike<number>,
  columns: number,
  rows: number,
  invert: boolean
): { c0: number; c1: number; r0: number; r1: number } | null {
  const step = Math.max(1, Math.floor(Math.max(columns, rows) / 400));
  let min = Infinity;
  let max = -Infinity;
  for (let r = 0; r < rows; r += step) {
    for (let c = 0; c < columns; c += step) {
      const v = pixels[r * columns + c];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!(max > min)) return null;
  const thr = invert ? max - (max - min) * 0.08 : min + (max - min) * 0.08;
  const isTissue = (v: number) => (invert ? v < thr : v > thr);
  const colHits = new Uint32Array(Math.ceil(columns / step));
  const rowHits = new Uint32Array(Math.ceil(rows / step));
  for (let r = 0, ri = 0; r < rows; r += step, ri++) {
    for (let c = 0, ci = 0; c < columns; c += step, ci++) {
      if (isTissue(pixels[r * columns + c])) {
        colHits[ci]++;
        rowHits[ri]++;
      }
    }
  }
  // A line counts when at least 2 % of it is tissue: skips text labels and scatter in the air
  const minCol = Math.max(2, rowHits.length * 0.02);
  const minRow = Math.max(2, colHits.length * 0.02);
  let c0 = -1, c1 = -1, r0 = -1, r1 = -1;
  colHits.forEach((n, i) => { if (n >= minCol) { if (c0 < 0) c0 = i; c1 = i; } });
  rowHits.forEach((n, i) => { if (n >= minRow) { if (r0 < 0) r0 = i; r1 = i; } });
  if (c0 < 0 || r0 < 0) return null;
  return { c0: c0 * step, c1: Math.min(columns, (c1 + 1) * step), r0: r0 * step, r1: Math.min(rows, (r1 + 1) * step) };
}

function applyMammo(viewport: any, image: any, inst: any) {
  const side = laterality(inst);
  if (!side) {
    return;
  }
  const invert = inst.PhotometricInterpretation === 'MONOCHROME1';
  const pixels = image.getPixelData();
  const want = side === 'R' ? 'right' : 'left';
  const have =
    chestWallFromOrientation(inst.PatientOrientation) ||
    chestWallSide(pixels, image.columns, image.rows, invert);
  if (have !== want) {
    viewport.setCamera({ flipHorizontal: true });
  }
  const box = tissueBox(pixels, image.columns, image.rows, invert);
  const toCanvas = (col: number, row: number) => {
    const w = csUtils.imageToWorldCoords(image.imageId, [col, row]);
    return w ? viewport.worldToCanvas(w) : null;
  };
  const cw = viewport.canvas.clientWidth;
  const ch = viewport.canvas.clientHeight;
  // Fill the pane with the breast (workstations open the tissue, not the empty detector)
  if (box && viewport.getZoom && viewport.setZoom) {
    const p0 = toCanvas(box.c0, box.r0);
    const p1 = toCanvas(box.c1, box.r1);
    if (p0 && p1) {
      const bw = Math.abs(p1[0] - p0[0]);
      const bh = Math.abs(p1[1] - p0[1]);
      const f = Math.min((cw * 0.96) / bw, (ch * 0.96) / bh);
      if (Number.isFinite(f) && f > 1.02) {
        viewport.setZoom(viewport.getZoom() * f);
      }
    }
  }
  // Slide the image so its chest wall touches the pane edge on that side and the tissue is centred in height
  const wallCol = have === 'left' ? (box ? box.c0 : 0) : box ? box.c1 : image.columns;
  const midRow = box ? (box.r0 + box.r1) / 2 : image.rows / 2;
  const wall = csUtils.imageToWorldCoords(image.imageId, [wallCol, midRow]);
  if (wall) {
    const p = viewport.worldToCanvas(wall);
    const target = [want === 'right' ? cw : 0, ch / 2];
    const a = viewport.canvasToWorld(p);
    const b = viewport.canvasToWorld(target);
    const d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cam = viewport.getCamera();
    viewport.setCamera({
      focalPoint: cam.focalPoint.map((v: number, i: number) => v + d[i]),
      position: cam.position.map((v: number, i: number) => v + d[i]),
    });
  }
  viewport.render();
}

function isFused(viewport: any): boolean {
  try {
    return (viewport.getActors?.() || []).length > 1;
  } catch {
    return false;
  }
}

/** Whether a PET viewport's pixels are SUV (scaled on load) rather than raw Bq/mL. */
function inSuv(viewport: any): boolean {
  try {
    if (viewport.type === 'stack') {
      const sp = viewport.getCornerstoneImage?.()?.preScale?.scalingParameters;
      return !!sp?.suvbw;
    }
    const a = viewport.getActors?.()[0];
    const v = a && cache.getVolume(a.referencedId || a.uid);
    return !!v?.scaling?.PT?.suvbw;
  } catch {
    return false;
  }
}

/**
 * A PET whose pixels are in SUV but whose window came from the DICOM header (raw units, e.g. 758–14408) shows a blank
 * pane. Opens it at SUV 0–10 instead: the fixed inverse linear scale EANM 2015 gives as example for reading and
 * response assessment (Boellaard R et al. EJNMMI 2015;42:328–54).
 */
export function fixSuvWindow(viewport: any) {
  try {
    const voi = viewport.getProperties?.()?.voiRange;
    if (voi && voi.upper > 100 && inSuv(viewport)) {
      viewport.setProperties({ voiRange: { lower: 0, upper: 10 } });
      viewport.render();
    }
  } catch {
    // viewport gone
  }
}

export function installModalityLook(servicesManager): () => void {
  const { cornerstoneViewportService, viewportGridService, displaySetService } =
    servicesManager.services;
  const done = new Set<string>();
  const sub = cornerstoneViewportService.subscribe(
    cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
    async ({ viewportId }) => {
      const uids: string[] =
        viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs || [];
      const sets: any[] = uids
        .map(uid => displaySetService.getDisplaySetByUID(uid))
        .filter(Boolean);
      const ds = sets[0];
      const key = `${viewportId}|${uids.join(',')}`;
      if (!ds || done.has(key) || !['MG', 'PT'].includes(ds.Modality)) {
        return;
      }
      for (let i = 0; i < 40; i++) {
        const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (!viewport) {
          return;
        }
        if (ds.Modality === 'PT') {
          // Only a PET on its own (stack or MPR plane), never the PET layer of a fusion or a 3D render.
          if (sets.length > 1 || viewport.type === 'volume3d') {
            return;
          }
          const ready =
            viewport.type === 'stack'
              ? viewport.getCornerstoneImage?.()
              : viewport.getActors?.().length;
          if (ready) {
            done.add(key);
            if (!isFused(viewport)) {
              viewport.setProperties({ invert: true });
              viewport.render();
              // The volume may still be applying the header window: check again once it settles
              [0, 1500, 4000].forEach(ms => setTimeout(() => fixSuvWindow(viewport), ms));
            }
            return;
          }
        } else {
          if (viewport.type !== 'stack') {
            return;
          }
          const image = viewport.getCornerstoneImage?.();
          if (image?.getPixelData) {
            done.add(key);
            const inst =
              ds.instances?.find((x: any) => image.imageId?.includes(x.SOPInstanceUID)) ||
              ds.instances?.[0] ||
              {};
            applyMammo(viewport, image, inst);
            return;
          }
        }
        await wait(150);
      }
    }
  );
  return () => sub.unsubscribe();
}
