/**
 * Vascular 3D looks for contrast CT (angio-TC) and whether the series has contrast at all.
 *
 * Why our own presets: the stock VTK/3D Slicer presets do not isolate the vessel lumen.
 * - «CT-Chest-Vessels» is opaque from −1278 HU and «CT-Pulmonary-Arteries» from −568 HU: lung and all soft tissue
 *   render red, even on an angio-CT.
 * - «CT-AAA» and «CT-Coronary-Arteries-2» start at ~143 HU (right) but colour the contrast-filled lumen white like bone
 *   above ~214 HU.
 * Ours keep soft tissue transparent (< 120–150 HU), colour iodinated blood (≈150–450 HU) red (blue for the pulmonary
 * arteries) and bone (> 500 HU) ivory. Contrast and trabecular bone overlap between ~200 and 500 HU on any CT: crop the
 * box or use «Umbral» to separate them.
 *
 * Without contrast the blood is ~40 HU, like muscle: no transfer function can show the vessels, so on a series known to
 * be plain these looks are disabled with the reason.
 */

export type ContrastStatus = 'si' | 'no' | 'desconocido';

/** Looks that need iodinated contrast in the vessels. */
export const NEEDS_CONTRAST = new Set([
  'PX-CTA-Aorta',
  'PX-CTA-Chest',
  'PX-CTA-Pulmonary',
  'PX-CTA-Coronary',
  'CT-Cardiac3',
  'CT-Liver-Vasculature',
]);

const PLAIN = /(calci(um|o)\b|ca\s*score|agatston|sin\s+contraste|simple\b|nativ[oa]?\b|native|non[\s-]?contrast|non[\s-]?con\b|sin\s+medio|without\s+contrast|w\/o|\bnc\b|pre[\s-]?contrast|no\s+contrast|basal\b|noncon)/i;
const ENHANCED = /(angio|\bcta\b|\bc\+|contrast|contraste|arterial|portal|venos[ao]|nefrog|excret|tard[ií]a|delay|enhanc|\bce\b|\bcect\b|\btep\b|embol|\bcoronar)/i;
const NO_AGENT = /^(none|no|ninguno|n\/a|na|-|sin)$/i;

/**
 * Contrast of a series from its DICOM header: Contrast/Bolus Agent (0018,0010) or the series, protocol and study
 * descriptions. «no» only when the header says it is plain; «desconocido» when nothing says either way.
 */
export function contrastStatus(h: {
  ContrastBolusAgent?: unknown;
  SeriesDescription?: unknown;
  ProtocolName?: unknown;
  StudyDescription?: unknown;
}): ContrastStatus {
  const agent = String(h.ContrastBolusAgent ?? '').trim();
  if (agent && !NO_AGENT.test(agent)) {
    return 'si';
  }
  const series = `${h.SeriesDescription ?? ''} ${h.ProtocolName ?? ''}`;
  if (PLAIN.test(series)) {
    return 'no';
  }
  if (ENHANCED.test(series)) {
    return 'si';
  }
  const study = String(h.StudyDescription ?? '');
  if (PLAIN.test(study) && !ENHANCED.test(study)) {
    return 'no';
  }
  if (ENHANCED.test(study)) {
    return 'si';
  }
  return 'desconocido';
}

type Rgb = [number, number, number];
type Point = { hu: number; opacity: number; rgb: Rgb };

const BONE: Point[] = [
  { hu: 500, opacity: 0.8, rgb: [0.93, 0.87, 0.76] },
  { hu: 1200, opacity: 0.85, rgb: [1, 0.98, 0.94] },
  { hu: 3071, opacity: 0.85, rgb: [1, 1, 1] },
];

/** A preset object in the format of @cornerstonejs/core VIEWPORT_PRESETS (strings of numbers, VTK style). */
export function vtkPreset(name: string, points: Point[]) {
  const all = [{ hu: -3024, opacity: 0, rgb: [0, 0, 0] as Rgb }, ...points];
  const opacity = all.flatMap(p => [p.hu, p.opacity]);
  const color = all.flatMap(p => [p.hu, ...p.rgb]);
  return {
    name,
    gradientOpacity: '4 0 1 255 1',
    specularPower: '10',
    scalarOpacity: `${opacity.length} ${opacity.join(' ')}`,
    specular: '0.2',
    shade: '1',
    ambient: '0.15',
    colorTransfer: `${color.length} ${color.join(' ')}`,
    diffuse: '0.9',
    interpolation: '1',
  };
}

const lumen = (start: number, low: Rgb, high: Rgb): Point[] => [
  { hu: start, opacity: 0, rgb: low },
  { hu: start + 40, opacity: 0.3, rgb: low },
  { hu: start + 100, opacity: 0.7, rgb: high },
  { hu: 450, opacity: 0.75, rgb: high },
  ...BONE,
];

const RED_LOW: Rgb = [0.55, 0.07, 0.06];
const RED_HIGH: Rgb = [0.9, 0.2, 0.14];
const BLUE_LOW: Rgb = [0.12, 0.2, 0.6];
const BLUE_HIGH: Rgb = [0.3, 0.5, 0.95];

export const VESSEL_PRESETS = [
  // Aorta and branches (arterial phase): lumen from ~150 HU
  vtkPreset('PX-CTA-Aorta', lumen(120, RED_LOW, RED_HIGH)),
  // Thoracic angio-CT: aorta, supra-aortic trunks, pulmonary vessels with contrast
  vtkPreset('PX-CTA-Chest', lumen(110, RED_LOW, RED_HIGH)),
  // Pulmonary angio-CT (PE protocol): pulmonary arteries in blue by convention
  vtkPreset('PX-CTA-Pulmonary', lumen(130, BLUE_LOW, BLUE_HIGH)),
  // Coronary CTA: contrast in chambers and coronaries; myocardium and fat transparent
  vtkPreset('PX-CTA-Coronary', lumen(150, RED_LOW, RED_HIGH)),
];

/** Adds our presets to the list the 3D viewport looks names up in (once). */
export function registerVesselPresets(list: any[]): void {
  for (const p of VESSEL_PRESETS) {
    if (!list.some(x => x.name === p.name)) {
      list.push(p);
    }
  }
}

/** Opacity of a preset at a density (for tests and the hint text). */
export function opacityAt(preset: { scalarOpacity: string }, hu: number): number {
  const v = preset.scalarOpacity.split(' ').slice(1).map(Number);
  for (let i = 2; i < v.length; i += 2) {
    if (hu <= v[i]) {
      const [x0, y0, x1, y1] = [v[i - 2], v[i - 1], v[i], v[i + 1]];
      return x1 === x0 ? y1 : y0 + ((hu - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return v[v.length - 1];
}
