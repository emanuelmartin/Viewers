import React, { useEffect, useState } from 'react';
import { utilities as csUtils } from '@cornerstonejs/core';
import { callCloud } from './ris';
import Viewer3D from './Viewer3D';

const title = 'mb-2 text-[13px] font-semibold text-white';
const btn = 'rounded border border-white/20 px-2 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40';
const primaryBtn = 'rounded bg-primary px-2 py-1 text-[12px] text-white hover:opacity-90 disabled:opacity-40';
const muted = 'text-[12px] text-white/60';

const STATUS: Record<string, string> = {
  queued: 'en cola', running: 'procesando', done: 'listo', failed: 'falló', skipped: 'no aplica',
};

const AORTA_LABELS: Record<string, string> = {
  ascendente: 'Ascendente', cayado: 'Cayado', descendente: 'Descendente torácica',
  abdominal_suprarrenal: 'Abdominal suprarrenal', infrarrenal: 'Infrarrenal',
};

/** Loads the AI SEG series (stored by the AI queue in the PACS) over the image in the active viewport. */
function showAISeg(servicesManager, commandsManager, seg: any): Promise<string | null> {
  const { displaySetService, viewportGridService } = servicesManager.services;
  const ds = displaySetService.getActiveDisplaySets().find((d: any) => d.SeriesInstanceUID === seg.seriesInstanceUID);
  if (!ds) {
    return Promise.resolve('La serie de IA aún no está en el visor: recargue el estudio.');
  }
  const { userAuthenticationService } = servicesManager.services;
  // Load (download and register the segmentation) before hydrating: hydration only adds the representation
  return Promise.resolve(typeof ds.load === 'function' ? ds.load({ headers: userAuthenticationService.getAuthorizationHeader() }) : null)
    .then(() => commandsManager.runCommand('hydrateSecondaryDisplaySet', { displaySet: ds, viewportId: viewportGridService.getActiveViewportId() }))
    // The source series opens on its first image: go to the largest segment once the labelmap is in place
    .then(() => new Promise<string | null>(resolve => setTimeout(() => {
      resolve(seg.focusLps ? showPoint(servicesManager, toWorld(seg.focusLps), seg.focusLabel || '') : null);
    }, 1500)));
}

/** Switches to MPR + 3D and loads the AI SEG into the 3D viewport, where it renders as surfaces. */
function showAISeg3D(servicesManager, commandsManager, seg: any): Promise<string | null> {
  const { displaySetService, viewportGridService, userAuthenticationService } = servicesManager.services;
  const ds = displaySetService.getActiveDisplaySets().find((d: any) => d.SeriesInstanceUID === seg.seriesInstanceUID);
  if (!ds) {
    return Promise.resolve('La serie de IA aún no está en el visor: recargue el estudio.');
  }
  commandsManager.runCommand('setHangingProtocol', { protocolId: 'mprAnd3DVolumeViewport' });
  return Promise.resolve(typeof ds.load === 'function' ? ds.load({ headers: userAuthenticationService.getAuthorizationHeader() }) : null)
    .then(() => new Promise<string | null>(resolve => setTimeout(() => {
      const viewports = [...(viewportGridService.getState().viewports?.values?.() || [])];
      const v3d = viewports.find((v: any) => v.viewportOptions?.viewportType === 'volume3d');
      if (!v3d) {
        resolve('No se encontró la vista 3D en este diseño.');
        return;
      }
      Promise.resolve(commandsManager.runCommand('hydrateSecondaryDisplaySet', { displaySet: ds, viewportId: v3d.viewportId }))
        .then(() => resolve(null), e => resolve(`No se pudo cargar en 3D: ${e?.message || e}`));
    }, 4000)));
}

/** Shows the isometric 3D views (secondary capture series) in the active viewport. */
function showAIRenders(servicesManager, seg: any): string | null {
  const { displaySetService, viewportGridService } = servicesManager.services;
  const ds = displaySetService.getActiveDisplaySets().find((d: any) => d.SeriesInstanceUID === seg.renderSeriesInstanceUID);
  if (!ds) {
    return 'Las vistas 3D aún no están en el visor: recargue el estudio.';
  }
  viewportGridService.setDisplaySetsForViewport({ viewportId: viewportGridService.getActiveViewportId(), displaySetInstanceUIDs: [ds.displaySetInstanceUID] });
  return null;
}

type PlanItem = { type: string; task?: string; label: string; eta: string; note: string; job: null | { status: string; error?: string | null; remote?: string | null } };
type AIState = { plan: PlanItem[]; analysis: any; quant: any[]; description?: string };

/**
 * The lung nodule bundle reads the volume with ITK and saves boxes in its
 * patient coordinates, LPS millimetres like Cornerstone (checked on an HRSL
 * study: a reported right posterior subpleural nodule lands there).
 */
const toWorld = (p: number[]): [number, number, number] => [p[0], p[1], p[2]];

/**
 * Moves the active viewport to a world point (LPS mm) and rings it for a few
 * seconds: volume viewports (MPR) centre the point on its slice; stack
 * viewports go to the closest image.
 */
function showPoint(servicesManager, world: [number, number, number], label: string, voi: [number, number] | null = null): string | null {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
  if (!viewport) {
    return 'No hay una vista activa';
  }
  if (typeof viewport.setImageIdIndex === 'function') {
    const index = csUtils.getClosestStackImageIndexForPoint(world, viewport);
    if (index == null) {
      return 'El punto no está en esta serie: cargue la serie analizada o use MPR';
    }
    viewport.setImageIdIndex(index);
  } else {
    const { focalPoint, position } = viewport.getCamera();
    viewport.setCamera({
      focalPoint: world,
      position: [world[0] + position[0] - focalPoint[0], world[1] + position[1] - focalPoint[1], world[2] + position[2] - focalPoint[2]],
    });
    viewport.render();
  }
  if (voi && typeof viewport.setProperties === 'function') {
    // Window for the finding: lung (W 1500 / L -600) for nodules, liver for focal lesions
    viewport.setProperties({ voiRange: { lower: voi[0], upper: voi[1] } });
    viewport.render();
  }
  // Ring on top of the canvas at the point, removed after 6 s
  window.setTimeout(() => {
    const [x, y] = viewport.worldToCanvas(world);
    const host: HTMLElement = viewport.element;
    if (!host || !Number.isFinite(x)) return;
    const ring = document.createElement('div');
    ring.title = label;
    Object.assign(ring.style, {
      position: 'absolute', left: `${x - 22}px`, top: `${y - 22}px`, width: '44px', height: '44px', borderRadius: '50%',
      border: '2px solid #facc15', boxShadow: '0 0 0 2px rgba(0,0,0,.6)', pointerEvents: 'none', zIndex: '20',
    });
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, {
      position: 'absolute', left: `${x + 26}px`, top: `${y - 10}px`, color: '#facc15', font: '12px system-ui',
      textShadow: '0 0 3px #000', pointerEvents: 'none', zIndex: '20', whiteSpace: 'nowrap',
    });
    host.style.position = host.style.position || 'relative';
    host.appendChild(ring);
    host.appendChild(tag);
    window.setTimeout(() => { ring.remove(); tag.remove(); }, 6000);
  }, 150);
  return null;
}

const fetchState = (uid: string, request = false, redo = false) =>
  callCloud<AIState>(request ? 'viewerRequestAIAnalysis' : 'viewerAIFindings', { StudyInstanceUID: uid, redo });

/**
 * Puts the analysed series in the active viewport (if it is not there yet),
 * waits for it to load and then shows the point.
 */
const LUNG: [number, number] = [-1350, 150];
const LIVER: [number, number] = [-25, 175];

async function showOnSeries(servicesManager, commandsManager, seriesUID: string | null, world: [number, number, number], label: string,
  voi: [number, number] | null = LUNG) {
  const { viewportGridService, displaySetService, cornerstoneViewportService } = servicesManager.services;
  const viewportId = viewportGridService.getActiveViewportId();
  const current = viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs || [];
  if (seriesUID) {
    const target = (displaySetService.getActiveDisplaySets() || [])
      .filter(ds => ds.SeriesInstanceUID === seriesUID)
      .sort((a, b) => (b.numImageFrames || b.instances?.length || 0) - (a.numImageFrames || a.instances?.length || 0))[0];
    if (target && !current.includes(target.displaySetInstanceUID)) {
      commandsManager.runCommand('setDisplaySetsForViewports', {
        viewportsToUpdate: [{ viewportId, displaySetInstanceUIDs: [target.displaySetInstanceUID] }],
      });
      // Wait for the new series to be in the viewport
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 250));
        const vp: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (vp?.getImageIds?.().length || vp?.getActors?.().length) break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return showPoint(servicesManager, world, label, voi);
}

/**
 * AI for BOFH: what can run on this study, live progress, results, and
 * candidate nodules placed on the image.
 */
function AISection({ servicesManager, commandsManager, studyUID }: { servicesManager: any; commandsManager: any; studyUID: string }) {
  const [state, setState] = useState<AIState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = (request: boolean, redo = false) => {
    setError('');
    setBusy(true);
    fetchState(studyUID, request, redo)
      .then(r => {
        setState(r);
        if (request) setMessage('Análisis solicitados: el avance se actualiza solo.');
      })
      .catch(e => setError(e?.message || String(e)))
      .then(() => setBusy(false));
  };

  // Results so far when the study opens
  useEffect(() => {
    let alive = true;
    fetchState(studyUID).then(r => alive && setState(r)).catch(e => alive && setError(e?.message || String(e)));
    return () => { alive = false; };
  }, [studyUID]);

  // Live progress while something is queued or running
  const pending = !!state?.plan.some(p => p.job && ['queued', 'running'].includes(p.job.status));
  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setInterval(() => {
      fetchState(studyUID).then(setState).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pending, studyUID]);

  const nodules = (state?.quant || []).flatMap(q => (q.task === 'ct_lung_nodules'
    ? (q.data?.nodules || []).map(n => ({ ...n, seriesUID: q.seriesInstanceUID || null, series: q.series })) : []));
  const organs = (state?.quant || []).find(q => q.task === 'ct_organs')?.data?.organs;

  return (
    <div className="mb-4 border-b border-white/10 pb-3">
      <div className={title}>IA</div>
      {error && <div className="mb-2 rounded bg-red-800/60 px-2 py-1 text-[12px]">{error}</div>}
      {message && <div className="mb-2 rounded bg-green-800/50 px-2 py-1 text-[12px]">{message}</div>}

      {!state && !error && <div className={muted}>Consultando análisis…</div>}
      {state && (
        <>
          <div className={`mb-1 ${muted}`}>Análisis que aplican a {state.description || 'este estudio'}:</div>
          {state.plan.map(p => (
            <div key={p.type} className="mb-1 text-[12px]">
              <div className="flex justify-between gap-2">
                <span>{p.label}</span>
                <span className={p.job?.status === 'failed' ? 'text-red-400' : p.job?.status === 'done' ? 'text-green-400' : 'text-white/70'}>
                  {p.job ? `${STATUS[p.job.status] || p.job.status}${p.job.remote && p.job.status !== 'done' ? ` (${p.job.remote})` : ''}` : 'sin ejecutar'}
                </span>
              </div>
              <div className={muted}>{p.note} Tiempo {p.eta}.</div>
              {p.job?.error && <div className="text-[11px] text-red-300">{p.job.error}</div>}
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-1">
            <button className={primaryBtn} disabled={busy || pending} onClick={() => load(true)}>
              {pending ? 'Procesando…' : 'Analizar con IA'}
            </button>
            <button className={btn} disabled={busy || pending} onClick={() => load(true, true)}>Repetir análisis</button>
            <button className={btn} disabled={busy} onClick={() => load(false)}>Actualizar</button>
          </div>
          <div className={`mt-1 ${muted}`}>
            Pasos: 1) Analizar con IA · 2) esperar a «listo» · 3) «Ver en imagen» carga la serie analizada y marca el hallazgo con un anillo.
          </div>

          {state.analysis && (
            <div className="mt-3 text-[12px]">
              <b>Revisión visual:</b> {state.analysis.isNormal ? 'sin hallazgos marcados' : 'hallazgos a revisar'} · {state.analysis.impression}
              {(state.analysis.abnormalities || []).map((a, n) => <div key={n}>• {a.finding}{a.location ? ` (${a.location})` : ''}</div>)}
              <div className={muted}>Orientativa ({state.analysis.model}, {state.analysis.frames} imágenes).</div>
            </div>
          )}

          {(state.quant || []).some(q => (q.scores || []).length || q.aiSeg) && (
            <div className="mt-3 text-[12px]">
              <b>Puntajes y medidas de IA:</b>
              {(state.quant || []).filter(q => (q.scores || []).length || q.aiSeg).map((q, i) => (
                <div key={`sc${i}`} className="mt-2 rounded border border-white/10 p-2">
                  <div className="mb-1 text-white/80">{q.label || q.task}</div>
                  {(q.scores || []).map((sc: any) => (
                    <div key={sc.label} className="flex justify-between gap-2">
                      <span className="text-white/70">{sc.label}</span>
                      <span>{sc.value.toLocaleString('es-MX', { maximumFractionDigits: 1 })}{sc.unit ? ` ${sc.unit}` : ''}</span>
                    </div>
                  ))}
                  {(q.aiSeg?.stats || []).length > 0 && (
                    <div className="mt-1">
                      <div className="text-white/60">Medidas de la segmentación:</div>
                      {q.aiSeg.stats.slice(0, 16).map((st: any) => (
                        <div key={st.label} className="flex justify-between gap-2">
                          <span className="text-white/70">{st.label}</span>
                          <span>{st.volume_ml} ml{st.unit ? ` · ${st.mean} ${st.unit}` : ''} · {st.extent_mm?.[0]} mm</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {q.aiSeg && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button className={btn} onClick={() => {
                        showAISeg3D(servicesManager, commandsManager, q.aiSeg)
                          .then(problem => { setMessage(problem ? '' : 'Segmentación de IA en MPR y vista 3D; arrastre para rotar. Con muchas estructuras el navegador puede no alcanzar a generar las superficies: use «Vistas 3D (imágenes)».'); setError(problem || ''); })
                          .catch(e => { setMessage(''); setError(`No se pudo cargar en 3D: ${e?.message || e}`); });
                      }}>Ver en 3D</button>
                      {q.aiSeg.meshUrl && (
                        <button className={btn} onClick={() => {
                          servicesManager.services.uiModalService.show({
                            title: `${q.aiSeg.title} · vista 3D interactiva`,
                            content: Viewer3D,
                            contentProps: { url: q.aiSeg.meshUrl, title: q.aiSeg.title },
                            containerClassName: 'max-w-[92vw] w-auto',
                          });
                        }}>Vista 3D interactiva</button>
                      )}
                      {q.aiSeg.renderSeriesInstanceUID && (
                        <button className={btn} onClick={() => {
                          const problem = showAIRenders(servicesManager, q.aiSeg);
                          setMessage(problem ? '' : 'Vistas 3D isométricas de la segmentación (serie de IA en el PACS).');
                          setError(problem || '');
                        }}>Vistas 3D (imágenes)</button>
                      )}
                    </div>
                  )}
                  {q.aiSeg && (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-white/60">{q.aiSeg.title} · {q.aiSeg.segments} segmento(s)</span>
                      <button className={btn} onClick={() => {
                        showAISeg(servicesManager, commandsManager, q.aiSeg)
                          .then(problem => { setMessage(problem ? '' : 'Segmentación de IA sobre la vista activa (panel Segmentación para colores y visibilidad; en 3D se ve como superficie).'); setError(problem || ''); })
                          .catch(e => { setMessage(''); setError(`No se pudo cargar: ${e?.message || e}`); });
                      }}>Ver segmentación IA</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {organs && (
            <div className="mt-3 text-[12px]">
              <b>Volumetría:</b>
              {/* CT prostate volume did not agree with the reports: not shown */}
              {Object.entries(organs).filter(([k]) => k !== 'prostate').map(([, o]: [string, any]) => (
                <div key={o.label} className="flex justify-between">
                  <span>{o.label}{o.partial ? ' (parcial)' : ''}</span>
                  <span>{o.volume_ml} ml · {o.mean_hu} UH</span>
                </div>
              ))}
            </div>
          )}

          {(state.quant || []).filter(q => q.task === 'ct_organs' || q.task === 'mr_prostate').map((q, i) => (
            <div key={`f${i}`} className="mt-2 text-[12px]">
              {q.task === 'mr_prostate' && <div>{q.text}</div>}
              {(q.flags || []).map((f: string, k: number) => <div key={k} className="text-amber-300">• {f}</div>)}
              {(q.data?.liver_lesions || []).length > 0 && (
                <div className="mt-1">
                  <b>Lesiones hepáticas candidatas ({q.data.liver_lesions.length}):</b>
                  {q.data.liver_lesions.map((l: any, k: number) => (
                    <div key={k} className="mt-1 flex items-center justify-between gap-2">
                      <span>{k + 1}. {l.diameter_mm} mm · {l.mean_hu} UH{l.segment ? ` · segmento ${l.segment}` : ''}</span>
                      {l.world_lps && (
                        <button className={btn} onClick={() => {
                          showOnSeries(servicesManager, commandsManager, q.seriesInstanceUID || null, toWorld(l.world_lps), `${k + 1}: ${l.diameter_mm} mm`, LIVER)
                            .then(problem => { setMessage(problem ? '' : `Lesión ${k + 1} en la vista activa: anillo amarillo.`); setError(problem || ''); })
                            .catch(e => { setMessage(''); setError(`No se pudo ubicar la lesión: ${e?.message || e}`); });
                        }}>Ver en imagen</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'mr_spine_levels').map((q, i) => (
            <div key={`s${i}`} className="mt-3 text-[12px]">
              <b>Niveles (RM):</b> {q.text}
              <div className="mt-1 flex flex-wrap gap-1">
                {(q.data?.discs || []).map((d: any) => (
                  <button key={d.level} className={btn} onClick={() => {
                    showOnSeries(servicesManager, commandsManager, q.seriesInstanceUID || null, toWorld(d.world_lps), d.level, null)
                      .then(problem => { setMessage(problem ? '' : `Disco ${d.level} en la vista activa.`); setError(problem || ''); })
                      .catch(e => { setMessage(''); setError(`No se pudo ubicar: ${e?.message || e}`); });
                  }}>{d.level}</button>
                ))}
              </div>
              <div className={muted}>Verifique el conteo desde C2 o el sacro: las variantes de transición cambian la numeración.</div>
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'mr_brain_aneurysm').map((q, i) => (
            <div key={`a${i}`} className="mt-3 text-[12px]">
              <b>Aneurismas (TOF, en validación):</b> {q.text}
              {(q.data?.aneurysms || []).map((a: any, k: number) => (
                <div key={k} className="mt-1 flex items-center justify-between gap-2">
                  <span>{k + 1}. {a.diameter_mm} mm</span>
                  <button className={btn} onClick={() => {
                    showOnSeries(servicesManager, commandsManager, q.seriesInstanceUID || null, toWorld(a.world_lps), `${k + 1}: ${a.diameter_mm} mm`, null)
                      .then(problem => { setMessage(problem ? '' : `Candidato ${k + 1} en la vista activa (TOF): anillo amarillo.`); setError(problem || ''); })
                      .catch(e => { setMessage(''); setError(`No se pudo ubicar: ${e?.message || e}`); });
                  }}>Ver en imagen</button>
                </div>
              ))}
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'ct_aorta').map((q, i) => (
            <div key={`ao${i}`} className="mt-3 text-[12px]">
              <b>Diámetros aórticos (perpendiculares a la línea central):</b> {q.text}
              {Object.entries(q.data?.segments || {}).map(([k, sg]: [string, any]) => (
                <div key={k} className="mt-1 flex items-center justify-between gap-2">
                  <span>{AORTA_LABELS[k] || k}: {sg.max_eq_mm} mm</span>
                  <button className={btn} onClick={() => {
                    showOnSeries(servicesManager, commandsManager, q.seriesInstanceUID || null, toWorld(sg.world_lps), `${AORTA_LABELS[k] || k}: ${sg.max_eq_mm} mm`, null)
                      .then(problem => { setMessage(problem ? '' : `${AORTA_LABELS[k] || k}: corte de mayor diámetro (anillo amarillo); verifique con MPR.`); setError(problem || ''); })
                      .catch(e => { setMessage(''); setError(`No se pudo ubicar: ${e?.message || e}`); });
                  }}>Ver en imagen</button>
                </div>
              ))}
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'mr_brain_dwi').map((q, i) => (
            <div key={`dw${i}`} className="mt-3 text-[12px]">
              <b>Difusión restringida (en validación):</b> {q.text}
              {(q.data?.lesions || []).filter((l: any) => l.volume_ml >= 0.3).map((l: any, k: number) => (
                <div key={k} className="mt-1 flex items-center justify-between gap-2">
                  <span>{k + 1}. {l.side}, {l.volume_ml} ml, ADC {l.mean_adc}</span>
                  <button className={btn} onClick={() => {
                    showOnSeries(servicesManager, commandsManager, q.seriesInstanceUID || null, toWorld(l.world_lps), `${k + 1}: ${l.volume_ml} ml`, null)
                      .then(problem => { setMessage(problem ? '' : `Zona ${k + 1} en la difusión: anillo amarillo; compare con el mapa ADC.`); setError(problem || ''); })
                      .catch(e => { setMessage(''); setError(`No se pudo ubicar: ${e?.message || e}`); });
                  }}>Ver en imagen</button>
                </div>
              ))}
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'mr_brain_tumor').map((q, i) => (
            <div key={`t${i}`} className="mt-3 text-[12px]">
              <b>Tumor cerebral (BraTS, en validación):</b> {q.text}
              {q.data?.tumor?.world_lps && (
                <div className="mt-1">
                  <button className={btn} onClick={() => {
                    showOnSeries(servicesManager, commandsManager, q.seriesInstanceUID || null, toWorld(q.data.tumor.world_lps), 'tumor', null)
                      .then(problem => { setMessage(problem ? '' : 'Tumor en la vista activa (T1 con contraste): anillo amarillo.'); setError(problem || ''); })
                      .catch(e => { setMessage(''); setError(`No se pudo ubicar: ${e?.message || e}`); });
                  }}>Ver en imagen</button>
                </div>
              )}
              <div className={muted}>Solo para validación: en HRSL marcó el cerebelo en cerebros normales. Verificar siempre.</div>
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'mr_brain_volumes').map((q, i) => (
            <div key={`b${i}`} className="mt-3 text-[12px]">
              <b>Volumetría cerebral:</b>
              {Object.entries(q.data?.volumes_ml || {}).map(([k, v]: [string, any]) => (
                <div key={k} className="flex justify-between"><span>{k.replace(/_/g, ' ')}</span><span>{v} ml</span></div>
              ))}
              {q.data?.hippocampal_asymmetry_pct != null && <div>Asimetría hipocampal: {q.data.hippocampal_asymmetry_pct}%</div>}
              <div className={muted}>FastSurfer sobre {q.series || 'T1 3D'}; sin normalizar por volumen intracraneal.</div>
            </div>
          ))}

          {(state.quant || []).filter(q => q.task === 'ct_head_ventricles').map((q, i) => (
            <div key={`v${i}`} className="mt-3 text-[12px]">
              <b>Ventrículos:</b>
              <div>{q.text}</div>
              {(q.flags || []).map((f: string) => <div key={f} className="text-amber-300">• {f}</div>)}
              <div className={muted}>TotalSegmentator (ventricle_parts); índice de Evans en el corte axial de mayor anchura de astas frontales.</div>
            </div>
          ))}

          {(state.quant || []).some(q => q.task === 'ct_lung_nodules') && (
            <div className="mt-3 text-[12px]">
              <b>Nódulos candidatos ({nodules.length}):</b>
              {!nodules.length && <div className={muted}>Sin candidatos por encima del umbral.</div>}
              {nodules.map((n, i) => (
                <div key={i} className="mt-1 flex items-center justify-between gap-2">
                  <span>{i + 1}. {n.diameter_mm} mm · confianza {Math.round(n.score * 100)}%</span>
                  <button className={btn} onClick={() => {
                    showOnSeries(servicesManager, commandsManager, n.seriesUID, toWorld(n.center_mm), `${i + 1}: ${n.diameter_mm} mm`)
                      .then(problem => {
                        setMessage(problem ? '' : `Nódulo ${i + 1} en la vista activa${n.series ? ` (serie ${n.series})` : ''}: anillo amarillo.`);
                        setError(problem || '');
                      })
                      .catch(e => { setMessage(''); setError(`No se pudo ubicar el nódulo: ${e?.message || e}`); });
                  }}>Ver en imagen</button>
                </div>
              ))}
            </div>
          )}

          {(state.quant || []).filter(q => q.task === 'cxr').map((q, i) => (
            <div key={i} className="mt-3 text-[12px]"><b>Clasificador de tórax (validación):</b> {q.text}</div>
          ))}
        </>
      )}
    </div>
  );
}

export default AISection;
