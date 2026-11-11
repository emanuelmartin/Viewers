/**
 * Tools for the modality on screen, as each reading workstation offers them: CT windows and density, MR and PET
 * projections and colour, ultrasound and mammography measurements, X-ray angles and calibration.
 */
import { project, setColormap } from './processing';

type Services = any;

export type ModalityAction =
  | { kind: 'window'; label: string; width: number; center: number }
  | { kind: 'tool'; label: string; tool: string; hint: string }
  | { kind: 'run'; label: string; hint: string; run: (s: Services, c: any) => Promise<string | null> | string | null };

const tool = (label: string, toolName: string, hint: string): ModalityAction => ({ kind: 'tool', label, tool: toolName, hint });
const win = (label: string, width: number, center: number): ModalityAction => ({ kind: 'window', label, width, center });

function activeViewport(s: Services): any {
  const { viewportGridService, cornerstoneViewportService } = s.services;
  return cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
}

const invert: ModalityAction = {
  kind: 'run',
  label: 'Invertir',
  hint: 'Blanco por negro',
  run: s => {
    const vp = activeViewport(s);
    if (!vp) return 'No hay imagen activa';
    vp.setProperties({ invert: !vp.getProperties().invert });
    vp.render();
    return null;
  },
};
const autoWindow: ModalityAction = {
  kind: 'run',
  label: 'Ventana automática',
  hint: 'Vuelve a la ventana del equipo',
  run: s => {
    const vp = activeViewport(s);
    if (!vp) return 'No hay imagen activa';
    vp.resetProperties?.();
    vp.render();
    return null;
  },
};
const mip = (thickness: number): ModalityAction => ({
  kind: 'run',
  label: `MIP ${thickness} mm`,
  hint: 'Proyección de máxima intensidad en los tres planos',
  run: (s, c) => project(s, c, 1, thickness),
});
const color = (label: string, name: string): ModalityAction => ({
  kind: 'run',
  label,
  hint: 'Mapa de color en la vista activa',
  run: s => setColormap(s, name),
});

export const MODALITY_LABEL: Record<string, string> = {
  CT: 'Tomografía',
  MR: 'Resonancia',
  PT: 'PET',
  NM: 'Medicina nuclear',
  US: 'Ultrasonido',
  MG: 'Mastografía',
  CR: 'Rayos X',
  DX: 'Rayos X',
  XA: 'Angiografía',
  RF: 'Fluoroscopía',
};

export function modalityTools(modality: string): { windows: ModalityAction[]; tools: ModalityAction[] } {
  switch (modality) {
    case 'CT':
      return {
        windows: [
          win('Cerebro', 80, 40),
          win('Subdural', 200, 75),
          win('Ictus', 40, 35),
          win('Pulmón', 1500, -600),
          win('Mediastino', 350, 50),
          win('Abdomen', 400, 40),
          win('Hígado', 150, 60),
          win('Hueso', 2000, 500),
          win('Angio', 600, 170),
          win('Oído / senos', 4000, 400),
        ],
        tools: [
          tool('Densidad (UH)', 'Probe', 'Unidades Hounsfield en un punto'),
          tool('Región (UH media)', 'EllipticalROI', 'Área y densidad media'),
          tool('Contorno libre', 'PlanarFreehandROI', 'Área de un contorno a mano'),
          mip(10),
          mip(20),
        ],
      };
    case 'MR':
      return {
        windows: [],
        tools: [
          autoWindow,
          tool('Señal en región', 'EllipticalROI', 'Área y señal media'),
          tool('Contorno libre', 'PlanarFreehandROI', 'Área de un contorno a mano'),
          mip(20),
          color('Color perfusión', 'perfusion'),
          color('Grises', 'Grayscale'),
        ],
      };
    case 'PT':
    case 'NM':
      return {
        windows: [],
        tools: [
          {
            kind: 'run',
            label: 'Abrir PET/CT',
            hint: 'Fusión, MIP y SUV',
            run: () => {
              const url = new URL(window.location.href);
              url.pathname = url.pathname.replace(/\/viewer\b/, '/tmtv');
              window.location.assign(url.toString());
              return null;
            },
          },
          tool('SUV en región', 'EllipticalROI', 'SUV medio y máximo'),
          invert,
          color('Color hierro', 'hot_iron'),
          color('Color PET', 's_pet'),
          color('Grises', 'Grayscale'),
        ],
      };
    case 'US':
      return {
        windows: [],
        tools: [
          tool('Longitud', 'Length', 'Distancia en mm (calibrada por el equipo)'),
          tool('Elipse', 'EllipticalROI', 'Área y perímetro'),
          tool('Dos ejes', 'Bidirectional', 'Diámetro mayor y menor'),
          tool('Ángulo', 'Angle', 'Por ejemplo, ángulo alfa de cadera'),
          tool('Doppler / dirección', 'UltrasoundDirectionalTool', 'Distancia y tiempo en trazo Doppler'),
        ],
      };
    case 'MG':
      return {
        windows: [],
        tools: [
          tool('Lupa', 'Magnify', 'Amplía bajo el cursor (microcalcificaciones)'),
          tool('Lupa avanzada', 'AdvancedMagnify', 'Lupa fija y movible'),
          tool('Longitud', 'Length', 'Tamaño de la lesión'),
          tool('Región', 'EllipticalROI', 'Área de la lesión'),
          invert,
          autoWindow,
        ],
      };
    case 'CR':
    case 'DX':
    case 'XA':
    case 'RF':
      return {
        windows: [],
        tools: [
          tool('Ángulo', 'Angle', 'Ángulo entre dos líneas'),
          tool('Ángulo de Cobb', 'CobbAngle', 'Escoliosis'),
          tool('Calibrar', 'CalibrationLine', 'Fija la escala con una distancia conocida'),
          tool('Lupa', 'Magnify', 'Amplía bajo el cursor'),
          invert,
          autoWindow,
        ],
      };
    default:
      return { windows: [], tools: [autoWindow, invert, tool('Longitud', 'Length', 'Distancia')] };
  }
}

/** Window on the active view; when the active view is the 3D render, on every 2D plane instead. */
export function applyWindow(s: Services, width: number, center: number): string | null {
  const { viewportGridService, cornerstoneViewportService } = s.services;
  const active = activeViewport(s);
  const list =
    active && active.type !== 'volume3d'
      ? [active]
      : [...viewportGridService.getState().viewports.keys()]
          .map(id => cornerstoneViewportService.getCornerstoneViewport(id))
          .filter(vp => vp && vp.type !== 'volume3d');
  if (!list.length) return 'No hay imagen activa';
  for (const vp of list) {
    vp.setProperties({ voiRange: { lower: center - width / 2, upper: center + width / 2 } });
    vp.render();
  }
  return null;
}

export function activateTool(commandsManager: any, toolName: string): void {
  commandsManager.runCommand('setToolActiveToolbar', { toolName });
}

/** Modality of the active view (the first image series in it). */
export function activeModality(s: Services): string {
  const { viewportGridService, displaySetService } = s.services;
  const uids: string[] =
    viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId())?.displaySetInstanceUIDs || [];
  const ds: any = uids.map(uid => displaySetService.getDisplaySetByUID(uid)).find((d: any) => d && !['SEG', 'SR', 'RTSTRUCT'].includes(d.Modality));
  return ds?.Modality || '';
}
