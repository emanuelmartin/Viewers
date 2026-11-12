/**
 * Automatic window for projection images (MG, DX, CR) whose stored window is only the full pixel range.
 *
 * Some equipment and many converted archives write WindowWidth = 2^BitsStored and WindowCenter = half of it
 * (8-bit mammograms: W 256 / L 128). That is not a clinical window: it shows the raw range, and the breast or chest
 * opens dark and flat. The first time such an image is shown, the window is set from the tissue histogram (background
 * left out, 0.5–99.5 %). A real window from the device is never touched, nor anything the radiologist sets afterwards.
 */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const MODALITIES = new Set(['MG', 'DX', 'CR']);

function first(v: any): number | undefined {
  const n = Array.isArray(v) ? Number(v[0]) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** True when there is no window, or the stored one only spans the whole pixel range. */
export function isRangeOnlyWindow(
  width: number | undefined,
  center: number | undefined,
  bitsStored: number
): boolean {
  if (width === undefined || center === undefined) {
    return true;
  }
  const full = 2 ** bitsStored;
  return width >= full * 0.9 && Math.abs(center - full / 2) <= full * 0.1;
}

/**
 * Window from the tissue: background (the darkest values for MONOCHROME2, the brightest for MONOCHROME1) is left
 * out, then 0.5–99.5 percentiles of what remains. Returns stored-value units; null when the image is empty.
 */
export function tissueRange(
  pixels: ArrayLike<number>,
  invert: boolean
): { lower: number; upper: number } | null {
  let min = Infinity;
  let max = -Infinity;
  const step = Math.max(1, Math.floor(pixels.length / 400000));
  for (let i = 0; i < pixels.length; i += step) {
    const v = pixels[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(max > min)) {
    return null;
  }
  const bins = 1024;
  const scale = (bins - 1) / (max - min);
  const hist = new Uint32Array(bins);
  for (let i = 0; i < pixels.length; i += step) {
    hist[Math.round((pixels[i] - min) * scale)]++;
  }
  // Background: the run of values next to the extreme (2 % of the range), as in a mammogram's air.
  const edge = Math.max(1, Math.round(bins * 0.02));
  const from = invert ? 0 : edge;
  const to = invert ? bins - edge : bins;
  let total = 0;
  for (let b = from; b < to; b++) total += hist[b];
  if (total < 100) {
    return null;
  }
  const pick = (q: number) => {
    let acc = 0;
    for (let b = from; b < to; b++) {
      acc += hist[b];
      if (acc >= total * q) return min + b / scale;
    }
    return max;
  };
  const lower = pick(0.005);
  const upper = pick(0.995);
  return upper > lower ? { lower, upper } : null;
}

export function installAutoVoi(servicesManager): () => void {
  const { cornerstoneViewportService, viewportGridService, displaySetService } =
    servicesManager.services;
  const done = new Set<string>();
  const sub = cornerstoneViewportService.subscribe(
    cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
    async ({ viewportId }) => {
      const uids: string[] =
        viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs || [];
      const ds: any = uids.map(uid => displaySetService.getDisplaySetByUID(uid)).find(Boolean);
      const key = `${viewportId}|${ds?.displaySetInstanceUID}`;
      if (!ds || done.has(key) || !MODALITIES.has(ds.Modality)) {
        return;
      }
      for (let i = 0; i < 40; i++) {
        const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (!viewport || viewport.type !== 'stack') {
          return;
        }
        const image = viewport.getCornerstoneImage?.();
        if (image?.getPixelData) {
          done.add(key);
          const inst =
            ds.instances?.find((x: any) => image.imageId?.includes(x.SOPInstanceUID)) ||
            ds.instances?.[0] ||
            {};
          const bits = Number(inst.BitsStored) || 8;
          if (!isRangeOnlyWindow(first(inst.WindowWidth), first(inst.WindowCenter), bits)) {
            return;
          }
          const range = tissueRange(
            image.getPixelData(),
            inst.PhotometricInterpretation === 'MONOCHROME1'
          );
          if (!range) {
            return;
          }
          const slope = Number(image.slope ?? inst.RescaleSlope ?? 1) || 1;
          const intercept = Number(image.intercept ?? inst.RescaleIntercept ?? 0) || 0;
          viewport.setProperties({
            voiRange: {
              lower: range.lower * slope + intercept,
              upper: range.upper * slope + intercept,
            },
          });
          viewport.render();
          return;
        }
        await wait(150);
      }
    }
  );
  return () => sub.unsubscribe();
}
