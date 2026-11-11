/**
 * Menus of the modality group in the top bar:
 * - «Volumen de lesión» (CT, MR, PET): click a lesion, it grows in 3D and is measured (mL, axes, density / SUV).
 * - «Vértebras» (CT, MR, X-ray): each arrow placed gets the next vertebra's name (C1…S1, up or down).
 * - «Cálculos» (US): obstetric biometry with Hadlock gestational age and fetal weight, and Teichholz ejection fraction.
 */
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { useSystem } from '@ohif/core';
import { HeaderPopover } from './HeaderMenus';
import { activeModality } from './modalityBar';
import { describe, ensureVolume, LesionResult, measureLesion, pickPoint } from './lesionVolume';
import { readMeasurements } from './tools';
import { compositeGA, diskVolume, efRange, gaVariability, hadlockEFW, hadlockGA, lvDisks, weeksText } from './clinicalCalc';

const TOOL_GROUPS = ['default', 'mpr', 'SRToolGroup', 'volume3d'];

const copy = (text: string) => {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    // no clipboard: the text is on screen
  }
};

// ── lesion volume ───────────────────────────────────────────────────────────

const LESION_TOL: Record<string, { label: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string }> = {
  CT: { label: 'Tolerancia', min: 10, max: 200, step: 5, def: 50, fmt: v => `± ${v} UH` },
  MR: { label: 'Tolerancia', min: 5, max: 60, step: 1, def: 20, fmt: v => `± ${v} %` },
  PT: { label: 'Umbral', min: 20, max: 70, step: 1, def: 41, fmt: v => `${v} % del SUV máx` },
};

const lesionResults: LesionResult[] = [];

export function LesionMenu(): ReactNode {
  const { servicesManager, commandsManager } = useSystem();
  const modality = activeModality(servicesManager);
  const key = modality === 'NM' ? 'PT' : LESION_TOL[modality] ? modality : 'CT';
  const cfg = LESION_TOL[key];
  const [tol, setTol] = useState(cfg.def);
  const [state, setState] = useState<'idle' | 'loading' | 'picking' | 'growing'>('idle');
  const [msg, setMsg] = useState('');
  const [list, setList] = useState<LesionResult[]>(() => [...lesionResults]);
  const cancelRef = useRef<() => void>();

  useEffect(() => setTol(cfg.def), [key]);
  useEffect(() => () => cancelRef.current?.(), []);

  const start = async () => {
    setMsg('');
    setState('loading');
    const ok = await ensureVolume(servicesManager, commandsManager);
    if (!ok) {
      setState('idle');
      setMsg('Esta serie no forma un volumen (necesita cortes continuos).');
      return;
    }
    setState('picking');
    const p = pickPoint(servicesManager);
    cancelRef.current = p.cancel;
    const pick = await p.promise;
    cancelRef.current = undefined;
    if (!pick) {
      setState('idle');
      return;
    }
    setState('growing');
    await new Promise(r => setTimeout(r, 30));
    const mode =
      key === 'PT'
        ? ({ kind: 'pet', frac: tol / 100 } as const)
        : key === 'MR'
          ? ({ kind: 'rel', frac: tol / 100 } as const)
          : ({ kind: 'abs', tol } as const);
    try {
      const r = await measureLesion(servicesManager, commandsManager, pick, mode, key);
      if (typeof r === 'string') {
        setMsg(r);
      } else {
        lesionResults.push(r);
        setList([...lesionResults]);
        if (r.unit === 'SUV' && r.max < 2.5) {
          setMsg(`Captación baja (SUV máx ${r.max.toFixed(1)}): puede no ser una lesión. Haz clic más cerca del foco.`);
        } else if (r.note) {
          setMsg(r.unit === 'SUV' ? r.note : `Se ${r.note} para no desbordarse al tejido vecino.`);
        }
      }
    } catch (e) {
      setMsg('No se pudo medir: ' + ((e as Error)?.message || e));
    }
    setState('idle');
  };

  return (
    <HeaderPopover id="pxLesion" icon="tool-seg-brush" tooltip="Volumen de lesión" width={300} active={state === 'picking'}>
      {() => (
        <>
          <div className="px-proc-head">
            <span>Volumen de lesión</span>
            {state === 'loading' && <span className="px-proc-note">Abriendo volumen…</span>}
            {state === 'growing' && <span className="px-proc-note">Midiendo…</span>}
          </div>
          <div className="px-proc-section">
            <p className="px-proc-note">
              Haz clic dentro de la lesión en cualquier plano. Crece en 3D sobre el tejido parecido y queda pintada en la
              segmentación «Lesiones». Es un apoyo: revisa el contorno pintado antes de reportar.
            </p>
            {key === 'PT' ? (
              <div className="px-range">
                <span>Umbral (EANM 2015)</span>
                <div className="px-seg">
                  {[41, 50].map(v => (
                    <button key={v} type="button" className="px-seg-item" data-active={tol === v || undefined} onClick={() => setTol(v)}>
                      VOI{v} · {v} % del SUV máx
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label className="px-range">
                <span>
                  {cfg.label} <b>{cfg.fmt(tol)}</b>
                </span>
                <input className="px-slider" type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={tol} onChange={e => setTol(+e.target.value)} />
              </label>
            )}
            {state === 'picking' ? (
              <button type="button" className="px-tile" style={{ width: '100%' }} onClick={() => cancelRef.current?.()}>
                <strong>Esperando clic… (cancelar)</strong>
              </button>
            ) : (
              <button type="button" className="px-tile px-tile-primary" style={{ width: '100%' }} disabled={state !== 'idle'} onClick={start}>
                <strong>Elegir lesión</strong>
              </button>
            )}
            {msg && <p className="px-proc-warn">{msg}</p>}
          </div>
          {list.length > 0 && (
            <div className="px-proc-section">
              <header>
                <h4>Resultados</h4>
                <button type="button" className="px-link" onClick={() => copy(list.map(describe).join('\n'))}>
                  Copiar
                </button>
              </header>
              <ul className="px-result-list">
                {list.map(r => (
                  <li key={r.index}>{describe(r)}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </HeaderPopover>
  );
}

// ── vertebra labels ─────────────────────────────────────────────────────────

export const VERTEBRAE = [
  ...Array.from({ length: 7 }, (_, i) => `C${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `L${i + 1}`),
  'S1',
];

/** The label after `current` going down (towards the sacrum) or up; null past the ends. */
export function nextVertebra(current: string, down: boolean): string | null {
  const i = VERTEBRAE.indexOf(current);
  const j = i + (down ? 1 : -1);
  return i < 0 || j < 0 || j >= VERTEBRAE.length ? null : VERTEBRAE[j];
}

type SpineState = { next: string | null; down: boolean; saved: Map<any, any> } | null;
let spine: SpineState = null;
const spineListeners = new Set<() => void>();
const notifySpine = () => spineListeners.forEach(f => f());

function arrowTools(servicesManager): any[] {
  const { toolGroupService } = servicesManager.services;
  return TOOL_GROUPS.map(id => toolGroupService.getToolGroup(id))
    .map(g => g?.getToolInstance?.('ArrowAnnotate'))
    .filter(Boolean);
}

function startSpine(servicesManager, commandsManager, first: string, down: boolean) {
  stopSpine(servicesManager);
  const saved = new Map();
  spine = { next: first, down, saved };
  for (const tool of arrowTools(servicesManager)) {
    saved.set(tool, tool.configuration.getTextCallback);
    tool.configuration.getTextCallback = (callback: (t: string) => void, ...rest: any[]) => {
      if (!spine?.next) {
        // Past S1 / C1: ask as usual
        return saved.get(tool)?.(callback, ...rest);
      }
      const label = spine.next;
      spine.next = nextVertebra(label, spine.down);
      notifySpine();
      callback(label);
    };
  }
  commandsManager.runCommand('setToolActiveToolbar', { toolName: 'ArrowAnnotate', toolGroupIds: TOOL_GROUPS });
  notifySpine();
}

function stopSpine(servicesManager) {
  if (!spine) return;
  for (const [tool, cb] of spine.saved) {
    tool.configuration.getTextCallback = cb;
  }
  spine = null;
  notifySpine();
}

export function SpineMenu(): ReactNode {
  const { servicesManager, commandsManager } = useSystem();
  const [, force] = useState(0);
  const [first, setFirst] = useState('L1');
  const [down, setDown] = useState(true);
  useEffect(() => {
    const f = () => force(x => x + 1);
    spineListeners.add(f);
    return () => {
      spineListeners.delete(f);
    };
  }, []);
  const starts = ['C1', 'C2', 'C7', 'T1', 'T12', 'L1', 'L5', 'S1'];
  return (
    <HeaderPopover id="pxSpine" icon="tool-annotate" tooltip="Etiquetar vértebras" width={280} active={!!spine}>
      {close => (
        <>
          <div className="px-proc-head">
            <span>Vértebras</span>
            {spine && <span className="px-proc-note">Siguiente: {spine.next || '—'}</span>}
          </div>
          <div className="px-proc-section">
            <p className="px-proc-note">Elige la primera y coloca una flecha en cada vértebra: el nombre se pone solo.</p>
            <header style={{ margin: '12px 0 6px' }}>
              <h4>Empezar en</h4>
            </header>
            <div className="px-chips">
              {starts.map(v => (
                <button key={v} type="button" className="px-seg-item" data-active={first === v || undefined} onClick={() => setFirst(v)}>
                  {v}
                </button>
              ))}
            </div>
            <div className="px-seg" style={{ marginTop: 10 }}>
              <button type="button" className="px-seg-item" data-active={down || undefined} onClick={() => setDown(true)}>
                Hacia abajo ↓
              </button>
              <button type="button" className="px-seg-item" data-active={!down || undefined} onClick={() => setDown(false)}>
                Hacia arriba ↑
              </button>
            </div>
            <div className="px-proc-grid3" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginTop: 10 }}>
              <button
                type="button"
                className="px-tile px-tile-primary"
                onClick={() => {
                  startSpine(servicesManager, commandsManager, first, down);
                  close();
                }}
              >
                <strong>{spine ? 'Reiniciar' : 'Empezar'}</strong>
              </button>
              <button type="button" className="px-tile" disabled={!spine} onClick={() => stopSpine(servicesManager)}>
                <strong>Terminar</strong>
              </button>
            </div>
          </div>
        </>
      )}
    </HeaderPopover>
  );
}

// ── ultrasound calculations ─────────────────────────────────────────────────
// Formulas and sources live in clinicalCalc.ts (Hadlock 1984/1985, ASE/EACVI 2015).

/** Factor to mm from a measurement unit («mm», «cm US Region»…); null for px or unknown units. */
export function toMmFactor(unit: unknown): number | null {
  const u = String(unit || 'mm').trim().toLowerCase();
  if (u.startsWith('mm')) return 1;
  if (u.startsWith('cm')) return 10;
  return null;
}

/** Last linear measurement in mm; for circumferences (CC, CA) the perimeter of the last ellipse/contour. */
function lastLengthMm(servicesManager, perimeter = false): number | null {
  const items = readMeasurements(servicesManager);
  for (let i = items.length - 1; i >= 0; i--) {
    const v = items[i].values;
    const p = perimeter && typeof v.perimeter === 'number' ? v.perimeter : null;
    const value = p ?? (typeof v.length === 'number' ? v.length : null);
    const f = toMmFactor(p !== null ? (v.areaUnit ? String(v.areaUnit).replace(/[²2]/, '') : v.unit) : v.unit);
    if (value !== null && f) return value * f;
  }
  return null;
}

const CONTOUR_TOOLS = ['PlanarFreehandROI', 'SplineROI', 'LivewireContour'];

/**
 * Last traced contour as disks for the method of disks. The trace's world coordinates are scaled to mm with the area
 * the tool reports in calibrated units (so ultrasound regions in cm work as well as pixel spacing in mm).
 */
function lastTrace(servicesManager): { L: number; diameters: number[] } | string {
  const { measurementService } = servicesManager.services;
  const list: any[] = (measurementService.getMeasurements() || []).filter((m: any) => CONTOUR_TOOLS.includes(m.toolName));
  const m = list[list.length - 1];
  if (!m) return 'Primero traza el borde del ventrículo con «Contorno libre» o «Spline».';
  const pts: number[][] = m.points || [];
  const stats: any = Object.values(m.data || {})[0] || {};
  const f = toMmFactor(String(stats.areaUnit || '').replace(/[²2]/, ''));
  if (!pts.length || typeof stats.area !== 'number' || !f) return 'El trazo no tiene escala calibrada (mm o cm).';
  // Area of the trace in its own coordinates (Newell), to get the scale to mm
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  const own = Math.hypot(...n) / 2;
  const scale = Math.sqrt((stats.area * f * f) / own);
  const d = lvDisks(pts, scale);
  return d || 'El trazo es demasiado corto.';
}

function Field({ label, value, onChange, onTake }: { label: string; value: string; onChange: (v: string) => void; onTake: () => void }) {
  return (
    <label className="px-calc-field">
      <span>{label}</span>
      <input inputMode="decimal" value={value} placeholder="mm" onChange={e => onChange(e.target.value)} />
      <button type="button" className="px-link" title="Usar la última medida" onClick={onTake}>
        ← medida
      </button>
    </label>
  );
}

type Disks = { L: number; diameters: number[] };

function TraceField({ label, value, onTake }: { label: string; value?: Disks | null; onTake: () => void }) {
  return (
    <div className="px-calc-field">
      <span>{label}</span>
      <em className="px-proc-note" style={{ margin: 0 }}>
        {value ? `L ${value.L.toFixed(0)} mm · ${diskVolume(value).toFixed(0)} mL` : '—'}
      </em>
      <button type="button" className="px-link" title="Usar el último contorno trazado" onClick={onTake}>
        ← trazo
      </button>
    </div>
  );
}

const num = (s: string) => {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
};

export function obstetricText(mm: { bpd?: number | null; hc?: number | null; ac?: number | null; fl?: number | null }): string[] {
  const cm = (v?: number | null) => (v ? v / 10 : null);
  const b = cm(mm.bpd), h = cm(mm.hc), a = cm(mm.ac), f = cm(mm.fl);
  const lines: string[] = [];
  const age = (label: string, value: number | null | undefined, key: 'bpd' | 'hc' | 'ac' | 'fl', x: number | null) => {
    if (!x) return;
    const w = hadlockGA[key](x);
    lines.push(`${label} ${value} mm → ${weeksText(w)} (± ${gaVariability(key, w).toFixed(1)} sem)`);
  };
  age('DBP', mm.bpd, 'bpd', b);
  age('CC', mm.hc, 'hc', h);
  age('CA', mm.ac, 'ac', a);
  age('LF', mm.fl, 'fl', f);
  if (b && h && a && f) {
    const w = compositeGA(b, h, a, f);
    lines.push(`Edad gestacional, Hadlock compuesta: ${weeksText(w)} (± ${gaVariability('all', w).toFixed(1)} sem, ±2 DE)`);
    if (w < 12 || w > 42) lines.push('Fuera del rango validado de Hadlock (12–42 semanas).');
  }
  const efw = hadlockEFW({ bpd: b, hc: h, ac: a, fl: f });
  if (efw) lines.push(`Peso fetal estimado: ${Math.round(efw.grams)} g (${efw.model})`);
  return lines;
}

export function echoText(t: { ed4?: Disks | null; es4?: Disks | null; ed2?: Disks | null; es2?: Disks | null }, lvidd: number | null, lvids: number | null, sex: string): string[] {
  const lines: string[] = [];
  if (t.ed4 && t.es4) {
    const biplane = !!(t.ed2 && t.es2);
    const vd = diskVolume(t.ed4, biplane ? t.ed2 : null);
    const vs = diskVolume(t.es4, biplane ? t.es2 : null);
    const ef = ((vd - vs) / vd) * 100;
    lines.push(`VTD ${vd.toFixed(0)} mL · VTS ${vs.toFixed(0)} mL (discos, ${biplane ? 'biplano' : 'monoplano 4C'})`);
    const range = efRange(sex);
    const verdict = range ? (ef < range[0] ? ' — por debajo de lo normal' : ef > range[1] ? ' — por arriba de lo normal' : ' — normal') : '';
    lines.push(`FEVI ${ef.toFixed(0)} %${range ? ` (normal ${range[0]}–${range[1]} %)` : ''}${verdict}`);
    if (!biplane) lines.push('ASE recomienda biplano: traza también 2 cámaras para mayor exactitud.');
  }
  if (lvidd) lines.push(`DDVI ${lvidd} mm${lvids ? ` · DSVI ${lvids} mm` : ''}`);
  if (lvidd && lvids && lvids < lvidd) {
    lines.push(`Fracción de acortamiento ${(((lvidd - lvids) / lvidd) * 100).toFixed(0)} % (uso desaconsejado por ASE 2015)`);
  }
  return lines;
}

/** Echocardiogram by its descriptions (eco, echo, TTE, ETE…): the calculator opens on ejection fraction. */
function isEcho(servicesManager): boolean {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const uids: string[] =
    viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId())?.displaySetInstanceUIDs || [];
  const text = uids
    .map(uid => displaySetService.getDisplaySetByUID(uid))
    .map((d: any) => `${d?.SeriesDescription || ''} ${d?.StudyDescription || d?.instances?.[0]?.StudyDescription || ''}`)
    .join(' ');
  return /\b(echo|eco|ecocardio\w*|tte|tee|ete|cardiac|card[ií]aco)/i.test(text);
}

function patientSex(servicesManager): string {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const uid = viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId())?.displaySetInstanceUIDs?.[0];
  const ds: any = uid && displaySetService.getDisplaySetByUID(uid);
  return ds?.instances?.[0]?.PatientSex || ds?.instance?.PatientSex || '';
}

export function CalcMenu(): ReactNode {
  const { servicesManager } = useSystem();
  const [tab, setTab] = useState<'ob' | 'echo'>(() => (isEcho(servicesManager) ? 'echo' : 'ob'));
  const [f, setF] = useState<Record<string, string>>({});
  const [traces, setTraces] = useState<Record<string, Disks | null>>({});
  const [msg, setMsg] = useState('');
  const set = (k: string) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const take = (k: string) => () => {
    const v = lastLengthMm(servicesManager, k === 'hc' || k === 'ac');
    if (v) set(k)(String(Math.round(v * 10) / 10));
  };
  const takeTrace = (k: string) => () => {
    const t = lastTrace(servicesManager);
    if (typeof t === 'string') {
      setMsg(t);
    } else {
      setMsg('');
      setTraces(x => ({ ...x, [k]: t }));
    }
  };
  const lines =
    tab === 'ob'
      ? obstetricText({ bpd: num(f.bpd), hc: num(f.hc), ac: num(f.ac), fl: num(f.fl) })
      : echoText(traces, num(f.lvidd), num(f.lvids), patientSex(servicesManager));
  return (
    <HeaderPopover id="pxCalc" icon="tool-calibration" tooltip="Cálculos de ultrasonido" width={330}>
      {() => (
        <>
          <div className="px-proc-head">
            <span>Cálculos</span>
          </div>
          <div className="px-proc-section">
            <div className="px-seg">
              <button type="button" className="px-seg-item" data-active={tab === 'ob' || undefined} onClick={() => setTab('ob')}>
                Obstétrico
              </button>
              <button type="button" className="px-seg-item" data-active={tab === 'echo' || undefined} onClick={() => setTab('echo')}>
                Eco (FEVI)
              </button>
            </div>
            {tab === 'ob' ? (
              <>
                <p className="px-proc-note" style={{ margin: '8px 0' }}>
                  Mide con «Longitud» (CC y CA con elipse) y pulsa «← medida», o escribe el valor en mm. Hadlock 1984/1985.
                </p>
                <Field label="DBP" value={f.bpd || ''} onChange={set('bpd')} onTake={take('bpd')} />
                <Field label="CC" value={f.hc || ''} onChange={set('hc')} onTake={take('hc')} />
                <Field label="CA" value={f.ac || ''} onChange={set('ac')} onTake={take('ac')} />
                <Field label="LF" value={f.fl || ''} onChange={set('fl')} onTake={take('fl')} />
              </>
            ) : (
              <>
                <p className="px-proc-note" style={{ margin: '8px 0' }}>
                  Método de discos (Simpson), ASE/EACVI 2015: traza el borde del VI en diástole y sístole y pulsa «← trazo».
                </p>
                <TraceField label="4C diást." value={traces.ed4} onTake={takeTrace('ed4')} />
                <TraceField label="4C sist." value={traces.es4} onTake={takeTrace('es4')} />
                <TraceField label="2C diást." value={traces.ed2} onTake={takeTrace('ed2')} />
                <TraceField label="2C sist." value={traces.es2} onTake={takeTrace('es2')} />
                <header style={{ margin: '12px 0 4px' }}>
                  <h4>Diámetros (tamaño)</h4>
                </header>
                <Field label="DDVI" value={f.lvidd || ''} onChange={set('lvidd')} onTake={take('lvidd')} />
                <Field label="DSVI" value={f.lvids || ''} onChange={set('lvids')} onTake={take('lvids')} />
              </>
            )}
            {msg && <p className="px-proc-warn">{msg}</p>}
          </div>
          {lines.length > 0 && (
            <div className="px-proc-section">
              <header>
                <h4>Resultado</h4>
                <button type="button" className="px-link" onClick={() => copy(lines.join('\n'))}>
                  Copiar
                </button>
              </header>
              <ul className="px-result-list">
                {lines.map(l => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </HeaderPopover>
  );
}
