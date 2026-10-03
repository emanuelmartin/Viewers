import React, { useState, useEffect } from 'react';
import {
  DownloadTarget,
  base64ToBlob,
  cancelDownloadTarget,
  deliverBlob,
  deliverUrl,
  prepareDownloadTarget,
} from '../utils/fileDownload';

// ---------------------------------------------------------------------------
// Schema configuration — overridable via window.config.interpretationsPanel
// ---------------------------------------------------------------------------

export interface InterpretationsPanelSchema {
  /** Explicitly enable/disable the interpretations panel (default: true) */
  showInterpretationsPanel?: boolean;
  /** Parse Server base URL (no trailing slash) */
  parseUrl: string;
  /** Parse Application ID */
  appId: string;
  /** Parse JavaScript client key */
  jsKey?: string;
  /** Optional session token for authenticated requests */
  sessionToken?: string;
  /** Parse class name that holds DICOM studies (default: 'Studies') */
  studiesClass: string;
  /** Field in studiesClass that stores the DICOM StudyInstanceUID (default: 'instanceUUID') */
  studiesUidField: string;
  /** Parse class name that holds interpretations / reports (default: 'Interpretations') */
  interpretationsClass: string;
  /** Field in interpretationsClass that is a Pointer to studiesClass (default: 'study') */
  interpretationsStudyField: string;
  /** Field containing the report HTML content (default: 'content') */
  interpretationsContentField: string;
  /** Boolean field indicating the report is signed/finalized (default: 'signed') */
  interpretationsSignedField: string;
  /** Date field for when the report was signed (default: 'signedAt') */
  interpretationsSignedAtField: string;
  /** Field containing Pointer to user/physician (default: 'user') */
  interpretationsUserField: string;
  /** Parse class name for user/physician (default: '_User') */
  userClass: string;
  /** Field in user object that contains the user's full name (default: 'fullName') */
  userNameField: string;
  /** Orthanc base URL used to download DICOM archives (e.g. 'https://orthanc.example.com') */
  orthancBaseUrl?: string;
  /** Field in studiesClass that stores the Orthanc study UUID (default: 'orthancUUID') */
  orthancUuidField: string;
  /** Field in interpretationsClass that stores the pre-generated PDF URL (default: 'pdfUrl') */
  interpretationsPdfUrlField: string;
  /** Parse Cloud function name that generates the interpretation PDF (default: 'generateInterpretationReport') */
  interpretationsPdfCloudFunction: string;
}

const DEFAULT_SCHEMA: InterpretationsPanelSchema = {
  showInterpretationsPanel: true,
  parseUrl: '',
  appId: '',
  jsKey: undefined,
  sessionToken: undefined,
  studiesClass: 'Studies',
  studiesUidField: 'instanceUUID',
  interpretationsClass: 'Interpretations',
  interpretationsStudyField: 'study',
  interpretationsContentField: 'content',
  interpretationsSignedField: 'signed',
  interpretationsSignedAtField: 'signedAt',
  interpretationsUserField: 'user',
  userClass: '_User',
  userNameField: 'fullName',
  orthancBaseUrl: undefined,
  orthancUuidField: 'orthancUUID',
  interpretationsPdfUrlField: 'pdfUrl',
  interpretationsPdfCloudFunction: 'generateInterpretationReport',
  studyViewerBaseUrl: undefined,
};

/**
 * Session of the user logged into the RIS on this origin: the Parse JS SDK
 * keeps it in localStorage under Parse/<appId>/currentUser. Lets the panel
 * read once the Parse classes require a session; viewers opened without a
 * RIS login keep working anonymously while that is allowed.
 */
function getRisSessionToken(appId: string): string | undefined {
  try {
    const raw = window.localStorage.getItem(`Parse/${appId}/currentUser`);
    return raw ? JSON.parse(raw)?.sessionToken || undefined : undefined;
  } catch {
    return undefined;
  }
}

function getSchema(): InterpretationsPanelSchema {
  const cfg = (window as any).config?.interpretationsPanel ?? {};
  const schema = { ...DEFAULT_SCHEMA, ...cfg };
  if (!schema.sessionToken && schema.appId) {
    schema.sessionToken = getRisSessionToken(schema.appId);
  }
  return schema;
}

// CSS for Quill-generated HTML output (text alignment classes)
const QUILL_OUTPUT_STYLES = `
.ql-interp .ql-align-center { text-align: center; }
.ql-interp .ql-align-right  { text-align: right; }
.ql-interp .ql-align-justify { text-align: justify; }
.ql-interp p { margin: 0 0 0.5em 0; }
.ql-interp strong { font-weight: 600; }
.ql-interp u { text-decoration: underline; }
.ql-interp em { font-style: italic; }
`;

function getStudyInstanceUIDs(): string[] {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('StudyInstanceUIDs') || '';
  return raw
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);
}

function buildHeaders(schema: InterpretationsPanelSchema): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Parse-Application-Id': schema.appId,
    'Content-Type': 'application/json',
  };
  if (schema.jsKey) {
    headers['X-Parse-Javascript-Key'] = schema.jsKey;
  }
  if (schema.sessionToken) {
    headers['X-Parse-Session-Token'] = schema.sessionToken;
  }
  return headers;
}

async function fetchStudiesByUIDs(
  uids: string[],
  schema: InterpretationsPanelSchema
): Promise<any[]> {
  if (!uids.length) {
    return [];
  }
  const where = encodeURIComponent(
    JSON.stringify({ [schema.studiesUidField]: { $in: uids } })
  );
  const res = await fetch(
    `${schema.parseUrl}/classes/${schema.studiesClass}?where=${where}&limit=20`,
    { headers: buildHeaders(schema) }
  );
  if (!res.ok) {
    throw new Error(`${schema.studiesClass} fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

async function fetchInterpretationsByStudies(
  studies: any[],
  schema: InterpretationsPanelSchema
): Promise<any[]> {
  if (!studies.length) {
    return [];
  }
  const pointers = studies.map(s => ({
    __type: 'Pointer',
    className: schema.studiesClass,
    objectId: s.objectId,
  }));
  const where = encodeURIComponent(
    JSON.stringify({ [schema.interpretationsStudyField]: { $in: pointers } })
  );
  const include = encodeURIComponent(`${schema.interpretationsUserField},${schema.interpretationsStudyField}`);
  const res = await fetch(
    `${schema.parseUrl}/classes/${schema.interpretationsClass}?where=${where}&include=${include}&order=-createdAt&limit=20`,
    { headers: buildHeaders(schema) }
  );
  if (!res.ok) {
    throw new Error(`${schema.interpretationsClass} fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

async function runCloudFunction(name: string, params: object, schema: InterpretationsPanelSchema) {
  const res = await fetch(`${schema.parseUrl}/functions/${name}`, {
    method: 'POST',
    headers: buildHeaders(schema),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`${name} failed: ${res.status}`);
  }
  const json = await res.json();
  return json?.result ?? json;
}

/**
 * Patients open the viewer from a shared link, without a RIS session; the
 * Parse classes require one, so the signed reports come from a public cloud
 * function scoped to the StudyInstanceUIDs of the link. Shaped like the
 * Interpretations rows the panel renders.
 */
async function fetchPublicInterpretations(uids: string[], schema: InterpretationsPanelSchema): Promise<any[]> {
  if (!uids.length) {
    return [];
  }
  const rows = await runCloudFunction('getPublicStudyInterpretations', { StudyInstanceUIDs: uids }, schema);
  return (rows || []).map(r => ({
    objectId: r.interpretationId,
    createdAt: r.signedAt?.iso || r.signedAt,
    [schema.interpretationsContentField]: r.content,
    [schema.interpretationsSignedField]: true,
    [schema.interpretationsSignedAtField]: r.signedAt,
    [schema.interpretationsUserField]: { [schema.userNameField]: r.signerName },
    [schema.interpretationsPdfUrlField]: r.pdfUrl,
    publicStudyUID: r.studyUID,
  }));
}

async function downloadInterpretationPdf(
  interp: any,
  schema: InterpretationsPanelSchema,
  target: DownloadTarget
): Promise<void> {
  try {
    // Shared link: the stored PDF of that study's signed report
    const result: any = interp.publicStudyUID
      ? await runCloudFunction('getPublicInterpretationPdf',
          { StudyInstanceUID: interp.publicStudyUID, interpretationId: interp.objectId }, schema)
      : await runCloudFunction(schema.interpretationsPdfCloudFunction, { interpretationId: interp.objectId }, schema);
    const pdfBase64 = result?.pdf;
    const pdfUrl = result?.pdfUrl;
    const fileName = 'Interpretacion.pdf';

    if (pdfBase64) {
      // A Blob works everywhere; a data: URL is ignored by <a download> on iOS.
      deliverBlob(target, base64ToBlob(pdfBase64), fileName);
    } else if (pdfUrl) {
      // Fetch it so the download keeps its name even when the PDF is served
      // from another origin (where <a download> is ignored).
      const pdfRes = await fetch(pdfUrl);
      if (pdfRes.ok) {
        deliverBlob(target, await pdfRes.blob(), fileName);
      } else {
        deliverUrl(target, pdfUrl, fileName);
      }
    } else {
      throw new Error('Cloud function did not return PDF data');
    }
  } catch (err) {
    console.error('[PanelInterpretations] downloadInterpretationPdf error:', err);
    cancelDownloadTarget(target);
    alert(`Error al descargar PDF: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function formatDateTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Loads the interpretations of the studies in the URL. Kept outside the
 * component: the React Compiler cannot lower try/catch/finally inside one.
 */
async function loadInterpretations(): Promise<{ interpretations: any[]; error: string | null }> {
  try {
    const schema = getSchema();
    if (!schema.parseUrl || !schema.appId) {
      throw new Error('interpretationsPanel.parseUrl y appId son requeridos en window.config');
    }
    const uids = getStudyInstanceUIDs();
    if (!schema.sessionToken) {
      // Shared link without a RIS session: signed reports of these studies only
      return { interpretations: await fetchPublicInterpretations(uids, schema), error: null };
    }
    const studies = await fetchStudiesByUIDs(uids, schema);
    const interpretations = await fetchInterpretationsByStudies(studies, schema);
    return { interpretations, error: null };
  } catch (err) {
    console.error('[PanelInterpretations]', err);
    return { interpretations: [], error: 'No se pudieron cargar las interpretaciones.' };
  }
}

const PanelInterpretations: React.FC = () => {
  const [interpretations, setInterpretations] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [pdfBusy, setPdfBusy] = useState<Record<string, boolean>>({});

  const schema = getSchema();
  const isConfigured = !!(schema.showInterpretationsPanel !== false && schema.parseUrl && schema.appId);
  const [loading, setLoading] = useState(isConfigured);

  // Inject Quill output CSS once
  useEffect(() => {
    const styleId = 'quill-interp-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = QUILL_OUTPUT_STYLES;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isConfigured) {
      loadInterpretations().then(result => {
        if (cancelled) {
          return;
        }
        setInterpretations(result.interpretations);
        setError(result.error);
        setLoading(false);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [isConfigured]);

  // If interpretationsPanel is not configured, render nothing
  if (!isConfigured) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <span className="text-primary animate-pulse text-sm">Cargando interpretaciones…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-center text-sm">
        {error}
      </div>
    );
  }

  if (!interpretations.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-3xl opacity-50">📋</div>
        <div className="text-foreground text-sm font-medium">Sin interpretaciones</div>
        <div className="text-muted-foreground text-xs">
          Este estudio aún no tiene interpretaciones registradas.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-border border-b px-3 py-2">
        <p className="text-foreground text-[11px] font-semibold uppercase tracking-wider opacity-70">
          Interpretaciones
          <span className="bg-primary ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] text-white">
            {interpretations.length}
          </span>
        </p>
      </div>

      {interpretations.map((interp, index) => {
        const isOpen = expandedIndex === index;
        const signedAtRaw = interp[schema.interpretationsSignedAtField];
        const userObj: any = interp[schema.interpretationsUserField];
        const userName: string = userObj?.[schema.userNameField] ?? userObj?.username ?? 'Sin identificar';
        const dateStr = formatDateTime(
          typeof signedAtRaw === 'object' ? signedAtRaw?.iso : signedAtRaw || interp.createdAt
        );
        const isSigned: boolean = !!interp[schema.interpretationsSignedField];
        const content: string = interp[schema.interpretationsContentField] ?? '';
        
        // Ensure PDF button condition is evaluated at render time
        const hasPdfCloudFunction = !!(schema.parseUrl && schema.interpretationsPdfCloudFunction);

        return (
          <div
            key={interp.objectId}
            className="border-border border-b"
          >
            {/* Header row – click to expand/collapse */}
            <button
              className="hover:bg-muted/40 flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors"
              onClick={() => setExpandedIndex(isOpen ? null : index)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-foreground text-xs font-medium">{dateStr}</div>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[11px]">
                  {isSigned ? (
                    <>
                      <span className="text-green-400">✓</span>
                      <span>Firmada</span>
                    </>
                  ) : (
                    <span className="text-yellow-400">Borrador</span>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 text-[10px]">
                  {userName}
                </div>
              </div>
              <div className="ml-2 flex flex-shrink-0 items-center gap-1">
                {/* PDF download button if Cloud Function is configured */}
                {hasPdfCloudFunction && (
                  <button
                    title="Descargar PDF"
                    disabled={!!pdfBusy[interp.objectId]}
                    onClick={e => {
                      e.stopPropagation();
                      const target = prepareDownloadTarget();
                      setPdfBusy(prev => ({ ...prev, [interp.objectId]: true }));
                      downloadInterpretationPdf(interp, schema, target).finally(() =>
                        setPdfBusy(prev => ({ ...prev, [interp.objectId]: false }))
                      );
                    }}
                    className="text-muted-foreground hover:text-foreground flex items-center rounded p-1 transition-colors disabled:opacity-40"
                  >
                    {pdfBusy[interp.objectId] ? (  
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <polyline points="9 15 12 18 15 15" />
                      </svg>
                    )}
                  </button>
                )}
                <span className="text-muted-foreground text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Content – rendered Quill HTML */}
            {isOpen && (
              <div
                className="ql-interp border-border border-t px-3 py-3"
                style={{
                  fontSize: '12px',
                  lineHeight: '1.65',
                  color: 'hsl(var(--foreground))',
                  maxHeight: '70vh',
                  overflowY: 'auto',
                }}
                // Content is written by authenticated radiologists in our own Parse DB.
                // No user-supplied arbitrary HTML enters this field.
                dangerouslySetInnerHTML={{ __html: content }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PanelInterpretations;
