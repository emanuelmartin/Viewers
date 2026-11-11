import i18n from '@ohif/i18n';
import { ViewportDialog } from '@ohif/ui-next';

// pixOS: plain Spanish written here (these are read when the module loads, before the language is ready)
const beginTrackingMessage = '¿Guardar las medidas de esta serie?';
const trackNewSeriesMessage = '¿Agregar esta medida a las que ya guardó?';
const discardSeriesMessage = 'Ya tiene medidas de otra serie. ¿Qué hacemos con ellas?';
const trackNewStudyMessage = '¿Guardar las medidas de esta serie?';
const discardStudyMessage = 'Las medidas se guardan por estudio. ¿Guardar las que ya tiene antes de cambiar?';
const hydrateSRMessage = 'Este estudio tiene medidas guardadas. ¿Mostrarlas?';
const hydrateRTMessage = '¿Abrir esta segmentación?';
const hydrateSEGMessage = '¿Abrir esta segmentación?';
const discardDirtyMessage = 'Tiene medidas sin guardar. ¿Guardarlas?';
void i18n;

export default {
  'ui.notificationComponent': ViewportDialog,
  'viewportNotification.beginTrackingMessage': beginTrackingMessage,
  'viewportNotification.trackNewSeriesMessage': trackNewSeriesMessage,
  'viewportNotification.discardSeriesMessage': discardSeriesMessage,
  'viewportNotification.trackNewStudyMessage': trackNewStudyMessage,
  'viewportNotification.discardStudyMessage': discardStudyMessage,
  'viewportNotification.hydrateSRMessage': hydrateSRMessage,
  'viewportNotification.hydrateRTMessage': hydrateRTMessage,
  'viewportNotification.hydrateSEGMessage': hydrateSEGMessage,
  'viewportNotification.discardDirtyMessage': discardDirtyMessage,
};
