import React, { useState } from 'react';
import { callCloud } from './ris';
import { readMeasurements } from './tools';

const title = 'mb-1 text-[13px] font-semibold text-white';
const btn = 'rounded border border-white/20 px-2 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40';
const muted = 'text-[12px] text-white/60';
const input = 'w-20 rounded border border-white/20 bg-transparent px-1 py-0.5 text-[12px] text-white';

export type Prior = {
  objectId: string; instanceUUID: string | null; date: any; description: string; modality: string | null;
  sameModality: boolean; daysBefore: number; conclusion: string | null;
  quant: { task: string; text: string; data: any }[];
  measurements: { kind: string; label: string; text: string; values: Record<string, any> }[];
  values?: Record<string, number> | null; // graft Doppler values read from the report
};

const fmtDate = (d: any) => (d ? new Date(d.iso || d).toLocaleDateString('es-MX') : '');
const num = (v: string) => (v === '' || v == null ? null : Number(v));
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Longest diameter of each prior measurement (mm). */
const priorLengths = (p?: Prior) => (p?.measurements || [])
  .map(m => Number(m.values?.length) || null).filter((v): v is number => !!v);

export function openCompare(currentUID: string, prior: Prior) {
  if (!prior.instanceUUID) return;
  const url = new URL(window.location.href);
  url.searchParams.set('StudyInstanceUIDs', `${currentUID},${prior.instanceUUID}`);
  url.searchParams.set('hangingprotocolId', '@ohif/hpCompare');
  window.location.href = url.toString();
}

/**
 * Earlier studies of the same region (radiology physicians): conclusion,
 * measurements sent to their report, quantitative AI results; side-by-side
 * comparison; and follow-up calculators (RECIST 1.1, doubling time,
 * resistive index) with the chosen prior as baseline.
 */
function PriorsSection({ servicesManager, priors, studyUID, episode, canSave }: {
  servicesManager: any; priors: Prior[]; studyUID: string; episode: string; canSave: boolean;
}) {
  const [baseline, setBaseline] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [recistBase, setRecistBase] = useState('');
  const [recistNow, setRecistNow] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');
  const [days, setDays] = useState('');
  const [psv, setPsv] = useState('');
  const [edv, setEdv] = useState('');
  const [msg, setMsg] = useState('');

  const base = priors[baseline];
  const fillFromData = () => {
    const now = readMeasurements(servicesManager).map(m => Number(m.values.length)).filter(Boolean);
    const prev = priorLengths(base);
    if (prev.length) setRecistBase(String(round(prev.reduce((a, b) => a + b, 0))));
    if (now.length) setRecistNow(String(round(now.reduce((a, b) => a + b, 0))));
    const prevNodule = base?.quant.flatMap(q => q.data?.nodules || []).map(n => n.diameter_mm).sort((a, b) => b - a)[0];
    if (prevNodule || prev.length) setD1(String(prevNodule || Math.max(...prev)));
    if (now.length) setD2(String(Math.max(...now)));
    if (base) setDays(String(base.daysBefore));
    setMsg(prev.length || now.length ? 'Valores tomados de las medidas del previo y de las actuales; revíselos.' : 'No hay medidas guardadas: escriba los valores.');
  };

  const b = num(recistBase); const n = num(recistNow);
  let recist: string | null = null;
  if (b != null && n != null && b > 0) {
    const pct = round((100 * (n - b)) / b);
    const cat = n === 0 ? 'Respuesta completa (RC)' : pct <= -30 ? 'Respuesta parcial (RP)'
      : pct >= 20 && n - b >= 5 ? 'Progresión (PE)' : 'Enfermedad estable (EE)';
    recist = `RECIST 1.1: suma de diámetros ${n} mm contra ${b} mm basal (${pct > 0 ? '+' : ''}${pct}%): ${cat}.`;
  }
  const a1 = num(d1); const a2 = num(d2); const t = num(days);
  let growth: string | null = null;
  if (a1 && a2 && t) {
    if (a2 === a1) growth = `Sin cambio de diámetro (${a1} mm) en ${t} días.`;
    else {
      const vdt = Math.round((t * Math.log(2)) / (3 * Math.log(a2 / a1)));
      growth = vdt > 0
        ? `Diámetro de ${a1} a ${a2} mm en ${t} días: tiempo de duplicación de volumen ≈ ${vdt} días${vdt < 400 ? ' (menor de 400 días: crecimiento sospechoso en nódulo sólido)' : ''}.`
        : `Disminución de ${a1} a ${a2} mm en ${t} días.`;
    }
  }
  const p1 = num(psv); const e1 = num(edv);
  const ri = p1 && e1 != null && p1 > 0 ? round((p1 - e1) / p1, 2) : null;
  const riText = ri != null ? `Índice de resistencia ${ri} (VPS ${p1} cm/s, VFD ${e1} cm/s)${ri >= 0.8 ? ': elevado (≥ 0.8)' : ': normal'}.` : null;

  const send = async (text: string) => {
    try {
      await callCloud('saveViewerMeasurements', { StudyInstanceUID: studyUID, items: [{ kind: 'Cálculo', label: 'Evolución', text, values: {} }] });
      setMsg('Enviado al informe («Medidas del visor»).');
    } catch (e: any) {
      setMsg(e?.message || String(e));
    }
  };

  return (
    <div className="mb-4 border-b border-white/10 pb-3">
      <div id="pixos-priors" className={title}>
        Estudios previos de la región ({priors.length}) · {episode === 'control' ? 'estudio de control' : 'estudio nuevo'}
      </div>
      {!priors.length && <div className={muted}>Sin estudios previos de esta región para el paciente.</div>}
      {priors.map((p, i) => (
        <div key={p.objectId} className={`mb-2 rounded px-2 py-1 text-[12px] ${i === baseline ? 'bg-white/10' : 'bg-white/5'}`}>
          <div className="flex items-center justify-between gap-1">
            <span><b>{fmtDate(p.date)}</b> · {p.modality} · {p.description} <span className={muted}>(hace {p.daysBefore} d)</span></span>
          </div>
          {p.conclusion && (
            <div className="mt-1 cursor-pointer" onClick={() => setOpen(o => ({ ...o, [p.objectId]: !o[p.objectId] }))}>
              {open[p.objectId] ? p.conclusion : `${p.conclusion.slice(0, 140)}${p.conclusion.length > 140 ? '…' : ''}`}
            </div>
          )}
          {!!p.measurements.length && <div className="mt-1 text-white/80">Medidas: {p.measurements.map(m => m.text).join(' · ')}</div>}
          {p.quant.map((q, k) => <div key={k} className="mt-1 text-white/70">{q.text}</div>)}
          <div className="mt-1 flex flex-wrap gap-1">
            {p.instanceUUID && <button className={btn} onClick={() => openCompare(studyUID, p)}>Comparar lado a lado</button>}
            <button className={btn} disabled={i === baseline} onClick={() => setBaseline(i)}>{i === baseline ? 'Basal elegido' : 'Usar como basal'}</button>
          </div>
        </div>
      ))}

      <div id="pixos-followup" className={`mt-3 ${title}`}>Evolución y cálculos</div>
      <button className={btn} onClick={fillFromData}>Llenar con medidas (previo y actual)</button>
      {msg && <div className={`mt-1 ${muted}`}>{msg}</div>}

      <div className="mt-2 text-[12px]">
        <b>RECIST 1.1</b> · suma basal <input className={input} value={recistBase} onChange={e => setRecistBase(e.target.value)} /> mm
        · actual <input className={input} value={recistNow} onChange={e => setRecistNow(e.target.value)} /> mm
        {recist && <div className="mt-1">{recist} {canSave && <button className={btn} onClick={() => send(recist)}>Al informe</button>}</div>}
      </div>
      <div className="mt-2 text-[12px]">
        <b>Tiempo de duplicación</b> · previo <input className={input} value={d1} onChange={e => setD1(e.target.value)} /> mm
        · actual <input className={input} value={d2} onChange={e => setD2(e.target.value)} /> mm
        · días <input className={input} value={days} onChange={e => setDays(e.target.value)} />
        {growth && <div className="mt-1">{growth} {canSave && <button className={btn} onClick={() => send(growth)}>Al informe</button>}</div>}
      </div>
      <div className="mt-2 text-[12px]">
        <b>Índice de resistencia (Doppler)</b> · VPS <input className={input} value={psv} onChange={e => setPsv(e.target.value)} />
        · VFD <input className={input} value={edv} onChange={e => setEdv(e.target.value)} /> cm/s
        {riText && <div className="mt-1">{riText} {canSave && <button className={btn} onClick={() => send(riText)}>Al informe</button>}</div>}
      </div>
    </div>
  );
}

export default PriorsSection;
