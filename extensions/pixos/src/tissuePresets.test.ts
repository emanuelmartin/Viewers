import { opacityAt } from './vesselPresets';
import { TISSUE_PRESETS, registerTissuePresets } from './tissuePresets';
import { checkVolumes, VolumeLike } from './volumeWatchdog';

const look = (name: string) => TISSUE_PRESETS.find(p => p.name === name)!;
const AIR = -1000; // outside the patient, trachea, bowel gas
const LUNG = -850;
const FAT = -100;
const SOFT = 40; // muscle, organs, unenhanced blood
const BONE = 700;

describe('3D looks for tissues', () => {
  it('air is transparent in every look (no box around the patient)', () => {
    for (const p of TISSUE_PRESETS) expect(opacityAt(p, AIR)).toBe(0);
  });

  it('bone: only bone', () => {
    const p = look('PX-CT-Bone');
    for (const hu of [LUNG, FAT, SOFT, 150]) expect(opacityAt(p, hu)).toBe(0);
    expect(opacityAt(p, BONE)).toBeGreaterThan(0.7);
  });

  it('bone and skin: the skin edge, not the fat or the organs under it', () => {
    const p = look('PX-CT-BoneSkin');
    expect(opacityAt(p, -350)).toBeGreaterThan(0.1);
    for (const hu of [FAT, SOFT, 150]) expect(opacityAt(p, hu)).toBe(0);
    expect(opacityAt(p, BONE)).toBeGreaterThan(0.7);
  });

  it('lung: the parenchyma shows, soft tissue does not, ribs faint', () => {
    const p = look('PX-CT-Lung');
    expect(opacityAt(p, LUNG)).toBeGreaterThan(0.2);
    expect(opacityAt(p, -980)).toBe(0);
    for (const hu of [FAT, SOFT]) expect(opacityAt(p, hu)).toBe(0);
    expect(opacityAt(p, BONE)).toBeLessThanOrEqual(0.2);
  });

  it('soft tissue, muscle and fat: translucent, never a solid block', () => {
    expect(opacityAt(look('PX-CT-Soft'), FAT)).toBeLessThan(0.1);
    expect(opacityAt(look('PX-CT-Soft'), SOFT)).toBeLessThan(0.25);
    expect(opacityAt(look('PX-CT-Muscle'), FAT)).toBe(0);
    expect(opacityAt(look('PX-CT-Muscle'), SOFT)).toBeGreaterThan(0.15);
    expect(opacityAt(look('PX-CT-Fat'), FAT)).toBeGreaterThan(0.05);
    expect(opacityAt(look('PX-CT-Fat'), SOFT)).toBe(0);
  });

  it('well-formed strings (no NaN: the stock CT-Air breaks on a trailing space) and registered once', () => {
    for (const p of TISSUE_PRESETS) {
      for (const s of [p.scalarOpacity, p.colorTransfer]) {
        const v = s.split(' ').map(Number);
        expect(v.every(Number.isFinite)).toBe(true);
        expect(v.length - 1).toBe(v[0]);
      }
    }
    const list: any[] = [];
    registerTissuePresets(list);
    registerTissuePresets(list);
    expect(list.length).toBe(TISSUE_PRESETS.length);
  });
});

describe('stalled volume loads', () => {
  const vol = (frames: number, total = 10, loading = true): VolumeLike & { loads: number } => {
    const v: any = {
      volumeId: 'v1',
      imageIds: Array.from({ length: total }, (_, i) => `img${i}`),
      cachedFrames: Array.from({ length: total }, (_, i) => (i < frames ? 8 : undefined)),
      loadStatus: { loaded: frames >= total, loading },
      loads: 0,
      load() {
        v.loads++;
        v.loadStatus.loading = true;
      },
      cancelLoading() {
        v.loadStatus.loading = false;
        v.loadStatus.cancelled = true;
      },
    };
    return v;
  };

  it('restarts a volume on screen that gained no slice in 8 s, and only that one', () => {
    const tracks = new Map();
    const v = vol(4);
    const on = new Set(['v1']);
    expect(checkVolumes([v], on, tracks, 0)).toEqual([]);
    expect(checkVolumes([v], on, tracks, 5000)).toEqual([]);
    expect(checkVolumes([v], on, tracks, 9000)).toEqual(['v1']);
    expect(v.loads).toBe(1);
    expect(v.loadStatus!.cancelled).toBe(false);
  });

  it('leaves alone a volume that is progressing, complete, or not on screen', () => {
    const tracks = new Map();
    const v = vol(4);
    checkVolumes([v], new Set(['v1']), tracks, 0);
    (v.cachedFrames as any[])[4] = 8;
    expect(checkVolumes([v], new Set(['v1']), tracks, 9000)).toEqual([]);
    const done = vol(10);
    expect(checkVolumes([done], new Set(['v1']), new Map(), 0)).toEqual([]);
    const hidden = vol(2);
    const t2 = new Map();
    checkVolumes([hidden], new Set(), t2, 0);
    expect(checkVolumes([hidden], new Set(), t2, 20000)).toEqual([]);
  });

  it('gives up after 5 restarts', () => {
    const tracks = new Map();
    const v = vol(1);
    const on = new Set(['v1']);
    let t = 0;
    checkVolumes([v], on, tracks, t);
    let n = 0;
    for (let i = 0; i < 10; i++) n += checkVolumes([v], on, tracks, (t += 9000)).length;
    expect(n).toBe(5);
  });
});
