import getCineFrameRate from './getCineFrameRate';

const defaults = { XA: 30, CT: 10, default: 15 };

describe('getCineFrameRate', () => {
  it('uses FrameTime (ms per frame) when present', () => {
    expect(getCineFrameRate({ FrameRate: 33.33, Modality: 'XA' }, defaults)).toBe(30);
    expect(getCineFrameRate({ instance: { FrameTime: '66.7' }, Modality: 'XA' }, defaults)).toBe(15);
  });

  it('falls back to RecommendedDisplayFrameRate, then CineRate', () => {
    expect(getCineFrameRate({ instances: [{ RecommendedDisplayFrameRate: 25 }] }, defaults)).toBe(25);
    expect(getCineFrameRate({ instances: [{ CineRate: [12] }] }, defaults)).toBe(12);
  });

  it('uses the modality default, then the generic default, then 24', () => {
    expect(getCineFrameRate({ Modality: 'CT', instances: [{}] }, defaults)).toBe(10);
    expect(getCineFrameRate({ Modality: 'MG', instances: [{}] }, defaults)).toBe(15);
    expect(getCineFrameRate({ Modality: 'CT' })).toBe(24);
  });

  it('clamps to the player range', () => {
    expect(getCineFrameRate({ FrameRate: 1 })).toBe(90);
    expect(getCineFrameRate({ FrameRate: 0 }, { default: 0 })).toBe(1);
  });
});
