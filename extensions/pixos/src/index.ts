// Spanish month names for formatDate/formatDICOMDate (moment). The rsbuild
// build no longer bundles every moment locale as webpack did, and the
// browser language here is es-419/es-MX, which moment resolves to "es".
import 'moment/locale/es';
import { id } from './id';
import getPanelModule from './getPanelModule';
import getCustomizationModule from './getCustomizationModule';

export default { id, getPanelModule, getCustomizationModule };
