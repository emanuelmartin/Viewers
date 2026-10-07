/**
 * Better defaults for OHIF's 3D viewport. The MPR + 3D layout opens every CT with the «CT-Bone» preset, which in HRSL
 * studies renders the skin and muscle as an opaque red fog over everything. The first time a series is shown in a 3D
 * viewport it gets a preset by what the study is: vessels for angiography, coronary arteries for coronary CT, bones
 * only for the rest of CT, MR angiography for TOF/angio MR. Anything the radiologist chooses afterwards (viewport
 * menu presets, quality, lighting) is left alone.
 */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function presetFor(ds: any): string | null {
  const text = `${ds?.StudyDescription || ''} ${ds?.SeriesDescription || ''} ${ds?.instances?.[0]?.StudyDescription || ''}`.toLowerCase();
  if (ds?.Modality === 'CT') {
    if (/coronari|calcio|cardi/.test(text)) return 'CT-Coronary-Arteries-2';
    if (/angio|aort|arteri|vascular|tep|pulmonar|cta/.test(text)) return 'CT-AAA';
    return 'CT-Bones';
  }
  if (ds?.Modality === 'MR') {
    return /tof|angio|arm|mra/.test(text) ? 'MR-Angio' : null;
  }
  return null;
}

export function installBetter3D(servicesManager): () => void {
  const { cornerstoneViewportService, viewportGridService, displaySetService } = servicesManager.services;
  const done = new Set<string>();
  const sub = cornerstoneViewportService.subscribe(cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED, async ({ viewportId }) => {
    const uids: string[] = viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs || [];
    const ds = uids.map(uid => displaySetService.getDisplaySetByUID(uid)).find((d: any) => d && d.Modality !== 'SEG');
    const key = `${viewportId}|${ds?.displaySetInstanceUID}`;
    if (!ds || done.has(key)) {
      return;
    }
    const preset = presetFor(ds);
    for (let i = 0; i < 20; i++) {
      const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport?.type !== 'volume3d') {
        return;
      }
      if (viewport.getActors?.().some((a: any) => a.actor?.isA?.('vtkVolume'))) {
        done.add(key);
        if (preset) {
          viewport.setProperties({ preset });
          viewport.render();
        }
        return;
      }
      await wait(250);
    }
  });
  return () => sub.unsubscribe();
}
