import AI3DMenu from './AI3DMenu';
import { aiSurfaceView } from './aiSurfaces';

/** The «IA 3D» viewport menu and when it shows: only on 3D viewports drawing AI surfaces. */
export default function getToolbarModule({ servicesManager }: withAppTypes) {
  return [
    { name: 'pixos.ai3dMenu', defaultComponent: AI3DMenu },
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
