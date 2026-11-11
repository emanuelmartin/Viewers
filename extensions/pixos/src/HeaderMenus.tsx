import React, { ReactNode, useState } from 'react';
import { useSystem } from '@ohif/core';
import { Icons, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@ohif/ui-next';
import { open3D, PRESETS, setPreset, view3D } from './recon3d';
import { activeModality } from './modalityBar';

const RECONSTRUCT_PANEL = '@ohif/extension-pixos.panelModule.reconstruct';

/** An icon in the header that opens a menu, styled like the toolbar's own buttons. */
function HeaderPopover({
  id,
  icon,
  tooltip,
  active,
  width = 260,
  children,
}: {
  id: string;
  icon: string;
  tooltip: string;
  active?: boolean;
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              id={id}
              data-cy={`${id}-btn`}
              aria-label={tooltip}
              className="px-proc-trigger inline-flex h-10 w-10 items-center justify-center !rounded-lg"
              data-active={open || active || undefined}
            >
              <Icons.ByName name={icon} className="h-7 w-7" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
      <PopoverContent className="px-proc p-0" style={{ width }} side="bottom" align="start" sideOffset={8}>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

const CT_WINDOWS = [
  { label: 'Cerebro', w: 80, c: 40 },
  { label: 'Subdural', w: 200, c: 75 },
  { label: 'Ictus', w: 40, c: 35 },
  { label: 'Pulmón', w: 1500, c: -600 },
  { label: 'Mediastino', w: 350, c: 50 },
  { label: 'Abdomen', w: 400, c: 40 },
  { label: 'Hígado', w: 150, c: 60 },
  { label: 'Hueso', w: 2000, c: 500 },
  { label: 'Angio', w: 600, c: 170 },
  { label: 'Oído / senos', w: 4000, c: 400 },
];

/** CT windows, one click each; with the 3D view active they go on the 2D planes. */
export function WindowsMenu(): ReactNode {
  const { servicesManager } = useSystem();
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const apply = (w: number, c: number) => {
    const active: any = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
    const list: any[] =
      active && active.type !== 'volume3d'
        ? [active]
        : [...viewportGridService.getState().viewports.keys()]
            .map(id => cornerstoneViewportService.getCornerstoneViewport(id))
            .filter((vp: any) => vp && vp.type !== 'volume3d');
    for (const vp of list) {
      vp.setProperties({ voiRange: { lower: c - w / 2, upper: c + w / 2 } });
      vp.render();
    }
  };
  return (
    <HeaderPopover id="pxWindows" icon="tool-window-level" tooltip="Ventanas de TC" width={250}>
      {close => (
        <>
          <div className="px-proc-head">
            <span>Ventanas</span>
          </div>
          <div className="px-proc-section">
            <div className="px-proc-grid3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              {CT_WINDOWS.map(x => (
                <button
                  key={x.label}
                  type="button"
                  className="px-tile px-tile-2"
                  onClick={() => {
                    apply(x.w, x.c);
                    close();
                  }}
                >
                  <strong>{x.label}</strong>
                  <small>
                    {x.w} / {x.c}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </HeaderPopover>
  );
}

/** «3D»: opens the reconstruction (with the «Reconstruir» inspector on the side) straight in a chosen look. */
export function Menu3D(): ReactNode {
  const { servicesManager, commandsManager } = useSystem();
  const { panelService } = servicesManager.services;
  const [busy, setBusy] = useState(false);
  const modality = activeModality(servicesManager);
  const presets = (PRESETS[modality] || PRESETS.CT).slice(0, 6);

  const go = async (only: boolean, preset?: string) => {
    setBusy(true);
    try {
      const vp = (!only && view3D(servicesManager)) || (await open3D(commandsManager, servicesManager, only));
      if (vp && preset) setPreset(vp, preset);
      panelService.activatePanel?.(RECONSTRUCT_PANEL, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <HeaderPopover id="px3d" icon="tool-3d-rotate" tooltip="Reconstrucción 3D" width={290}>
      {close => (
        <>
          <div className="px-proc-head">
            <span>Reconstrucción 3D</span>
            {busy && <span className="px-proc-note">Preparando…</span>}
          </div>
          <div className="px-proc-section">
            <div className="px-proc-grid3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <button type="button" className="px-tile" onClick={() => { close(); go(false); }}>
                <strong>MPR + 3D</strong>
              </button>
              <button type="button" className="px-tile" onClick={() => { close(); go(true); }}>
                <strong>Solo 3D</strong>
              </button>
            </div>
          </div>
          <div className="px-proc-section">
            <header>
              <h4>Abrir en 3D como</h4>
            </header>
            <div className="px-preset-grid">
              {presets.map(p => (
                <button key={p.id} type="button" className="px-preset" title={p.hint} onClick={() => { close(); go(false, p.id); }}>
                  <i style={{ background: p.css }} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="px-link"
              style={{ marginTop: 10 }}
              onClick={() => {
                close();
                panelService.activatePanel?.(RECONSTRUCT_PANEL, true);
              }}
            >
              Umbral, recorte, volumetría y más →
            </button>
          </div>
        </>
      )}
    </HeaderPopover>
  );
}
