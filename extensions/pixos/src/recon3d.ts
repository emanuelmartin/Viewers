/**
 * 3D reconstruction and volumetry for the «Reconstruir» panel: rendering presets by modality, threshold (opacity
 * shift), quality, lighting, standard views, turntable rotation, a crop box, PNG export and volume by density range
 * inside that box. It all acts on the 3D view on screen; nothing is written to the study.
 */
import { cache, utilities as csUtils } from '@cornerstonejs/core';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

type Services = any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export type Preset = { id: string; label: string; hint: string; css: string };

export const PRESETS: Record<string, Preset[]> = {
  CT: [
    { id: 'CT-Bones', label: 'Hueso', hint: 'Solo hueso, limpio', css: 'linear-gradient(135deg,#f3e6c8,#b89a6a)' },
    { id: 'CT-Bone', label: 'Hueso y piel', hint: 'Hueso con piel translúcida', css: 'linear-gradient(135deg,#f4d9b0,#a5522e)' },
    { id: 'CT-AAA', label: 'Aorta y vasos', hint: 'Angio-TC: aorta, ramas y hueso', css: 'linear-gradient(135deg,#ff9a8a,#b21a1a)' },
    { id: 'CT-Chest-Vessels', label: 'Vasos del tórax', hint: 'Angio-TC de tórax', css: 'linear-gradient(135deg,#ffb2a0,#7a1414)' },
    { id: 'CT-Pulmonary-Arteries', label: 'Arterias pulmonares', hint: 'TEP / angio pulmonar', css: 'linear-gradient(135deg,#9ad0ff,#b0202a)' },
    { id: 'CT-Coronary-Arteries-2', label: 'Coronarias', hint: 'Angio-TC coronaria', css: 'linear-gradient(135deg,#ffcf9a,#c0392b)' },
    { id: 'CT-Cardiac3', label: 'Corazón', hint: 'Cavidades y grandes vasos', css: 'linear-gradient(135deg,#ff8f7a,#6d0f0f)' },
    { id: 'CT-Liver-Vasculature', label: 'Hígado y vasos', hint: 'Hígado con contraste', css: 'linear-gradient(135deg,#e9a46b,#7b2d12)' },
    { id: 'CT-Lung', label: 'Pulmón', hint: 'Parénquima y vía aérea', css: 'linear-gradient(135deg,#d6ecff,#4a7fb5)' },
    { id: 'CT-Air', label: 'Vía aérea', hint: 'Tráquea, bronquios, colon', css: 'linear-gradient(135deg,#e8f6ff,#6aa6d8)' },
    { id: 'CT-Soft-Tissue', label: 'Tejidos blandos', hint: 'Piel y músculo', css: 'linear-gradient(135deg,#f6c6a8,#9b4f32)' },
    { id: 'CT-Muscle', label: 'Músculo', hint: 'Músculo y hueso', css: 'linear-gradient(135deg,#e28a7a,#6a1c1c)' },
    { id: 'CT-Fat', label: 'Grasa', hint: 'Tejido adiposo', css: 'linear-gradient(135deg,#fff1b8,#c9a227)' },
    { id: 'CT-MIP', label: 'MIP 3D', hint: 'Máxima intensidad en volumen', css: 'linear-gradient(135deg,#ffffff,#3a3a3a)' },
  ],
  MR: [
    { id: 'MR-Default', label: 'Normal', hint: 'Volumen general', css: 'linear-gradient(135deg,#f0d2b8,#7b4a2a)' },
    { id: 'MR-Angio', label: 'Angio-RM', hint: 'TOF / angio con contraste', css: 'linear-gradient(135deg,#ffb2a0,#a01a1a)' },
    { id: 'MR-T2-Brain', label: 'Cerebro T2', hint: 'Encéfalo en T2', css: 'linear-gradient(135deg,#d8d0ff,#4b3a8a)' },
    { id: 'MR-MIP', label: 'MIP 3D', hint: 'Máxima intensidad en volumen', css: 'linear-gradient(135deg,#ffffff,#3a3a3a)' },
  ],
  PT: [{ id: 'MR-MIP', label: 'MIP 3D', hint: 'Captación en volumen', css: 'linear-gradient(135deg,#ffffff,#3a3a3a)' }],
};

export const QUALITY = [
  { label: 'Rápida', value: 1 },
  { label: 'Alta', value: 2 },
  { label: 'Máxima', value: 4 },
];

export const LIGHTING = [
  { id: 'mate', label: 'Mate', opts: { shade: true, ambient: 0.35, diffuse: 0.8, specular: 0.05 } },
  { id: 'normal', label: 'Natural', opts: { shade: true, ambient: 0.2, diffuse: 0.9, specular: 0.3 } },
  { id: 'brillo', label: 'Brillante', opts: { shade: true, ambient: 0.15, diffuse: 1.0, specular: 0.7 } },
  { id: 'plano', label: 'Sin sombra', opts: { shade: false, ambient: 0.4, diffuse: 0.7, specular: 0 } },
];

// LPS: +X left, +Y posterior, +Z superior. viewPlaneNormal points from the focal point toward the camera.
export const VIEWS = [
  { id: 'A', label: 'Anterior', normal: [0, -1, 0], up: [0, 0, 1] },
  { id: 'P', label: 'Posterior', normal: [0, 1, 0], up: [0, 0, 1] },
  { id: 'R', label: 'Derecha', normal: [-1, 0, 0], up: [0, 0, 1] },
  { id: 'L', label: 'Izquierda', normal: [1, 0, 0], up: [0, 0, 1] },
  { id: 'S', label: 'Superior', normal: [0, 0, 1], up: [0, -1, 0] },
  { id: 'I', label: 'Inferior', normal: [0, 0, -1], up: [0, -1, 0] },
];

export const DENSITY_RANGES = [
  { id: 'bone', label: 'Hueso', lower: 300, upper: 3000 },
  { id: 'calc', label: 'Calcio', lower: 130, upper: 3000 },
  { id: 'contrast', label: 'Contraste', lower: 150, upper: 600 },
  { id: 'soft', label: 'Tejido blando', lower: -30, upper: 120 },
  { id: 'fat', label: 'Grasa', lower: -190, upper: -30 },
  { id: 'lung', label: 'Pulmón', lower: -950, upper: -500 },
  { id: 'emphysema', label: 'Enfisema', lower: -1024, upper: -950 },
  { id: 'air', label: 'Aire', lower: -1024, upper: -500 },
];

export type Box = { x: [number, number]; y: [number, number]; z: [number, number] };
export const FULL_BOX: Box = { x: [0, 100], y: [0, 100], z: [0, 100] };

/** The 3D view on screen (the active one if it is 3D). */
export function view3D(servicesManager: Services): any | null {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const active = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
  if (active?.type === 'volume3d') {
    return active;
  }
  for (const id of viewportGridService.getState().viewports.keys()) {
    const vp = cornerstoneViewportService.getCornerstoneViewport(id);
    if (vp?.type === 'volume3d') {
      return vp;
    }
  }
  return null;
}

function volumeActor(vp: any): any | null {
  return (vp?.getActors?.() || []).find((a: any) => a.actor?.isA?.('vtkVolume')) || null;
}

/** Opens a 3D view: MPR + 3D by default, or only 3D. Waits until the volume is drawn. */
export async function open3D(commandsManager: any, servicesManager: Services, only = false): Promise<any | null> {
  commandsManager.runCommand('setHangingProtocol', { protocolId: only ? 'only3D' : 'mprAnd3DVolumeViewport' });
  for (let i = 0; i < 80; i++) {
    await wait(250);
    const vp = view3D(servicesManager);
    if (vp && volumeActor(vp)) {
      return vp;
    }
  }
  return null;
}

// The opacity curve of each preset, kept so the threshold slider is absolute (moving it back returns to the preset).
const baseOpacity = new WeakMap<any, number[][]>();

function opacityPoints(actor: any): number[][] {
  const ofun = actor.getProperty().getScalarOpacity(0);
  const pts: number[][] = [];
  for (let i = 0; i < ofun.getSize(); i++) {
    const v = [0, 0, 0, 0];
    ofun.getNodeValue(i, v);
    pts.push(v);
  }
  return pts;
}

export function setPreset(vp: any, preset: string): void {
  vp.setProperties({ preset });
  const entry = volumeActor(vp);
  if (entry) {
    baseOpacity.set(entry.actor, opacityPoints(entry.actor));
  }
  vp.render();
}

export function currentPreset(vp: any): string | null {
  try {
    return vp?.getProperties?.()?.preset || null;
  } catch {
    return null;
  }
}

/** Moves the whole opacity curve: negative shows more (lower densities), positive less. */
export function setThreshold(vp: any, shift: number): void {
  const entry = volumeActor(vp);
  if (!entry) {
    return;
  }
  const actor = entry.actor;
  if (!baseOpacity.has(actor)) {
    baseOpacity.set(actor, opacityPoints(actor));
  }
  const ofun = actor.getProperty().getScalarOpacity(0);
  ofun.removeAllPoints();
  for (const [x, y, mid, sharp] of baseOpacity.get(actor)!) {
    ofun.addPoint(x + shift, y, mid, sharp);
  }
  vp.render();
}

/** Ray-casting sample distance: «Máxima» samples four times finer than the voxel. */
export function setQuality(vp: any, quality: number): void {
  const entry = volumeActor(vp);
  if (!entry) {
    return;
  }
  const mapper = entry.actor.getMapper();
  const image = mapper.getInputData();
  const dims = image.getDimensions();
  const spacing = image.getSpacing();
  const diagonal = Math.hypot(dims[0] * spacing[0], dims[1] * spacing[1], dims[2] * spacing[2]);
  let distance = (spacing[0] + spacing[1] + spacing[2]) / 3;
  distance /= quality > 1 ? 0.5 * quality ** 2 : 1;
  mapper.setMaximumSamplesPerRay(Math.ceil(diagonal / distance) + 1);
  mapper.setSampleDistance(distance);
  vp.render();
}

export function setLighting(vp: any, opts: { shade: boolean; ambient: number; diffuse: number; specular: number }) {
  const entry = volumeActor(vp);
  if (!entry) {
    return;
  }
  const p = entry.actor.getProperty();
  p.setShade(opts.shade);
  p.setAmbient(opts.ambient);
  p.setDiffuse(opts.diffuse);
  p.setSpecular(opts.specular);
  p.setSpecularPower?.(20);
  vp.render();
}

function volumeBounds(vp: any): number[] | null {
  const entry = volumeActor(vp);
  return entry ? entry.actor.getMapper().getInputData().getBounds() : null;
}

export function setView(vp: any, normal: number[], up: number[]): void {
  const bounds = volumeBounds(vp);
  if (!bounds) {
    return;
  }
  const center = [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2, (bounds[4] + bounds[5]) / 2];
  const cam = vp.getCamera();
  const dist = Math.hypot(...cam.position.map((v: number, i: number) => v - cam.focalPoint[i])) || 1000;
  vp.setCamera({
    focalPoint: center,
    position: center.map((c, i) => c + normal[i] * dist),
    viewPlaneNormal: normal,
    viewUp: up,
  });
  vp.resetCamera?.({ resetPan: true, resetZoom: true, resetToCenter: true });
  vp.setCamera({ viewPlaneNormal: normal, viewUp: up, position: center.map((c, i) => c + normal[i] * dist), focalPoint: center });
  vp.render();
}

let spinTimer: ReturnType<typeof setInterval> | null = null;
export function spin(vp: any, on: boolean): void {
  if (spinTimer) {
    clearInterval(spinTimer);
    spinTimer = null;
  }
  if (!on || !vp) {
    return;
  }
  spinTimer = setInterval(() => {
    const camera = vp.getVtkActiveCamera?.();
    if (!camera || !vp.getRenderingEngine?.()) {
      spin(vp, false);
      return;
    }
    camera.azimuth(1.5);
    camera.orthogonalizeViewUp?.();
    vp.getRenderer().resetCameraClippingRange();
    vp.render();
  }, 33);
}
export const spinning = () => spinTimer !== null;

/** Crop box in percent of the volume along each patient axis. */
export function setCrop(vp: any, box: Box): void {
  const entry = volumeActor(vp);
  const b = volumeBounds(vp);
  if (!entry || !b) {
    return;
  }
  const at = (axis: 0 | 1 | 2, pct: number) => b[axis * 2] + ((b[axis * 2 + 1] - b[axis * 2]) * pct) / 100;
  const mapper = entry.actor.getMapper();
  mapper.removeAllClippingPlanes();
  const full = JSON.stringify(box) === JSON.stringify(FULL_BOX);
  if (!full) {
    const axes: [keyof Box, 0 | 1 | 2][] = [['x', 0], ['y', 1], ['z', 2]];
    for (const [k, axis] of axes) {
      const n = [0, 0, 0];
      n[axis] = 1;
      const o = [0, 0, 0];
      o[axis] = at(axis, box[k][0]);
      mapper.addClippingPlane(vtkPlane.newInstance({ origin: [...o], normal: [...n] }));
      const n2 = [0, 0, 0];
      n2[axis] = -1;
      const o2 = [0, 0, 0];
      o2[axis] = at(axis, box[k][1]);
      mapper.addClippingPlane(vtkPlane.newInstance({ origin: [...o2], normal: [...n2] }));
    }
  }
  vp.render();
}

/** PNG of the 3D view, downloaded with the study's name. */
export function exportPng(vp: any, name = 'reconstruccion-3d'): void {
  vp.render();
  const canvas: HTMLCanvasElement | undefined = vp.canvas;
  if (!canvas) {
    return;
  }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${name}.png`;
  a.click();
}

/**
 * Volume (mL) of the voxels between lower and upper (HU in CT) inside the crop box. Uses the volume loaded in the
 * 3D view, or any loaded volume of the active series.
 */
export function measureVolume(
  vp: any,
  lower: number,
  upper: number,
  box: Box
): { ml: number; voxels: number; meanHU: number } | null {
  const entry = volumeActor(vp);
  const volumeId = entry?.referencedId || entry?.uid;
  const volume: any = volumeId ? cache.getVolume(volumeId) : null;
  if (!volume) {
    return null;
  }
  const [nx, ny, nz] = volume.dimensions;
  const data: ArrayLike<number> | undefined =
    volume.voxelManager?.getCompleteScalarDataArray?.() ?? volume.getScalarData?.();
  if (!data || data.length < nx * ny * nz) {
    return null;
  }
  // Crop box (percent of world bounds) to index ranges through its eight corners: exact for axis-aligned volumes.
  const b = entry.actor.getMapper().getInputData().getBounds();
  const worldOf = (axis: number, pct: number) => b[axis * 2] + ((b[axis * 2 + 1] - b[axis * 2]) * pct) / 100;
  const xs = [worldOf(0, box.x[0]), worldOf(0, box.x[1])];
  const ys = [worldOf(1, box.y[0]), worldOf(1, box.y[1])];
  const zs = [worldOf(2, box.z[0]), worldOf(2, box.z[1])];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const x of xs) for (const y of ys) for (const z of zs) {
    const ijk = csUtils.transformWorldToIndex(volume.imageData, [x, y, z]);
    for (let d = 0; d < 3; d++) {
      min[d] = Math.min(min[d], ijk[d]);
      max[d] = Math.max(max[d], ijk[d]);
    }
  }
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(v)));
  const [i0, j0, k0] = [clamp(min[0], nx), clamp(min[1], ny), clamp(min[2], nz)];
  const [i1, j1, k1] = [clamp(max[0], nx), clamp(max[1], ny), clamp(max[2], nz)];

  let count = 0;
  let sum = 0;
  const slice = nx * ny;
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      const base = k * slice + j * nx;
      for (let i = i0; i <= i1; i++) {
        const v = data[base + i];
        if (v >= lower && v <= upper) {
          count++;
          sum += v;
        }
      }
    }
  }
  const [sx, sy, sz] = volume.spacing;
  return { ml: (count * sx * sy * sz) / 1000, voxels: count, meanHU: count ? sum / count : 0 };
}
