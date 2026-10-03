/**
 * Cross-platform file delivery for downloads that need a network round trip
 * first (PDF reports, DICOM archives, external viewer links).
 *
 * Browsers only let a page open a tab while a user gesture is active, and that
 * activation is gone once the click handler awaits a fetch. iOS Safari is the
 * strictest: `window.open` after an `await` is blocked, and `<a download>` is
 * ignored for `data:` URLs. So:
 *
 * 1. call `prepareDownloadTarget()` synchronously inside the click handler; on
 *    iOS it opens the tab right away (still inside the gesture);
 * 2. fetch whatever is needed;
 * 3. hand the result to `deliverBlob` / `deliverUrl` / `openUrl`, which point
 *    that tab at it, or use an `<a download>` click everywhere else.
 */

export type DownloadTarget = Window | null;

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Must be called synchronously from the click handler, before any await.
 * `alwaysOpenTab` is for links that open a page rather than download a file:
 * every browser may block a late `window.open`, not only iOS Safari.
 */
export function prepareDownloadTarget(alwaysOpenTab = false): DownloadTarget {
  if (!alwaysOpenTab && !isIOS()) {
    return null;
  }
  const win = window.open('', '_blank');
  if (win) {
    win.document.title = 'Descargando…';
    win.document.body.style.cssText =
      'background:#03111c;color:#e6eef5;font:15px -apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0';
    win.document.body.textContent = 'Preparando archivo…';
  }
  return win;
}

/** Closes a prepared tab when there is nothing to show in it. */
export function cancelDownloadTarget(target: DownloadTarget): void {
  if (target && !target.closed) {
    target.close();
  }
}

function clickLink(href: string, filename?: string, newTab = false): void {
  const link = document.createElement('a');
  link.href = href;
  if (filename) {
    link.download = filename;
  }
  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Turns a base64 string, with or without a `data:` prefix, into a Blob. */
export function base64ToBlob(base64: string, mimeType = 'application/pdf'): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(base64);
  const type = match?.[1] || mimeType;
  const payload = match ? match[3] : base64;
  const binary = atob(payload.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

/** Saves a Blob under `filename`. */
export function deliverBlob(target: DownloadTarget, blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  if (target && !target.closed) {
    // iOS: show the file in the tab opened during the click; Safari's share
    // sheet there offers "Save to Files".
    target.location.href = url;
  } else {
    clickLink(url, filename);
  }
  // Leave time for the browser (or the iOS tab) to read the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Downloads a URL the server sends as an attachment (e.g. an Orthanc ZIP
 * archive). Navigating with a plain link keeps the page and never trips a
 * popup blocker.
 */
export function deliverUrl(target: DownloadTarget, url: string, filename?: string): void {
  if (target && !target.closed) {
    target.location.href = url;
  } else {
    clickLink(url, filename);
  }
}

/** Opens a page (not a download) in a new tab. */
export function openUrl(target: DownloadTarget, url: string): void {
  if (target && !target.closed) {
    target.location.href = url;
    return;
  }
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    // Blocked as a popup: fall back to a link, which browsers allow.
    clickLink(url, undefined, true);
  }
}
