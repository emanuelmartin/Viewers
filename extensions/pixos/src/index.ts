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

let cleanup: Array<() => void> = [];

/**
 * On every mode entry the viewer starts restricted (shared links, no
 * session) and checks the RIS session; physicians get the full toolbar and
 * the PixOS tools panel once the server confirms it.
 */
function onModeEnter({ servicesManager }: withAppTypes) {
  cleanup.forEach(fn => fn());
  cleanup = [installToolbarGate(servicesManager), watchRisSession()];
  loadAccess();
}

function onModeExit() {
  cleanup.forEach(fn => fn());
  cleanup = [];
}

export default { id, getPanelModule, getCustomizationModule, getCommandsModule, onModeEnter, onModeExit };
