const DEFAULT_FRAME_RATE = 24;
const MIN_FRAME_RATE = 1;
const MAX_FRAME_RATE = 90;

/** Fallback frame rate per modality, used when the series carries no timing. */
export type CineFrameRateDefaults = Record<string, number> & { default?: number };

const toNumber = (value: unknown): number => {
  const first = Array.isArray(value) ? value[0] : value;
  const n = Number(first);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (fps: number): number =>
  Math.min(MAX_FRAME_RATE, Math.max(MIN_FRAME_RATE, Math.round(fps)));

/**
 * Playback rate for a display set, from the series' own timing when it has
 * one: FrameTime (0018,1063, ms per frame), then RecommendedDisplayFrameRate
 * (0008,2144) and CineRate (0018,0040). Otherwise the per-modality default,
 * then 24.
 */
export default function getCineFrameRate(
  displaySet,
  defaults?: CineFrameRateDefaults
): number {
  const instance = displaySet?.instance ?? displaySet?.instances?.[0] ?? {};

  const frameTime = toNumber(displaySet?.FrameRate ?? instance.FrameTime);
  if (frameTime > 0) {
    return clamp(1000 / frameTime);
  }

  const recommended = toNumber(instance.RecommendedDisplayFrameRate ?? instance.CineRate);
  if (recommended > 0) {
    return clamp(recommended);
  }

  const modality = displaySet?.Modality ?? instance.Modality;
  return clamp(defaults?.[modality] ?? defaults?.default ?? DEFAULT_FRAME_RATE);
}
