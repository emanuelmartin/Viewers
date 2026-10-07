import { utilities as csUtils } from '@cornerstonejs/core';

/** AI results give points in patient coordinates, LPS millimetres like Cornerstone. */
export const toWorld = (p: number[]): [number, number, number] => [p[0], p[1], p[2]];

/** Yellow ring with a label on top of a viewport's canvas at a world point, removed after 6 s. */
function ring(viewport: any, world: [number, number, number], label: string) {
  window.setTimeout(() => {
    const [x, y] = viewport.worldToCanvas(world);
    const host: HTMLElement = viewport.element;
    if (!host || !Number.isFinite(x)) return;
    const circle = document.createElement('div');
    circle.title = label;
    Object.assign(circle.style, {
      position: 'absolute', left: `${x - 22}px`, top: `${y - 22}px`, width: '44px', height: '44px', borderRadius: '50%',
      border: '2px solid #facc15', boxShadow: '0 0 0 2px rgba(0,0,0,.6)', pointerEvents: 'none', zIndex: '20',
    });
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, {
      position: 'absolute', left: `${x + 26}px`, top: `${y - 10}px`, color: '#facc15', font: '12px system-ui',
      textShadow: '0 0 3px #000', pointerEvents: 'none', zIndex: '20', whiteSpace: 'nowrap',
    });
    host.style.position = host.style.position || 'relative';
    host.appendChild(circle);
    host.appendChild(tag);
    window.setTimeout(() => { circle.remove(); tag.remove(); }, 6000);
  }, 150);
}

/**
 * Moves one Cornerstone viewport to a world point (LPS mm) and rings it: volume viewports (MPR) centre the point on
 * their slice; stack viewports go to the closest image. Returns a problem, or null.
 */
function moveViewport(viewport: any, world: [number, number, number], label: string, voi: [number, number] | null): string | null {
  if (typeof viewport.setImageIdIndex === 'function') {
    const index = csUtils.getClosestStackImageIndexForPoint(world, viewport);
    if (index == null) {
      return 'El punto no está en esta serie: cargue la serie analizada o use MPR';
    }
    viewport.setImageIdIndex(index);
  } else {
    const { focalPoint, position } = viewport.getCamera();
    viewport.setCamera({
      focalPoint: world,
      position: [world[0] + position[0] - focalPoint[0], world[1] + position[1] - focalPoint[1], world[2] + position[2] - focalPoint[2]],
    });
    viewport.render();
  }
  if (voi && typeof viewport.setProperties === 'function') {
    // Window for the finding: lung (W 1500 / L -600) for nodules, liver for focal lesions
    viewport.setProperties({ voiRange: { lower: voi[0], upper: voi[1] } });
    viewport.render();
  }
  ring(viewport, world, label);
  return null;
}

/** The active viewport goes to the point. */
export function showPoint(servicesManager, world: [number, number, number], label: string, voi: [number, number] | null = null): string | null {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
  if (!viewport) {
    return 'No hay una vista activa';
  }
  return moveViewport(viewport, world, label, voi);
}

/**
 * Every image viewport of the grid goes to the point (used from the 3D view: a click on a surface shows that place in
 * the slices). 3D-rendering viewports and series that do not contain the point are left as they are. Returns how many
 * viewports moved.
 */
export function showPointEverywhere(servicesManager, world: [number, number, number], label: string): number {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  let moved = 0;
  for (const { viewportId } of viewportGridService.getState().viewports.values()) {
    const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport || viewport.type === 'volume3d') {
      continue;
    }
    try {
      if (moveViewport(viewport, world, label, null) === null) {
        moved++;
      }
    } catch {
      /* a viewport still loading is skipped */
    }
  }
  return moved;
}
