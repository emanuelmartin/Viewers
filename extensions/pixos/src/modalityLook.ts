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
import { utilities as csUtils } from '@cornerstonejs/core';

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

function applyMammo(viewport: any, image: any, inst: any) {
  const side = laterality(inst);
  if (!side) {
    return;
  }
  const want = side === 'R' ? 'right' : 'left';
  const have =
    chestWallFromOrientation(inst.PatientOrientation) ||
    chestWallSide(
      image.getPixelData(),
      image.columns,
      image.rows,
      inst.PhotometricInterpretation === 'MONOCHROME1'
    );
  if (have !== want) {
    viewport.setCamera({ flipHorizontal: true });
  }
  // Slide the image so its chest wall touches the pane edge on that side (setDisplayArea would undo the flip).
  const wall = csUtils.imageToWorldCoords(image.imageId, [
    have === 'left' ? 0 : image.columns,
    image.rows / 2,
  ]);
  if (wall) {
    const p = viewport.worldToCanvas(wall);
    const target = [want === 'right' ? viewport.canvas.clientWidth : 0, p[1]];
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
