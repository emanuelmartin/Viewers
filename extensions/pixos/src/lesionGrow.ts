/**
 * Pure lesion math used by «Volumen de lesión»: 3D region growing (CT/MR by tolerance, CT lung nodules by a half-way
 * threshold, PET by VOI41/VOI50 as in EANM 2015) and SUVpeak in a 1 mL sphere. No viewer state here, so it is validated
 * directly against reference data: QIBA PET DROs (validacionPet.data.test.ts), the FDA lung phantom and the RIDER
 * readers (validacionCt.data.test.ts).
 */
import { utilities as csUtils } from '@cornerstonejs/core';
import { PEAK_RADIUS_MM } from './clinicalCalc';

export const MAX_ML = 1500;

export type GrowMode =
  | { kind: 'abs'; tol: number }
  | { kind: 'rel'; frac: number }
  | { kind: 'pet'; frac: number }
  // CT nodule surrounded by lung: keep what is above background + frac × (core − background)
  | { kind: 'lung'; frac: number };

/** Largest extent (mm) a region may reach before it counts as leaked. A lung nodule or mass is < 8 cm. */
const MAX_EXTENT_MM: Record<GrowMode['kind'], number> = { abs: 200, rel: 200, pet: Infinity, lung: 80 };

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
  let background: number | null = null;
  let start = sk * slice + sj * nx + si;
  if (mode.kind === 'pet') {
    // PET: snap to the hottest voxel within 15 mm of the click (clicking a few mm off a small lesion is normal), then
    // keep everything above a fraction (41 % by default) of it, as for metabolic tumour volume
    const [px, py, pz] = volume.spacing;
    const ri = Math.ceil(15 / px), rj = Math.ceil(15 / py), rk = Math.ceil(15 / pz);
    // Ties (a flat-topped or saturated lesion) go to the voxel closest to the click, not to a corner of the plateau
    let best = start;
    let bestD = 0;
    for (let dk = -rk; dk <= rk; dk++)
      for (let dj = -rj; dj <= rj; dj++)
        for (let di = -ri; di <= ri; di++) {
          const d2 = (di * px) ** 2 + (dj * py) ** 2 + (dk * pz) ** 2;
          if (d2 > 225) continue;
          const i = si + di, j = sj + dj, k = sk + dk;
          if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
          const x = k * slice + j * nx + i;
          if (data[x] > data[best] || (data[x] === data[best] && d2 < bestD)) {
            best = x;
            bestD = d2;
          }
        }
    start = best;
    lo = data[best] * mode.frac;
    hi = Infinity;
    background = localBackground(data, volume.dimensions, volume.spacing, best);
  } else if (mode.kind === 'lung') {
    // Sharp lung kernels swing hundreds of HU between neighbours: compare 3×3×3 means, snap to the densest point within
    // 5 mm of the click (its core) and cut half-way between that core and the surrounding lung, as nodule volumetry
    // does (the FDA phantom work and QIBA CT 1B). The 5/6 rule below still cuts vessel bridges.
    const [px, py, pz] = volume.spacing;
    const ri = Math.ceil(5 / px), rj = Math.ceil(5 / py), rk = Math.ceil(5 / pz);
    let best = start;
    let bestV = mean27(data, nx, ny, nz, start);
    let bestD = 0;
    for (let dk = -rk; dk <= rk; dk++)
      for (let dj = -rj; dj <= rj; dj++)
        for (let di = -ri; di <= ri; di++) {
          const d2 = (di * px) ** 2 + (dj * py) ** 2 + (dk * pz) ** 2;
          if (d2 > 25) continue;
          const i = si + di, j = sj + dj, k = sk + dk;
          if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
          const x = k * slice + j * nx + i;
          const v = mean27(data, nx, ny, nz, x);
          if (v > bestV || (v === bestV && d2 < bestD)) {
            best = x;
            bestV = v;
            bestD = d2;
          }
        }
    // Background = the lung parenchyma itself (shell values below −400 HU), not the chest wall or mediastinum next to it
    const lung = shellValues(data, volume.dimensions, volume.spacing, best, 10, 30, -1100).filter(v => v < -400);
    lung.sort((a, b) => a - b);
    const bg = lung.length >= 20 ? lung[Math.floor(lung.length / 2)] : -850;
    const core = Math.min(bestV, 100); // calcium or contrast inside a nodule does not raise the cut
    const cut = bg + mode.frac * (core - bg);
    // A core less than 150 HU above the lung (faint ground glass) has no reliable edge
    return { ...lungRegion(volume, data, best, cut), seed, background: bg as number | null, threshold: cut, lowContrast: core - bg < 150 };
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
  // Range tests use the 3×3×3 mean around each voxel: CT noise (sharp kernels swing hundreds of HU between
  // neighbours) and MR noise would otherwise stop the growth. PET is already smooth and is compared voxel by voxel.
  const val = mode.kind === 'pet' ? (x: number) => data[x] : (x: number) => mean27(data, nx, ny, nz, x);
  // PET: the isocontour is only meaningful well above the surrounding uptake (EANM 2015 warns about low lesion-to-
  // background ratios); below 1.5 × the local background it is reported as unreliable instead of a volume
  // CT lung: a core less than 150 HU above the lung around it (faint ground glass) has no reliable edge
  const lowContrast =
    mode.kind === 'pet' && background !== null && lo < 1.5 * background;
  const maxExtent = MAX_EXTENT_MM[mode.kind];
  if (val(start) < lo || val(start) > hi)
    return { indices: new Int32Array(0), count: 0, seed, mean: 0, max: 0, bounds, leaked: false, lowContrast, background, threshold: lo, opening: 0 };
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
    const [sx2, sy2, sz2] = volume.spacing;
    if (
      (bounds[1] - bounds[0] + 1) * sx2 > maxExtent ||
      (bounds[3] - bounds[2] + 1) * sy2 > maxExtent ||
      (bounds[5] - bounds[4] + 1) * sz2 > maxExtent
    ) {
      leaked = true;
      break;
    }
    const neighbours = [
      i > 0 ? idx - 1 : -1,
      i < nx - 1 ? idx + 1 : -1,
      j > 0 ? idx - nx : -1,
      j < ny - 1 ? idx + nx : -1,
      k > 0 ? idx - slice : -1,
      k < nz - 1 ? idx + slice : -1,
    ];
    // CT/MR: only spread from voxels inside solid tissue (5 of 6 neighbours in range), so a lesion does not escape
    // through a one-voxel bridge into the organ next to it. PET keeps the plain connected isocontour of EANM 2015.
    if (head > 1 && mode.kind !== 'pet') {
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
  return {
    indices: out.subarray(0, count),
    count,
    seed,
    mean: count ? total / Math.max(head, 1) : 0,
    max: maxV,
    bounds,
    leaked,
    lowContrast,
    background,
    threshold: lo,
    opening: 0,
  };
}

/**
 * Lung nodule or mass: voxels above the cut (3×3×3 mean) connected to the core, inside a 80 mm box, then a morphological
 * opening that detaches vessels and thin pleural or mediastinal bridges (Kostis WJ et al. IEEE TMI 2003;22:1259). The
 * first pass only spreads through solid voxels (5 of 6 neighbours); the opening radius grows (1.5 to 8 mm) only while
 * the region still reaches the edge of the box.
 */
function lungRegion(volume: any, data: ArrayLike<number>, core: number, cut: number) {
  const [nx, ny, nz] = volume.dimensions;
  const [sx, sy, sz] = volume.spacing;
  const slice = nx * ny;
  const K = Math.floor(core / slice);
  const J = Math.floor((core - K * slice) / nx);
  const I = core - K * slice - J * nx;
  const H = MAX_EXTENT_MM.lung / 2;
  const i0 = Math.max(0, I - Math.ceil(H / sx)), i1 = Math.min(nx - 1, I + Math.ceil(H / sx));
  const j0 = Math.max(0, J - Math.ceil(H / sy)), j1 = Math.min(ny - 1, J + Math.ceil(H / sy));
  const k0 = Math.max(0, K - Math.ceil(H / sz)), k1 = Math.min(nz - 1, K + Math.ceil(H / sz));
  const bx = i1 - i0 + 1, by = j1 - j0 + 1, bz = k1 - k0 + 1;
  const bs = bx * by;
  const n = bs * bz;
  const toBox = (x: number) => {
    const k = Math.floor(x / slice), r = x - k * slice, j = Math.floor(r / nx);
    return (k - k0) * bs + (j - j0) * bx + (r - j * nx - i0);
  };
  const toVol = (b: number) => {
    const k = Math.floor(b / bs), r = b - k * bs, j = Math.floor(r / bx);
    return (k + k0) * slice + (j + j0) * nx + (r - j * bx + i0);
  };
  // 3×3×3 mean of the box (separable sums over a one-voxel margin), thresholded at the cut
  const pi0 = Math.max(0, i0 - 1), pi1 = Math.min(nx - 1, i1 + 1);
  const pj0 = Math.max(0, j0 - 1), pj1 = Math.min(ny - 1, j1 + 1);
  const pk0 = Math.max(0, k0 - 1), pk1 = Math.min(nz - 1, k1 + 1);
  const px = pi1 - pi0 + 1, py = pj1 - pj0 + 1, pz = pk1 - pk0 + 1;
  const pxy = px * py;
  let a = new Float32Array(px * py * pz);
  let cnt = new Float32Array(px * py * pz);
  for (let k = 0; k < pz; k++)
    for (let j = 0; j < py; j++) {
      const src = (k + pk0) * slice + (j + pj0) * nx + pi0;
      const dst = k * pxy + j * px;
      for (let i = 0; i < px; i++) {
        a[dst + i] = data[src + i];
        cnt[dst + i] = 1;
      }
    }
  const sum1d = (stride: number, len: number, pos: (x: number) => number) => {
    const b = new Float32Array(a.length);
    const cb = new Float32Array(a.length);
    for (let x = 0; x < a.length; x++) {
      const p = pos(x);
      let s = a[x], c = cnt[x];
      if (p > 0) { s += a[x - stride]; c += cnt[x - stride]; }
      if (p < len - 1) { s += a[x + stride]; c += cnt[x + stride]; }
      b[x] = s;
      cb[x] = c;
    }
    a = b;
    cnt = cb;
  };
  sum1d(1, px, x => x % px);
  sum1d(px, py, x => Math.floor(x / px) % py);
  sum1d(pxy, pz, x => Math.floor(x / pxy));
  const mask = new Uint8Array(n);
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++) {
      const p = (k + k0 - pk0) * pxy + (j + j0 - pj0) * px + (i0 - pi0);
      const b = k * bs + j * bx;
      for (let i = 0; i < bx; i++) if (a[p + i] / cnt[p + i] >= cut) mask[b + i] = 1;
    }
  const c = toBox(core);
  const empty = { indices: new Int32Array(0), count: 0, mean: 0, max: 0, bounds: [I, I, J, J, K, K], leaked: false, opening: 0 };
  if (!mask[c]) return empty;

  // 6-connected component of `m` from `from`; reports whether it touches the box edge. With `solid`, it only spreads
  // from voxels with 5 of 6 neighbours set (cuts one-voxel bridges, keeps the spicules an opening would shave)
  const component = (m: Uint8Array, from: number, solid = false) => {
    const out = new Int32Array(n);
    const seen = new Uint8Array(n);
    let count = 0, head = 0, edge = false;
    out[count++] = from;
    seen[from] = 1;
    while (head < count) {
      const b = out[head++];
      const k = Math.floor(b / bs), r = b - k * bs, j = Math.floor(r / bx), i = r - j * bx;
      if (i === 0 || j === 0 || k === 0 || i === bx - 1 || j === by - 1 || k === bz - 1) edge = true;
      const nb = [i > 0 ? b - 1 : -1, i < bx - 1 ? b + 1 : -1, j > 0 ? b - bx : -1, j < by - 1 ? b + bx : -1, k > 0 ? b - bs : -1, k < bz - 1 ? b + bs : -1];
      if (solid && head > 1) {
        let set = 0;
        for (const x of nb) if (x >= 0 && m[x]) set++;
        if (set < 5) continue;
      }
      for (const x of nb) if (x >= 0 && m[x] && !seen[x]) { seen[x] = 1; out[count++] = x; }
    }
    return { list: out.subarray(0, count), seen, edge };
  };
  // Chamfer distance (mm, 26 neighbours, two passes) from the voxels where `src` is set
  const half: { di: number; dj: number; dk: number; w: number }[] = [];
  for (let dk = -1; dk <= 1; dk++)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++)
        if (dk * 9 + dj * 3 + di < 0) half.push({ di, dj, dk, w: Math.hypot(di * sx, dj * sy, dk * sz) });
  const distance = (src: (b: number) => boolean) => {
    const d = new Float32Array(n);
    for (let b = 0; b < n; b++) d[b] = src(b) ? 0 : 1e9;
    for (const sgn of [1, -1]) {
      const offs = half.map(o => ({ ...o, di: o.di * sgn, dj: o.dj * sgn, dk: o.dk * sgn, step: sgn * (o.dk * bs + o.dj * bx + o.di) }));
      const m = offs.length;
      for (let t = 0; t < bz; t++) {
        const k = sgn === 1 ? t : bz - 1 - t;
        for (let u = 0; u < by; u++) {
          const j = sgn === 1 ? u : by - 1 - u;
          const inner = j > 0 && j < by - 1 && k > 0 && k < bz - 1;
          for (let w = 0; w < bx; w++) {
            const i = sgn === 1 ? w : bx - 1 - w;
            const b = k * bs + j * bx + i;
            let best = d[b];
            if (!best) continue;
            if (inner && i > 0 && i < bx - 1) {
              for (let q = 0; q < m; q++) {
                const v = d[b + offs[q].step] + offs[q].w;
                if (v < best) best = v;
              }
            } else {
              for (let q = 0; q < m; q++) {
                const o = offs[q];
                const ii = i + o.di, jj = j + o.dj, kk = k + o.dk;
                if (ii < 0 || jj < 0 || kk < 0 || ii >= bx || jj >= by || kk >= bz) continue;
                const v = d[b + o.step] + o.w;
                if (v < best) best = v;
              }
            }
            d[b] = best;
          }
        }
      }
    }
    return d;
  };

  let region = component(mask, c, true);
  let opening = 0;
  if (region.edge) {
    const inside = distance(b => !mask[b]); // distance to the nearest voxel below the cut
    for (const r of [1.5, 3, 4.5, 6, 8]) {
      const eroded = new Uint8Array(n);
      for (let b = 0; b < n; b++) if (mask[b] && inside[b] > r) eroded[b] = 1;
      // The core may sit within r of the edge of a small nodule: start from the deepest eroded voxel within 5 mm
      let from = -1, deepest = 0;
      for (let b = 0; b < n; b++) {
        if (!eroded[b]) continue;
        const k = Math.floor(b / bs), rr = b - k * bs, j = Math.floor(rr / bx), i = rr - j * bx;
        const d2 = ((i + i0 - I) * sx) ** 2 + ((j + j0 - J) * sy) ** 2 + ((k + k0 - K) * sz) ** 2;
        if (d2 <= 25 && inside[b] > deepest) { deepest = inside[b]; from = b; }
      }
      if (from < 0) break; // the nodule itself is thinner than the opening
      const kept = component(eroded, from).seen;
      const near = distance(b => kept[b] === 1);
      const opened = new Uint8Array(n);
      for (let b = 0; b < n; b++) if (mask[b] && near[b] <= r) opened[b] = 1;
      const start = opened[c] ? c : from;
      region = component(opened, start);
      opening = r;
      if (!region.edge) break;
    }
  }
  const indices = new Int32Array(region.list.length);
  let total = 0, maxV = -Infinity;
  const bounds = [I, I, J, J, K, K];
  for (let x = 0; x < region.list.length; x++) {
    const v = toVol(region.list[x]);
    indices[x] = v;
    total += data[v];
    if (data[v] > maxV) maxV = data[v];
    const k = Math.floor(v / slice), r = v - k * slice, j = Math.floor(r / nx), i = r - j * nx;
    if (i < bounds[0]) bounds[0] = i; if (i > bounds[1]) bounds[1] = i;
    if (j < bounds[2]) bounds[2] = j; if (j > bounds[3]) bounds[3] = j;
    if (k < bounds[4]) bounds[4] = k; if (k > bounds[5]) bounds[5] = k;
  }
  return { indices, count: indices.length, mean: indices.length ? total / indices.length : 0, max: maxV, bounds, leaked: region.edge, opening };
}

/**
 * When a lung nodule volume is not trustworthy, measured on the FDA lung phantom (validacionCt.data.test.ts): nodules
 * under ~8 mm (< 0.25 mL) came out −25 to −80 % on 0.75–1.5 mm slices, and on slices thicker than 1.5 mm anything under
 * 1 mL was off by up to +400 % (partial volume). Larger nodules were within ±10 %.
 */
export function lungVolumeWarning(ml: number, sliceMm: number): string {
  if (ml < 0.25) return 'nódulo menor de 8 mm: el volumen por umbral no es confiable, reporta el diámetro medio (Fleischner 2017)';
  if (sliceMm > 1.5 && ml < 1) return `cortes de ${sliceMm.toFixed(1)} mm: en nódulos pequeños el volumen no es confiable, usa cortes de 1.5 mm o menos`;
  return '';
}

/** Lung around a CT click: at least 30 % of a 10–40 mm shell below −400 HU (a mass up to ~4 cm still counts). */
export function inLung(volume: any, world: number[]): boolean {
  const [nx, ny, nz] = volume.dimensions;
  const data: ArrayLike<number> = volume.voxelManager.getCompleteScalarDataArray();
  const [i, j, k] = csUtils.transformWorldToIndex(volume.imageData, world as any).map(Math.round);
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
  const vals = shellValues(data, volume.dimensions, volume.spacing, k * nx * ny + j * nx + i, 10, 40, -1100);
  return vals.length >= 20 && vals.filter(v => v < -400).length >= 0.3 * vals.length;
}

/**
 * What «Volumen de lesión» runs: grow, and if the region leaks or its edge is unreliable, retry tighter.
 * - CT inside lung: half-way threshold with a morphological opening that grows while the region leaks (lungRegion).
 * - CT/MR elsewhere: tolerance × 0.7, 0.5, 0.35 (engineering heuristic, see REFERENCIAS.md).
 * - PET: VOI41 → VOI50 (EANM 2015).
 */
export function growWithRetry(volume: any, world: number[], mode: GrowMode) {
  let first: GrowMode = mode;
  if (mode.kind === 'abs' && inLung(volume, world)) first = { kind: 'lung', frac: 0.5 };
  let used = first;
  let g = grow(volume, world, first);
  const steps =
    first.kind === 'pet' ? (first.frac < 0.5 ? [0.5] : []) : first.kind === 'lung' ? [] : [0.7, 0.5, 0.35];
  for (const f of steps) {
    if (!g || !(g.leaked || (first.kind === 'pet' && g.lowContrast))) break;
    used =
      first.kind === 'abs'
        ? { kind: 'abs', tol: Math.max(5, Math.round(first.tol * f)) }
        : first.kind === 'rel'
          ? { kind: 'rel', frac: first.frac * f }
          : { kind: first.kind, frac: f };
    g = grow(volume, world, used);
  }
  return { g, used };
}

/** 3×3×3 mean around a voxel (edges use what exists). */
function mean27(data: ArrayLike<number>, nx: number, ny: number, nz: number, x: number): number {
  const slice = nx * ny;
  const k = Math.floor(x / slice);
  const r = x - k * slice;
  const j = Math.floor(r / nx);
  const i = r - j * nx;
  let s = 0;
  let n = 0;
  for (let dk = -1; dk <= 1; dk++) {
    const kk = k + dk;
    if (kk < 0 || kk >= nz) continue;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= ny) continue;
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        if (ii < 0 || ii >= nx) continue;
        s += data[kk * slice + jj * nx + ii];
        n++;
      }
    }
  }
  return s / n;
}

/** Values in a spherical shell (inner–outer mm) around a voxel, above a floor. */
function shellValues(
  data: ArrayLike<number>,
  dims: number[],
  spacing: number[],
  centre: number,
  inner: number,
  outer: number,
  floor: number
): number[] {
  const [nx, ny, nz] = dims;
  const [sx, sy, sz] = spacing;
  const slice = nx * ny;
  const k0 = Math.floor(centre / slice);
  const j0 = Math.floor((centre - k0 * slice) / nx);
  const i0 = centre - k0 * slice - j0 * nx;
  // Sample on a grid of about 1.5 mm so a thin-slice CT does not read a million voxels
  const step = (s: number) => Math.max(1, Math.round(1.5 / s));
  const ti = step(sx), tj = step(sy), tk = step(sz);
  const ri = Math.ceil(outer / sx), rj = Math.ceil(outer / sy), rk = Math.ceil(outer / sz);
  const vals: number[] = [];
  for (let dk = -rk; dk <= rk; dk += tk)
    for (let dj = -rj; dj <= rj; dj += tj)
      for (let di = -ri; di <= ri; di += ti) {
        const d2 = (di * sx) ** 2 + (dj * sy) ** 2 + (dk * sz) ** 2;
        if (d2 < inner * inner || d2 > outer * outer) continue;
        const i = i0 + di, j = j0 + dj, k = k0 + dk;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
        const v = data[k * slice + j * nx + i];
        if (v > floor) vals.push(v);
      }
  return vals;
}

function shellMedian(
  data: ArrayLike<number>,
  dims: number[],
  spacing: number[],
  centre: number,
  inner: number,
  outer: number,
  floor: number
): number | null {
  const vals = shellValues(data, dims, spacing, centre, inner, outer, floor);
  if (vals.length < 20) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/** PET: median uptake in a shell 20–30 mm around a voxel (the lesion's surroundings); outside the body (0) excluded. */
export function localBackground(data: ArrayLike<number>, dims: number[], spacing: number[], centre: number): number | null {
  return shellMedian(data, dims, spacing, centre, 20, 30, 0);
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
