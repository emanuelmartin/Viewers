import React, { useState, useEffect, useCallback } from 'react';

const ORTHANC_PUBLIC = 'https://imagen.hospitalrealsanlucas.com.mx/pacs-web';
const PARSE_APP_ID = '2aa9a978-cae0-4a8d-96f6-036ab4aa13c7';
const PARSE_SERVER = 'https://imagen.hospitalrealsanlucas.com.mx/server';

const WL_PRESETS = [
  { label: 'Pulmon', w: 1500, l: -600 },
  { label: 'Hueso', w: 2500, l: 480 },
  { label: 'Tejido', w: 400, l: 40 },
  { label: 'Cerebro', w: 80, l: 40 },
  { label: 'Higado', w: 150, l: 90 },
  { label: 'Default', w: 0, l: 0 },
];

const TOOL_GROUPS = [
  {
    label: 'Procesamiento',
    tools: [
      { key: 'mpr', label: 'MPR 3 Planos', desc: 'Axial + Coronal + Sagital' },
      { key: 'mip', label: 'MIP + Mediciones', desc: 'MIP, volumen, estadisticas' },
      { key: 'window_optimize', label: 'W/L Optimizado', desc: 'Window/Level por AI' },
      { key: 'measurements', label: 'Mediciones', desc: 'Volumen + intensidad' },
    ],
  },
  {
    label: 'Segmentacion',
    tools: [
      { key: 'totalsegmentator', label: 'TotalSegmentator', desc: '104 estructuras (CT)' },
      { key: 'organ_liver', label: 'Segmentar Higado', desc: 'MONAI liver' },
      { key: 'organ_lung', label: 'Segmentar Pulmon', desc: 'MONAI lung' },
      { key: 'synthseg', label: 'SynthSeg MR', desc: '30 estructuras cerebrales' },
    ],
  },
  {
    label: 'Analisis IA',
    tools: [
      { key: 'analyze', label: 'Analizar Estudio', desc: 'Vision AI (MedGemma)' },
      { key: 'keyImages', label: 'Key Images', desc: 'Seleccion automatica' },
      { key: 'classify_xray', label: 'Clasificar RX Torax', desc: '18 patologias' },
      { key: 'cobb_angle', label: 'Cobb Angle', desc: 'Medicion escoliosis' },
      { key: 'pipeline', label: 'Pipeline Completo', desc: 'Fase A + B' },
    ],
  },
  {
    label: 'Clinico',
    tools: [
      { key: 'classify', label: 'Clasificar Anatomia', desc: 'Region anatomica' },
      { key: 'critical', label: 'Hallazgos Criticos', desc: 'Deteccion urgencias' },
      { key: 'secondOpinion', label: '2da Opinion', desc: 'IA independiente' },
      { key: 'radiomics', label: 'Radiomics', desc: 'Features cuantitativos' },
      { key: 'model_status', label: 'Status GPU', desc: 'Monitoreo modelos' },
    ],
  },
];

function getStudyUID(servicesManager) {
  try {
    const dss = servicesManager?.services?.displaySetService;
    if (!dss) return null;
    const sets = dss.getActiveDisplaySets?.() || [];
    return sets[0]?.StudyInstanceUID || sets[0]?.Study?.StudyInstanceUID || null;
  } catch { return null; }
}

async function getParse() {
  const m = await import('parse');
  const P = m.default || m;
  if (!P.applicationId || P.applicationId === 'Parse') {
    P.initialize(PARSE_APP_ID);
    P.serverURL = PARSE_SERVER;
  }
  return P;
}

async function callAi(tool, studyUID, options) {
  const P = await getParse();
  return await P.Cloud.run('aiOhifTools', { tool, studyUID, options: options || {} });
}

export default function AIToolsPanel({ servicesManager }) {
  const [studyUID, setStudyUID] = useState(null);
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState([]);
  const [aiSeries, setAiSeries] = useState([]);
  const [error, setError] = useState(null);
  const [expandedSeries, setExpandedSeries] = useState(null);
  const [wlState, setWlState] = useState({});
  const [saving, setSaving] = useState({});

  const fetchAISeries = useCallback(async () => {
    if (!studyUID) return;
    try {
      const r = await callAi('getAISeries', studyUID);
      if (r?.aiSeries) setAiSeries(r.aiSeries);
    } catch {}
  }, [studyUID]);

  useEffect(() => {
    const uid = getStudyUID(servicesManager);
    setStudyUID(uid);
    if (uid) fetchAISeries();
  }, [servicesManager, fetchAISeries]);

  useEffect(() => {
    if (!running || !studyUID) return;
    const i = setInterval(fetchAISeries, 8000);
    return () => clearInterval(i);
  }, [running, studyUID, fetchAISeries]);

  const run = async (tool) => {
    setRunning(tool.key);
    setError(null);
    try {
      const r = await callAi(tool.key, studyUID, null);
      if (r?.status === 'error') throw new Error(r.error);
      setResults(prev => [{ key: tool.key, label: tool.label, ok: true, data: r, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 20)]);
      setTimeout(fetchAISeries, 3000);
    } catch (e) {
      setError(e.message);
      setResults(prev => [{ key: tool.key, label: tool.label, ok: false, err: e.message, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 20)]);
    }
    setRunning(null);
  };

  const handleSave = async (seriesId) => {
    setSaving(prev => ({ ...prev, [seriesId]: true }));
    try {
      await callAi('saveSeries', studyUID, { seriesId });
      setAiSeries(prev => prev.map(s => s.seriesId === seriesId ? { ...s, saved: true } : s));
      setTimeout(fetchAISeries, 2000);
    } catch (e) { setError(e.message); }
    setSaving(prev => ({ ...prev, [seriesId]: false }));
  };

  const handleDiscard = async (seriesId) => {
    try {
      await callAi('discardSeries', studyUID, { seriesId });
      setAiSeries(prev => prev.filter(s => s.seriesId !== seriesId));
    } catch (e) { setError(e.message); }
  };

  const applyWL = (seriesId, preset) => {
    setWlState(prev => ({ ...prev, [seriesId]: preset.w ? preset : null }));
  };

  const wlFilter = (seriesId, url) => {
    const wl = wlState[seriesId];
    if (!wl || !wl.w) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}window=${wl.w}&level=${wl.l}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0f14] text-[13px] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1d2225]">
        <div>
          <span className="text-sm font-medium text-[#e0e0e0]">AI Tools</span>
          <span className="ml-2 text-[10px] text-[#0d7b9e]">{aiSeries.length > 0 ? `${aiSeries.length} series` : ''}</span>
        </div>
        <button onClick={fetchAISeries} className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-[#1d2225]">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 7a6 6 0 016-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>

      {!studyUID && <div className="px-3 py-8 text-center text-xs text-gray-500">Esperando estudio...</div>}
      {error && (
        <div className="mx-2 mt-2 rounded border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* AI Series with interactive preview */}
      {aiSeries.length > 0 && (
        <div className="border-b border-[#1d2225]">
          <div className="px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase">Resultados AI</div>
          <div className="space-y-2 px-2 pb-3">
            {aiSeries.map((s, i) => {
              const isExpanded = expandedSeries === s.seriesId;
              const previewUrl = wlFilter(s.seriesId, s.previewUrl || s.preview_url);
              return (
                <div key={s.seriesId || i} className={`rounded border overflow-hidden transition-all ${s.saved ? 'border-green-800 bg-green-900/10' : 'border-[#2d3436] bg-[#0d1117]'}`}>
                  {/* Preview Image */}
                  {previewUrl && (
                    <div className="relative cursor-pointer" onClick={() => setExpandedSeries(isExpanded ? null : s.seriesId)}>
                      <img src={previewUrl} className="w-full h-32 object-cover bg-black" alt="" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="text-[11px] font-medium text-white truncate">{s.description || s.label || 'AI Series'}</div>
                        <div className="text-[9px] text-gray-400">{s.tool} &middot; {s.instances || s.instanceCount || '?'} img{s.modality ? ` &middot; ${s.modality}` : ''}</div>
                      </div>
                      <button className="absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-black/70">
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>
                  )}

                  {/* Expanded controls */}
                  {isExpanded && (
                    <div className="p-2 space-y-2">
                      {/* W/L Presets */}
                      <div className="flex flex-wrap gap-1">
                        {WL_PRESETS.map(p => (
                          <button key={p.label}
                            onClick={() => applyWL(s.seriesId, p)}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                              wlState[s.seriesId]?.label === p.label
                                ? 'bg-[#0d7b9e]/30 border-[#0d7b9e] text-[#0d7b9e]'
                                : 'border-[#2d3436] text-gray-400 hover:border-gray-500 hover:text-gray-300'
                            }`}>
                            {p.label}{p.w ? ` (W:${p.w} L:${p.l})` : ''}
                          </button>
                        ))}
                      </div>

                      {/* Actions */}
                      {!s.saved ? (
                        <div className="flex gap-2">
                          <button onClick={() => handleSave(s.seriesId)}
                            disabled={saving[s.seriesId]}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded bg-green-900/30 border border-green-700 py-1.5 text-[11px] text-green-400 hover:bg-green-900/50 disabled:opacity-50 transition-colors">
                            {saving[s.seriesId] ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="1.5"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.5"/></svg>
                            )}
                            Guardar en PACS
                          </button>
                          <button onClick={() => handleDiscard(s.seriesId)}
                            className="flex items-center justify-center gap-1 rounded bg-red-900/20 border border-red-800 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-900/40 transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 rounded bg-green-900/10 py-1.5 text-[11px] text-green-400">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Guardado en el estudio
                        </div>
                      )}

                      {/* Stats if available */}
                      {s.stats && (
                        <div className="rounded bg-[#0a0f14] p-2 text-[10px] text-gray-500">
                          {Object.entries(s.stats).slice(0, 5).map(([k, v]) => (
                            <div key={k} className="flex justify-between"><span>{k}</span><span className="text-gray-400">{typeof v === 'number' ? v.toFixed(1) : String(v)}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsed state: compact action bar */}
                  {!isExpanded && !s.saved && previewUrl && (
                    <div className="flex border-t border-[#2d3436]">
                      <button onClick={() => handleSave(s.seriesId)}
                        disabled={saving[s.seriesId]}
                        className="flex-1 py-1.5 text-[10px] text-green-400 hover:bg-green-900/20 transition-colors disabled:opacity-50">
                        {saving[s.seriesId] ? '...' : 'Guardar'}
                      </button>
                      <div className="w-px bg-[#2d3436]" />
                      <button onClick={() => handleDiscard(s.seriesId)}
                        className="flex-1 py-1.5 text-[10px] text-red-400 hover:bg-red-900/20 transition-colors">
                        Descartar
                      </button>
                      <div className="w-px bg-[#2d3436]" />
                      <button onClick={() => setExpandedSeries(s.seriesId)}
                        className="flex-1 py-1.5 text-[10px] text-gray-400 hover:bg-[#1d2225] transition-colors">
                        Ajustes
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tool buttons */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {TOOL_GROUPS.map(group => (
          <div key={group.label}>
            <div className="mb-1 text-[10px] font-medium text-gray-500 uppercase px-1">{group.label}</div>
            <div className="space-y-0.5">
              {group.tools.map(t => (
                <button key={t.key} onClick={() => run(t)} disabled={!!running}
                  title={t.desc}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-[12px] text-left transition-colors ${
                    running === t.key
                      ? 'bg-[#0d7b9e]/20 border border-[#0d7b9e]/40 text-[#0d7b9e]'
                      : 'hover:bg-[#1d2225] text-gray-300 border border-transparent'
                  } disabled:opacity-50`}>
                  {running === t.key ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0d7b9e] border-t-transparent flex-shrink-0" />
                  ) : (
                    <span className="flex-shrink-0 w-5 text-center text-[14px]">{t.icon || '▶'}</span>
                  )}
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Result log */}
      {results.length > 0 && (
        <div className="border-t border-[#1d2225] max-h-32 overflow-y-auto">
          <div className="px-3 py-1 text-[9px] text-gray-500 flex justify-between">
            <span>Historial ({results.length})</span>
            <button onClick={() => setResults([])} className="hover:text-gray-300">Limpiar</button>
          </div>
          {results.slice(0, 10).map((r, i) => (
            <div key={i} className={`px-3 py-1 text-[10px] flex justify-between ${r.ok ? 'text-gray-400' : 'text-red-400'}`}>
              <span>{r.ok ? '✓' : '✗'} {r.label}</span>
              <span className="text-[9px] text-gray-600">{r.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
