/**
 * Validación de «Volumen de lesión» en TC con datos públicos, corriendo el código real del visor (`growWithRetry`):
 * - Maniquí pulmonar de la FDA (TCIA «Phantom FDA», layout 3): nódulos esféricos de volumen conocido (−630 y +100 UH, de
 *   5 a 40 mm) en cortes de 0.75, 1.5 y 3 mm. Gavrielides MA et al. Opt Express 2010;18:15244.
 * - RIDER Lung CT (TCIA): pacientes con cáncer de pulmón escaneados dos veces en 15 minutos; cinco lectores de QIBA
 *   midieron la misma lesión en las dos tomas. Zhao B et al. Radiology 2009;252:263–272 (un cambio de volumen mayor de
 *   ±8 % no es variación de medición).
 * Los datos no van en el repositorio: se preparan con `prep_ct.py` en PIXOS_VALIDACION_CT (por omisión
 * /Volumes/Respaldo/Datos/validacion-visor/prep_ct). Sin datos, la prueba se omite.
 */
import fs from 'fs';

jest.mock('@cornerstonejs/core', () => ({
  cache: {},
  utilities: { transformWorldToIndex: (_d: unknown, w: number[]) => w },
}));
jest.mock('@cornerstonejs/tools', () => ({ segmentation: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { growWithRetry, lungVolumeWarning } = require('./lesionGrow');

const DIR = process.env.PIXOS_VALIDACION_CT || '/Volumes/Respaldo/Datos/validacion-visor/prep_ct';
const exists = (name: string) => fs.existsSync(`${DIR}/${name}.json`);

function load(name: string) {
  const meta = JSON.parse(fs.readFileSync(`${DIR}/${name}.json`, 'utf8'));
  const raw = fs.readFileSync(`${DIR}/${name}.i16`);
  const data = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const volume = { dimensions: meta.dims, spacing: meta.spacing, imageData: {}, voxelManager: { getCompleteScalarDataArray: () => data } };
  const mm3 = meta.spacing[0] * meta.spacing[1] * meta.spacing[2];
  return { meta, volume, mm3 };
}

/** What the viewer reports for a click (CT tool at its default ± 50 UH): mm³, or null when it refuses. */
function measure(v: ReturnType<typeof load>, ijk: number[]) {
  const { g, used } = growWithRetry(v.volume, ijk, { kind: 'abs', tol: 50 });
  return { mm3: g && !g.leaked && g.count ? g.count * v.mm3 : null, leaked: !!g?.leaked, kind: used.kind };
}

const median = (x: number[]) => {
  const s = [...x].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const riderSeries = (patient: string) =>
  fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.startsWith(`rider_${patient}_`) && f.endsWith('.json')).map(f => f.slice(0, -5)) : [];

const dRider = riderSeries('6081').length === 2 ? describe : describe.skip;

dRider('validación TC con los lectores de RIDER Lung CT (QIBA)', () => {
  // Nódulo de ~0.6 mL rodeado de pulmón, reconstrucción LUNG (filtro duro, mucho ruido)
  it('nódulo aislado: el volumen cae dentro del rango de los cinco lectores y repite entre toma y retoma (< 8 %)', () => {
    const byTp: Record<number, { viewer: number[]; readers: number[] }> = {};
    for (const name of riderSeries('6081')) {
      const v = load(name);
      for (const s of v.meta.seeds) {
        const r = measure(v, s.ijk);
        expect(r.kind).toBe('lung');
        expect(r.mm3).not.toBeNull();
        (byTp[s.tp] ??= { viewer: [], readers: [] }).viewer.push(r.mm3 as number);
        byTp[s.tp].readers.push(s.Volume);
      }
    }
    for (const tp of [0, 1]) {
      const { viewer, readers } = byTp[tp];
      for (const x of viewer) {
        expect(x).toBeGreaterThanOrEqual(Math.min(...readers) * 0.95);
        expect(x).toBeLessThanOrEqual(Math.max(...readers) * 1.05);
      }
      // El clic de cada lector (en puntos distintos) da casi el mismo volumen: ± 10 % de la mediana
      for (const x of viewer) expect(Math.abs(x / median(viewer) - 1)).toBeLessThan(0.1);
    }
    const change = median(byTp[1].viewer) / median(byTp[0].viewer) - 1;
    expect(Math.abs(change)).toBeLessThan(0.08);
  });

  it('masas que tocan el mediastino: el visor no inventa un volumen, avisa que se desborda', () => {
    for (const p of ['2635', '6276']) {
      for (const name of riderSeries(p)) {
        const v = load(name);
        for (const s of v.meta.seeds) {
          const r = measure(v, s.ijk);
          expect(r.mm3).toBeNull();
          expect(r.leaked).toBe(true);
        }
      }
    }
  });

  it('lesiones mal definidas (los lectores difieren 5–15 veces): nunca reporta más que el lector más alto', () => {
    for (const p of ['3574', '4383']) {
      for (const name of riderSeries(p)) {
        const v = load(name);
        const readers = v.meta.seeds.map((s: any) => s.Volume);
        for (const s of v.meta.seeds) {
          const r = measure(v, s.ijk);
          if (r.mm3 !== null) expect(r.mm3).toBeLessThanOrEqual(Math.max(...readers));
        }
      }
    }
  });
});

const dFda = exists('fda_th0.75_r1') && exists('fda_th0.75_r2') && exists('fda_th1.5_r1') && exists('fda_th3_r1') ? describe : describe.skip;

dFda('validación TC con el maniquí pulmonar de la FDA (volumen verdadero conocido)', () => {
  // mm³ por nódulo y serie; los centros se localizan con fda_locate.py (esfera de la tabla cerca de su x, y)
  const results: Record<string, { diam: number; hu: number; truth: number; got: number | null; warn: string }[]> = {};
  beforeAll(() => {
    for (const name of ['fda_th0.75_r1', 'fda_th0.75_r2', 'fda_th1.5_r1', 'fda_th3_r1']) {
      const v = load(name);
      results[name] = v.meta.seeds.map((s: any) => {
        const r = measure(v, s.ijk);
        return { diam: s.diam, hu: s.hu, truth: s.vol_ul, got: r.mm3, warn: r.mm3 === null ? '' : lungVolumeWarning(r.mm3 / 1000, v.meta.spacing[2]) };
      });
    }
  });
  const err = (x: { truth: number; got: number | null }) => (x.got as number) / x.truth - 1;

  it('nódulos de 10 a 40 mm en cortes de 0.75 y 1.5 mm: error de volumen ≤ 12 %', () => {
    for (const name of ['fda_th0.75_r1', 'fda_th0.75_r2', 'fda_th1.5_r1'])
      for (const x of results[name].filter(x => x.diam >= 10)) {
        expect(x.got).not.toBeNull();
        expect(Math.abs(err(x))).toBeLessThanOrEqual(0.12);
        expect(x.warn).toBe('');
      }
  });

  it('nódulos de 20 y 40 mm aun en cortes de 3 mm: error ≤ 5 %', () => {
    for (const name of Object.keys(results))
      for (const x of results[name].filter(x => x.diam >= 20)) expect(Math.abs(err(x))).toBeLessThanOrEqual(0.05);
  });

  it('nódulo sólido (+100 UH) de 8 mm en cortes finos: error ≤ 10 %', () => {
    for (const name of ['fda_th0.75_r1', 'fda_th0.75_r2', 'fda_th1.5_r1'])
      for (const x of results[name].filter(x => x.diam === 8 && x.hu === 100)) expect(Math.abs(err(x))).toBeLessThanOrEqual(0.1);
  });

  it('dos tomas repetidas (0.75 mm): el mismo nódulo da el mismo volumen (≤ 10 %)', () => {
    const a = results['fda_th0.75_r1'];
    const b = results['fda_th0.75_r2'];
    a.forEach((x, i) => {
      if (x.diam >= 8 && x.got && b[i].got) expect(Math.abs((b[i].got as number) / x.got - 1)).toBeLessThanOrEqual(0.1);
    });
  });

  it('donde el volumen falla (5 mm, o nódulos pequeños en cortes de 3 mm) el visor lo advierte', () => {
    for (const name of Object.keys(results))
      for (const x of results[name]) {
        if (x.got === null) continue;
        if (Math.abs(err(x)) > 0.15) expect(x.warn).not.toBe('');
      }
  });
});
