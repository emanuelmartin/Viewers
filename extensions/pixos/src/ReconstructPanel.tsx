import React, { ReactNode, useEffect, useState } from 'react';
import {
  Box,
  DENSITY_RANGES,
  FULL_BOX,
  LIGHTING,
  PRESETS,
  QUALITY,
  VIEWS,
  currentPreset,
  exportPng,
  measureVolume,
  open3D,
  setCrop,
  setLighting,
  setPreset,
  setQuality,
  setThreshold,
  setView,
  spin,
  spinning,
  view3D,
  seriesContrast,
  presetBlocked,
  NEEDS_CONTRAST,
  CONTRAST_UNKNOWN_NOTE,
} from './recon3d';
import { getAccess, subscribeAccess } from './ris';
import { activeModality } from './modalityBar';

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-proc-section">
      <header>
        <h4>{title}</h4>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Seg<T extends string | number>({ options, value, onPick }: { options: { label: string; value: T }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="px-seg">
      {options.map(o => (
        <button key={String(o.value)} type="button" className="px-seg-item" data-active={o.value === value || undefined} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, onChange }: { label: string; value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <div className="px-crop-row">
      <span>{label}</span>
      <input type="range" min={0} max={100} value={value[0]} onChange={e => onChange([Math.min(Number(e.target.value), value[1] - 2), value[1]])} />
      <input type="range" min={0} max={100} value={value[1]} onChange={e => onChange([value[0], Math.max(Number(e.target.value), value[0] + 2)])} />
    </div>
  );
}

/** «Reconstruir»: 3D volume rendering, volumetry and the tools of the modality on screen. */
export default function ReconstructPanel({ servicesManager, commandsManager }: any): ReactNode {
  const { uiNotificationService, viewportGridService, cornerstoneViewportService, displaySetService } = servicesManager.services;
  const [modality, setModality] = useState(() => activeModality(servicesManager));
  const [vp, setVp] = useState<any>(() => view3D(servicesManager));
  const [busy, setBusy] = useState(false);
  const [preset, setPresetState] = useState<string | null>(null);
  const [threshold, setThresholdState] = useState(0);
  const [quality, setQualityState] = useState(2);
  const [light, setLight] = useState('normal');
  const [turning, setTurning] = useState(spinning());
  const [box, setBox] = useState<Box>(FULL_BOX);
  const [range, setRange] = useState({ lower: 300, upper: 3000 });
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const m = activeModality(servicesManager);
      if (m && m !== 'SEG') setModality(m);
      const v = view3D(servicesManager);
      setVp(v);
      if (v) setPresetState(currentPreset(v));
    };
    refresh();
    const subs = [
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, refresh),
      viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, refresh),
      cornerstoneViewportService.subscribe(cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED, refresh),
      displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, refresh),
    ];
    return () => subs.forEach(s => s.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => spin(null, false), []);
  // A result belongs to the crop and range it was measured with
  useEffect(() => setResult(null), [box, range]);

  const warn = (message: string | null) => {
    if (message) uiNotificationService.show({ title: 'Reconstruir', message, type: 'warning', duration: 4000 });
  };

  const ensure3D = async (only = false) => {
    let v = view3D(servicesManager);
    if (v && !only) return v;
    setBusy(true);
    try {
      v = await open3D(commandsManager, servicesManager, only);
    } finally {
      setBusy(false);
    }
    if (!v) warn('Esta serie no se puede reconstruir en 3D (necesita cortes de un volumen)');
    setVp(v);
    return v;
  };

  const [physician, setPhysician] = useState(getAccess().physician);
  useEffect(() => subscribeAccess(a => setPhysician(a.physician)), []);
  if (!physician) {
    return (
      <div className="px-recon">
        <p className="px-proc-note" style={{ padding: 16 }}>La reconstrucción 3D y la volumetría están disponibles para los médicos de pixOS.</p>
      </div>
    );
  }

  if (modality && !['CT', 'MR', 'PT', 'NM'].includes(modality)) {
    return (
      <div className="px-recon">
        <p className="px-proc-note" style={{ padding: 16 }}>
          Esta imagen es plana ({modality}): no tiene un volumen que reconstruir. La reconstrucción 3D y la volumetría
          aparecen al abrir una tomografía, resonancia o PET.
        </p>
      </div>
    );
  }

  const presets = PRESETS[modality] || PRESETS.CT;
  const contrast = modality === 'CT' ? seriesContrast(servicesManager) : 'desconocido';
  const has3D = !!vp;
  const isCT = modality === 'CT';

  return (
    <div className="px-recon">
      <Section title="Reconstrucción 3D" aside={busy ? <span className="px-proc-note">Preparando volumen…</span> : null}>
        <div className="px-proc-grid3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
          <button type="button" className="px-tile" onClick={() => ensure3D(false)}>
            <strong>MPR + 3D</strong>
          </button>
          <button type="button" className="px-tile" onClick={() => ensure3D(true)}>
            <strong>Solo 3D</strong>
          </button>
        </div>
        {!has3D && <p className="px-proc-note">Abra el 3D para elegir cómo se ve, recortarlo y medir volúmenes.</p>}
      </Section>

      {has3D && (
        <>
          <Section title="Qué mostrar">
            <div className="px-preset-grid">
              {presets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="px-preset"
                  title={presetBlocked(p.id, contrast) || p.hint}
                  disabled={!!presetBlocked(p.id, contrast)}
                  data-active={preset === p.id || undefined}
                  onClick={() => {
                    setPreset(vp, p.id);
                    setPresetState(p.id);
                    setThresholdState(0);
                  }}
                >
                  <i style={{ background: p.css }} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
            {contrast === 'no' && presets.some(p => NEEDS_CONTRAST.has(p.id)) && (
              <p className="px-proc-note">Serie sin contraste: los modos de vasos están apagados (necesitan angio-TC).</p>
            )}
            {contrast === 'desconocido' && preset && NEEDS_CONTRAST.has(preset) && <p className="px-proc-note">{CONTRAST_UNKNOWN_NOTE}</p>}
          </Section>

          <Section title="Ajustar" aside={<button type="button" className="px-link" onClick={() => { setThresholdState(0); setThreshold(vp, 0); }}>Umbral original</button>}>
            <div className="px-proc-row">
              <span>Umbral</span>
              <input
                className="px-slider"
                type="range"
                min={-600}
                max={600}
                step={10}
                value={threshold}
                onChange={e => {
                  const v = Number(e.target.value);
                  setThresholdState(v);
                  setThreshold(vp, v);
                }}
              />
            </div>
            <p className="px-proc-note">A la izquierda muestra más tejido; a la derecha, solo lo más denso ({threshold > 0 ? '+' : ''}{threshold}).</p>
            <div className="px-proc-row">
              <span>Calidad</span>
              <Seg options={QUALITY} value={quality} onPick={q => { setQualityState(q); setQuality(vp, q); }} />
            </div>
            <div className="px-proc-row">
              <span>Luz</span>
              <Seg
                options={LIGHTING.map(l => ({ label: l.label, value: l.id }))}
                value={light}
                onPick={id => { setLight(id); setLighting(vp, LIGHTING.find(l => l.id === id)!.opts); }}
              />
            </div>
          </Section>

          <Section title="Vistas" aside={
            <button type="button" className="px-link" onClick={() => { const on = !turning; setTurning(on); spin(vp, on); }}>
              {turning ? 'Detener giro' : 'Girar'}
            </button>
          }>
            <div className="px-proc-grid3">
              {VIEWS.map(v => (
                <button key={v.id} type="button" className="px-tile" onClick={() => setView(vp, v.normal, v.up)}>
                  <strong>{v.label}</strong>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Recortar" aside={<button type="button" className="px-link" onClick={() => { setBox(FULL_BOX); setCrop(vp, FULL_BOX); }}>Sin recorte</button>}>
            {(['x', 'y', 'z'] as const).map(k => (
              <Range
                key={k}
                label={{ x: 'Der → Izq', y: 'Ant → Post', z: 'Pies → Cabeza' }[k]}
                value={box[k]}
                onChange={v => {
                  const next = { ...box, [k]: v };
                  setBox(next);
                  setCrop(vp, next);
                }}
              />
            ))}
            <p className="px-proc-note">Quita lo que estorba (mesa, brazos, costillas) para ver lo de adentro.</p>
          </Section>

          <Section title="Volumetría" aside={isCT ? <span className="px-proc-note">UH</span> : null}>
            {isCT && (
              <div className="px-chips">
                {DENSITY_RANGES.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className="px-seg-item"
                    data-active={(range.lower === r.lower && range.upper === r.upper) || undefined}
                    onClick={() => setRange({ lower: r.lower, upper: r.upper })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <div className="px-proc-row">
              <span>Entre</span>
              <div className="px-range-inputs">
                <input type="number" value={range.lower} onChange={e => setRange(r => ({ ...r, lower: Number(e.target.value) }))} />
                <span>y</span>
                <input type="number" value={range.upper} onChange={e => setRange(r => ({ ...r, upper: Number(e.target.value) }))} />
              </div>
            </div>
            <button
              type="button"
              className="px-tile px-tile-wide"
              onClick={() => {
                const r = measureVolume(vp, range.lower, range.upper, box);
                if (!r) {
                  warn('El volumen aún no termina de cargar');
                  return;
                }
                setResult(
                  `${r.ml >= 1000 ? `${(r.ml / 1000).toFixed(2)} L` : `${r.ml.toFixed(1)} mL`} · ${r.voxels.toLocaleString('es-MX')} vóxeles · media ${r.meanHU.toFixed(0)}${isCT ? ' UH' : ''}`
                );
              }}
            >
              <strong>Medir volumen</strong>
            </button>
            {result && <p className="px-volume">{result}</p>}
            <p className="px-proc-note">Cuenta lo que está dentro del recorte y del rango. Para un órgano o lesión, recórtelo primero.</p>
          </Section>

          <Section title="Exportar">
            <button type="button" className="px-tile px-tile-wide" onClick={() => exportPng(vp)}>
              <strong>Descargar imagen 3D (PNG)</strong>
            </button>
          </Section>
        </>
      )}

    </div>
  );
}
