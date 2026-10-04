/**
 * The RIS session on this origin and what it allows in the viewer.
 *
 * The RIS (same origin, Parse JS SDK) keeps the logged-in user in
 * localStorage under Parse/<appId>/currentUser. Its session token is sent to
 * the cloud function getViewerAccess, which validates it and answers with the
 * user's permissions; the browser's copy alone is never trusted. Until the
 * answer arrives (and for anyone without a session: patients opening a shared
 * link) the viewer stays in its restricted mode.
 */

export type ViewerAccess = {
  status: 'pending' | 'ready';
  physician: boolean;
  canSave: boolean;
  ai: boolean;
  user?: { objectId: string; fullName?: string | null };
};

type RisConfig = { parseUrl?: string; appId?: string; jsKey?: string };

const RESTRICTED: ViewerAccess = { status: 'pending', physician: false, canSave: false, ai: false };
let access: ViewerAccess = RESTRICTED;
const listeners = new Set<(a: ViewerAccess) => void>();
let inFlight: Promise<ViewerAccess> | null = null;

const config = (): RisConfig => (window as any).config?.interpretationsPanel ?? {};

export function risSessionToken(): string | undefined {
  const { appId } = config();
  if (!appId) {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(`Parse/${appId}/currentUser`);
    return raw ? JSON.parse(raw)?.sessionToken || undefined : undefined;
  } catch {
    return undefined;
  }
}

/** Calls a Parse cloud function as the RIS user; throws with the server's message. */
export async function callCloud<T = any>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const { parseUrl, appId, jsKey } = config();
  if (!parseUrl || !appId) {
    throw new Error('El visor no tiene configurado el servidor del RIS');
  }
  const headers: Record<string, string> = { 'X-Parse-Application-Id': appId, 'Content-Type': 'application/json' };
  if (jsKey) {
    headers['X-Parse-Javascript-Key'] = jsKey;
  }
  const token = risSessionToken();
  if (token) {
    headers['X-Parse-Session-Token'] = token;
  }
  const res = await fetch(`${parseUrl.replace(/\/$/, '')}/functions/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error || `Error ${res.status}`);
  }
  return json.result as T;
}

export const getAccess = (): ViewerAccess => access;

export function subscribeAccess(fn: (a: ViewerAccess) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function publish(next: ViewerAccess) {
  access = next;
  listeners.forEach(fn => fn(access));
}

export function loadAccess(): Promise<ViewerAccess> {
  if (inFlight) {
    return inFlight;
  }
  if (!risSessionToken()) {
    publish({ ...RESTRICTED, status: 'ready' });
    return Promise.resolve(access);
  }
  inFlight = callCloud<Omit<ViewerAccess, 'status'>>('getViewerAccess')
    .then(r => {
      publish({
        status: 'ready',
        physician: !!r?.physician,
        canSave: !!r?.canSave,
        ai: !!r?.ai,
        user: r?.user,
      });
      return access;
    })
    .catch(() => {
      // Expired or invalid session: restricted, like an anonymous link
      publish({ ...RESTRICTED, status: 'ready' });
      return access;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Logging in or out of the RIS in another tab changes what this viewer allows. */
export function watchRisSession(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.endsWith('/currentUser')) {
      loadAccess();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
