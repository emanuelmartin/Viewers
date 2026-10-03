import React, { useState } from 'react';
import { openStudyInViewer } from './headerStudyActions';

const HeaderViewStudyButton: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const cfg = (window as any).config?.interpretationsPanel ?? {};
  if (!cfg.studyViewerBaseUrl) {
    return null;
  }

  const handleViewStudy = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    openStudyInViewer(cfg).finally(() => setBusy(false));
  };

  return (
    <button
      title="Ver estudio en Orthanc"
      onClick={handleViewStudy}
      disabled={busy}
      className="text-primary hover:bg-primary-dark flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle
          cx="12"
          cy="12"
          r="3"
        />
      </svg>
      <span className="hidden sm:inline">Ver</span>
    </button>
  );
};

export default HeaderViewStudyButton;
