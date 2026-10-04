import React, { useEffect, useState } from 'react';
import { callCloud } from './ris';
import { SLABS, applySlab, createSegmentation } from './tools';
import { FOLLOW_UP_MODULE, SCENARIO_MODULES, WORKFLOWS, type Step } from './workflows';
import PriorsSection, { openCompare, type Prior } from './PriorsSection';
import { GraftSection, XASection } from './ClinicalSection';

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
  scenarios?: string[]; episode?: string; priors?: Prior[];
};
const SCENARIO_LABELS: Record<string, string> = {
  trauma: 'trauma', oncologia: 'oncología', trasplante: 'trasplante', infeccion: 'infección', vascular_evc: 'vascular / EVC',
  litiasis: 'litiasis', nodulo_seguimiento: 'nódulo en seguimiento', obstetrico: 'obstétrico', postquirurgico: 'posquirúrgico',
  degenerativo: 'degenerativo', tamizaje: 'tamizaje', dolor_agudo: 'dolor agudo',
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
function WorkflowSection({ servicesManager, commandsManager, studyUID, ai, canSave }: {
  servicesManager: any; commandsManager: any; studyUID: string; ai: boolean; canSave: boolean;
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
  // Base workflow + clinical scenario modules + follow-up module; numbered as one list
  const groups = [
    { title: workflow.title, steps: workflow.steps },
    ...(info.scenarios || []).map(sc => SCENARIO_MODULES[sc]).filter(Boolean),
    ...(info.episode === 'control' ? [FOLLOW_UP_MODULE] : []),
  ].map(g => ({ ...g, steps: g.steps.filter(st => st.kind !== 'ai' || ai) }));
  const steps = groups.flatMap(g => g.steps);
  const prior = (info.priors || []).find(p => p.instanceUUID && p.sameModality) || (info.priors || []).find(p => p.instanceUUID);

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
      case 'section':
        scrollTo(step.target);
        text = `${step.label}${step.hint ? `: ${step.hint}` : ''}`;
        break;
      case 'compare':
        if (prior) openCompare(studyUID, prior);
        else problem = 'No hay un estudio previo con imágenes de esta región';
        break;
      case 'priors':
        scrollTo('pixos-priors');
        break;
      case 'followup':
        scrollTo('pixos-followup');
        text = `${step.label}${step.hint ? `: ${step.hint}` : ''}`;
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
      {(!!info.scenarios?.length || info.episode === 'control') && (
        <div className="mt-1 flex flex-wrap gap-1">
          {info.episode === 'control' && <span className="rounded bg-amber-700/50 px-1.5 text-[11px]">control</span>}
          {(info.scenarios || []).map(sc => <span key={sc} className="rounded bg-white/10 px-1.5 text-[11px]">{SCENARIO_LABELS[sc] || sc}</span>)}
        </div>
      )}
      {groups.map((g, gi) => {
        const offset = groups.slice(0, gi).reduce((a, x) => a + x.steps.length, 0);
        return (
          <div key={gi} className="mt-2">
            {gi > 0 && <div className="mb-1 text-[12px] font-semibold text-white/80">{g.title}</div>}
            <div className="flex flex-col gap-1">
              {g.steps.map((step, k) => {
                const i = offset + k;
                return (
                  <button key={i} title={'hint' in step ? step.hint : undefined}
                    className="flex items-center justify-between rounded border border-white/15 px-2 py-1 text-left text-[12px] text-white hover:bg-white/10"
                    onClick={() => run(step, i)}>
                    <span>{i + 1}. {step.label}{step.kind === 'ai' ? ' · IA' : ''}</span>
                    <span className={done.includes(i) ? 'text-green-400' : 'text-white/30'}>{done.includes(i) ? '✓' : '›'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {note && <div className="mt-2 rounded bg-white/5 px-2 py-1 text-[12px]">{note}</div>}
      {info.workflowId === 'xa_angio' && (
        <div className="mt-3">
          <XASection servicesManager={servicesManager} commandsManager={commandsManager} studyUID={studyUID} canSave={canSave} />
        </div>
      )}
      {(info.workflowId === 'us_transplant' || info.scenarios?.includes('trasplante')) && (
        <div className="mt-3">
          <GraftSection servicesManager={servicesManager} studyUID={studyUID} priors={info.priors || []} canSave={canSave} />
        </div>
      )}
      {info.priors && (
        <div className="mt-3">
          <PriorsSection servicesManager={servicesManager} priors={info.priors} studyUID={studyUID}
            episode={info.episode || 'nuevo'} canSave={canSave} />
        </div>
      )}
    </div>
  );
}

export default WorkflowSection;
