import React, { useEffect, useState } from 'react';
import { ColourMode, download3D, setStructureVisible, setVolumeMode, styleSurfaces, VolumeMode } from './aiSurfaces';

export type AI3DView = { viewportId: string; segmentationId: string; seriesInstanceUID: string; title: string; modality: string };

const btn = 'rounded border border-white/20 px-2 py-0.5 text-[11px] text-white hover:bg-white/10';
const on = 'rounded border border-primary bg-primary/60 px-2 py-0.5 text-[11px] text-white';

/**
 * Controls of the AI surfaces shown in OHIF's 3D viewport: colouring (distinct per structure or realistic), opacity,
 * which structures are shown, the volume rendering behind them and a PNG. Visibility is the segmentation's own state,
 * so the Segmentation panel and this list agree.
 */
export default function AI3DControls({ servicesManager, view }: { servicesManager: any; view: AI3DView }) {
  const { segmentationService } = servicesManager.services;
  const [colours, setColours] = useState<ColourMode>('distintivo');
  const [opacity, setOpacity] = useState(1);
  const [volume, setVolume] = useState<VolumeMode>('oculto');
  const [, setTick] = useState(0);
  const [problem, setProblem] = useState('');

  // Look of the surfaces; again when they are re-created (visibility from the Segmentation panel re-renders them)
  useEffect(() => {
    styleSurfaces(servicesManager, view.viewportId, view.segmentationId, colours, opacity);
    const sub = segmentationService.subscribe(segmentationService.EVENTS.SEGMENTATION_REPRESENTATION_MODIFIED, () => {
      styleSurfaces(servicesManager, view.viewportId, view.segmentationId, colours, opacity);
      setTick(t => t + 1);
    });
    return () => sub.unsubscribe();
  }, [servicesManager, segmentationService, view, colours, opacity]);

  useEffect(() => {
    setVolumeMode(servicesManager, view.viewportId, volume);
  }, [servicesManager, view, volume]);

  const segments: Record<string, any> = segmentationService.getSegmentation(view.segmentationId)?.segments || {};
  const representation = segmentationService
    .getSegmentationRepresentations(view.viewportId, { segmentationId: view.segmentationId })
    ?.find((r: any) => r.type === 'Surface');
  const visible = (index: number) => representation?.segments?.[index]?.visible !== false;
  const indices = Object.keys(segments).map(Number).filter(i => segments[i]);
  const all = (show: boolean) => indices.forEach(i => setStructureVisible(servicesManager, view.viewportId, view.segmentationId, i, show));
  const presets: Array<[VolumeMode, string]> = view.modality === 'MR'
    ? [['oculto', 'Oculto'], ['MR-Default', 'RM'], ['MR-Angio', 'Angio RM']]
    : [['oculto', 'Oculto'], ['CT-Bones', 'Hueso'], ['CT-AAA', 'Vasos'], ['CT-Lung', 'Pulmón'], ['CT-Soft-Tissue', 'Tejido blando']];

  return (
    <div className="mt-2 rounded border border-white/10 p-2 text-[11px]">
      <div className="mb-1 font-semibold text-white/80">Vista 3D · {view.title}</div>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="text-white/60">Color:</span>
        <button className={colours === 'distintivo' ? on : btn} onClick={() => setColours('distintivo')}>Distintivo</button>
        <button className={colours === 'realista' ? on : btn} onClick={() => setColours('realista')}>Realista</button>
      </div>
      <label className="mb-1 flex items-center gap-2">
        <span className="text-white/60">Opacidad</span>
        <input className="min-w-0 flex-1" type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} />
      </label>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="text-white/60">Volumen:</span>
        {presets.map(([mode, label]) => (
          <button key={mode} className={volume === mode ? on : btn} onClick={() => setVolume(mode)}>{label}</button>
        ))}
      </div>
      <div className="mb-1 flex flex-wrap gap-1">
        <button className={btn} onClick={() => all(true)}>Todas</button>
        <button className={btn} onClick={() => all(false)}>Ninguna</button>
        <button className={btn} onClick={() => setProblem(download3D(servicesManager, view.viewportId, view.title) || '')}>Descargar PNG</button>
      </div>
      {problem && <div className="text-red-300">{problem}</div>}
      <div className="ohif-scrollbar max-h-48 overflow-y-auto">
        {indices.map(i => (
          <label key={i} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={visible(i)} onChange={e => setStructureVisible(servicesManager, view.viewportId, view.segmentationId, i, e.target.checked)} />
            <span>{segments[i].label}</span>
          </label>
        ))}
      </div>
      <div className="mt-1 text-white/50">
        Arrastre para rotar (herramientas de OHIF: zoom, mover, rotar). Clic en una superficie lleva el MPR a ese punto: mida ahí con Longitud o Ángulo.
      </div>
    </div>
  );
}
