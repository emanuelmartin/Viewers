import { contrastStatus, opacityAt, registerVesselPresets, VESSEL_PRESETS, NEEDS_CONTRAST } from './vesselPresets';

describe('contrastStatus', () => {
  it('reads the contrast agent tag first', () => {
    expect(contrastStatus({ ContrastBolusAgent: 'IOPAMIDOL 370', SeriesDescription: 'Abd' })).toBe('si');
    expect(contrastStatus({ ContrastBolusAgent: 'NONE', SeriesDescription: 'Abd Native' })).toBe('no');
  });
  it('plain series by description (the reported case: «Abd Native»)', () => {
    for (const d of ['Abd Native', 'TC simple de abdomen', 'Torax sin contraste', 'NON-CONTRAST HEAD', 'Calcium Score', 'Abd w/o']) {
      expect(contrastStatus({ SeriesDescription: d })).toBe('no');
    }
  });
  it('enhanced series by description', () => {
    for (const d of ['CTA Chest', 'Angio TC aorta', 'Fase arterial', 'Portal venosa', 'TEP', 'Coronary CTA', 'C+ abdomen']) {
      expect(contrastStatus({ SeriesDescription: d })).toBe('si');
    }
  });
  it('unknown when nothing says', () => {
    expect(contrastStatus({ SeriesDescription: 'Abdomen 5mm', StudyDescription: 'CT ABDOMEN' })).toBe('desconocido');
  });
  it('the series wins over the study description', () => {
    expect(contrastStatus({ SeriesDescription: 'Simple', StudyDescription: 'Angio TC' })).toBe('no');
  });
});

describe('pixOS angio-CT looks', () => {
  const byName = (n: string) => VESSEL_PRESETS.find(p => p.name === n)!;
  it('soft tissue, muscle and unenhanced blood (~40 HU) stay transparent; contrast and bone show', () => {
    for (const p of VESSEL_PRESETS) {
      expect(opacityAt(p, -800)).toBe(0);
      expect(opacityAt(p, 40)).toBe(0);
      expect(opacityAt(p, 100)).toBe(0);
      expect(opacityAt(p, 300)).toBeGreaterThan(0.6);
      expect(opacityAt(p, 1000)).toBeGreaterThan(0.75);
    }
  });
  it('the coronary look starts above the myocardium and the pulmonary one is blue', () => {
    expect(opacityAt(byName('PX-CTA-Coronary'), 140)).toBe(0);
    const color = byName('PX-CTA-Pulmonary').colorTransfer.split(' ').slice(1).map(Number);
    const at300 = color.findIndex((v, i) => i % 4 === 0 && v >= 300);
    expect(color[at300 + 3]).toBeGreaterThan(color[at300 + 1]); // blue > red
  });
  it('well-formed VTK strings and registered once', () => {
    for (const p of VESSEL_PRESETS) {
      const o = p.scalarOpacity.split(' ').map(Number);
      expect(o[0]).toBe(o.length - 1);
      const c = p.colorTransfer.split(' ').map(Number);
      expect(c[0]).toBe(c.length - 1);
      expect(NEEDS_CONTRAST.has(p.name)).toBe(true);
    }
    const list: any[] = [{ name: 'CT-Bone' }];
    registerVesselPresets(list);
    registerVesselPresets(list);
    expect(list).toHaveLength(1 + VESSEL_PRESETS.length);
  });
});
