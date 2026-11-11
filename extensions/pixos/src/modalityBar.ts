/**
 * The modality group in the top toolbar, as on a reading workstation: the few tools each kind of study is read with,
 * changing with the active view (CT windows and density, MR signal, PET SUV, ultrasound Doppler, mammography
 * magnifier, X-ray Cobb and calibration). They are ordinary toolbar buttons (ids «px.mod.*»), so they light up when
 * active like any other tool. The header groups them under the modality's name. Physicians only.
 */
import { getAccess, subscribeAccess } from './ris';

const TOOL_GROUPS = ['default', 'mpr', 'SRToolGroup', 'volume3d'];
export const MOD_PREFIX = 'px.mod.';
export const BUTTON_3D = 'px.3d';

const toolButton = (toolName: string, label: string, tooltip: string, icon: string, key = toolName) => ({
  id: `${MOD_PREFIX}${key}`,
  uiType: 'ohif.toolButton',
  props: {
    icon,
    label,
    tooltip,
    commands: { commandName: 'setToolActiveToolbar', commandOptions: { toolName, toolGroupIds: TOOL_GROUPS } },
    evaluate: { name: 'evaluate.cornerstoneTool', toolNames: [toolName] },
  },
});

const actionButton = (id: string, label: string, tooltip: string, icon: string, commands: any, evaluate?: any) => ({
  id: `${MOD_PREFIX}${id}`,
  uiType: 'ohif.toolButton',
  props: { icon, label, tooltip, commands, evaluate: evaluate || 'evaluate.action' },
});

const B = {
  windows: { id: `${MOD_PREFIX}windows`, uiType: 'pixos.windowsMenu', props: {} },
  hu: toolButton('Probe', 'Densidad (UH)', 'Unidades Hounsfield en un punto', 'tool-probe'),
  roiHu: toolButton('EllipticalROI', 'Región (UH media)', 'Área y densidad media de una región', 'tool-ellipse'),
  roiSignal: toolButton('EllipticalROI', 'Señal en región', 'Área y señal media', 'tool-ellipse', 'roiSignal'),
  roiSuv: toolButton('EllipticalROI', 'SUV en región', 'SUV medio y máximo de una región', 'tool-ellipse', 'roiSuv'),
  autoWindow: actionButton('autoWindow', 'Ventana automática', 'Vuelve a la ventana del equipo', 'tool-reset', 'pixosAutoWindow'),
  perfusion: actionButton('perfusion', 'Color de perfusión', 'Mapa de color en la vista activa (otra vez: grises)', 'tool-fusion-color', 'pixosToggleColor'),
  invert: actionButton('invert', 'Invertir', 'Blanco por negro', 'tool-invert', 'invertViewport', [
    'evaluate.viewportProperties.toggle',
    { name: 'evaluate.viewport.supported', unsupportedViewportTypes: ['video'] },
  ]),
  doppler: toolButton('UltrasoundDirectionalTool', 'Doppler', 'Distancia y tiempo en el trazo Doppler', 'tool-ultrasound-bidirectional'),
  twoAxes: toolButton('Bidirectional', 'Dos ejes', 'Diámetro mayor y menor', 'tool-bidirectional'),
  ellipse: toolButton('EllipticalROI', 'Elipse', 'Área y perímetro', 'tool-ellipse', 'ellipse'),
  magnify: toolButton('Magnify', 'Lupa', 'Amplía bajo el cursor', 'tool-magnify'),
  magnifyFixed: toolButton('AdvancedMagnify', 'Lupa fija', 'Lupa que se queda y se mueve', 'tool-quick-magnify'),
  cobb: toolButton('CobbAngle', 'Ángulo de Cobb', 'Escoliosis', 'tool-cobb-angle'),
  calibrate: toolButton('CalibrationLine', 'Calibrar', 'Fija la escala con una distancia conocida', 'tool-calibration'),
};

export const MODALITY_NAME: Record<string, string> = {
  CT: 'TC',
  MR: 'RM',
  PT: 'PET',
  NM: 'Nuclear',
  US: 'US',
  MG: 'Mastografía',
  CR: 'Rayos X',
  DX: 'Rayos X',
  XA: 'Angio',
  RF: 'Fluoro',
};

function buttonsFor(modality: string): any[] {
  switch (modality) {
    case 'CT':
      return [B.windows, B.hu, B.roiHu];
    case 'MR':
      return [B.autoWindow, B.roiSignal, B.perfusion];
    case 'PT':
    case 'NM':
      return [B.roiSuv, B.invert];
    case 'US':
      return [B.doppler, B.twoAxes, B.ellipse];
    case 'MG':
      return [B.magnify, B.magnifyFixed, B.invert];
    case 'CR':
    case 'DX':
    case 'XA':
    case 'RF':
      return [B.cobb, B.calibrate, B.magnify];
    default:
      return [];
  }
}

const BUTTON_3D_DEF = { id: BUTTON_3D, uiType: 'pixos.menu3d', props: {} };

/** Modality of the active view (its first image series). */
export function activeModality(servicesManager): string {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const uids: string[] =
    viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId())?.displaySetInstanceUIDs || [];
  const ds: any = uids
    .map(uid => displaySetService.getDisplaySetByUID(uid))
    .find((d: any) => d && !['SEG', 'SR', 'RTSTRUCT'].includes(d.Modality));
  return ds?.Modality || '';
}

export function installModalityBar(servicesManager): () => void {
  const { toolbarService, viewportGridService, displaySetService } = servicesManager.services;
  let applying = false;
  let modality = '';

  const apply = () => {
    if (applying || !getAccess().physician) {
      return;
    }
    const primary: string[] = toolbarService.state.buttonSections?.primary || [];
    if (!primary.length) {
      return;
    }
    applying = true;
    try {
      const m = activeModality(servicesManager) || modality;
      modality = m;
      const wanted = buttonsFor(m);
      const missing = [...wanted, BUTTON_3D_DEF].filter(b => !toolbarService.getButton(b.id));
      if (missing.length) {
        toolbarService.addButtons(missing);
      }
      const base = primary.filter(id => !id.startsWith(MOD_PREFIX) && id !== BUTTON_3D);
      const atMeasure = base.indexOf('MeasurementTools');
      base.splice(atMeasure >= 0 ? atMeasure + 1 : base.length, 0, ...wanted.map(b => b.id));
      const atLayout = base.indexOf('Layout');
      base.splice(atLayout >= 0 ? atLayout + 1 : base.length, 0, BUTTON_3D);
      if (base.join('|') !== primary.join('|')) {
        toolbarService.clearButtonSection('primary');
        toolbarService.updateSection('primary', base);
      }
    } finally {
      applying = false;
    }
  };

  const subs = [
    toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_MODIFIED, apply),
    viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, apply),
    viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, apply),
    displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, apply),
  ];
  const unsubscribeAccess = subscribeAccess(apply);
  apply();
  return () => {
    subs.forEach(s => s.unsubscribe());
    unsubscribeAccess();
  };
}
