import AI3DMenu from './AI3DMenu';
import ProcessMenu from './ProcessMenu';
import { Menu3D, WindowsMenu } from './HeaderMenus';
import { CalcMenu, LesionMenu, SpineMenu } from './ModalityMenus';
import { ReportMenu } from './ReportMenu';
import { getAccess, subscribeAccess } from './ris';
import { aiSurfaceView } from './aiSurfaces';

/** The «IA 3D» viewport menu and when it shows: only on 3D viewports drawing AI surfaces. */
export default function getToolbarModule({ servicesManager }: withAppTypes) {
  return [
    { name: 'pixos.ai3dMenu', defaultComponent: AI3DMenu },
    { name: 'pixos.processMenu', defaultComponent: ProcessMenu },
    { name: 'pixos.windowsMenu', defaultComponent: WindowsMenu },
    { name: 'pixos.menu3d', defaultComponent: Menu3D },
    { name: 'pixos.lesionMenu', defaultComponent: LesionMenu },
    { name: 'pixos.spineMenu', defaultComponent: SpineMenu },
    { name: 'pixos.calcMenu', defaultComponent: CalcMenu },
    { name: 'pixos.reportMenu', defaultComponent: ReportMenu },
    {
      name: 'evaluate.pixos.ai3dMenu',
      evaluate: ({ viewportId }) => ({ disabled: !aiSurfaceView(servicesManager, viewportId) }),
    },
  ];
}

export const AI3D_BUTTON = {
  id: 'pixosAI3D',
  uiType: 'pixos.ai3dMenu',
  props: {
    icon: 'tab-segmentation',
    label: 'IA 3D',
    tooltip: 'Color, opacidad, estructuras, volumen y PNG de las superficies de IA',
    evaluate: { name: 'evaluate.pixos.ai3dMenu', hideWhenDisabled: true },
  },
};

const SECTION = 'viewportActionMenu.topRight';

/** Keeps the button in the 3D viewport's top-right corner (the mode registers its toolbar after the extensions enter). */
export function installAI3DButton(servicesManager): () => void {
  const { toolbarService } = servicesManager.services;
  let applying = false;
  const apply = () => {
    if (applying) {
      return;
    }
    applying = true;
    try {
      if (!toolbarService.getButton(AI3D_BUTTON.id)) {
        toolbarService.addButtons([AI3D_BUTTON]);
      }
      if (!(toolbarService.state.buttonSections?.[SECTION] || []).includes(AI3D_BUTTON.id)) {
        toolbarService.updateSection(SECTION, [AI3D_BUTTON.id]);
      }
    } finally {
      applying = false;
    }
  };
  const { unsubscribe } = toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_MODIFIED, apply);
  apply();
  return unsubscribe;
}

export const PROCESS_BUTTON = { id: 'pixosProcess', uiType: 'pixos.processMenu', props: {} };

/** «Procesar» next to the window/level tool in the main toolbar, for physicians. */
export function installProcessButton(servicesManager): () => void {
  const { toolbarService } = servicesManager.services;
  let applying = false;
  const apply = () => {
    if (applying || !getAccess().physician) {
      return;
    }
    applying = true;
    try {
      if (!toolbarService.getButton(PROCESS_BUTTON.id)) {
        toolbarService.addButtons([PROCESS_BUTTON]);
      }
      const primary: string[] = toolbarService.state.buttonSections?.primary || [];
      if (primary.length && !primary.includes(PROCESS_BUTTON.id)) {
        const at = primary.indexOf('WindowLevel');
        const next = [...primary];
        next.splice(at >= 0 ? at + 1 : next.length, 0, PROCESS_BUTTON.id);
        toolbarService.clearButtonSection('primary');
        toolbarService.updateSection('primary', next);
      }
    } finally {
      applying = false;
    }
  };
  const { unsubscribe } = toolbarService.subscribe(toolbarService.EVENTS.TOOL_BAR_MODIFIED, apply);
  const unsubscribeAccess = subscribeAccess(apply);
  apply();
  return () => {
    unsubscribe();
    unsubscribeAccess();
  };
}
