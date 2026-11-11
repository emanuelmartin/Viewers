/**
 * Access to the images before the viewer starts.
 *
 * The /dicom-web gate accepts the HttpOnly viewer cookie only. The cookie
 * comes from the pixOS app (when it opens the viewer), from a shared link
 * (/resultado/:token/imagenes, which the server re-redeems when the viewer
 * URL carries ?liga=) or, here, from the pixOS session on this origin: when
 * there is no cookie but there is a session, the viewer asks for its own
 * (viewer:session + POST /viewer/session), so reloading, bookmarking or
 * pasting a viewer URL works without going back to the app.
 *
 * The outcome is kept so the "not available" page can say why, in Spanish,
 * and what to do (sign in, ask the clinic for the link, retry).
 */
import { callCloud, risSessionToken } from './ris';

export type AccessProblem =
  | 'sin-sesion' // no cookie, no session, no link
  | 'sesion-vencida' // a pixOS session exists but the server refused it
  | 'no-compartido' // the cookie does not cover this study (another link or organization)
  | 'bloqueado' // trial/billing lock
  | 'no-encontrado' // allowed, but the archive has no such study
  | 'servidor'; // network or archive down

let problem: AccessProblem | null = null;
let studies: string[] = [];
/** The viewer URL as opened: OHIF navigates to /notfoundstudy and drops it. */
let viewerUrl = '';

export const getAccessProblem = () => problem;
export const getRequestedStudies = () => studies;
export const getViewerUrl = () => viewerUrl || window.location.href;

const PROBE_TIMEOUT_MS = 8000;

function requestedStudies(): string[] {
  const q = new URLSearchParams(window.location.search);
  const raw = q.getAll('StudyInstanceUIDs').concat(q.getAll('studyInstanceUIDs'));
  return raw
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(v => /^[0-9.]{1,64}$/.test(v));
}

function qidoRoot(): string {
  const ds = (window as any).config?.dataSources?.[0]?.configuration;
  return String(ds?.qidoRoot || `${window.location.origin}/dicom-web`).replace(/\/$/, '');
}

async function probe(uid: string): Promise<number> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${qidoRoot()}/studies?StudyInstanceUID=${encodeURIComponent(uid)}&limit=1`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/dicom+json' },
      signal: ctrl.signal,
    });
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      return Array.isArray(rows) && rows.length ? 200 : 404;
    }
    return res.status;
  } catch {
    return 0;
  } finally {
    window.clearTimeout(timer);
  }
}

async function cookieFromSession(uids: string[]): Promise<boolean> {
  if (!risSessionToken()) {
    return false;
  }
  try {
    const org = window.localStorage.getItem('pixos.org') || undefined;
    const { code } = await callCloud<{ code: string }>('viewer:session', { studies: uids }, org ? { 'X-Pixos-Org': org } : {});
    if (!code) {
      return false;
    }
    const res = await fetch('/viewer/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const toProblem = (status: number, hadSession: boolean): AccessProblem | null => {
  if (status === 200) {
    return null;
  }
  if (status === 401) {
    return hadSession ? 'sesion-vencida' : 'sin-sesion';
  }
  if (status === 403) {
    return 'no-compartido';
  }
  if (status === 402) {
    return 'bloqueado';
  }
  if (status === 404) {
    return 'no-encontrado';
  }
  return 'servidor';
};

/** Runs once before the viewer routes mount (extension preRegistration). */
export async function ensureViewerAccess(): Promise<void> {
  studies = requestedStudies();
  problem = null;
  if (studies.length) {
    viewerUrl = window.location.href;
  }
  if (!studies.length) {
    return;
  }
  let status = await probe(studies[0]);
  const hadSession = !!risSessionToken();
  if ((status === 401 || status === 403) && hadSession && (await cookieFromSession(studies))) {
    status = await probe(studies[0]);
  }
  problem = toProblem(status, hadSession);
}

/** Retry from the "not available" page: check again and reopen the same URL. */
export async function retryAccess(): Promise<boolean> {
  if (!studies.length) {
    return false;
  }
  const hadSession = !!risSessionToken();
  let status = await probe(studies[0]);
  if ((status === 401 || status === 403) && hadSession && (await cookieFromSession(studies))) {
    status = await probe(studies[0]);
  }
  problem = toProblem(status, hadSession);
  return problem === null;
}
