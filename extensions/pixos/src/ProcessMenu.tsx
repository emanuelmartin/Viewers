import React, { ReactNode, useEffect, useState } from 'react';
import { useSystem } from '@ohif/core';
import {
  Icons,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@ohif/ui-next';
import {
  COLORMAPS,
  PROJECTIONS,
  RECONSTRUCTIONS,
  SHARPENING,
  SMOOTHING,
  THICKNESSES,
  currentColormap,
  currentFilters,
  currentProjection,
  project,
  resetProcessing,
  setColormap,
  setFilter,
} from './processing';

type Props = { id?: string; disabled?: boolean };

function Seg<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { label: string; value: T; hint?: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="px-seg">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          title={o.hint}
          className="px-seg-item"
          data-active={o.value === value || undefined}
          onClick={() => onPick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
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

/** «Procesar» in the header: projections, filters, colour and reconstructions, like a reading workstation. */
export default function ProcessMenu({ id = 'pixosProcess', disabled }: Props): ReactNode {
  const { servicesManager, commandsManager } = useSystem();
  const { uiNotificationService, viewportGridService } = servicesManager.services;
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(true);
  const [proj, setProj] = useState({ blend: 0, thickness: 10 });
  const [filters, setFilters] = useState({ smoothing: 0, sharpening: 0 });
  const [cmap, setCmap] = useState('Grayscale');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setProj(currentProjection(servicesManager));
    setFilters(currentFilters(servicesManager));
    setCmap(currentColormap(servicesManager));
  };

  useEffect(() => {
    if (open) {
      refresh();
    }
    const { unsubscribe } = viewportGridService.subscribe(
      viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
      () => open && refresh()
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const warn = (message: string | null) => {
    if (message) {
      uiNotificationService.show({ title: 'Procesar', message, type: 'warning', duration: 4000 });
    }
  };

  const pickProjection = async (blend: number, thickness = proj.thickness) => {
    setProj({ blend, thickness });
    setBusy(true);
    try {
      warn(await project(servicesManager, commandsManager, blend, thickness));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              id={id}
              data-cy={id}
              disabled={disabled}
              aria-label="Procesar imagen"
              className="px-proc-trigger inline-flex h-10 items-center justify-center gap-1 !rounded-lg px-2"
              data-active={open || proj.blend !== 0 || filters.smoothing > 0 || filters.sharpening > 0 || cmap !== 'Grayscale' || undefined}
            >
              <Icons.ByName name="tool-fusion-color" className="h-7 w-7" />
              <span className="px-proc-trigger-label">Procesar</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">MIP, filtros, color y reconstrucciones</TooltipContent>
      </Tooltip>
      <PopoverContent className="px-proc w-[340px] p-0" side="bottom" align="start" sideOffset={8}>
        <div className="px-proc-head">
          <span>Procesar imagen</span>
          <button type="button" className="px-link" onClick={() => { resetProcessing(servicesManager); refresh(); }}>
            Volver al original
          </button>
        </div>

        <Section title="Proyección" aside={busy ? <span className="px-proc-note">Reconstruyendo…</span> : null}>
          <div className="px-proc-grid4">
            {PROJECTIONS.map(p => (
              <button
                key={p.id}
                type="button"
                className="px-tile"
                title={p.hint}
                data-active={proj.blend === p.blend || undefined}
                onClick={() => pickProjection(p.blend)}
              >
                <strong>{p.label}</strong>
              </button>
            ))}
          </div>
          <div className="px-proc-row">
            <span>Grosor</span>
            <Seg
              options={THICKNESSES.map(t => ({ label: `${t} mm`, value: t }))}
              value={proj.thickness}
              onPick={t => pickProjection(proj.blend || 1, t)}
            />
          </div>
          <p className="px-proc-note">
            {PROJECTIONS.find(p => p.blend === proj.blend)?.hint}. Se aplica a los tres planos.
          </p>
        </Section>

        <Section
          title="Filtros"
          aside={
            <label className="px-proc-note flex items-center gap-1">
              <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
              Todas las vistas
            </label>
          }
        >
          <div className="px-proc-row">
            <span>Suavizar</span>
            <Seg
              options={SMOOTHING}
              value={filters.smoothing}
              onPick={v => {
                setFilters(f => ({ ...f, smoothing: v }));
                warn(setFilter(servicesManager, 'smoothing', v, all));
              }}
            />
          </div>
          <div className="px-proc-row">
            <span>Bordes</span>
            <Seg
              options={SHARPENING}
              value={filters.sharpening}
              onPick={v => {
                setFilters(f => ({ ...f, sharpening: v }));
                warn(setFilter(servicesManager, 'sharpening', v, all));
              }}
            />
          </div>
        </Section>

        <Section title="Color" aside={<span className="px-proc-note">Vista activa</span>}>
          <div className="px-proc-colors">
            {COLORMAPS.map(c => (
              <button
                key={c.name}
                type="button"
                className="px-swatch"
                data-active={cmap === c.name || undefined}
                onClick={() => {
                  setCmap(c.name);
                  warn(setColormap(servicesManager, c.name));
                }}
              >
                <i style={{ background: c.css }} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Reconstrucción">
          <div className="px-proc-grid3">
            {RECONSTRUCTIONS.map(r => (
              <button
                key={r.id}
                type="button"
                className="px-tile"
                title={r.hint}
                onClick={() => {
                  commandsManager.runCommand('setHangingProtocol', { protocolId: r.id });
                  setOpen(false);
                }}
              >
                <strong>{r.label}</strong>
              </button>
            ))}
          </div>
        </Section>
      </PopoverContent>
    </Popover>
  );
}
