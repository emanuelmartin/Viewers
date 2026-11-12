/**
 * «Informe» in the top bar (radiologists with a pixOS session only; the server checks it again):
 * - Critical finding: marks the draft as critical with its one-line description; on signing the RIS opens the usual
 *   acknowledgment flow (whom, when, how).
 * - Peer review (RADPEER): score 1–4 of a report signed by another radiologist, with clinical significance and a
 *   comment for discrepancies.
 * - PACS: stores the measurements as DICOM SR (TID 1500) and the «Lesiones» segmentation as DICOM SEG now (signing
 *   the report stores them too).
 */
import React, { ReactNode, useEffect, useState } from 'react';
import { useSystem } from '@ohif/core';
import { HeaderPopover } from './HeaderMenus';
import { callCloud, getAccess } from './ris';
import { activeStudyUID, saveLesionsSEG, saveMeasurementsSR } from './reportLink';

const RADPEER: [number, string][] = [
  [1, 'Concuerdo con la interpretación'],
  [2, 'Discrepancia: diagnóstico que no se espera hacer siempre'],
  [3, 'Discrepancia: debió hacerse la mayoría de las veces'],
  [4, 'Discrepancia: debió hacerse casi siempre'],
];

type Peer = { eligible: boolean; reason: string | null; author: string | null; mine: { score: number; significant: boolean | null; comment: string } | null };

function Critical({ uid }: { uid: string }) {
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const send = async (critical: boolean) => {
    try {
      await callCloud('viewer:critical', { StudyInstanceUID: uid, critical, note });
      setMsg(critical ? 'Marcado como crítico. Al firmar se abre el aviso al médico tratante.' : 'Se quitó la marca de crítico.');
    } catch (e) {
      setMsg((e as Error)?.message || String(e));
    }
  };
  return (
    <div className="px-proc-section">
      <header>
        <h4>Hallazgo crítico</h4>
      </header>
      <textarea className="px-textarea" rows={2} maxLength={500} placeholder="Describa el hallazgo en una línea" aria-label="Descripción del hallazgo crítico" value={note} onChange={e => setNote(e.target.value)} />
      <div className="px-proc-grid3" style={{ gridTemplateColumns: '2fr 1fr', marginTop: 6 }}>
        <button type="button" className="px-tile px-tile-primary" disabled={!note.trim()} onClick={() => send(true)}>
          <strong>Marcar crítico</strong>
        </button>
        <button type="button" className="px-tile" onClick={() => send(false)}>
          <strong>Quitar</strong>
        </button>
      </div>
      {msg && <p className="px-proc-note" role="status">{msg}</p>}
    </div>
  );
}

function PeerReview({ uid }: { uid: string }) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [significant, setSignificant] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    callCloud<Peer>('viewer:peer-review:get', { StudyInstanceUID: uid })
      .then(p => {
        setPeer(p);
        if (p.mine) {
          setScore(p.mine.score);
          setSignificant(p.mine.significant);
          setComment(p.mine.comment);
        }
      })
      .catch(() => setPeer(null));
  }, [uid]);
  if (!peer) {
    return null;
  }
  if (!peer.eligible) {
    return (
      <div className="px-proc-section">
        <header>
          <h4>Revisión por pares</h4>
        </header>
        <p className="px-proc-note">{peer.reason === 'own_report' ? 'Usted firmó este informe: lo revisa otro radiólogo.' : 'Se revisa cuando el informe esté firmado.'}</p>
      </div>
    );
  }
  const ready = score === 1 || (score && significant !== null && comment.trim().length >= 5);
  return (
    <div className="px-proc-section">
      <header>
        <h4>Revisión por pares (RADPEER)</h4>
      </header>
      <p className="px-proc-note">Informe de {peer.author || 'otro radiólogo'}. {peer.mine ? 'Ya lo revisó; puede cambiar su calificación.' : ''}</p>
      <div className="px-radio-list" role="radiogroup" aria-label="Calificación RADPEER">
        {RADPEER.map(([n, label]) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} className="px-seg-item" data-active={score === n || undefined} onClick={() => setScore(n)}>
            {n} · {label}
          </button>
        ))}
      </div>
      {score && score > 1 && (
        <>
          <div className="px-seg" style={{ marginTop: 6 }} role="radiogroup" aria-label="Significancia clínica">
            <button type="button" role="radio" aria-checked={significant === false} className="px-seg-item" data-active={significant === false || undefined} onClick={() => setSignificant(false)}>
              a · poco probable que sea significativa
            </button>
            <button type="button" role="radio" aria-checked={significant === true} className="px-seg-item" data-active={significant === true || undefined} onClick={() => setSignificant(true)}>
              b · probablemente significativa
            </button>
          </div>
          <textarea className="px-textarea" rows={2} maxLength={1000} placeholder="¿Qué se omitió o se interpretó distinto?" aria-label="Comentario de la discrepancia" value={comment} onChange={e => setComment(e.target.value)} />
        </>
      )}
      <button
        type="button"
        className="px-tile px-tile-primary"
        style={{ width: '100%', marginTop: 6 }}
        disabled={!ready}
        onClick={async () => {
          try {
            await callCloud('viewer:peer-review:set', { StudyInstanceUID: uid, score, significant, comment });
            setMsg('Revisión guardada.');
          } catch (e) {
            setMsg((e as Error)?.message || String(e));
          }
        }}
      >
        <strong>Guardar revisión</strong>
      </button>
      {msg && <p className="px-proc-note" role="status">{msg}</p>}
    </div>
  );
}

function Pacs({ uid }: { uid: string }) {
  const { servicesManager, commandsManager } = useSystem();
  const [msg, setMsg] = useState('');
  const run = async (kind: 'SR' | 'SEG') => {
    setMsg('Guardando…');
    try {
      const r = kind === 'SR' ? await saveMeasurementsSR(servicesManager, uid, 'manual') : await saveLesionsSEG(servicesManager, commandsManager, uid, 'manual');
      setMsg(r ? `DICOM ${kind} guardado en el PACS.` : kind === 'SR' ? 'No hay medidas de este estudio.' : 'No hay segmentación «Lesiones».');
    } catch (e) {
      setMsg((e as Error)?.message || String(e));
    }
  };
  return (
    <div className="px-proc-section">
      <header>
        <h4>Al PACS</h4>
      </header>
      <p className="px-proc-note">También se guardan solos al firmar el informe.</p>
      <div className="px-proc-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" className="px-tile" onClick={() => run('SR')}>
          <strong>Medidas (SR)</strong>
        </button>
        <button type="button" className="px-tile" onClick={() => run('SEG')}>
          <strong>Lesiones (SEG)</strong>
        </button>
      </div>
      {msg && <p className="px-proc-note" role="status">{msg}</p>}
    </div>
  );
}

export function ReportMenu(): ReactNode {
  const { servicesManager } = useSystem();
  if (!getAccess().canSave) {
    return null;
  }
  return (
    <HeaderPopover id="pxReport" icon="icon-list-view" tooltip="Informe: crítico, revisión por pares, PACS" width={330}>
      {() => {
        const uid = activeStudyUID(servicesManager);
        return (
          <>
            <div className="px-proc-head">
              <span>Informe</span>
            </div>
            <Critical uid={uid} />
            <PeerReview uid={uid} />
            <Pacs uid={uid} />
          </>
        );
      }}
    </HeaderPopover>
  );
}
