// Spanish month names for formatDate/formatDICOMDate (moment). The rsbuild
// build no longer bundles every moment locale as webpack did, and the
// browser language here is es-419/es-MX, which moment resolves to "es".
import 'moment/locale/es';
import { id } from './id';
import getPanelModule from './getPanelModule';
import getCustomizationModule from './getCustomizationModule';
import getCommandsModule from './getCommandsModule';
import getHangingProtocolModule from './getHangingProtocolModule';
import { loadAccess, watchRisSession } from './ris';
import { ensureViewerAccess } from './access';
import { installToolbarGate } from './toolbarGate';
import { installSegmentationTools } from './segTools';
import { installAISeriesFilter } from './aiSeries';
import { installLooks, installSurfaceGuard, installSurfacePicking } from './aiSurfaces';
import { installBetter3D } from './better3D';
import { installAutoVoi } from './autoVoi';
import { installModalityLook } from './modalityLook';
import getToolbarModule, { installAI3DButton, installProcessButton } from './getToolbarModule';
import { installReportCaptureButton } from './reportCapture';
import { installVolumeWatchdog } from './volumeWatchdog';
import { installModalityBar } from './modalityBar';
import { installReportLink } from './reportLink';

let cleanup: Array<() => void> = [];

/**
 * On every mode entry the viewer starts restricted (shared links, no
 * session) and checks the RIS session; physicians get the full toolbar and
 * the PixOS tools panel once the server confirms it.
 */
function onModeEnter({ servicesManager, extensionManager, commandsManager }: withAppTypes) {
  cleanup.forEach(fn => fn());
  cleanup = [
    installToolbarGate(servicesManager),
    watchRisSession(),
    installSegmentationTools(servicesManager, extensionManager),
    installAISeriesFilter(servicesManager),
    installSurfacePicking(servicesManager),
    installSurfaceGuard(servicesManager),
    installBetter3D(servicesManager),
    installAutoVoi(servicesManager),
    installModalityLook(servicesManager),
    installAI3DButton(servicesManager),
    installLooks(servicesManager),
    installReportCaptureButton(servicesManager),
    installProcessButton(servicesManager),
    installModalityBar(servicesManager),
    installReportLink(servicesManager, commandsManager),
    installVolumeWatchdog(),
  ];
  loadAccess();
}

/**
 * Before the routes mount: make sure there is a viewer cookie (asks for one
 * with the pixOS session when missing) and remember why not, for the
 * "not available" page.
 */
async function preRegistration() {
  await ensureViewerAccess().catch(() => undefined);
}

function onModeExit() {
  cleanup.forEach(fn => fn());
  cleanup = [];
}

export default {
  id,
  preRegistration,
  getHangingProtocolModule,
  getPanelModule,
  getToolbarModule,
  getCustomizationModule,
  getCommandsModule,
  onModeEnter,
  onModeExit,
};
