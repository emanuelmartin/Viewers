/**
 * Interactive 3D views of AI segmentations as series of the study.
 *
 * The AI service exports the surfaces of each segmentation as binary glTF (stored with the result; `aiSeg.meshUrl`).
 * For every result that has one, the study gets a display set «IA · 3D interactivo · …» handled by this extension's
 * 3D viewport: it appears in the series list (drag it to any viewport of the grid) and «Abrir 3D en el visor» puts it
 * next to the images. These display sets exist only in the browser; nothing is written to the PACS.
 */
import { id } from './id';
import { callCloud, getAccess, subscribeAccess } from './ris';

export const AI3D_SOP_CLASS_HANDLER = `${id}.sopClassHandlerModule.ai3d`;
export const AI3D_VIEWPORT = `${id}.viewportModule.ai3d`;

export type AISeg = {
  title: string;
  segments?: number;
  seriesInstanceUID?: string;
  meshUrl?: string;
  stats?: Array<{ label: string; volume_ml: number; mean: number; unit: string; extent_mm?: number[] }>;
  focusLps?: number[];
  focusLabel?: string;
};

const THUMBNAIL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#000"/>' +
    '<g fill="none" stroke="#5acce6" stroke-width="4" stroke-linejoin="round"><path d="M64 18 104 40v46L64 108 24 86V40z"/>' +
    '<path d="M24 40l40 22 40-22M64 62v46"/></g><text x="64" y="124" fill="#fff" font-family="sans-serif" font-size="16" ' +
    'text-anchor="middle">3D IA</text></svg>'
)}`;

const uidFor = (seg: AISeg) => `pixos-ai3d-${seg.seriesInstanceUID || seg.meshUrl}`;

/** Adds (once) a 3D display set for each AI result of the study that has surfaces. Returns their UIDs. */
export function addAI3DDisplaySets(servicesManager, studyUID: string, quant: Array<{ aiSeg?: AISeg; label?: string; task?: string }>): string[] {
  const { displaySetService } = servicesManager.services;
  const uids: string[] = [];
  const added: any[] = [];
  (quant || []).forEach(q => {
    const seg = q.aiSeg;
    if (!seg?.meshUrl) {
      return;
    }
    const uid = uidFor(seg);
    uids.push(uid);
    const existing = displaySetService.getDisplaySetByUID(uid);
    if (existing) {
      // A repeated analysis replaces the surfaces
      Object.assign(existing, { meshUrl: seg.meshUrl, aiSeg: seg });
      return;
    }
    added.push({
      displaySetInstanceUID: uid,
      SOPClassHandlerId: AI3D_SOP_CLASS_HANDLER,
      StudyInstanceUID: studyUID,
      // Not the SEG's UID: lookups by series UID must keep finding the SEG itself
      SeriesInstanceUID: `${seg.seriesInstanceUID || uid}.3d`,
      SeriesDescription: `IA · 3D interactivo · ${seg.title}`,
      SeriesNumber: 9900 + added.length,
      Modality: '3D',
      Manufacturer: 'PixOS IA',
      label: seg.title,
      meshUrl: seg.meshUrl,
      aiSeg: seg,
      task: q.task,
      instances: [],
      numImageFrames: 0,
      isReconstructable: false,
      isDerivedDisplaySet: false,
      getThumbnailSrc: () => Promise.resolve(THUMBNAIL),
    });
  });
  if (added.length) {
    displaySetService.addDisplaySets(...added);
  }
  return uids;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Puts a 3D display set in the grid: where it already is, else in another viewport than the active one, else the
 * single viewport becomes two (images on the left, 3D on the right).
 */
export async function openAI3D(servicesManager, commandsManager, uid: string): Promise<string | null> {
  const { viewportGridService } = servicesManager.services;
  let state = viewportGridService.getState();
  let viewports: any[] = [...state.viewports.values()];
  const shown = viewports.find(v => v.displaySetInstanceUIDs?.includes(uid));
  if (shown) {
    viewportGridService.setActiveViewportId(shown.viewportId);
    return null;
  }
  if (viewports.length === 1) {
    const keep = viewports[0].viewportId;
    commandsManager.runCommand('setViewportGridLayout', { numRows: 1, numCols: 2 });
    for (let i = 0; i < 30 && viewportGridService.getState().viewports.size < 2; i++) {
      await wait(100);
    }
    state = viewportGridService.getState();
    viewports = [...state.viewports.values()];
    if (viewports.length < 2) {
      return 'No se pudo dividir la vista';
    }
    const target = viewports.find(v => v.viewportId !== keep) || viewports[viewports.length - 1];
    viewportGridService.setDisplaySetsForViewport({ viewportId: target.viewportId, displaySetInstanceUIDs: [uid] });
    return null;
  }
  const others = viewports.filter(v => v.viewportId !== state.activeViewportId);
  const target = others[others.length - 1];
  viewportGridService.setDisplaySetsForViewport({ viewportId: target.viewportId, displaySetInstanceUIDs: [uid] });
  return null;
}

/**
 * When the user may see AI results, the 3D series of the studies in the viewer are added without opening the PixOS
 * panel. Results still in validation come only to the validation roles (the cloud strips them for the rest).
 */
export function installAI3D(servicesManager): () => void {
  const { displaySetService } = servicesManager.services;
  const done = new Set<string>();
  let alive = true;

  const scan = () => {
    if (!getAccess().ai) {
      return;
    }
    const studies = new Set<string>(displaySetService.getActiveDisplaySets().map((ds: any) => ds.StudyInstanceUID).filter(Boolean));
    studies.forEach(uid => {
      if (done.has(uid)) {
        return;
      }
      done.add(uid);
      callCloud<{ quant?: any[] }>('viewerAIFindings', { StudyInstanceUID: uid })
        .then(r => alive && addAI3DDisplaySets(servicesManager, uid, r?.quant || []))
        .catch(() => done.delete(uid));
    });
  };

  const added = displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, () => scan());
  const unsubscribeAccess = subscribeAccess(() => scan());
  scan();
  return () => {
    alive = false;
    added.unsubscribe();
    unsubscribeAccess();
  };
}
