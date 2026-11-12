import React, { useState } from 'react';
import { getAccessProblem, getViewerUrl, retryAccess, type AccessProblem } from './access';

/**
 * "Not available" page in Spanish with the pixOS look: says why the study did
 * not open and what the person can do (sign in, ask the clinic for the link,
 * try again). Replaces OHIF's /notfoundstudy and /notfoundserver messages.
 */

type Copy = { title: string; body: string; hint?: string; signIn?: string; retry?: boolean };

const COPY: Record<AccessProblem | 'desconocido', Copy> = {
  'sin-sesion': {
    title: 'Estas imágenes son privadas',
    body: 'Para verlas abra la liga que le compartió la clínica o entre a pixOS con su cuenta.',
    hint: '¿Le compartieron una liga? Ábrala de nuevo desde su WhatsApp o correo.',
    signIn: 'Entrar a pixOS',
  },
  'sesion-vencida': {
    title: 'Su sesión de pixOS terminó',
    body: 'Por seguridad la sesión se cierra después de un tiempo. Entre de nuevo para ver el estudio.',
    signIn: 'Entrar de nuevo',
  },
  'no-compartido': {
    title: 'Este estudio no está compartido con usted',
    body: 'La liga que abrió es de otro estudio, ya venció o el estudio es de otra clínica. Pida a la clínica una liga para este estudio.',
    signIn: 'Entrar a pixOS',
  },
  bloqueado: {
    title: 'La clínica debe activar su cuenta',
    body: 'Las imágenes están guardadas y seguras. En cuanto la clínica active su cuenta de pixOS podrá verlas.',
    retry: true,
  },
  'no-encontrado': {
    title: 'Todavía no encontramos este estudio',
    body: 'Puede que el equipo aún lo esté enviando. Intente de nuevo en unos minutos.',
    retry: true,
  },
  servidor: {
    title: 'No pudimos conectar con el archivo de imágenes',
    body: 'Revise su conexión a Internet e intente de nuevo.',
    retry: true,
  },
  desconocido: {
    title: 'No pudimos abrir este estudio',
    body: 'Intente de nuevo. Si sigue sin abrir, pida a la clínica que le comparta la liga otra vez.',
    retry: true,
  },
};

function HeartMark() {
  return (
    <svg
      viewBox="0 0 160 160"
      width="56"
      height="56"
      aria-hidden
    >
      <g transform="matrix(0.707107 -0.707107 -0.707107 -0.707107 80 150)">
        <path
          d="M7,0 L110,0 A50,50 0 0 1 110,100 L100,100 L100,110 A50,50 0 0 1 0,110 L0,7 Q0,0 7,0 Z"
          fill="#84aacb"
        />
        <path
          d="M30,0 L110,0 A50,50 0 0 1 110,100 L58,100 Q30,100 30,72 Z"
          fill="#ff7a2f"
        />
      </g>
    </svg>
  );
}

export default function StudyUnavailable() {
  const problem = getAccessProblem();
  const copy = COPY[problem ?? 'desconocido'];
  const [checking, setChecking] = useState(false);
  const [stillFailing, setStillFailing] = useState(false);

  const retry = async () => {
    setChecking(true);
    setStillFailing(false);
    if (await retryAccess()) {
      window.location.replace(getViewerUrl());
      return;
    }
    setChecking(false);
    setStillFailing(true);
  };

  return (
    <main
      className="px-rise-in absolute inset-0 flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(110% 80% at 80% 0%, #0b2a45 0%, hsl(var(--background)) 60%)' }}
    >
      <section
        className="border-border bg-card/80 w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl backdrop-blur"
        aria-labelledby="px-unavailable-title"
      >
        <div className="mb-5 flex justify-center">
          <HeartMark />
        </div>
        <h1
          id="px-unavailable-title"
          className="px-title text-foreground mb-3 text-xl"
          data-cy="study-not-found-message"
        >
          {copy.title}
        </h1>
        <p className="text-muted-foreground mb-6 text-[15px] leading-relaxed">{copy.body}</p>
        <div className="flex flex-col items-center gap-3">
          {copy.signIn && (
            <a
              href="/"
              className="text-primary-foreground inline-flex h-10 items-center justify-center rounded-lg px-5 text-[15px] font-semibold transition-colors"
              style={{ background: 'var(--px-accent)' }}
            >
              {copy.signIn}
            </a>
          )}
          {copy.retry && (
            <button
              type="button"
              onClick={retry}
              disabled={checking}
              className="border-border text-foreground hover:bg-accent inline-flex h-10 items-center justify-center rounded-lg border px-5 text-[15px] font-medium transition-colors disabled:opacity-60"
            >
              {checking ? 'Revisando…' : 'Volver a intentar'}
            </button>
          )}
          {stillFailing && (
            <p
              className="text-muted-foreground text-sm"
              role="status"
            >
              Sigue sin estar disponible.
            </p>
          )}
          {copy.hint && <p className="text-muted-foreground mt-2 text-sm">{copy.hint}</p>}
        </div>
        <p className="text-muted-foreground/70 mt-8 text-xs">pixOS Imagen</p>
      </section>
    </main>
  );
}
