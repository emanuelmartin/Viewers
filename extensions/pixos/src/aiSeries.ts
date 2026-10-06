/**
 * AI series in the study browser.
 *
 * The AI queue stores its masks in the PACS as DICOM SEG series tagged as AI
 * (Manufacturer «PixOS IA», description «IA · …», «· en validación» while a
 * model is still being validated). They are for physicians: anyone without a
 * physician's session (patients opening a shared link) does not see them in
 * the study browser, and series still in validation are listed only for the
 * validation roles. The display sets are kept (access arrives after they are
 * created); only their thumbnail is hidden.
 */
import { getAccess, subscribeAccess, ViewerAccess } from './ris';

export function isAISeries(ds: any): boolean {
  const manufacturer = ds?.instance?.Manufacturer || ds?.instances?.[0]?.Manufacturer || ds?.Manufacturer;
  return manufacturer === 'PixOS IA' || String(ds?.SeriesDescription || '').startsWith('IA · ');
}

function hidden(ds: any, access: ViewerAccess): boolean {
  if (!access.physician) {
    return true;
  }
  return /en validación/.test(String(ds?.SeriesDescription || '')) && !access.validation;
}

export function installAISeriesFilter(servicesManager): () => void {
  const { displaySetService } = servicesManager.services;

  const apply = (displaySets: any[], notify: boolean) => {
    const access = getAccess();
    displaySets.filter(isAISeries).forEach(ds => {
      const hide = hidden(ds, access);
      if (ds.excludeFromThumbnailBrowser !== hide) {
        ds.excludeFromThumbnailBrowser = hide;
        if (notify) {
          // The study browser re-reads the display sets on this event
          displaySetService.setDisplaySetMetadataInvalidated(ds.displaySetInstanceUID, false);
        }
      }
    });
  };

  const added = displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, ({ displaySetsAdded }) =>
    apply(displaySetsAdded || [], false)
  );
  const unsubscribeAccess = subscribeAccess(() => apply(displaySetService.getActiveDisplaySets(), true));
  apply(displaySetService.getActiveDisplaySets(), true);

  return () => {
    added.unsubscribe();
    unsubscribeAccess();
  };
}
