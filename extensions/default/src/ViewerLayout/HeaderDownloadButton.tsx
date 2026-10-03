import React, { useState } from 'react';
import { Icons } from '@ohif/ui-next';
import { downloadStudyArchives } from './headerStudyActions';

const HeaderDownloadButton: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const cfg = (window as any).config?.interpretationsPanel ?? {};
  if (!cfg.orthancBaseUrl) {
    return null;
  }

  const handleDownload = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    downloadStudyArchives(cfg).finally(() => setBusy(false));
  };

  return (
    <button
      title="Descargar imágenes DICOM (ZIP)"
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
