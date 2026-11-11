/**
 * Volumes that stop loading. Opening MPR or 3D while the series is still streaming in the 2D view can leave the volume
 * marked «loading» with no requests left in the queue (the layout change drops them): the missing slices stay grey in
 * MPR and missing in 3D, for good. Every 2 s this looks at the volumes on screen; one that is not complete and has not
 * gained a slice in 8 s is restarted. Slices already loaded are skipped, so a restart only asks for what is missing.
 */
import { cache, getRenderingEngines } from '@cornerstonejs/core';

const STALL_MS = 8000;
const MAX_RESTARTS = 5;

export type VolumeLike = {
  volumeId: string;
  imageIds?: string[];
  cachedFrames?: unknown[];
  loadStatus?: { loaded?: boolean; loading?: boolean; cancelled?: boolean };
  load?: (cb?: unknown) => void;
  cancelLoading?: () => void;
};

/** Slices already in the volume. */
export function framesIn(v: VolumeLike): number {
  return (v.cachedFrames || []).filter(Boolean).length;
}

type Track = { frames: number; since: number; restarts: number };

/** One check: restarts the stalled volumes among `onScreen`; returns the ids restarted. Pure enough to test. */
export function checkVolumes(volumes: VolumeLike[], onScreen: Set<string>, tracks: Map<string, Track>, now: number): string[] {
  const restarted: string[] = [];
  for (const v of volumes) {
    const st = v.loadStatus;
    if (!st || st.loaded || !onScreen.has(v.volumeId) || typeof v.load !== 'function') {
      tracks.delete(v.volumeId);
      continue;
    }
    const frames = framesIn(v);
    const t = tracks.get(v.volumeId);
    if (!t || t.frames !== frames) {
      tracks.set(v.volumeId, { frames, since: now, restarts: t?.restarts ?? 0 });
      continue;
    }
    if (now - t.since < STALL_MS || t.restarts >= MAX_RESTARTS || frames >= (v.imageIds?.length ?? Infinity)) continue;
    try {
      v.cancelLoading?.();
      st.loading = false;
      st.cancelled = false;
      v.load();
      restarted.push(v.volumeId);
    } catch {
      // try again on the next round
    }
    tracks.set(v.volumeId, { frames, since: now, restarts: t.restarts + 1 });
  }
  return restarted;
}

function volumesOnScreen(): Set<string> {
  const ids = new Set<string>();
  for (const engine of getRenderingEngines() || []) {
    for (const vp of engine.getViewports?.() || []) {
      for (const a of (vp as any).getActors?.() || []) {
        if (a.referencedId) ids.add(a.referencedId);
        if (a.uid) ids.add(a.uid);
      }
    }
  }
  return ids;
}

export function installVolumeWatchdog(): () => void {
  const tracks = new Map<string, Track>();
  const timer = setInterval(() => {
    try {
      const volumes = ((cache as any).getVolumes?.() || []) as VolumeLike[];
      if (!volumes.length) return;
      const restarted = checkVolumes(volumes, volumesOnScreen(), tracks, Date.now());
      if (restarted.length) console.info('[pixOS] carga de volumen reanudada:', restarted.join(', '));
    } catch {
      // never break the viewer for this
    }
  }, 2000);
  return () => clearInterval(timer);
}
