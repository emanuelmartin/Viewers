import { callCloud, getAccess, subscribeAccess } from './ris';
import { trackAI } from './aiUsage';

/**
 * «Agregar al reporte»: the active viewport as the physician sees it (slice, window, zoom, annotations) goes to the
 * RIS as an image of the study's report. The image canvas and the annotation layer are composed; the corner overlays
 * (patient name, dates) are HTML and stay out. The RIS shows it in the report's images and links it on save.
 */

const MAX_SIDE = 1600;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

/** The viewport's pixels plus its SVG annotations, as a JPEG data URL. */
async function composeViewport(viewport): Promise<string> {
  const element: HTMLElement = viewport.element;
  const canvas: HTMLCanvasElement = viewport.canvas || element.querySelector('canvas');
  if (!canvas?.width) {
    throw new Error('La vista no tiene imagen');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height);

  const svg = element.querySelector('svg.svg-layer') as SVGSVGElement | null;
  if (svg && svg.childElementCount) {
    const copy = svg.cloneNode(true) as SVGSVGElement;
    const rect = canvas.getBoundingClientRect();
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', String(rect.width));
    copy.setAttribute('height', String(rect.height));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
    try {
      ctx.drawImage(await loadImage(url), 0, 0, out.width, out.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return out.toDataURL('image/jpeg', 0.92);
}

function sliceText(viewport): string {
  const index = viewport.getCurrentImageIdIndex?.() ?? viewport.getSliceIndex?.();
  const total = viewport.getImageIds?.()?.length ?? viewport.getNumberOfSlices?.();
  return index != null && total > 1 ? `imagen ${index + 1}/${total}` : '';
}

type ReportImageResult = {
  count: number;
  linked: boolean;
  itemId?: string;
  report?: string;
  status?: string;
  redirected?: boolean;
  url?: string;
};

/**
 * Opens the report in the RIS. Inside the interpretation screen (the viewer is its iframe, same origin) the RIS page
 * moves to that report; opened alone, it goes to a new tab.
 */
function openReport(url: string): void {
  try {
    if (window.top && window.top !== window && window.top.location.origin === window.location.origin) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    // cross-origin parent: fall through
  }
  window.open(url, '_blank', 'noopener');
}

/** `label` replaces the series/slice label (e.g. «L1 · Nódulo hepático»); `quiet` skips the toast (the caller shows its own). */
export async function addViewportToReport(servicesManager, opts: { label?: string; quiet?: boolean } = {}): Promise<void> {
  const { viewportGridService, cornerstoneViewportService, displaySetService, uiNotificationService } = servicesManager.services;
  const { activeViewportId, viewports } = viewportGridService.getState();
  const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
  const displaySet = (viewports.get(activeViewportId)?.displaySetInstanceUIDs || [])
    .map(uid => displaySetService.getDisplaySetByUID(uid))
    .find(ds => ds?.StudyInstanceUID);
  if (!viewport || !displaySet) {
    uiNotificationService.show({ title: 'Agregar al reporte', message: 'Selecciona una vista con imagen', type: 'warning' });
    return;
  }
  try {
    const image = await composeViewport(viewport);
    const label = [opts.label, displaySet.SeriesDescription || displaySet.Modality, sliceText(viewport)].filter(Boolean).join(' · ').slice(0, 160);
    const res = await callCloud<ReportImageResult>('addReportImageFromViewer', {
      studyInstanceUID: displaySet.StudyInstanceUID,
      image,
      label,
    });
    trackAI('viewer.report_capture', displaySet.StudyInstanceUID, { series: displaySet.SeriesDescription || displaySet.Modality || '', count: res.count });
    if (opts.quiet) {
      return;
    }
    const n = `${res.count} ${res.count === 1 ? 'imagen' : 'imágenes'}`;
    uiNotificationService.show({
      title: 'Imagen agregada al reporte',
      message: res.linked
        ? `${label || 'Vista actual'} → ${res.report} (${res.status}). Ese reporte tiene ${n}.` +
          (res.redirected ? ' El reporte abierto en interpretación ya estaba firmado; se agregó a este, que sigue sin firmar.' : '')
        : `${label || 'Vista actual'}. El estudio aún no tiene orden en el RIS: queda con el estudio (${n}).`,
      type: res.redirected ? 'warning' : 'success',
      duration: res.redirected ? 9000 : 6000,
      ...(res.url ? { action: { label: 'Abrir reporte', onClick: () => openReport(res.url!) } } : {}),
    });
  } catch (e) {
    if (opts.quiet) {
      throw e;
    }
    uiNotificationService.show({ title: 'No se pudo agregar al reporte', message: e?.message || String(e), type: 'error' });
  }
}

export const REPORT_CAPTURE_BUTTON = {
  id: 'pixosAddToReport',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'clipboard',
    label: 'Agregar al reporte',
    tooltip: 'Agregar la vista activa (corte, ventana, zoom y anotaciones) a las imágenes del reporte',
    commands: 'pixosAddToReport',
    evaluate: [
      'evaluate.action',
      { name: 'evaluate.viewport.supported', unsupportedViewportTypes: ['video', 'wholeSlide'] },
    ],
  },
};

/** Puts the button next to «Capture» in the main toolbar, for physicians (the mode registers its toolbar after us). */
export function installReportCaptureButton(servicesManager): () => void {
  const { toolbarService } = servicesManager.services;
  let applying = false;
  const apply = () => {
    if (applying || !getAccess().physician) {
      return;
    }
    applying = true;
    try {
      if (!toolbarService.getButton(REPORT_CAPTURE_BUTTON.id)) {
        toolbarService.addButtons([REPORT_CAPTURE_BUTTON]);
      }
      const primary: string[] = toolbarService.state.buttonSections?.primary || [];
      if (primary.length && !primary.includes(REPORT_CAPTURE_BUTTON.id)) {
        const at = primary.indexOf('Capture');
        const next = [...primary];
        next.splice(at >= 0 ? at + 1 : next.length, 0, REPORT_CAPTURE_BUTTON.id);
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
