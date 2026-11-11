/**
 * Clinical formulas used by the viewer, each with its published source. Pure functions (no viewer state) so they can be
 * tested and audited. References and saved papers: extensions/pixos/REFERENCIAS.md.
 */

// ── Obstetrics: Hadlock ─────────────────────────────────────────────────────

/**
 * Menstrual age (weeks) from one measurement in cm. Hadlock FP et al. Radiology 1984;152:497–501, Table 1
 * (valid 12–42 weeks).
 */
export const hadlockGA = {
  bpd: (x: number) => 9.54 + 1.482 * x + 0.1676 * x * x,
  hc: (x: number) => 8.96 + 0.54 * x + 0.0003 * x ** 3,
  ac: (x: number) => 8.14 + 0.753 * x + 0.0036 * x * x,
  fl: (x: number) => 10.35 + 2.46 * x + 0.17 * x * x,
};

/** Composite menstrual age from BPD, HC, AC and FL in cm. Hadlock 1984, Table 1 (last row). */
export const compositeGA = (bpd: number, hc: number, ac: number, fl: number) =>
  10.85 + 0.06 * hc * fl + 0.67 * bpd + 0.168 * ac;

/** ±2 SD (weeks) of each model by gestational window. Hadlock 1984, Table II. */
const GA_VARIABILITY: Record<string, number[]> = {
  bpd: [1.19, 1.73, 2.18, 3.08, 3.2],
  hc: [1.19, 1.48, 2.06, 2.98, 2.7],
  ac: [1.66, 2.06, 2.18, 2.96, 3.04],
  fl: [1.38, 1.8, 2.08, 2.96, 3.12],
  all: [1.08, 1.4, 1.8, 2.44, 2.3],
};
const WINDOW_EDGES = [18, 24, 30, 36];

export function gaVariability(model: keyof typeof GA_VARIABILITY, weeks: number): number {
  const i = WINDOW_EDGES.findIndex(edge => weeks < edge);
  return GA_VARIABILITY[model][i < 0 ? 4 : i];
}

/**
 * Estimated fetal weight (g), Hadlock FP et al. Am J Obstet Gynecol 1985;151:333–7, Table II. With HC, AC and FL the
 * HC–AC–FL model is used: the most accurate in the systematic comparison of Hammami A et al. Ultrasound Obstet Gynecol
 * 2018;52:35–43. Without head measurements, the AC–FL model.
 */
export function hadlockEFW(cm: { bpd?: number | null; hc?: number | null; ac?: number | null; fl?: number | null }) {
  const { bpd, hc, ac, fl } = cm;
  if (!ac || !fl) return null;
  if (hc) {
    return {
      grams: 10 ** (1.326 - 0.00326 * ac * fl + 0.0107 * hc + 0.0438 * ac + 0.158 * fl),
      model: 'Hadlock CC-CA-LF (1985)',
    };
  }
  if (bpd) {
    return {
      grams: 10 ** (1.335 - 0.0034 * ac * fl + 0.0316 * bpd + 0.0457 * ac + 0.1623 * fl),
      model: 'Hadlock DBP-CA-LF (1985)',
    };
  }
  return { grams: 10 ** (1.304 + 0.05281 * ac + 0.1938 * fl - 0.004 * ac * fl), model: 'Hadlock CA-LF (1985)' };
}

export const weeksText = (w: number) => {
  const total = Math.round(w * 7);
  return `${Math.floor(total / 7)} sem ${total % 7} d`;
};

// ── Echocardiography: method of disks (ASE/EACVI 2015) ──────────────────────

type V3 = number[];
const sub = (a: V3, b: V3) => a.map((x, i) => x - b[i]);
const dot = (a: V3, b: V3) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a: V3, b: V3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(...a);
const unit = (a: V3) => {
  const n = norm(a) || 1;
  return a.map(x => x / n);
};

/** Polygon normal and area in its own units (Newell's method). */
function newell(points: V3[]) {
  let n = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  return { normal: unit(n), area: norm(n) / 2 };
}

/**
 * A traced LV cavity reduced to its long axis and the 20 disk diameters (ASE/EACVI 2015: biplane method of disks,
 * modified Simpson's rule). The mitral plane is taken as the polygon's longest edge (the straight line that closes the
 * trace across the annulus) and the apex as the point farthest from its midpoint. `scale` converts the trace's
 * coordinates to mm.
 */
export function lvDisks(points: V3[], scale = 1, disks = 20) {
  if (points.length < 8) return null;
  const p = points.map(x => x.map(v => v * scale));
  let base = 0;
  let longest = -1;
  for (let i = 0; i < p.length; i++) {
    const d = norm(sub(p[(i + 1) % p.length], p[i]));
    if (d > longest) {
      longest = d;
      base = i;
    }
  }
  const mid = p[base].map((v, i) => (v + p[(base + 1) % p.length][i]) / 2);
  let apex = p[0];
  for (const q of p) if (norm(sub(q, mid)) > norm(sub(apex, mid))) apex = q;
  const L = norm(sub(apex, mid));
  if (!(L > 0)) return null;
  const axis = unit(sub(apex, mid));
  const across = unit(cross(newell(p).normal, axis));
  const uv = p.map(q => {
    const d = sub(q, mid);
    return [dot(d, axis), dot(d, across)];
  });
  const diameters: number[] = [];
  for (let k = 0; k < disks; k++) {
    const u = ((k + 0.5) * L) / disks;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < uv.length; i++) {
      const a = uv[i];
      const b = uv[(i + 1) % uv.length];
      if ((a[0] - u) * (b[0] - u) > 0 || a[0] === b[0]) continue;
      const v = a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    diameters.push(hi > lo ? hi - lo : 0);
  }
  return { L, diameters };
}

/** Volume in mL from one (single-plane) or two orthogonal (biplane) traces, ASE/EACVI 2015. */
export function diskVolume(a: { L: number; diameters: number[] }, b?: { L: number; diameters: number[] } | null): number {
  const L = b ? Math.max(a.L, b.L) : a.L;
  const n = a.diameters.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a.diameters[i] * (b ? b.diameters[i] : a.diameters[i]);
  return ((Math.PI / 4) * sum * (L / n)) / 1000;
}

/** Normal LVEF by 2D, ASE/EACVI 2015 (Lang RM et al. J Am Soc Echocardiogr 2015;28:1–39): men 52–72 %, women 54–74 %. */
export function efRange(sex: string): [number, number] | null {
  const s = String(sex || '').toUpperCase();
  if (s === 'M') return [52, 72];
  if (s === 'F') return [54, 74];
  return null;
}

// ── PET: EANM 2015 ──────────────────────────────────────────────────────────

/** Radius (mm) of the 1.0 mL sphere used for SUVpeak (1.2 cm diameter; Boellaard R et al. EJNMMI 2015;42:328–54). */
export const PEAK_RADIUS_MM = Math.cbrt((3 * 1000) / (4 * Math.PI));
