import { callCloud, getAccess, risSessionToken } from './ris';

/**
 * Usage of the AI in the viewer, sent in batches to aiUsage:track (pacs-cloud/aiUsage.js holds the event list and
 * stages). Only with a physician's RIS session (patients' shared links record nothing). Never throws.
 * trackAIOnce: a «shown» event once per page load for the same key.
 */
const SESSION = Math.random().toString(36).slice(2, 12);
let queue: Array<Record<string, unknown>> = [];
let timer: number | null = null;
const once = new Set<string>();

function flush(keepalive = false) {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length || !risSessionToken()) {
    queue = [];
    return;
  }
  const events = queue.splice(0, 50);
  const body = { app: 'viewer', sessionId: SESSION, events };
  if (keepalive) {
    // Page closing: a keepalive request survives the unload
    const cfg = (window as any).config?.interpretationsPanel ?? {};
    if (cfg.parseUrl && cfg.appId) {
      fetch(`${cfg.parseUrl.replace(/\/$/, '')}/functions/aiUsage:track`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': cfg.appId,
          ...(cfg.jsKey ? { 'X-Parse-Javascript-Key': cfg.jsKey } : {}),
          'X-Parse-Session-Token': risSessionToken() || '',
        },
        body: JSON.stringify(body),
      }).catch(() => undefined);
    }
  } else {
    callCloud('aiUsage:track', body).catch(() => undefined);
  }
  if (queue.length) {
    timer = window.setTimeout(() => flush(), 1000);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

export function trackAI(event: string, studyInstanceUID?: string | null, detail: Record<string, unknown> = {}) {
  try {
    if (!getAccess().physician) return;
    queue.push({ event, studyInstanceUID: studyInstanceUID || undefined, detail, at: new Date().toISOString() });
    if (queue.length >= 20) flush();
    else if (!timer) timer = window.setTimeout(() => flush(), 5000);
  } catch {
    /* never break the viewer */
  }
}

export function trackAIOnce(key: string, event: string, studyInstanceUID?: string | null, detail?: Record<string, unknown>) {
  if (once.has(key)) return;
  once.add(key);
  trackAI(event, studyInstanceUID, detail);
}
