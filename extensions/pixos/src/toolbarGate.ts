import { getAccess, subscribeAccess } from './ris';

/**
 * Toolbar for viewers without a physician's RIS session (patients opening a
 * shared link): browse the images, window/level, zoom, rotate and play.
 * Measurements, layouts (MPR, 3D), crosshairs and the rest stay for
 * physicians. The mode registers its toolbar after the extensions enter, so
 * the restriction is (re)applied on every toolbar change; the full sections
 * are kept to restore them when a physician's session is confirmed.
 */
const RESTRICTED_SECTIONS: Record<string, string[]> = {
  primary: ['Zoom', 'Pan', 'WindowLevel', 'Capture', 'MoreTools'],
  MoreTools: ['Reset', 'rotate-right', 'flipHorizontal', 'invert', 'StackScroll', 'Cine'],
  MeasurementTools: [],
};

export function installToolbarGate(servicesManager): () => void {
  const { toolbarService } = servicesManager.services;
  let saved: Record<string, string[]> = {};
  let applying = false;

  const replaceSection = (key: string, ids: string[]) => {
    toolbarService.clearButtonSection(key);
    if (ids.length) {
      toolbarService.updateSection(key, ids);
    }
  };

  const apply = () => {
    if (applying) {
      return;
    }
    applying = true;
    try {
      const sections = toolbarService.state.buttonSections;
      if (!getAccess().physician) {
        for (const [key, allowed] of Object.entries(RESTRICTED_SECTIONS)) {
          const current: string[] = sections[key] || [];
          const kept = current.filter(id => allowed.includes(id));
          if (kept.length !== current.length) {
            if (!saved[key] || saved[key].length < current.length) {
              saved[key] = [...current];
            }
            replaceSection(key, kept);
          }
        }
      } else if (Object.keys(saved).length) {
        const restore = saved;
        saved = {};
        Object.entries(restore).forEach(([key, ids]) => replaceSection(key, ids));
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
