/**
 * Image processing for the «Procesar» menu, the way a reading workstation offers it: thick-slab projections
 * (MIP, MinIP, average) on every reconstructed plane at once, smoothing and edge enhancement, colour maps, and
 * the reconstructions (MPR, 3D). Everything acts on what is on screen; nothing is written to the study.
 */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// Cornerstone BlendModes: 0 composite, 1 MIP, 2 MinIP, 3 average
export const PROJECTIONS = [
  { id: 'normal', label: 'Normal', hint: 'Un solo corte', blend: 0 },
  { id: 'mip', label: 'MIP', hint: 'Lo más brillante: vasos, contraste, nódulos', blend: 1 },
  { id: 'minip', label: 'MinIP', hint: 'Lo más oscuro: vía aérea, enfisema', blend: 2 },
  { id: 'avg', label: 'Promedio', hint: 'Corte grueso con menos ruido', blend: 3 },
] as const;

export const THICKNESSES = [5, 10, 20, 40];

export const SMOOTHING = [
  { label: 'No', value: 0 },
  { label: 'Poco', value: 3 },
  { label: 'Medio', value: 6 },
  { label: 'Mucho', value: 10 },
];

export const SHARPENING = [
  { label: 'No', value: 0 },
  { label: 'Poco', value: 0.1 },
  { label: 'Medio', value: 0.25 },
  { label: 'Mucho', value: 0.5 },
];

export const COLORMAPS = [
  { name: 'Grayscale', label: 'Grises', css: 'linear-gradient(90deg,#000,#fff)' },
  { name: 'hot_iron', label: 'Hierro', css: 'linear-gradient(90deg,#000,#a0130b,#f6a100,#fff)' },
  { name: 'red_hot', label: 'Rojo', css: 'linear-gradient(90deg,#000,#c00,#ff0,#fff)' },
  { name: 'rainbow_2', label: 'Arcoíris', css: 'linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)' },
  { name: 'perfusion', label: 'Perfusión', css: 'linear-gradient(90deg,#000,#30c,#0cf,#0f0,#ff0,#f00)' },
  { name: 's_pet', label: 'PET', css: 'linear-gradient(90deg,#000,#4b0082,#f00,#ff0,#fff)' },
  { name: 'ge', label: 'GE', css: 'linear-gradient(90deg,#000,#0a7a7a,#a05000,#fff)' },
  { name: 'X Ray', label: 'Rayos X', css: 'linear-gradient(90deg,#fff,#000)' },
];

export const RECONSTRUCTIONS = [
  { id: 'default', label: 'Cortes', hint: 'Las series como se adquirieron' },
  { id: 'mpr', label: 'MPR', hint: 'Axial, coronal y sagital' },
  { id: 'primaryAxial', label: 'Axial grande', hint: 'Axial principal con coronal y sagital' },
  { id: 'mprAnd3DVolumeViewport', label: 'MPR + 3D', hint: 'Los tres planos y un volumen' },
  { id: 'only3D', label: '3D', hint: 'Volumen renderizado' },
];

type Services = any;

function activeViewport(servicesManager: Services): any {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  return cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
}

/** The planes on screen that can project a slab (MPR planes, not the 3D render nor plain stacks). */
function slabViewports(servicesManager: Services): any[] {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const ids: string[] = [...viewportGridService.getState().viewports.keys()];
  return ids
    .map(id => cornerstoneViewportService.getCornerstoneViewport(id))
    .filter(
      vp => vp?.setBlendMode && vp?.setSlabThickness && vp.type !== 'volume3d' && !isOwnMip(vp)
    );
}

/** The PET/CT mode's rotating MIP is its own view: projections and resets leave it alone. */
function isOwnMip(vp: any): boolean {
  return /mip/i.test(String(vp?.id || ''));
}

/** Viewports the filters and colour apply to: the active one, or all of them. */
function targets(servicesManager: Services, all: boolean): any[] {
  if (!all) {
    const vp = activeViewport(servicesManager);
    return vp ? [vp] : [];
  }
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  return [...viewportGridService.getState().viewports.keys()]
    .map(id => cornerstoneViewportService.getCornerstoneViewport(id))
    .filter(vp => vp && vp.type !== 'volume3d' && !isOwnMip(vp));
}

export function canProject(servicesManager: Services): boolean {
  return slabViewports(servicesManager).length > 0;
}

/** Thick-slab projection on every MPR plane; from plain slices it opens MPR first. */
export async function project(
  servicesManager: Services,
  commandsManager: any,
  blend: number,
  thickness: number
): Promise<string | null> {
  let planes = slabViewports(servicesManager);
  if (!planes.length) {
    if (blend === 0) {
      return null;
    }
    commandsManager.runCommand('setHangingProtocol', { protocolId: 'mpr' });
    for (let i = 0; i < 60 && !planes.length; i++) {
      await wait(250);
      planes = slabViewports(servicesManager).filter(vp => vp.getActors?.().length);
    }
    if (!planes.length) {
      return 'Esta serie no se puede reconstruir (necesita cortes de un volumen)';
    }
    await wait(300);
  }
  for (const vp of planes) {
    vp.setBlendMode(blend);
    if (blend === 0) {
      vp.resetSlabThickness ? vp.resetSlabThickness() : vp.setSlabThickness(0.1);
    } else {
      vp.setSlabThickness(thickness);
    }
    vp.render();
  }
  return null;
}

export function currentProjection(servicesManager: Services): { blend: number; thickness: number } {
  const vp = slabViewports(servicesManager)[0];
  if (!vp) {
    return { blend: 0, thickness: 10 };
  }
  const blend = Number(vp.getBlendMode?.() ?? 0) || 0;
  const thickness = Math.round(Number(vp.getSlabThickness?.() ?? 10)) || 10;
  return { blend, thickness: THICKNESSES.includes(thickness) ? thickness : 10 };
}

export function setFilter(
  servicesManager: Services,
  kind: 'smoothing' | 'sharpening',
  value: number,
  all: boolean
): string | null {
  const list = targets(servicesManager, all);
  if (!list.length) {
    return 'No hay imagen activa';
  }
  for (const vp of list) {
    const setter = kind === 'smoothing' ? vp.setSmoothing : vp.setSharpening;
    if (setter) {
      setter.call(vp, value);
    } else {
      vp.setProperties?.({ [kind]: value });
    }
    vp.render();
  }
  return null;
}

export function currentFilters(servicesManager: Services): { smoothing: number; sharpening: number } {
  const vp = activeViewport(servicesManager);
  return { smoothing: Number(vp?.smoothing) || 0, sharpening: Number(vp?.sharpening) || 0 };
}

/** Colour goes on the active view only, as on a workstation (in PET/CT the CT views stay grey). */
export function setColormap(servicesManager: Services, name: string): string | null {
  const list = targets(servicesManager, false);
  if (!list.length) {
    return 'No hay imagen activa';
  }
  for (const vp of list) {
    try {
      // In a fusion only the top layer (the PET) takes the map; the CT underneath stays grey.
      const actors = vp.getActors?.() || [];
      if (actors.length > 1 && vp.setColormap) {
        vp.setColormap({ name }, actors[actors.length - 1].referencedId || actors[actors.length - 1].uid);
      } else {
        vp.setProperties({ colormap: { name } });
      }
      vp.render();
    } catch {
      // Video and whole-slide viewports have no colour maps.
    }
  }
  return null;
}

export function currentColormap(servicesManager: Services): string {
  const vp = activeViewport(servicesManager);
  try {
    return vp?.getProperties?.()?.colormap?.name || 'Grayscale';
  } catch {
    return 'Grayscale';
  }
}

/** Back to how the image opened: one slice, no filters, grey. */
export function resetProcessing(servicesManager: Services): void {
  for (const vp of slabViewports(servicesManager)) {
    vp.setBlendMode(0);
    vp.resetSlabThickness ? vp.resetSlabThickness() : vp.setSlabThickness(0.1);
    vp.render();
  }
  setFilter(servicesManager, 'smoothing', 0, true);
  setFilter(servicesManager, 'sharpening', 0, true);
  for (const vp of targets(servicesManager, true)) {
    if ((vp.getActors?.() || []).length <= 1) {
      try {
        vp.setProperties({ colormap: { name: 'Grayscale' } });
        vp.render();
      } catch {
        // not every viewport has a colour map
      }
    }
  }
}
