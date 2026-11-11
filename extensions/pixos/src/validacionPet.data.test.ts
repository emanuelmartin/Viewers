/**
 * Validación con los objetos digitales de referencia PET de QIBA / Universidad de Washington (DRO, DROe, DROmtv):
 * corre el código real del visor (`grow`, `suvPeak`) y la conversión a SUV de OHIF (`@cornerstonejs/calculate-suv`).
 * Los datos no van en el repositorio: se preparan con `validacion/prep_pet.py` y `validacion/ref_pet.py` en
 * PIXOS_VALIDACION (por omisión /Volumes/Respaldo/Datos/validacion-visor/prep). Sin datos, la prueba se omite.
 *
 * Fuentes: Pierce LA et al. Radiology 2015;277:538–545 (DRO y umbrales de aceptación); EANM 2015 (VOI41/VOI50,
 * SUVpeak de 1 mL).
 */
import fs from 'fs';
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv';

jest.mock('@cornerstonejs/core', () => ({
  cache: {},
  utilities: { transformWorldToIndex: (_d: unknown, w: number[]) => w },
}));
jest.mock('@cornerstonejs/tools', () => ({ segmentation: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { grow, suvPeak } = require('./lesionGrow');

const DIR = process.env.PIXOS_VALIDACION || '/Volumes/Respaldo/Datos/validacion-visor/prep';
const has = fs.existsSync(`${DIR}/referencias_pet.json`);
const d = has ? describe : describe.skip;

function volume(name: string) {
  const meta = JSON.parse(fs.readFileSync(`${DIR}/${name}.json`, 'utf8'));
  const raw = fs.readFileSync(`${DIR}/${name}.f32`);
  const bq = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  // Conversión a SUV como en OHIF: un factor por corte con calculate-suv
  const factors = calculateSUVScalingFactors(meta.instances);
  const [nx, ny] = meta.dims;
  const suv = new Float32Array(bq.length);
  for (let k = 0; k < meta.dims[2]; k++) {
    const f = factors[k].suvbw;
    for (let x = k * nx * ny; x < (k + 1) * nx * ny; x++) suv[x] = bq[x] * f;
  }
  return {
    dimensions: meta.dims,
    spacing: meta.spacing,
    imageData: {},
    voxelManager: { getCompleteScalarDataArray: () => suv },
    suv,
    factor: factors[0].suvbw,
  };
}
const ml = (vol: any, n: number) => (n * vol.spacing[0] * vol.spacing[1] * vol.spacing[2]) / 1000;
const ijk = (zyx: number[]) => [zyx[2], zyx[1], zyx[0]];

d('validación PET con los DRO de QIBA', () => {
  const ref = has ? JSON.parse(fs.readFileSync(`${DIR}/referencias_pet.json`, 'utf8')) : null;

  it('DRO: la conversión a SUV da 4.000 en las esferas y 1.000 de fondo (aceptable 3.999–4.001)', () => {
    const v = volume('dro');
    expect(v.factor).toBeCloseTo(ref.dro.suv_factor, 9);
    let n4 = 0;
    let max = 0;
    for (const x of v.suv) {
      if (Math.abs(x - 4) < 0.0005) n4++;
      if (x > max) max = x;
    }
    expect(n4).toBe(4532);
    expect(max).toBeCloseTo(4.11, 3); // el único vóxel caliente del DRO
  });

  it('DROe: SUVpeak de 1 mL igual en las dos manchas aunque una tenga un vóxel más caliente', () => {
    const v = volume('droe');
    const out = ref.droe.blobs.map((b: any) => {
      const g = grow(v, ijk(b.centre_zyx), { kind: 'pet', frac: 0.41 });
      return { side: b.side, max: g.max, peak: suvPeak(v, g.indices), ref: b.peak_bruteforce };
    });
    console.log('DROe', JSON.stringify(out));
    for (const o of out) expect(o.peak).toBeCloseTo(o.ref, 3);
    expect(out[1].max).toBeGreaterThan(out[0].max + 0.25);
  });

  it('DROmtv sin ruido: VOI41 de esferas 4:1 y objetos irregulares contra el volumen verdadero', () => {
    const v = volume('mtv_free');
    const rows = ref.mtv_free.objects.map((o: any) => {
      const g = grow(v, ijk(o.seed_zyx), { kind: 'pet', frac: 0.41 });
      const ours = g.leaked || g.lowContrast ? null : ml(v, g.count);
      return { slice: o.slice, level: o.level, true: o.true_ml, plain41: o.voi41_plain_ml, ours, leaked: g.leaked || g.lowContrast };
    });
    console.log('DROmtv sin ruido\n' + rows.map((r: any) => `${r.slice}\t${r.level}:1\tverdad ${r.true.toFixed(3)}\tVOI41 simple ${r.plain41.toFixed(3)}\tvisor ${r.ours === null ? 'se desborda' : r.ours.toFixed(3)}`).join('\n'));
    for (const r of rows) {
      if (r.level === 2) {
        // 2:1: el 41 % del máximo cae debajo del fondo; VOI41 no aplica y el visor lo debe detectar
        expect(r.leaked).toBe(true);
      } else {
        expect(r.ours).not.toBeNull();
        // Idéntico al VOI41 conexo de EANM, y nunca menor que el volumen verdadero menos 10 %
        expect(r.ours).toBeCloseTo(r.plain41, 6);
        expect(r.ours).toBeGreaterThan(r.true * 0.9);
      }
    }
  });

  it('DROmtv con ruido (6 mm FWHM): el visor encuentra la lesión desde el centro y reporta su volumen', () => {
    const v = volume('mtv_noise');
    const free = ref.mtv_free.objects;
    const rows = ref.mtv_noise.seeds.map((s: number[], i: number) => {
      let g = grow(v, ijk(s), { kind: 'pet', frac: 0.41 });
      let thr = 41;
      if (g.leaked || g.lowContrast) { g = grow(v, ijk(s), { kind: 'pet', frac: 0.5 }); thr = 50; }
      const ok = !(g.leaked || g.lowContrast);
      return { slice: free[i].slice, level: free[i].level, true: free[i].true_ml, ours: ok ? ml(v, g.count) : null, peak: suvPeak(v, g.indices), thr, bg: g.background };
    });
    console.log('DROmtv con ruido\n' + rows.map((r: any) => `${r.slice}\t${r.level}:1\tverdad ${r.true.toFixed(3)}\tvisor ${r.ours === null ? 'no confiable' : `${r.ours.toFixed(3)} (VOI${r.thr})`}\tSUVpeak ${r.peak?.toFixed(2) ?? '—'}\tfondo ${r.bg?.toFixed(2)}`).join('\n'));
    // 2:1 nunca da un volumen. En 4:1 el umbral fijo sobrestima con ruido y desenfoque (limitación conocida del método,
    // no del código): esferas de 1.15 mL o más quedan entre 0 y +60 %; la de 0.52 mL se reporta como no confiable.
    for (const r of rows) {
      if (r.level === 2) expect(r.ours).toBeNull();
    }
    const spheres = rows.filter((r: any) => r.level === 4 && r.slice >= 75);
    for (const r of spheres.filter((x: any) => x.true > 1)) {
      expect(r.ours).not.toBeNull();
      expect((r.ours - r.true) / r.true).toBeGreaterThan(0);
      expect((r.ours - r.true) / r.true).toBeLessThan(0.6);
    }
    expect(spheres.find((x: any) => x.true < 1).ours).toBeNull();
  });
});
