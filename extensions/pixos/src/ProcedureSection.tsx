import React, { useEffect, useState } from 'react';
import { callCloud } from './ris';
import { DEF, EVENT_DEFS, dicomTime, narrativeOf, readingOf, sentenceOf, type ProcEvent } from './procedure';

const title = 'mb-1 text-[13px] font-semibold text-white';
const btn = 'rounded border border-white/20 px-2 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40';
const muted = 'text-[12px] text-white/60';
const field = 'w-full rounded border border-white/20 bg-black px-1 py-0.5 text-[12px] text-white';
const FLAG_STYLE = { '': 'border-white/15', importante: 'border-amber-400', complicacion: 'border-red-500' };

export type Run = { time: string | null; projection: string; frames: number; seriesInstanceUID: string; sopInstanceUID?: string };

/** Run and frame shown in the active viewport, and the run's acquisition time. */
function currentPosition(servicesManager: any, runs: Run[]) {
  const { viewportGridService, displaySetService, cornerstoneViewportService } = servicesManager.services;
  const viewportId = viewportGridService.getActiveViewportId();
  const uid = viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs?.[0];
  const ds = uid && displaySetService.getDisplaySetByUID(uid);
  const vp: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  if (!ds || !vp?.getCurrentImageIdIndex) return null;
  const index = vp.getCurrentImageIdIndex();
  const instances = ds.instances || [ds.instance];
  // Multiframe run: one instance, the index is the frame; otherwise one instance per image
  const single = instances.length > 1;
  const sop = (single ? instances[index] : instances[0])?.SOPInstanceUID || null;
  const runIndex = runs.findIndex(r => r.sopInstanceUID === sop);
  const run = runs[runIndex];
  return {
    ref: { seriesInstanceUID: ds.SeriesInstanceUID, sopInstanceUID: sop, frame: single ? null : index,
      label: run ? `adq. ${runIndex + 1} (${run.projection}), cuadro ${index + 1}` : `${ds.SeriesDescription || 'serie'}, imagen ${index + 1}` },
    time: dicomTime(run?.time || null),
  };
}

/** Back to the run and frame of an event. */
function goTo(servicesManager: any, commandsManager: any, ref: NonNullable<ProcEvent['ref']>) {
  const { viewportGridService, displaySetService, cornerstoneViewportService } = servicesManager.services;
  const viewportId = viewportGridService.getActiveViewportId();
  const sets = (displaySetService.getActiveDisplaySets() || []).filter(ds => ds.SeriesInstanceUID === ref.seriesInstanceUID);
  const target = sets.find(ds => (ds.instances || [ds.instance]).some(i => i?.SOPInstanceUID === ref.sopInstanceUID)) || sets[0];
  if (!target) return Promise.resolve('La serie de este momento no está cargada');
  const current = viewportGridService.getState().viewports.get(viewportId)?.displaySetInstanceUIDs || [];
  if (!current.includes(target.displaySetInstanceUID)) {
    commandsManager.runCommand('setDisplaySetsForViewports', {
      viewportsToUpdate: [{ viewportId, displaySetInstanceUIDs: [target.displaySetInstanceUID] }],
    });
  }
  const instances = target.instances || [target.instance];
  const index = ref.frame != null ? ref.frame : Math.max(0, instances.findIndex(i => i?.SOPInstanceUID === ref.sopInstanceUID));
  const attempt = (left: number): Promise<string | null> => new Promise(resolve => {
    window.setTimeout(() => {
      const vp: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (vp?.getImageIds?.().length > index) {
        vp.setImageIdIndex(index);
        resolve(null);
      } else if (left > 0) attempt(left - 1).then(resolve);
      else resolve('No se pudo abrir el cuadro');
    }, 250);
  });
  return attempt(40);
}

const newId = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toTimeString().slice(0, 8);

/**
 * Procedure log: timed events (access, lesions, FFR/iFR, IVUS/OCT, balloons,
 * stents, pacemaker, drugs, complications, result, closure) with flags, each
 * one tied to the run and frame it happened on; the acquisitions from the
 * DICOM headers in the same timeline; and the narrative for the report.
 */
export function ProcedureSection({ servicesManager, commandsManager, studyUID, canSave, runs, acquisitions }: {
  servicesManager: any; commandsManager: any; studyUID: string; canSave: boolean; runs: Run[]; acquisitions: string | null;
}) {
  const [events, setEvents] = useState<ProcEvent[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<ProcEvent | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    callCloud<{ events: ProcEvent[]; version: string | null; updatedBy?: string }>('getProcedureLog', { StudyInstanceUID: studyUID })
      .then(r => {
        if (!alive) return;
        setEvents(r.events || []);
        setVersion(r.version);
        setLoaded(true);
        if (r.updatedBy) setMsg(`Última edición: ${r.updatedBy}`);
      })
      .catch(e => alive && setMsg(e?.message || String(e)));
    return () => { alive = false; };
  }, [studyUID]);

  const persist = (next: ProcEvent[]) => {
    setBusy(true);
    return callCloud<{ version: string }>('saveProcedureLog', { StudyInstanceUID: studyUID, events: next, version })
      .then(r => { setEvents(next); setVersion(r.version); setMsg('Bitácora guardada.'); setBusy(false); return true; })
      .catch(e => { setMsg(e?.message || String(e)); setBusy(false); return false; });
  };

  const start = (type: string, mark: boolean) => {
    const pos = mark ? currentPosition(servicesManager, runs) : null;
    if (mark && !pos) return setMsg('No hay una imagen en la vista activa');
    setEditing({ id: newId(), type, time: pos?.time || now(), flag: '', fields: {}, note: '', ref: pos?.ref || null });
  };
  const save = () => {
    if (!editing) return;
    const exists = events.some(e => e.id === editing.id);
    persist(exists ? events.map(e => (e.id === editing.id ? editing : e)) : [...events, editing])
      .then(ok => ok && setEditing(null));
  };
  const remove = (id: string) => {
    if (window.confirm('¿Eliminar este evento de la bitácora?')) persist(events.filter(e => e.id !== id));
  };
  const setField = (id: string, value: string, numeric: boolean) => {
    if (!editing) return;
    const v = numeric && value !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
    setEditing({ ...editing, fields: { ...editing.fields, [id]: v } });
  };

  const narrative = narrativeOf(events, acquisitions);
  const sendNarrative = () => callCloud('saveViewerMeasurements', {
    StudyInstanceUID: studyUID, items: narrative.map(p => ({ kind: 'Relato', label: p.label, text: p.text, values: {} })),
  }).then(() => setMsg('Relato enviado al informe («Medidas del visor»).')).catch(e => setMsg(e?.message || String(e)));

  // Timeline: events and (optionally) the acquisitions, by time
  type Row = { key: string; time: string; event?: ProcEvent; run?: Run; runIndex?: number };
  const rows: Row[] = [
    ...events.map(e => ({ key: e.id, time: e.time, event: e })),
    ...(showRuns ? runs.map((r, i) => ({ key: `run-${i}`, time: dicomTime(r.time), run: r, runIndex: i })) : []),
  ].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  const def = editing ? DEF[editing.type] : null;
  return (
    <div className="mt-3">
      <div id="pixos-procedure" className={title}>Bitácora del procedimiento</div>
      {!loaded && !msg && <div className={muted}>Cargando bitácora…</div>}
      {canSave && loaded && !editing && (
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          <select className="rounded border border-white/20 bg-black px-1 py-1 text-[12px]" value=""
            onChange={e => e.target.value && start(e.target.value, true)}>
            <option value="">Marcar momento en esta imagen…</option>
            {EVENT_DEFS.map(d => <option key={d.type} value={d.type}>{d.label}</option>)}
          </select>
          <select className="rounded border border-white/20 bg-black px-1 py-1 text-[12px]" value=""
            onChange={e => e.target.value && start(e.target.value, false)}>
            <option value="">Agregar evento sin imagen…</option>
            {EVENT_DEFS.map(d => <option key={d.type} value={d.type}>{d.label}</option>)}
          </select>
        </div>
      )}

      {editing && def && (
        <div className="mt-2 rounded border border-white/20 p-2 text-[12px]">
          <div className="mb-1 font-semibold">{def.label}{editing.ref ? ` · ${editing.ref.label}` : ''}</div>
          <div className="grid grid-cols-2 gap-1">
            <label>Hora<input className={field} value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} placeholder="HH:MM:SS" /></label>
            <label>Bandera
              <select className={field} value={editing.flag} onChange={e => setEditing({ ...editing, flag: e.target.value as ProcEvent['flag'] })}>
                <option value="">sin bandera</option><option value="importante">importante</option><option value="complicacion">complicación</option>
              </select>
            </label>
            {def.fields.map(f => (
              <label key={f.id}>{f.label}{f.unit ? ` (${f.unit})` : ''}
                {f.kind === 'select' ? (
                  <select className={field} value={String(editing.fields[f.id] ?? '')} onChange={e => setField(f.id, e.target.value, false)}>
                    {!f.options?.includes('') && <option value="">—</option>}
                    {f.options?.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                ) : (
                  <input className={field} inputMode={f.kind === 'num' ? 'decimal' : undefined} value={String(editing.fields[f.id] ?? '')}
                    onChange={e => setField(f.id, e.target.value, f.kind === 'num')} />
                )}
              </label>
            ))}
          </div>
          <label className="mt-1 block">Nota<textarea className={field} rows={2} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
          <div className="mt-1 text-white/80">{sentenceOf(editing)}</div>
          <div className="mt-1 flex gap-1">
            <button className={btn} disabled={busy} onClick={save}>Guardar</button>
            <button className={btn} onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {loaded && (
        <label className={`mt-2 flex items-center gap-1 ${muted}`}>
          <input type="checkbox" checked={showRuns} onChange={e => setShowRuns(e.target.checked)} /> Mostrar adquisiciones en la línea de tiempo
        </label>
      )}
      <div className="mt-1 flex flex-col gap-1">
        {rows.map(row => row.event ? (
          <div key={row.key} className={`rounded border-l-4 bg-white/5 px-2 py-1 text-[12px] ${FLAG_STYLE[row.event.flag || '']}`}>
            <div className="flex items-start justify-between gap-1">
              <span><b>{row.time ? row.time.slice(0, 5) : '—'}</b> · {DEF[row.event.type]?.label || row.event.type}</span>
              <span className="flex gap-1">
                {row.event.ref && (
                  <button className={btn} title={row.event.ref.label}
                    onClick={() => goTo(servicesManager, commandsManager, row.event.ref).then(p => setMsg(p || `En ${row.event.ref.label}`))}>Ver</button>
                )}
                {canSave && <button className={btn} onClick={() => setEditing(row.event)}>Editar</button>}
                {canSave && <button className={btn} disabled={busy} onClick={() => remove(row.event.id)}>×</button>}
              </span>
            </div>
            <div className="text-white/80">{sentenceOf(row.event)}</div>
            {readingOf(row.event) && row.event.type !== 'nota' && <div className="text-amber-300/90">{readingOf(row.event)}</div>}
          </div>
        ) : (
          <div key={row.key} className={`cursor-pointer px-2 text-[11px] text-white/50 hover:text-white`}
            onClick={() => row.run && goTo(servicesManager, commandsManager, { seriesInstanceUID: row.run.seriesInstanceUID,
              sopInstanceUID: row.run.sopInstanceUID || null, frame: 0, label: '' }).then(p => setMsg(p || `Adquisición ${(row.runIndex || 0) + 1}`))}>
            {row.time.slice(0, 5)} · adquisición {(row.runIndex || 0) + 1} · {row.run?.projection} · {row.run?.frames} cuadros
          </div>
        ))}
        {loaded && !events.length && <div className={muted}>Sin eventos. Marque momentos sobre la imagen o agregue eventos.</div>}
      </div>

      {!!events.length && (
        <div className="mt-2 rounded bg-white/5 px-2 py-1 text-[12px]">
          <div className="mb-1 font-semibold">Relato</div>
          {narrative.map(p => <p key={p.label} className="mb-1">{p.text}</p>)}
          {canSave && <button className={btn} onClick={sendNarrative}>Relato al informe</button>}
        </div>
      )}
      {msg && <div className={`mt-1 ${muted}`}>{msg}</div>}
    </div>
  );
}
