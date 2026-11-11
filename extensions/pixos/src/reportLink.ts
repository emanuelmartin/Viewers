/**
 * The viewer ↔ report link (pixOS RIS, same origin).
 *
 * - `sendToReport`: measurements and calculations go to the report with their numbers (name, value, unit), the tool,
 *   the method and its published reference, where they were taken (series, instance, frame), a suggested template
 *   field and a lesion id to follow it across studies (contract: pixos-ris apps/api/src/viewer-contract.ts). Optionally
 *   with the key image of the active view.
 * - A `BroadcastChannel` with the report screen (embedded viewer or another tab/monitor): `goto` takes the viewer to the
 *   image of a measurement; `signed` stores the DICOM SR (TID 1500) of the measurements and the DICOM SEG of the
 *   «Lesiones» segmentation in the PACS; the viewer tells the report when it sent something.
 * - The procedure's hanging protocol (from getStudyWorkflow): viewport layout when the study opens.
 *
 * Every write needs a radiologist with a pixOS session who is a member of the study's organization: the viewer checks
 * `getAccess().canSave` and the server checks it again.
 */
import { metaData } from '@cornerstonejs/core';
import { adaptersSR } from '@cornerstonejs/adapters';
import { utils } from '@ohif/core';
import { datasetToDicomBlob } from '@ohif/extension-default/src/utils/dicomWriter';
import getFilteredCornerstoneToolState from '@ohif/extension-cornerstone-dicom-sr/src/utils/getFilteredCornerstoneToolState';
import { callCloud, getAccess } from './ris';
import { addViewportToReport } from './reportCapture';

const CHANNEL = 'pixos-visor-informe';
export const LESION_SEGMENTATION = 'Lesiones';

export type ReportValue = { name: string; value: number; unit: string };
export type ImageRef = { seriesInstanceUID?: string; sopInstanceUID?: string; sopClassUID?: string; frame?: number };
export type ReportItem = {
  kind: string;
  label: string;
  text: string;
  series?: string;
  values: ReportValue[] | Record<string, number | string>;
  tool?: string;
  method?: string;
  reference?: string;
  field?: string;
  lesionKey?: string;
  ref?: ImageRef | null;
};

let channel: BroadcastChannel | null = null;
const link = () => {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL);
  }
  return channel;
};
const post = (msg: Record<string, unknown>) => link()?.postMessage({ ...msg, from: 'visor' });

// ── where we are ────────────────────────────────────────────────────────────

function activeViewport(servicesManager) {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const id = viewportGridService.getActiveViewportId();
  return { id, viewport: cornerstoneViewportService.getCornerstoneViewport(id) };
}

/** Study of the active view. */
export function activeStudyUID(servicesManager): string {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const uids: string[] = viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId())?.displaySetInstanceUIDs || [];
  const ds: any = uids.map(u => displaySetService.getDisplaySetByUID(u)).find((d: any) => d?.StudyInstanceUID);
  return ds?.StudyInstanceUID || new URLSearchParams(window.location.search).get('StudyInstanceUIDs')?.split(',')[0] || '';
}

/** The image the active view shows (series, instance, frame), to come back to it from the report. */
export function activeRef(servicesManager): ImageRef | null {
  const { viewport } = activeViewport(servicesManager);
  const imageId: string | undefined = viewport?.getCurrentImageId?.();
  return imageId ? refOfImageId(imageId) : null;
}

export function refOfImageId(imageId: string): ImageRef | null {
  const inst: any = metaData.get('instance', imageId) || {};
  const frame = Number(/frames\/(\d+)/.exec(imageId)?.[1] || /[?&]frame=(\d+)/.exec(imageId)?.[1] || 0);
  const ref: ImageRef = {};
  if (inst.SeriesInstanceUID) ref.seriesInstanceUID = inst.SeriesInstanceUID;
  if (inst.SOPInstanceUID) ref.sopInstanceUID = inst.SOPInstanceUID;
  if (inst.SOPClassUID) ref.sopClassUID = inst.SOPClassUID;
  if (frame > 0) ref.frame = frame;
  return Object.keys(ref).length ? ref : null;
}

// ── to the report ───────────────────────────────────────────────────────────

/**
 * Sends items to the report («Medidas del visor» in the interpretation screen) and, with `keyImage`, the active view
 * as a report image. Resolves with a short message for the menu.
 */
export async function sendToReport(servicesManager, items: ReportItem[], opts: { keyImage?: string | null } = {}): Promise<string> {
  if (!getAccess().canSave) {
    throw new Error('Solo los médicos radiólogos de esta organización, con su sesión de pixOS, pueden mandar al informe.');
  }
  const StudyInstanceUID = activeStudyUID(servicesManager);
  const ref = activeRef(servicesManager);
  const res: any = await callCloud('saveViewerMeasurements', {
    StudyInstanceUID,
    items: items.map(it => ({ ...it, ref: it.ref === undefined ? ref : it.ref })),
  });
  let image = '';
  if (opts.keyImage != null) {
    try {
      await addViewportToReport(servicesManager, { label: opts.keyImage, quiet: true });
      image = ' con su imagen clave';
    } catch (e) {
      image = ` (sin imagen: ${(e as Error)?.message || e})`;
    }
  }
  post({ type: 'measurements', studyInstanceUID: StudyInstanceUID });
  return `${res?.count ?? items.length} al informe${image}. Aparece en «Medidas del visor».`;
}

/** Tells the report screen something arrived (it also gets the server's live signal). */
export const notifyReport = (studyInstanceUID: string) => post({ type: 'measurements', studyInstanceUID });

/** Lesion id from a measurement label: «L1», «L2 hígado» → L1, L2. */
export const lesionKeyOfLabel = (label: string) => /^\s*(L\d{1,2})\b/i.exec(label || '')?.[1]?.toUpperCase() || '';

// ── DICOM to the PACS ───────────────────────────────────────────────────────

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * The study's measurements as DICOM SR (TID 1500, Comprehensive 3D SR from @cornerstonejs/adapters, as OHIF stores
 * them), stored in the PACS through the RIS. Null when the study has no measurements.
 */
export async function saveMeasurementsSR(servicesManager, StudyInstanceUID: string, trigger: 'firma' | 'manual') {
  const { measurementService } = servicesManager.services;
  const measurementData = (measurementService.getMeasurements() || []).filter(
    (m: any) => !m.referenceStudyUID || m.referenceStudyUID === StudyInstanceUID
  );
  if (!measurementData.length) {
    return null;
  }
  const { date, time } = utils.getCurrentDicomDateTime();
  const state = getFilteredCornerstoneToolState(measurementData, []);
  const { dataset } = adaptersSR.Cornerstone3D.MeasurementReport.generateReport(state, metaData, {
    SeriesDescription: 'Medidas pixOS (TID 1500)',
    SeriesDate: date,
    SeriesTime: time,
  });
  if (dataset.SpecificCharacterSet === undefined) {
    dataset.SpecificCharacterSet = 'ISO_IR 192';
  }
  if (dataset.StudyInstanceUID !== StudyInstanceUID) {
    return null;
  }
  return callCloud('saveViewerDicom', { StudyInstanceUID, kind: 'SR', trigger, dicom: await blobToBase64(datasetToDicomBlob(dataset)) });
}

/** The «Lesiones» segmentation (lesion volume tool) as DICOM SEG in the PACS. Null if there is none. */
export async function saveLesionsSEG(servicesManager, commandsManager, StudyInstanceUID: string, trigger: 'firma' | 'manual') {
  const { segmentationService } = servicesManager.services;
  const seg = (segmentationService.getSegmentations?.() || []).find((s: any) => s.label === LESION_SEGMENTATION);
  if (!seg) {
    return null;
  }
  const generated = commandsManager.runCommand('generateSegmentation', { segmentationId: seg.segmentationId });
  if (!generated?.dataset) {
    return null;
  }
  return callCloud('saveViewerDicom', {
    StudyInstanceUID,
    kind: 'SEG',
    trigger,
    dicom: await blobToBase64(datasetToDicomBlob(generated.dataset)),
  });
}

// ── go to a measurement's image ─────────────────────────────────────────────

async function gotoImage(servicesManager, StudyInstanceUID: string, ref: ImageRef) {
  const { displaySetService, viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const sets: any[] = displaySetService.getActiveDisplaySets() || [];
  const ds =
    sets.find(d => d.StudyInstanceUID === StudyInstanceUID && ref.seriesInstanceUID && d.SeriesInstanceUID === ref.seriesInstanceUID) ||
    sets.find(d => (d.instances || []).some((i: any) => i.SOPInstanceUID === ref.sopInstanceUID));
  if (!ds) {
    return;
  }
  const viewportId = viewportGridService.getActiveViewportId();
  const shown: string[] = viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs || [];
  if (!shown.includes(ds.displaySetInstanceUID)) {
    viewportGridService.setDisplaySetsForViewports([{ viewportId, displaySetInstanceUIDs: [ds.displaySetInstanceUID] }]);
    await new Promise(r => setTimeout(r, 600));
  }
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  const ids: string[] = viewport?.getImageIds?.() || [];
  if (!ref.sopInstanceUID || !ids.length || typeof viewport.setImageIdIndex !== 'function') {
    return;
  }
  const index = ids.findIndex(id => {
    const r = refOfImageId(id);
    return r?.sopInstanceUID === ref.sopInstanceUID && (!ref.frame || !r.frame || r.frame === ref.frame);
  });
  if (index >= 0) {
    await viewport.setImageIdIndex(index);
  }
}

// ── hanging protocol of the procedure ───────────────────────────────────────

const LAYOUTS: Record<string, [number, number]> = { '1x1': [1, 1], '1x2': [1, 2], '2x1': [2, 1], '2x2': [2, 2] };

async function applyHanging(commandsManager, StudyInstanceUID: string) {
  try {
    const wf: any = await callCloud('getStudyWorkflow', { StudyInstanceUID });
    const layout = LAYOUTS[wf?.hanging?.layout];
    if (layout) {
      commandsManager.runCommand('setViewportGridLayout', { numRows: layout[0], numCols: layout[1] });
    }
  } catch {
    // no RIS session (shared link) or no procedure: the viewer's own layout
  }
}

// ── install ─────────────────────────────────────────────────────────────────

export function installReportLink(servicesManager, commandsManager): () => void {
  const { displaySetService, uiNotificationService } = servicesManager.services;
  const studies = () => (new URLSearchParams(window.location.search).get('StudyInstanceUIDs') || '').split(',').filter(Boolean);
  const c = link();

  const onMessage = async (e: MessageEvent) => {
    const m = e.data || {};
    if (m.from !== 'informe' || !studies().includes(m.studyInstanceUID)) {
      return;
    }
    if (m.type === 'goto' && m.ref) {
      void gotoImage(servicesManager, m.studyInstanceUID, m.ref);
    } else if (m.type === 'signed') {
      if (!getAccess().canSave) {
        return;
      }
      post({ type: 'ack', studyInstanceUID: m.studyInstanceUID });
      for (const [kind, save] of [
        ['SR', () => saveMeasurementsSR(servicesManager, m.studyInstanceUID, 'firma')],
        ['SEG', () => saveLesionsSEG(servicesManager, commandsManager, m.studyInstanceUID, 'firma')],
      ] as const) {
        try {
          const r = await save();
          if (r) {
            post({ type: 'dicom', studyInstanceUID: m.studyInstanceUID, kind, ok: true });
          }
        } catch (err) {
          const message = (err as Error)?.message || String(err);
          post({ type: 'dicom', studyInstanceUID: m.studyInstanceUID, kind, ok: false, message });
          uiNotificationService.show({ title: `No se guardó el DICOM ${kind} en el PACS`, message, type: 'warning' });
        }
      }
      post({ type: 'exported', studyInstanceUID: m.studyInstanceUID });
    }
  };
  c?.addEventListener('message', onMessage);

  // Layout of the procedure's hanging protocol, once, when the first study (alone) is loaded
  let hung = false;
  const sub = displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, () => {
    const list = studies();
    if (hung || list.length !== 1) {
      return;
    }
    hung = true;
    setTimeout(() => void applyHanging(commandsManager, list[0]), 800);
  });

  return () => {
    c?.removeEventListener('message', onMessage);
    sub?.unsubscribe?.();
  };
}

