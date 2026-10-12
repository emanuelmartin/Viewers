import React, { useEffect, useState } from 'react';

type Summary = { studyUID: string; results: Array<{ task: string; label: string; flags: number }>; pending: boolean };

/**
 * Top of the PixOS panel: «IA lista» with the results of this study (the AI section sits at the bottom of the panel,
 * where it went unseen), or «IA en proceso». «Ver resultados» scrolls to them. Fed by the AI section's own state.
 */
export default function AIReadyBadge() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    const onAI = (e: Event) => setSummary((e as CustomEvent<Summary>).detail);
    window.addEventListener('pixos:viewer-ai', onAI);
    return () => window.removeEventListener('pixos:viewer-ai', onAI);
  }, []);
  if (!summary || (!summary.results.length && !summary.pending)) return null;
  const flags = summary.results.reduce((n, r) => n + r.flags, 0);
  const go = () => document.getElementById('pixos-ai')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!summary.results.length) {
    return <div className="mb-3 rounded border border-white/15 bg-white/5 px-2 py-1.5 text-[12px] text-white/70">IA en proceso para este estudio…</div>;
  }
  return (
    <div className="mb-3 rounded border border-purple-400/40 bg-purple-900/30 px-2 py-1.5 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span>
          <b>IA lista</b> · {summary.results.map(r => r.label).join(' · ')}
          {flags > 0 && <span className="text-amber-300"> · {flags} hallazgo{flags > 1 ? 's' : ''} para revisar</span>}
        </span>
        <button className="shrink-0 rounded border border-white/20 px-2 py-0.5 text-[12px] hover:bg-white/10" onClick={go}>Ver resultados</button>
      </div>
    </div>
  );
}
