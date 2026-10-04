import React, { useEffect, useState } from 'react';
import { getAccess, subscribeAccess, callCloud, loadAccess, type ViewerAccess } from './ris';
import AISection from './AISection';
import {
  CALCULATORS,
  LAYOUTS,
  SLABS,
  applySlab,
  createSegmentation,
  readMeasurements,
  saveSegmentation,
  segmentVolumes,
  studyInstanceUIDs,
  type SegmentVolume,
  type ViewerItem,
} from './tools';

const section = 'mb-4 border-b border-white/10 pb-3';
const title = 'mb-2 text-[13px] font-semibold text-white';
const btn = 'rounded border border-white/20 px-2 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40';
const primaryBtn = 'rounded bg-primary px-2 py-1 text-[12px] text-white hover:opacity-90 disabled:opacity-40';
const muted = 'text-[12px] text-white/60';

type Notice = { type: 'ok' | 'error'; text: string } | null;

/**
 * PixOS tools for physicians with a RIS session: reconstructions, slabs,
 * volumes by segmentation, calculators on measurements, sending results to
 * the report and storing segmentations (radiology physicians and BOFH), and
 * AI (BOFH for now). Anyone else sees why the tools are not available.
 */
function PixOSToolsPanel({ servicesManager, commandsManager }: withAppTypes) {
  const { measurementService, viewportGridService, displaySetService, segmentationService } = servicesManager.services;
  const [access, setAccess] = useState<ViewerAccess>(getAccess());
  const [items, setItems] = useState<ViewerItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<ViewerItem[]>([]);
  const [volumes, setVolumes] = useState<SegmentVolume[] | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => subscribeAccess(setAccess), []);

  useEffect(() => {
    const refresh = () => setItems(readMeasurements(servicesManager));
    refresh();
    const events = [
      measurementService.EVENTS.MEASUREMENT_ADDED,
      measurementService.EVENTS.MEASUREMENT_UPDATED,
      measurementService.EVENTS.MEASUREMENT_REMOVED,
      measurementService.EVENTS.MEASUREMENTS_CLEARED,
    ].filter(Boolean);
    const subs = events.map(e => measurementService.subscribe(e, refresh));
    return () => subs.forEach(s => s.unsubscribe());
  }, [measurementService, servicesManager]);

  const activeStudyUID = (): string => {
    // Also called while rendering, before any viewport has a display set
    const viewport = viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId());
    const uid = viewport?.displaySetInstanceUIDs?.[0];
    const ds = uid ? displaySetService.getDisplaySetByUID(uid) : null;
    return ds?.StudyInstanceUID || studyInstanceUIDs()[0];
  };

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setNotice(null);
    try {
      const text = await fn();
      if (text) setNotice({ type: 'ok', text });
    } catch (e: any) {
      setNotice({ type: 'error', text: e?.message || String(e) });
    }
    setBusy('');
  };

  if (access.status === 'pending') {
    return <div className={`p-3 ${muted}`}>Verificando la sesión del RIS…</div>;
  }
  if (!access.physician) {
    return (
      <div className="p-3 text-[12px] text-white/80">
        <div className={title}>Herramientas PixOS</div>
        <p className="mb-2">Las medidas, reconstrucciones y demás herramientas son para médicos con sesión iniciada en el RIS.</p>
        <p className={`mb-3 ${muted}`}>Inicie sesión en el RIS en este navegador y vuelva a verificar.</p>
        <button className={btn} onClick={() => loadAccess()}>Verificar sesión</button>
      </div>
    );
  }

  const chosen = items.filter(i => selected.includes(i.key));
  const toggle = (key: string) => setSelected(s => (s.includes(key) ? s.filter(k => k !== key) : [...s, key]));
  const toSend = [...chosen, ...results];

  return (
    <div className="p-3 text-white">
      <div className={`mb-3 ${muted}`}>
        {access.user?.fullName || 'Médico'} · {access.canSave ? 'puede enviar y guardar' : 'solo consulta'}
      </div>
      {notice && (
        <div className={`mb-3 rounded px-2 py-1 text-[12px] ${notice.type === 'ok' ? 'bg-green-800/60' : 'bg-red-800/60'}`}>{notice.text}</div>
      )}

      <div className={section}>
        <div className={title}>Reconstrucciones</div>
        <div className="flex flex-wrap gap-1">
          {LAYOUTS.map(l => (
            <button key={l.id} className={btn} onClick={() => run(l.label, async () => {
              commandsManager.runCommand('setHangingProtocol', { protocolId: l.id });
            })}>{l.label}</button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {SLABS.map(s => (
            <button key={s.id} className={btn} onClick={() => run(s.label, async () => {
              const error = applySlab(servicesManager, s);
              if (error) throw new Error(error);
            })}>{s.label}</button>
          ))}
        </div>
        <div className={`mt-1 ${muted}`}>El slab se aplica a la vista activa en MPR.</div>
      </div>

      <div className={section}>
        <div className={title}>Volúmenes por segmentación</div>
        <div className="flex flex-wrap gap-1">
          <button className={btn} onClick={() => run('seg', async () => {
            await createSegmentation(servicesManager, commandsManager);
            return 'Segmentación creada: pinte o use umbral en el panel de segmentación';
          })}>Nueva segmentación</button>
          <button className={btn} disabled={busy === 'vol'} onClick={() => run('vol', async () => {
            const v = await segmentVolumes(servicesManager);
            setVolumes(v);
            if (!v.length) return 'No hay segmentos con contenido';
          })}>{busy === 'vol' ? 'Calculando…' : 'Calcular volúmenes'}</button>
        </div>
        {volumes?.map(v => (
          <div key={`${v.segmentationId}-${v.segment}`} className="mt-1 flex items-center justify-between text-[12px]">
            <span>{v.segment} <span className={muted}>({v.segmentation})</span></span>
            <span className="flex items-center gap-2">
              <b>{v.ml != null ? `${v.ml} ml` : '—'}</b>
              {v.ml != null && (
                <button className={btn} onClick={() => setResults(r => [...r, {
                  key: `vol-${Date.now()}`, kind: 'Volume', label: v.segment,
                  text: `${v.segment}: volumen de ${v.ml} ml${v.mean != null ? `, valor medio ${v.mean}` : ''} (segmentación).`,
                  values: { ml: v.ml },
                }])}>+ informe</button>
              )}
            </span>
          </div>
        ))}
        {access.canSave && (segmentationService.getSegmentations() || []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(segmentationService.getSegmentations() || []).map(seg => (
              <button key={seg.segmentationId} className={btn} disabled={!!busy} onClick={() => run('save-seg', async () => {
                const r: any = await saveSegmentation(commandsManager, seg.segmentationId, activeStudyUID());
                return `Segmentación guardada en el PACS${r?.description ? ` (${r.description})` : ''}`;
              })}>Guardar «{seg.label || 'Segmentación'}» en PACS</button>
            ))}
          </div>
        )}
      </div>

      <div className={section}>
        <div className={title}>Medidas ({items.length})</div>
        {!items.length && <div className={muted}>Use las herramientas de medición de la barra superior.</div>}
        {items.map(i => (
          <label key={i.key} className="mb-1 flex cursor-pointer items-start gap-2 text-[12px]">
            <input type="checkbox" className="mt-0.5" checked={selected.includes(i.key)} onChange={() => toggle(i.key)} />
            <span>{i.text}{i.series ? <span className={muted}> · {i.series}</span> : null}</span>
          </label>
        ))}
        <div className={`mt-2 ${title}`}>Calculadoras (con las medidas marcadas, en orden)</div>
        <div className="flex flex-col gap-1">
          {CALCULATORS.map(c => (
            <button key={c.id} className={`${btn} text-left`} title={c.hint} onClick={() => {
              const order = selected.map(k => items.find(i => i.key === k)).filter(Boolean) as ViewerItem[];
              const r = c.run(order);
              if ('error' in r) {
                setNotice({ type: 'error', text: `${c.name}: ${r.error}` });
              } else {
                setNotice({ type: 'ok', text: `${c.name}: ${r.title}` });
                setResults(prev => [...prev, { key: `calc-${Date.now()}`, kind: 'Cálculo', label: c.name, text: r.text, values: {} }]);
              }
            }}>{c.name} <span className={muted}>— {c.hint}</span></button>
          ))}
        </div>
      </div>

      <div className={section}>
        <div className={title}>Enviar al informe ({toSend.length})</div>
        {results.map(r => (
          <div key={r.key} className="mb-1 flex items-start justify-between gap-2 text-[12px]">
            <span>{r.text}</span>
            <button className={btn} onClick={() => setResults(prev => prev.filter(x => x.key !== r.key))}>✕</button>
          </div>
        ))}
        {access.canSave ? (
          <button className={primaryBtn} disabled={!toSend.length || !!busy} onClick={() => run('send', async () => {
            const res: any = await callCloud('saveViewerMeasurements', {
              StudyInstanceUID: activeStudyUID(),
              items: toSend.map(({ kind, label, text, series, values }) => ({ kind, label, text, series, values })),
            });
            setResults([]);
            setSelected([]);
            return `${res.count} elemento(s) enviados: aparecen en «Medidas del visor» del editor de informes`;
          })}>Enviar medidas marcadas y resultados</button>
        ) : (
          <div className={muted}>Solo los médicos radiólogos pueden enviar medidas al informe.</div>
        )}
      </div>

      {access.ai && <AISection servicesManager={servicesManager} studyUID={activeStudyUID()} />}
    </div>
  );
}

export default PixOSToolsPanel;
