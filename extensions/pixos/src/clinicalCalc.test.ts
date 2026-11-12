import { compositeGA, diskVolume, efRange, gaVariability, hadlockEFW, hadlockGA, lvDisks, PEAK_RADIUS_MM, weeksText } from './clinicalCalc';

describe('Hadlock (1984, 1985)', () => {
  it('single-parameter ages from Table 1', () => {
    expect(hadlockGA.bpd(5)).toBeCloseTo(9.54 + 1.482 * 5 + 0.1676 * 25, 6);
    expect(hadlockGA.fl(5.5)).toBeCloseTo(10.35 + 2.46 * 5.5 + 0.17 * 30.25, 6);
  });
  it('composite age near term is ~ 37–40 weeks for typical biometry', () => {
    const w = compositeGA(9.0, 32.5, 33.0, 7.0);
    expect(w).toBeGreaterThan(36);
    expect(w).toBeLessThan(41);
    expect(gaVariability('all', w)).toBe(2.3);
    expect(gaVariability('bpd', 15)).toBe(1.19);
  });
  it('fetal weight with HC-AC-FL (Hammami 2018) and fallbacks', () => {
    const efw = hadlockEFW({ hc: 32.5, ac: 33, fl: 7 })!;
    expect(efw.model).toContain('CC-CA-LF');
    expect(efw.grams).toBeGreaterThan(2800);
    expect(efw.grams).toBeLessThan(3800);
    expect(hadlockEFW({ bpd: 9, ac: 33, fl: 7 })!.model).toContain('DBP-CA-LF');
    expect(hadlockEFW({ ac: 33, fl: 7 })!.model).toContain('CA-LF');
    expect(hadlockEFW({ hc: 30 })).toBeNull();
  });
  it('weeks as text', () => expect(weeksText(32.5)).toBe('32 sem 4 d'));
});

describe('method of disks (ASE/EACVI 2015)', () => {
  /** Half-ellipse trace with the mitral plane closing it: volume of a prolate half-ellipsoid ≈ (2/3)π a b² */
  const trace = (L: number, r: number, n = 60) => {
    const pts: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const t = (Math.PI * i) / n;
      pts.push([r * Math.cos(t), L * Math.sin(t), 0]);
    }
    return pts;
  };
  it('single-plane volume of a half-ellipsoid within 2 %', () => {
    const d = lvDisks(trace(80, 25), 1)!;
    expect(d.L).toBeCloseTo(80, 0);
    const exact = ((2 / 3) * Math.PI * 80 * 25 * 25) / 1000;
    expect(Math.abs(diskVolume(d) - exact) / exact).toBeLessThan(0.02);
  });
  it('scale converts trace units to mm and biplane uses both diameters', () => {
    const a = lvDisks(trace(8, 2.5), 10)!;
    const b = lvDisks(trace(8, 2.0), 10)!;
    expect(diskVolume(a, b)).toBeLessThan(diskVolume(a));
    expect(lvDisks([[0, 0, 0]], 1)).toBeNull();
  });
  it('normal EF ranges and SUVpeak sphere', () => {
    expect(efRange('M')).toEqual([52, 72]);
    expect(efRange('F')).toEqual([54, 74]);
    expect(efRange('')).toBeNull();
    expect(((4 / 3) * Math.PI * PEAK_RADIUS_MM ** 3) / 1000).toBeCloseTo(1, 6);
  });
});
