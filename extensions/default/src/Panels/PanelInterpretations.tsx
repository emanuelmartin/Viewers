import React, { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Schema configuration — overridable via window.config.interpretationsPanel
// ---------------------------------------------------------------------------

export interface InterpretationsPanelSchema {
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
  /** Orthanc base URL used to download DICOM archives (e.g. 'https://orthanc.example.com') */
  orthancBaseUrl?: string;
  /** Field in studiesClass that stores the Orthanc study UUID (default: 'orthancUUID') */
  orthancUuidField: string;
  /** Field in interpretationsClass that stores the pre-generated PDF URL (default: 'pdfUrl') */
  interpretationsPdfUrlField: string;
  /** Parse Cloud function name that generates the interpretation PDF (default: 'interpretationPDF') */
  interpretationsPdfCloudFunction: string;
}

const DEFAULT_SCHEMA: InterpretationsPanelSchema = {
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
  orthancBaseUrl: undefined,
  orthancUuidField: 'orthancUUID',
  interpretationsPdfUrlField: 'pdfUrl',
  interpretationsPdfCloudFunction: 'interpretationPDF',
};

function getSchema(): InterpretationsPanelSchema {
  const cfg = (window as any).config?.interpretationsPanel ?? {};
  return { ...DEFAULT_SCHEMA, ...cfg };
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
  const res = await fetch(
    `${schema.parseUrl}/classes/${schema.interpretationsClass}?where=${where}&order=-createdAt&limit=20`,
    { headers: buildHeaders(schema) }
  );
  if (!res.ok) {
    throw new Error(`${schema.interpretationsClass} fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

async function downloadInterpretationPdf(
  interp: any,
  schema: InterpretationsPanelSchema
): Promise<void> {
  const pdfUrl: string | undefined = interp[schema.interpretationsPdfUrlField];
  const now = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fileName = `Interpretacion - ${now}.pdf`;

  const headers = buildHeaders(schema);
  // Parse Cloud REST endpoint: POST /functions/<functionName>
  const endpoint = `${schema.parseUrl}/functions/${schema.interpretationsPdfCloudFunction}`;

  let pdfDataUrl: string | undefined;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pdfUrl, fileName }),
    });
    if (!res.ok) throw new Error(`Cloud function responded ${res.status}`);
    const data = await res.json();
    pdfDataUrl = data?.result?.pdf ?? data?.result;
  } catch (err) {
    console.error('[PanelInterpretations] downloadInterpretationPdf error', err);
  }

  if (!pdfDataUrl) return;

  // Attempt download first; if popup is blocked fall back to new tab
  try {
    const link = document.createElement('a');
    link.href = pdfDataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    window.open(pdfDataUrl);
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

const PanelInterpretations: React.FC = () => {
  const [studies, setStudies] = useState<any[]>([]);
  const [interpretations, setInterpretations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [downloadNotice, setDownloadNotice] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<Record<string, boolean>>({});

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

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const schema = getSchema();
        if (!schema.parseUrl || !schema.appId) {
          throw new Error('interpretationsPanel.parseUrl y appId son requeridos en window.config');
        }
        const uids = getStudyInstanceUIDs();
        const fetchedStudies = await fetchStudiesByUIDs(uids, schema);
        const interps = await fetchInterpretationsByStudies(fetchedStudies, schema);
        if (!cancelled) {
          setStudies(fetchedStudies);
          setInterpretations(interps);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PanelInterpretations]', err);
          setError('No se pudieron cargar las interpretaciones.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const schema = getSchema();

  const handleDownload = () => {
    if (!schema.orthancBaseUrl) {
      console.warn('[PanelInterpretations] orthancBaseUrl no está configurado en interpretationsPanel');
      return;
    }
    const uuids = studies
      .map(s => s[schema.orthancUuidField])
      .filter(Boolean) as string[];
    const uniqueUUIDs = [...new Set(uuids)];
    if (!uniqueUUIDs.length) {
      console.warn('[PanelInterpretations] No se encontraron UUIDs de Orthanc para descargar');
      return;
    }
    setDownloadNotice(true);
    setTimeout(() => setDownloadNotice(false), 4000);
    uniqueUUIDs.forEach(uuid => {
      window.open(`${schema.orthancBaseUrl}/studies/${uuid}/archive`);
    });
  };

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
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <p className="text-foreground text-[11px] font-semibold uppercase tracking-wider opacity-70">
          Interpretaciones
          <span className="bg-primary ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] text-white">
            {interpretations.length}
          </span>
        </p>
        {schema.orthancBaseUrl && (
          <button
            title="Descargar imágenes DICOM (ZIP)"
            onClick={handleDownload}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Descargar
          </button>
        )}
      </div>

      {downloadNotice && (
        <div className="bg-primary/10 border-primary/30 text-primary mx-3 mt-2 rounded border px-3 py-2 text-[11px]">
          Generando archivo ZIP con las imágenes DICOM…
        </div>
      )}

      {interpretations.map((interp, index) => {
        const isOpen = expandedIndex === index;
        const interpPdfUrl: string | undefined = interp[schema.interpretationsPdfUrlField];
        const hasPdf = !!interpPdfUrl && !!schema.parseUrl;
        const signedAtRaw = interp[schema.interpretationsSignedAtField];
        const dateStr = formatDateTime(
          typeof signedAtRaw === 'object' ? signedAtRaw?.iso : signedAtRaw || interp.createdAt
        );
        const isSigned: boolean = !!interp[schema.interpretationsSignedField];
        const content: string = interp[schema.interpretationsContentField] ?? '';

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
              </div>
              <div className="ml-2 flex flex-shrink-0 items-center gap-1">
                {hasPdf && (
                  <button
                    title="Descargar PDF"
                    disabled={!!pdfBusy[interp.objectId]}
                    onClick={async e => {
                      e.stopPropagation();
                      setPdfBusy(prev => ({ ...prev, [interp.objectId]: true }));
                      try {
                        await downloadInterpretationPdf(interp, schema);
                      } finally {
                        setPdfBusy(prev => ({ ...prev, [interp.objectId]: false }));
                      }
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
                // eslint-disable-next-line react/no-danger
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
