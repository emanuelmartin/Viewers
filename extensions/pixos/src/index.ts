// Spanish month names for formatDate/formatDICOMDate (moment). The rsbuild
// build no longer bundles every moment locale as webpack did, and the
// browser language here is es-419/es-MX, which moment resolves to "es".
import 'moment/locale/es';
import { id } from './id';
import getPanelModule from './getPanelModule';
import getCustomizationModule from './getCustomizationModule';
import getCommandsModule from './getCommandsModule';
import { loadAccess, watchRisSession } from './ris';
import { installToolbarGate } from './toolbarGate';
import { installSegmentationTools } from './segTools';
import { installAISeriesFilter } from './aiSeries';
import { installLooks, installSurfaceGuard, installSurfacePicking } from './aiSurfaces';
import { installBetter3D } from './better3D';
import getToolbarModule, { installAI3DButton } from './getToolbarModule';

let cleanup: Array<() => void> = [];

/**
 * On every mode entry the viewer starts restricted (shared links, no
 * session) and checks the RIS session; physicians get the full toolbar and
 * the PixOS tools panel once the server confirms it.
 */
function onModeEnter({ servicesManager, extensionManager }: withAppTypes) {
  cleanup.forEach(fn => fn());
  cleanup = [installToolbarGate(servicesManager), watchRisSession(), installSegmentationTools(servicesManager, extensionManager),
    installAISeriesFilter(servicesManager), installSurfacePicking(servicesManager), installSurfaceGuard(servicesManager),
    installBetter3D(servicesManager), installAI3DButton(servicesManager), installLooks(servicesManager)];
  loadAccess();
}

function onModeExit() {
  cleanup.forEach(fn => fn());
  cleanup = [];
}

export default { id, getPanelModule, getToolbarModule, getCustomizationModule, getCommandsModule, onModeEnter, onModeExit };
