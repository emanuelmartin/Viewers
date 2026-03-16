import React, { useState } from 'react';
import { Icons } from '@ohif/ui-next';

/**
 * Persistent download button rendered in the viewer header (always visible).
 * Reads config from window.config.interpretationsPanel.
 * Hidden when orthancBaseUrl is not configured.
 */
const HeaderDownloadButton: React.FC = () => {
  const [busy, setBusy] = useState(false);

  const cfg = (window as any).config?.interpretationsPanel ?? {};

  if (!cfg.orthancBaseUrl) {
    return null;
  }

  const handleDownload = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('StudyInstanceUIDs') || '';
      const uids = raw
        .split(',')
        .map((u: string) => u.trim())
        .filter(Boolean);

      if (!uids.length || !cfg.parseUrl || !cfg.appId) {
        return;
      }

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

      const studiesClass = cfg.studiesClass ?? 'Studies';
      const uidField = cfg.studiesUidField ?? 'instanceUUID';
      const uuidField = cfg.orthancUuidField ?? 'orthancUUID';

      const where = encodeURIComponent(JSON.stringify({ [uidField]: { $in: uids } }));
      const res = await fetch(
        `${cfg.parseUrl}/classes/${studiesClass}?where=${where}&limit=20`,
        { headers }
      );
      if (!res.ok) {
        console.warn('[HeaderDownloadButton] fetch failed:', res.status);
        return;
      }
      const data = await res.json();
      const studies: any[] = data.results ?? [];

      const uuids = [
        ...new Set(studies.map((s: any) => s[uuidField]).filter(Boolean)),
      ] as string[];

      uuids.forEach(uuid => {
        window.open(`${cfg.orthancBaseUrl}/studies/${uuid}/archive`);
      });
    } catch (err) {
      console.warn('[HeaderDownloadButton]', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      title="Descargar imagenes DICOM (ZIP)"
      onClick={handleDownload}
      disabled={busy}
      className="text-primary hover:bg-primary-dark flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
    >
      <Icons.Download className="h-4 w-4" />
      <span className="hidden sm:inline">Descargar</span>
    </button>
  );
};

export default HeaderDownloadButton;
