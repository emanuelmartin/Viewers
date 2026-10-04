import React, { useEffect, useState } from 'react';
import { callCloud } from './ris';
import { SLABS, applySlab, createSegmentation } from './tools';
import { WORKFLOWS, type Step } from './workflows';

const title = 'mb-1 text-[13px] font-semibold text-white';
const muted = 'text-[12px] text-white/60';
const REGION_LABELS: Record<string, string> = {
  craneo: 'cráneo', cara_senos: 'cara y senos', cuello: 'cuello', torax: 'tórax', corazon: 'corazón', abdomen: 'abdomen',
  pelvis: 'pelvis', columna_cervical: 'col. cervical', columna_dorsal: 'col. dorsal', columna_lumbar: 'col. lumbar',
  hombro: 'hombro', brazo_codo: 'brazo / codo', mano_muneca: 'mano / muñeca', cadera: 'cadera', rodilla: 'rodilla',
  pierna_tobillo_pie: 'pierna / tobillo / pie', mama: 'mama', vascular: 'vascular', cuerpo_completo: 'cuerpo completo', otra: 'otra',
};

type Info = {
  workflowId: string; regions: string[]; studyType: string; contrast: boolean | null; laterality: string | null; source: string;
  reason?: string | null; probableDx?: string[]; dxSource?: string | null; fromReport?: boolean;
  orderReason?: string | null; reasonSource?: string | null; dicomComments?: string[];
};

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function applyWindow(servicesManager, voi: [number, number]): string | null {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportGridService.getActiveViewportId());
  if (!viewport?.setProperties) return 'No hay una vista activa';
  viewport.setProperties({ voiRange: { lower: voi[0], upper: voi[1] } });
  viewport.render();
  return null;
}

/**
 * The study's reporting workflow: tags (region, type; reason and probable
 * diagnoses for AI roles) and the steps for this kind of study, each one a
 * click that sets up the viewer.
 */
function WorkflowSection({ servicesManager, commandsManager, studyUID, ai }: {
  servicesManager: any; commandsManager: any; studyUID: string; ai: boolean;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    callCloud<Info>('getStudyWorkflow', { StudyInstanceUID: studyUID })
      .then(r => alive && setInfo(r))
      .catch(e => alive && setError(e?.message || String(e)));
    return () => { alive = false; };
  }, [studyUID]);

  if (error) return <div className={`mb-4 ${muted}`}>Flujo de trabajo no disponible: {error}</div>;
  if (!info) return <div className={`mb-4 ${muted}`}>Cargando flujo de trabajo…</div>;

  const workflow = WORKFLOWS[info.workflowId] || WORKFLOWS.generic;
  const steps = workflow.steps.filter(s => s.kind !== 'ai' || ai);

  const run = (step: Step, index: number) => {
    let problem: string | null = null;
    let text = '';
    switch (step.kind) {
      case 'window':
        problem = applyWindow(servicesManager, step.voi);
        break;
      case 'layout':
        commandsManager.runCommand('setHangingProtocol', { protocolId: step.protocolId });
        break;
      case 'slab': {
        const slab = SLABS.find(s => s.id === step.slabId);
        problem = slab ? applySlab(servicesManager, slab) : 'Slab desconocido';
        break;
      }
      case 'tool':
        commandsManager.runCommand('setToolActiveToolbar', { toolName: step.toolName });
        text = `${step.label} activa${step.hint ? `: ${step.hint}` : ''}`;
        break;
      case 'segment':
        createSegmentation(servicesManager, commandsManager)
          .then(() => setNote(step.hint || 'Segmentación creada; use el panel de segmentación y «Calcular volúmenes»'))
          .catch(e => setNote(`No se pudo crear la segmentación: ${e?.message || e}`));
        break;
      case 'ai':
        callCloud('viewerRequestAIAnalysis', { StudyInstanceUID: studyUID }).catch(() => {});
        scrollTo('pixos-ai');
        text = `${step.label}: solicitado; el avance aparece en la sección IA`;
        break;
      case 'calc':
        scrollTo('pixos-calc');
        text = `${step.label}: ${step.hint || 'marque las medidas y use la calculadora'}`;
        break;
      case 'guide':
        text = `${step.label}: ${step.hint}`;
        break;
      case 'send':
        scrollTo('pixos-send');
        break;
    }
    setNote(problem || text);
    if (!problem) setDone(d => (d.includes(index) ? d : [...d, index]));
  };

  const regions = (info.regions || []).map(r => REGION_LABELS[r] || r).join(', ');
  return (
    <div className="mb-4 border-b border-white/10 pb-3">
      <div className={title}>Flujo de trabajo: {workflow.title}</div>
      <div className={muted}>
        {regions || 'región sin determinar'} · {info.studyType}{info.contrast ? ' · con contraste' : ''}
        {info.laterality ? ` · ${info.laterality}` : ''} · {info.source === 'ia' ? 'etiquetado por IA' : 'por reglas'}
      </div>
      {info.orderReason && (
        <div className="mt-1 rounded bg-blue-900/40 px-2 py-1 text-[12px]"><b>Motivo (orden):</b> {info.orderReason}</div>
      )}
      {ai && (info.reason || info.probableDx?.length) ? (
        <div className="mt-1 rounded bg-white/5 px-2 py-1 text-[12px]">
          {info.reason && info.reason !== info.orderReason && <div><b>Motivo{info.reasonSource ? ` (${info.reasonSource})` : ''}:</b> {info.reason}</div>}
          {!!info.probableDx?.length && (
            <div><b>Diagnóstico{info.fromReport ? ' (del informe)' : ' probable'}:</b> {info.probableDx.join('; ')}</div>
          )}
          {!!info.dicomComments?.length && <div className="text-white/60">DICOM: {info.dicomComments.join(' · ')}</div>}
        </div>
      ) : null}
      <div className="mt-2 flex flex-col gap-1">
        {steps.map((step, i) => (
          <button key={i} title={'hint' in step ? step.hint : undefined}
            className="flex items-center justify-between rounded border border-white/15 px-2 py-1 text-left text-[12px] text-white hover:bg-white/10"
            onClick={() => run(step, i)}>
            <span>{i + 1}. {step.label}{step.kind === 'ai' ? ' · IA' : ''}</span>
            <span className={done.includes(i) ? 'text-green-400' : 'text-white/30'}>{done.includes(i) ? '✓' : '›'}</span>
          </button>
        ))}
      </div>
      {note && <div className="mt-2 rounded bg-white/5 px-2 py-1 text-[12px]">{note}</div>}
    </div>
  );
}

export default WorkflowSection;
