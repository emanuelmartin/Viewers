import React, { useEffect, useState } from 'react';
import { callCloud } from './ris';
import { readMeasurements } from './tools';
import type { Prior } from './PriorsSection';
import { ProcedureSection } from './ProcedureSection';

const title = 'mb-1 text-[13px] font-semibold text-white';
const btn = 'rounded border border-white/20 px-2 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40';
const muted = 'text-[12px] text-white/60';
const input = 'w-16 rounded border border-white/20 bg-transparent px-1 py-0.5 text-[12px] text-white';

const num = (v: string) => (v === '' || v == null ? null : Number(v));
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const fmtDate = (d: any) => (d ? new Date(d.iso || d).toLocaleDateString('es-MX') : '');

async function send(studyUID: string, label: string, text: string) {
  await callCloud('saveViewerMeasurements', { StudyInstanceUID: studyUID, items: [{ kind: 'Cálculo', label, text, values: {} }] });
}

type Run = {
  time: string | null; series: string; projection: string; frames: number; fps: number | null;
  dapGycm2: number | null; magnification: number | null; seriesInstanceUID: string; sopInstanceUID?: string;
};
type XA = { runs: Run[]; totalRuns: number; totalFrames: number; totalDapGycm2: number; projections: string[]; text: string };

/** Puts one angiographic run (multiframe instance) in the active viewport. */
function showRun(servicesManager: any, commandsManager: any, run: Run) {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const sets = (displaySetService.getActiveDisplaySets() || []).filter(ds => ds.SeriesInstanceUID === run.seriesInstanceUID);
  const target = sets.find(ds => (ds.instances || [ds.instance]).some(i => i?.SOPInstanceUID === run.sopInstanceUID)) || sets[0];
  if (!target) return 'La serie de esta adquisición no está cargada';
  commandsManager.runCommand('setDisplaySetsForViewports', {
    viewportsToUpdate: [{ viewportId: viewportGridService.getActiveViewportId(), displaySetInstanceUIDs: [target.displaySetInstanceUID] }],
  });
  return null;
}

/**
 * Coronary angiography: acquisitions (projection, frames, dose) from the
 * DICOM headers, technique text for the report, QCA from two lengths and the
 * corrected TIMI frame count (Gibson 1996).
 */
export function XASection({ servicesManager, commandsManager, studyUID, canSave }: {
  servicesManager: any; commandsManager: any; studyUID: string; canSave: boolean;
}) {
  const [xa, setXa] = useState<XA | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vessel, setVessel] = useState('DA');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [fps, setFps] = useState('');
  const [ref, setRef] = useState('');
  const [mld, setMld] = useState('');

  useEffect(() => {
    let alive = true;
    callCloud<XA>('getXASummary', { StudyInstanceUID: studyUID })
      .then(r => alive && setXa(r))
      .catch(e => alive && setError(e?.message || String(e)));
    return () => { alive = false; };
  }, [studyUID]);

  const fromLengths = () => {
    const l = readMeasurements(servicesManager).filter(m => m.kind === 'Length').map(m => Number(m.values.length)).filter(Boolean);
    if (l.length < 2) return setMsg('Marque 2 longitudes: diámetro de referencia y luminal mínimo (calibre antes con «Calibración»).');
    const [a, b] = l.slice(-2);
    setRef(String(round(Math.max(a, b), 2)));
    setMld(String(round(Math.min(a, b), 2)));
    setMsg('Tomado de las 2 últimas longitudes: la mayor como referencia.');
  };

  const r = num(ref); const m = num(mld);
  const qca = r && m != null && m < r
    ? (() => {
      const ds = round(100 * (1 - m / r)); const as = round(100 * (1 - (m / r) ** 2));
      return `Estenosis de ${ds}% del diámetro (${as}% del área): referencia ${r} mm, luminal mínimo ${m} mm${ds >= 70 ? '; angiográficamente significativa (≥ 70%)' : ds >= 50 ? '; intermedia (50–69%): considerar FFR/iFR' : ''}.`;
    })() : null;

  const a = num(start); const b = num(end); const f = num(fps) || xa?.runs.find(x => x.fps)?.fps || 30;
  let tfc: string | null = null;
  if (a != null && b != null && b > a) {
    let v = (b - a) * (30 / f);
    if (vessel === 'DA') v /= 1.7;
    v = round(v);
    tfc = `TIMI frame count corregido de ${vessel} de ${v} cuadros (${f} cps)${v > 27 ? ': flujo lento (> 27)' : ': normal (21 ± 3)'}.`;
  }

  const doSend = (label: string, text: string) => send(studyUID, label, text)
    .then(() => setMsg('Enviado al informe («Medidas del visor»).'))
    .catch(e => setMsg(e?.message || String(e)));

  return (
    <div className="mb-4 border-b border-white/10 pb-3">
      <div id="pixos-xa" className={title}>Hemodinamia</div>
      {error && <div className={muted}>Resumen de adquisiciones no disponible: {error}</div>}
      {!xa && !error && <div className={muted}>Leyendo adquisiciones…</div>}
      {xa && (
        <div className="text-[12px]">
          <div>{xa.totalRuns} adquisiciones · {xa.totalFrames} cuadros · PDA {xa.totalDapGycm2} Gy·cm² (sin fluoroscopía)</div>
          <div className="mt-1 max-h-40 overflow-y-auto">
            {xa.runs.map((run, i) => (
              <div key={i} className="flex cursor-pointer justify-between gap-1 rounded px-1 hover:bg-white/10"
                onClick={() => setMsg(showRun(servicesManager, commandsManager, run) || `Adquisición ${i + 1} (${run.projection})`)}>
                <span>{i + 1}. {run.projection}</span>
                <span className={muted}>{run.frames} c{run.fps ? ` · ${run.fps} cps` : ''}{run.dapGycm2 != null ? ` · ${run.dapGycm2} Gy·cm²` : ''}</span>
              </div>
            ))}
          </div>
          {xa.text && canSave && <button className={`mt-1 ${btn}`} onClick={() => doSend('Técnica', xa.text)}>Técnica y dosis al informe</button>}
        </div>
      )}

      <div id="pixos-qca" className="mt-3 text-[12px]">
        <b>QCA</b> · referencia <input className={input} value={ref} onChange={e => setRef(e.target.value)} /> mm
        · MLD <input className={input} value={mld} onChange={e => setMld(e.target.value)} /> mm
        <button className={`ml-1 ${btn}`} onClick={fromLengths}>De las longitudes</button>
        {qca && <div className="mt-1">{qca} {canSave && <button className={btn} onClick={() => doSend('QCA', qca)}>Al informe</button>}</div>}
      </div>
      <div id="pixos-tfc" className="mt-2 text-[12px]">
        <b>TIMI frame count</b> ·{' '}
        <select className="rounded border border-white/20 bg-black px-1 text-[12px]" value={vessel} onChange={e => setVessel(e.target.value)}>
          <option value="DA">DA</option><option value="CX">CX</option><option value="CD">CD</option>
        </select>
        {' '}cuadro inicial <input className={input} value={start} onChange={e => setStart(e.target.value)} />
        · final <input className={input} value={end} onChange={e => setEnd(e.target.value)} />
        · cps <input className={input} placeholder={String(f)} value={fps} onChange={e => setFps(e.target.value)} />
        <div className={muted}>Inicial: contraste toca ambos bordes del ostium; final: llega a la referencia distal (DA: «bigote» apical; CX: última bifurcación de la marginal más larga; CD: primera rama posterolateral).</div>
        {tfc && <div className="mt-1">{tfc} {canSave && <button className={btn} onClick={() => doSend('TFC', tfc)}>Al informe</button>}</div>}
      </div>
      {msg && <div className={`mt-1 ${muted}`}>{msg}</div>}
      {(xa || error) && (
        <ProcedureSection servicesManager={servicesManager} commandsManager={commandsManager} studyUID={studyUID} canSave={canSave}
          runs={xa?.runs || []} acquisitions={xa?.text || null} />
      )}
    </div>
  );
}

const GRAFT_LABELS: [string, string, string][] = [
  ['graftVolumeMl', 'Volumen', 'ml'], ['riMedian', 'IR', ''], ['psvAnastomosis', 'VPS anast.', 'cm/s'], ['ratio', 'AR/AI', ''],
];

/**
 * Kidney graft Doppler: interpretation of the measured values (RI, PSV at the
 * anastomosis and iliac, acceleration time, venous flow) and their evolution
 * across the graft's earlier studies (values read from the signed reports).
 */
export function GraftSection({ servicesManager, studyUID, priors, canSave }: {
  servicesManager: any; studyUID: string; priors: Prior[]; canSave: boolean;
}) {
  const [ri, setRi] = useState('');
  const [ar, setAr] = useState('');
  const [ai, setAi] = useState('');
  const [at, setAt] = useState('');
  const [venous, setVenous] = useState('normal');
  const [vol, setVol] = useState('');
  const [msg, setMsg] = useState('');

  const volumeFromLengths = () => {
    const l = readMeasurements(servicesManager).filter(m => m.kind === 'Length' || m.kind === 'Bidirectional')
      .map(m => Number(m.values.length)).filter(Boolean).slice(-3);
    if (l.length !== 3) return setMsg('Marque 3 longitudes del injerto (longitudinal, transverso, anteroposterior).');
    setVol(String(round((0.523 * l[0] * l[1] * l[2]) / 1000)));
    setMsg(`Injerto de ${l.map(x => round(x, 0)).join(' × ')} mm.`);
  };

  const vRi = num(ri); const vAr = num(ar); const vAi = num(ai); const vAt = num(at); const vVol = num(vol);
  const ratio = vAr && vAi ? round(vAr / vAi, 1) : null;
  const parts: string[] = [];
  if (vVol) parts.push(`volumen estimado del injerto ${vVol} ml`);
  if (venous === 'ausente') parts.push('ausencia de flujo venoso con diástole arterial invertida: sugiere trombosis de la vena renal (hallazgo crítico)');
  if (vAr != null) {
    const tras = vAr >= 250 || (vAr >= 200 && (ratio == null || ratio >= 1.8)) || (ratio != null && ratio >= 3);
    parts.push(`VPS en la anastomosis ${vAr} cm/s${ratio ? `, relación AR/AI ${ratio}` : ''}${tras ? ': sugiere estenosis de la arteria del injerto' : ''}`);
  }
  if (vAt != null) parts.push(`tiempo de aceleración ${vAt} s${vAt > 0.1 ? ' (parvus tardus: estenosis proximal)' : vAt > 0.07 ? ' (limítrofe)' : ''}`);
  if (vRi != null) parts.push(`IR ${vRi}${vRi >= 0.8 ? ' (elevado, inespecífico: rechazo, necrosis tubular, obstrucción o compresión)' : vRi < 0.5 ? ' (bajo)' : ' (normal)'}`);
  // Change against the latest prior with values
  const last = priors.find(p => p.values);
  const lv: Record<string, number> = last?.values || {};
  const trend: string[] = [];
  if (vRi != null && lv.riMedian) trend.push(`IR ${lv.riMedian} → ${vRi}`);
  if (vAr != null && lv.psvAnastomosis) trend.push(`VPS anastomótica ${lv.psvAnastomosis} → ${vAr} cm/s`);
  if (vVol && lv.graftVolumeMl) trend.push(`volumen ${lv.graftVolumeMl} → ${vVol} ml`);
  const text = parts.length
    ? `Doppler del injerto renal: ${parts.join('; ')}.${trend.length ? ` Comparado con ${fmtDate(last?.date)}: ${trend.join(', ')}.` : ''}`
    : null;
  const history = priors.filter(p => p.values);

  return (
    <div className="mb-4 border-b border-white/10 pb-3">
      <div id="pixos-graft" className={title}>Injerto renal</div>
      {history.length ? (
        <table className="mb-2 w-full text-[12px]">
          <thead><tr className="text-white/60"><td>Fecha</td>{GRAFT_LABELS.map(([, l]) => <td key={l}>{l}</td>)}</tr></thead>
          <tbody>
            {history.map(p => (
              <tr key={p.objectId}><td>{fmtDate(p.date)}</td>
                {GRAFT_LABELS.map(([k, , u]) => <td key={k}>{p.values[k] ?? '—'}{p.values[k] != null && u ? ` ${u}` : ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className={muted}>Sin valores Doppler en informes previos del injerto.</div>}
      <div className="text-[12px]">
        Volumen <input className={input} value={vol} onChange={e => setVol(e.target.value)} /> ml
        <button className={`ml-1 ${btn}`} onClick={volumeFromLengths}>De 3 longitudes</button>
      </div>
      <div className="mt-1 text-[12px]">
        IR <input className={input} value={ri} onChange={e => setRi(e.target.value)} />
        · VPS anast. <input className={input} value={ar} onChange={e => setAr(e.target.value)} />
        · VPS iliaca <input className={input} value={ai} onChange={e => setAi(e.target.value)} /> cm/s
      </div>
      <div className="mt-1 text-[12px]">
        T. aceleración <input className={input} value={at} onChange={e => setAt(e.target.value)} /> s
        · vena{' '}
        <select className="rounded border border-white/20 bg-black px-1 text-[12px]" value={venous} onChange={e => setVenous(e.target.value)}>
          <option value="normal">permeable</option><option value="ausente">sin flujo / diástole invertida</option>
        </select>
      </div>
      <div className={muted}>Estenosis: VPS &gt; 200–250 cm/s con relación AR/AI &gt; 1.8–3 o parvus tardus (TA &gt; 0.07–0.1 s). IR ≥ 0.80 es inespecífico.</div>
      {text && <div className="mt-1 text-[12px]">{text} {canSave && (
        <button className={btn} onClick={() => send(studyUID, 'Injerto renal', text).then(() => setMsg('Enviado al informe.')).catch(e => setMsg(e?.message || String(e)))}>Al informe</button>
      )}</div>}
      {msg && <div className={`mt-1 ${muted}`}>{msg}</div>}
    </div>
  );
}
