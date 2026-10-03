import {
  DownloadTarget,
  cancelDownloadTarget,
  deliverUrl,
  openUrl,
} from '../utils/fileDownload';

/**
 * Network helpers for the HSRL header buttons (view study / download ZIP).
 * They live outside the components because the React Compiler cannot lower
 * try/catch/finally inside a component.
 */

export function getStudyInstanceUIDsFromUrl(): string[] {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('StudyInstanceUIDs') || '';
  return raw
    .split(',')
    .map((u: string) => u.trim())
    .filter(Boolean);
}

function getParseHeaders(cfg): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Parse-Application-Id': cfg.appId,
    'Content-Type': 'application/json',
  };
  if (cfg.jsKey) {
    headers['X-Parse-Javascript-Key'] = cfg.jsKey;
  }
  if (cfg.sessionToken) {
    headers['X-Parse-Session-Token'] = cfg.sessionToken;
  }
  return headers;
}

async function fetchParseStudies(cfg, uids: string[], limit: number): Promise<any[]> {
  const studiesClass = cfg.studiesClass ?? 'Studies';
  const uidField = cfg.studiesUidField ?? 'instanceUUID';
  const where = encodeURIComponent(JSON.stringify({ [uidField]: { $in: uids } }));
  const res = await fetch(`${cfg.parseUrl}/classes/${studiesClass}?where=${where}&limit=${limit}`, {
    headers: getParseHeaders(cfg),
  });
  if (!res.ok) {
    console.warn('[HSRL header] Parse fetch failed:', res.status);
    return [];
  }
  const data = await res.json();
  return data.results ?? [];
}

/** Opens the study in the external study viewer (`studyViewerBaseUrl`). */
export async function openStudyInViewer(cfg, target: DownloadTarget): Promise<void> {
  try {
    const uids = getStudyInstanceUIDsFromUrl();
    if (!uids.length || !cfg.parseUrl || !cfg.appId) {
      cancelDownloadTarget(target);
      return;
    }
    const studies = await fetchParseStudies(cfg, uids, 1);
    // instanceUUID (the DICOM StudyInstanceUID) builds the viewer URL
    const instanceUid = studies[0]?.[cfg.studiesUidField ?? 'instanceUUID'];
    if (instanceUid) {
      openUrl(target, `${cfg.studyViewerBaseUrl}/study/${instanceUid}`);
    } else {
      cancelDownloadTarget(target);
    }
  } catch (err) {
    console.warn('[HeaderViewStudyButton]', err);
    cancelDownloadTarget(target);
  }
}

async function findOrthancUuids(cfg, uids: string[]): Promise<string[]> {
  if (cfg.orthancDirectQuery) {
    // Query Orthanc's REST API directly via /tools/find
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.orthancUsername && cfg.orthancPassword) {
      headers['Authorization'] = 'Basic ' + btoa(`${cfg.orthancUsername}:${cfg.orthancPassword}`);
    }
    const uuids: string[] = [];
    for (const uid of uids) {
      const res = await fetch(`${cfg.orthancBaseUrl}/tools/find`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ Level: 'Study', Query: { StudyInstanceUID: uid } }),
      });
      if (!res.ok) {
        console.warn('[HeaderDownloadButton] Orthanc find failed:', res.status);
        continue;
      }
      uuids.push(...(await res.json()));
    }
    return uuids;
  }

  // Look the Orthanc UUID up in Parse Server
  if (!cfg.parseUrl || !cfg.appId) {
    return [];
  }
  const uuidField = cfg.orthancUuidField ?? 'orthancUUID';
  const studies = await fetchParseStudies(cfg, uids, 20);
  return [...new Set(studies.map((s: any) => s[uuidField]).filter(Boolean))] as string[];
}

/** Opens the Orthanc ZIP archive of every study in the URL. */
export async function downloadStudyArchives(cfg, target: DownloadTarget): Promise<void> {
  try {
    const uids = getStudyInstanceUIDsFromUrl();
    if (!uids.length) {
      cancelDownloadTarget(target);
      return;
    }
    const uuids = await findOrthancUuids(cfg, uids);
    if (!uuids.length) {
      cancelDownloadTarget(target);
      return;
    }
    // Orthanc sends the archive as an attachment, so a plain link downloads it
    // without leaving the page or tripping a popup blocker. Several studies are
    // spaced out so browsers do not drop the later ones.
    uuids.forEach((uuid, index) => {
      const url = `${cfg.orthancBaseUrl}/studies/${uuid}/archive`;
      setTimeout(() => deliverUrl(index === 0 ? target : null, url, `${uuid}.zip`), index * 800);
    });
  } catch (err) {
    console.warn('[HeaderDownloadButton]', err);
    cancelDownloadTarget(target);
  }
}
