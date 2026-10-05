/**
 * Procedure log of interventional cardiology: event types with their fields,
 * the clinical reading of the values, and the narrative for the report.
 *
 * Thresholds
 *   Angiographic stenosis ≥ 70% (≥ 50% left main) significant.
 *   FFR ≤ 0.80 and QFR ≤ 0.80; iFR / RFR / dPR ≤ 0.89; resting Pd/Pa ≤ 0.91 (ESC 2019 / ACC-AHA 2021).
 *   IVUS MLA < 4 mm² non-left main, < 6 mm² left main; stent expansion ≥ 80% and MSA > 5.5 mm²
 *   IVUS / > 4.5 mm² OCT in non-left main (EAPCI consensus, Räber 2018).
 */

export type FieldDef = { id: string; label: string; kind: 'text' | 'num' | 'select'; options?: string[]; unit?: string };
export type EventDef = { type: string; label: string; fields: FieldDef[] };
export type ProcEvent = {
  id: string; type: string; time: string; flag: '' | 'importante' | 'complicacion';
  fields: Record<string, string | number>; note: string;
  ref: { seriesInstanceUID: string; sopInstanceUID: string | null; frame: number | null; label: string } | null;
};

export const VESSELS = ['TCI', 'DA proximal', 'DA media', 'DA distal', 'Diagonal 1', 'Diagonal 2', 'CX proximal', 'CX distal',
  'Marginal obtusa 1', 'Marginal obtusa 2', 'Intermedia', 'CD proximal', 'CD media', 'CD distal', 'Descendente posterior',
  'Posterolateral', 'Injerto venoso', 'Injerto arterial (AMI)'];
const sel = (id: string, label: string, options: string[]): FieldDef => ({ id, label, kind: 'select', options });
const num = (id: string, label: string, unit?: string): FieldDef => ({ id, label, kind: 'num', unit });
const txt = (id: string, label: string): FieldDef => ({ id, label, kind: 'text' });
const vessel = sel('vaso', 'Vaso / segmento', VESSELS);

export const EVENT_DEFS: EventDef[] = [
  { type: 'acceso', label: 'Acceso', fields: [
    sel('via', 'Vía', ['radial derecha', 'radial izquierda', 'radial distal (tabaquera)', 'femoral derecha', 'femoral izquierda', 'cubital', 'braquial']),
    num('fr', 'Introductor', 'Fr'), sel('guiado', 'Punción', ['', 'guiada por ultrasonido', 'por referencias anatómicas'])] },
  { type: 'diagnostico', label: 'Coronariografía / ventriculografía', fields: [
    txt('cateteres', 'Catéteres diagnósticos'), sel('dominancia', 'Dominancia', ['', 'derecha', 'izquierda', 'codominante']),
    num('fevi', 'FEVI (ventriculografía)', '%'), num('d2vi', 'PDFVI', 'mmHg')] },
  { type: 'lesion', label: 'Lesión / estenosis', fields: [
    vessel, num('pct', 'Estenosis', '%'), num('long', 'Longitud', 'mm'), num('ref', 'Diámetro de referencia', 'mm'),
    sel('timi', 'TIMI', ['', '0', '1', '2', '3']), sel('tipo', 'Tipo ACC/AHA', ['', 'A', 'B1', 'B2', 'C']),
    txt('medina', 'Medina (p. ej. 1,1,1)'), txt('caracter', 'Características (calcio, trombo, ostial, OTC…)')] },
  { type: 'fisiologia', label: 'Fisiología (FFR / iFR)', fields: [
    sel('modo', 'Índice', ['FFR', 'iFR', 'RFR', 'dPR', 'Pd/Pa en reposo', 'QFR']), vessel, num('valor', 'Valor'),
    sel('hiperemia', 'Hiperemia', ['', 'adenosina IC', 'adenosina IV', 'no requiere']), sel('momento', 'Momento', ['previo a ICP', 'posterior a ICP'])] },
  { type: 'imagen_intra', label: 'IVUS / OCT', fields: [
    sel('modo', 'Modalidad', ['IVUS', 'OCT']), sel('momento', 'Momento', ['previo a ICP', 'posterior a ICP']), vessel,
    num('mla', 'Área luminal mínima', 'mm²'), num('placa', 'Carga de placa', '%'), num('msa', 'Área mínima del stent', 'mm²'),
    num('expansion', 'Expansión del stent', '%'), num('calcio', 'Arco de calcio', '°'),
    sel('aposicion', 'Aposición', ['', 'completa', 'malaposición']), sel('borde', 'Disección de borde', ['', 'no', 'sí'])] },
  { type: 'balon', label: 'Balón', fields: [
    sel('proposito', 'Propósito', ['predilatación', 'posdilatación', 'optimización', 'kissing balloon']),
    sel('tipo', 'Tipo', ['semidistensible', 'no distensible', 'cortante / scoring', 'litotricia intravascular', 'liberador de fármaco']),
    vessel, num('diam', 'Diámetro', 'mm'), num('long', 'Longitud', 'mm'), num('atm', 'Presión', 'atm'), num('inflados', 'Inflados')] },
  { type: 'stent', label: 'Stent', fields: [
    sel('tipo', 'Tipo', ['farmacoactivo', 'metálico', 'cubierto', 'bioabsorbible']), txt('modelo', 'Modelo'), vessel,
    num('diam', 'Diámetro', 'mm'), num('long', 'Longitud', 'mm'), num('atm', 'Presión', 'atm'),
    sel('tecnica', 'Técnica', ['', 'implante directo', 'tras predilatación', 'provisional', 'T / TAP', 'culotte', 'DK-crush', 'mini-crush'])] },
  { type: 'marcapasos', label: 'Marcapasos', fields: [
    sel('tipo', 'Tipo', ['temporal transvenoso', 'definitivo unicameral', 'definitivo bicameral', 'resincronizador', 'sin cables']),
    sel('acceso', 'Acceso', ['', 'yugular derecha', 'femoral derecha', 'femoral izquierda', 'subclavia izquierda', 'cefálica izquierda', 'axilar']),
    sel('posicion', 'Electrodo', ['', 'ápex de VD', 'septum de VD', 'aurícula derecha', 'seno coronario', 'haz de His / rama izquierda']),
    num('umbral', 'Umbral', 'V'), num('sensado', 'Onda R/P', 'mV'), num('impedancia', 'Impedancia', 'Ω'),
    num('frecuencia', 'Frecuencia', 'lpm'), txt('modo', 'Modo (VVI, DDD…)')] },
  { type: 'medicamento', label: 'Medicamento', fields: [
    sel('farmaco', 'Fármaco', ['heparina', 'bivalirudina', 'nitroglicerina', 'verapamilo', 'adenosina', 'inhibidor GP IIb/IIIa',
      'atropina', 'norepinefrina', 'clopidogrel', 'ticagrelor', 'prasugrel', 'ácido acetilsalicílico', 'otro']),
    txt('dosis', 'Dosis (con unidad)'), sel('via', 'Vía', ['', 'intracoronaria', 'intravenosa', 'intraarterial radial', 'oral'])] },
  { type: 'complicacion', label: 'Complicación', fields: [
    sel('tipo', 'Tipo', ['disección coronaria', 'no-reflow / flujo lento', 'perforación', 'trombosis aguda', 'oclusión de rama lateral',
      'espasmo', 'arritmia', 'bloqueo AV', 'hipotensión', 'hematoma del acceso', 'reacción al contraste', 'otra']),
    vessel, txt('grado', 'Grado / clasificación (NHLBI, Ellis…)'), txt('manejo', 'Manejo')] },
  { type: 'resultado', label: 'Resultado final', fields: [
    vessel, num('residual', 'Estenosis residual', '%'), sel('timi', 'TIMI final', ['', '0', '1', '2', '3']),
    sel('blush', 'Blush miocárdico (MBG)', ['', '0', '1', '2', '3']), txt('comentario', 'Comentario')] },
  { type: 'cierre', label: 'Cierre y dosis', fields: [
    sel('metodo', 'Hemostasia', ['banda de compresión radial', 'dispositivo de cierre vascular', 'compresión manual']),
    num('contraste', 'Contraste total', 'ml'), num('tfg', 'TFG del paciente', 'ml/min/1.73 m²'), num('fluoro', 'Tiempo de fluoroscopía', 'min'),
    num('kerma', 'Kerma en aire', 'mGy'), num('pda', 'Producto dosis-área total', 'Gy·cm²')] },
  { type: 'nota', label: 'Nota / momento', fields: [] },
];
export const DEF = Object.fromEntries(EVENT_DEFS.map(d => [d.type, d])) as Record<string, EventDef>;

const has = (v: unknown) => v !== '' && v != null;
const at = (e: ProcEvent) => (e.time ? ` (${e.time.slice(0, 5)})` : '');
const on = (f: ProcEvent['fields']) => (has(f.vaso) ? ` en ${f.vaso}` : '');
const dims = (f: ProcEvent['fields']) => [has(f.diam) && `${f.diam}`, has(f.long) && `${f.long} mm`].filter(Boolean).join(' × ');

/** Clinical reading of a value, or null. */
export function readingOf(e: ProcEvent): string | null {
  const f = e.fields;
  if (e.type === 'lesion' && has(f.pct)) {
    const tci = String(f.vaso || '') === 'TCI';
    const sig = Number(f.pct) >= (tci ? 50 : 70);
    return sig ? 'angiográficamente significativa' : Number(f.pct) >= 50 ? 'intermedia: valorar fisiología o imagen intravascular' : 'no significativa';
  }
  if (e.type === 'fisiologia' && has(f.valor)) {
    const v = Number(f.valor); const m = String(f.modo);
    const cut = m === 'FFR' || m === 'QFR' ? 0.8 : m === 'Pd/Pa en reposo' ? 0.91 : 0.89;
    return v <= cut ? `hemodinámicamente significativa (≤ ${cut})` : `no significativa (> ${cut})`;
  }
  if (e.type === 'imagen_intra') {
    const out: string[] = [];
    const tci = String(f.vaso || '') === 'TCI';
    if (has(f.mla) && !has(f.msa)) out.push(Number(f.mla) < (tci ? 6 : 4) ? `ALM < ${tci ? 6 : 4} mm²: lesión significativa` : 'ALM sin criterio de significancia');
    if (has(f.expansion)) out.push(Number(f.expansion) >= 80 ? 'expansión adecuada (≥ 80%)' : 'subexpansión (< 80%): considerar posdilatación');
    if (has(f.msa) && !tci) {
      const cut = f.modo === 'OCT' ? 4.5 : 5.5;
      out.push(Number(f.msa) > cut ? `AMS > ${cut} mm²` : `AMS ≤ ${cut} mm²: riesgo de reestenosis`);
    }
    if (f.aposicion === 'malaposición') out.push('malaposición');
    if (f.borde === 'sí') out.push('disección de borde');
    return out.join('; ') || null;
  }
  if (e.type === 'cierre') {
    const out: string[] = [];
    if (has(f.kerma) && Number(f.kerma) >= 5000) out.push('kerma ≥ 5 Gy: seguimiento de piel a 2–4 semanas (NCRP 168)');
    else if (has(f.kerma) && Number(f.kerma) >= 3000) out.push('kerma ≥ 3 Gy: vigilar dosis en piel');
    if (has(f.pda) && Number(f.pda) >= 500) out.push('PDA ≥ 500 Gy·cm²: seguimiento de piel (NCRP 168)');
    // Contrast volume / eGFR > 3.7: higher risk of contrast-associated kidney injury (Laskey 2007)
    if (has(f.contraste) && has(f.tfg) && Number(f.tfg) > 0) {
      const r = Math.round((Number(f.contraste) / Number(f.tfg)) * 10) / 10;
      out.push(`relación contraste/TFG ${r}${r > 3.7 ? ' (> 3.7: mayor riesgo de lesión renal por contraste; vigilar creatinina 48–72 h)' : ''}`);
    }
    return out.join('; ') || null;
  }
  return null;
}

/** One sentence for the narrative (capitalised, single final period). */
export function sentenceOf(e: ProcEvent): string {
  const text = rawSentence(e).replace(/\.{2,}$/, '.');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rawSentence(e: ProcEvent): string {
  const f = e.fields;
  const r = readingOf(e);
  const tail = `${r ? `, ${r}` : ''}${e.note ? `. ${e.note.replace(/[.\s]+$/, '')}` : ''}`;
  switch (e.type) {
    case 'acceso':
      return `Acceso ${f.via || ''}${has(f.fr) ? ` con introductor ${f.fr} Fr` : ''}${f.guiado ? `, punción ${f.guiado}` : ''}${at(e)}${tail}.`;
    case 'diagnostico':
      return `Coronariografía diagnóstica${has(f.cateteres) ? ` con catéteres ${f.cateteres}` : ''}${at(e)}`
        + `${f.dominancia ? `; circulación con dominancia ${f.dominancia}` : ''}`
        + `${has(f.fevi) ? `; ventriculografía con FEVI estimada de ${f.fevi}%` : ''}${has(f.d2vi) ? `, PDFVI ${f.d2vi} mmHg` : ''}${tail}.`;
    case 'lesion':
      return `Lesión${on(f)}${has(f.pct) ? ` con estenosis de ${f.pct}%` : ''}${has(f.long) ? `, longitud ${f.long} mm` : ''}`
        + `${has(f.ref) ? `, diámetro de referencia ${f.ref} mm` : ''}${f.tipo ? `, tipo ${f.tipo}` : ''}${f.medina ? `, Medina ${f.medina}` : ''}`
        + `${f.caracter ? `, ${f.caracter}` : ''}${f.timi ? `, flujo TIMI ${f.timi}` : ''}${at(e)}${tail}.`;
    case 'fisiologia':
      return `${f.modo}${on(f)} ${f.momento || ''} de ${f.valor}${f.hiperemia && f.hiperemia !== 'no requiere' ? ` con ${f.hiperemia}` : ''}${at(e)}${tail}.`;
    case 'imagen_intra':
      return `${f.modo} ${f.momento || ''}${on(f)}${at(e)}: ${[has(f.mla) && `área luminal mínima ${f.mla} mm²`, has(f.placa) && `carga de placa ${f.placa}%`,
        has(f.calcio) && `arco de calcio ${f.calcio}°`, has(f.msa) && `área mínima del stent ${f.msa} mm²`, has(f.expansion) && `expansión ${f.expansion}%`,
        f.aposicion && `aposición ${f.aposicion}`].filter(Boolean).join(', ')}${tail}.`;
    case 'balon':
      return `${String(f.proposito || 'Dilatación').replace(/^./, c => c.toUpperCase())}${on(f)} con balón ${f.tipo || ''}${dims(f) ? ` de ${dims(f)}` : ''}`
        + `${has(f.atm) ? ` a ${f.atm} atm` : ''}${has(f.inflados) ? ` (${f.inflados} inflados)` : ''}${at(e)}${tail}.`;
    case 'stent':
      return `Implante de stent ${f.tipo || ''}${f.modelo ? ` ${f.modelo}` : ''}${dims(f) ? ` de ${dims(f)}` : ''}${on(f)}`
        + `${has(f.atm) ? ` a ${f.atm} atm` : ''}${f.tecnica ? `, técnica ${f.tecnica}` : ''}${at(e)}${tail}.`;
    case 'marcapasos':
      return `Marcapasos ${f.tipo || ''}${f.acceso ? ` por vía ${f.acceso}` : ''}${f.posicion ? `, electrodo en ${f.posicion}` : ''}${at(e)}`
        + `${[has(f.umbral) && `umbral ${f.umbral} V`, has(f.sensado) && `sensado ${f.sensado} mV`, has(f.impedancia) && `impedancia ${f.impedancia} Ω`,
          has(f.frecuencia) && `frecuencia ${f.frecuencia} lpm`, f.modo && `modo ${f.modo}`].filter(Boolean).map(x => `, ${x}`).join('')}${tail}.`;
    case 'medicamento':
      return `Se administró ${f.farmaco || 'medicamento'}${f.dosis ? ` ${f.dosis}` : ''}${f.via ? ` por vía ${f.via}` : ''}${at(e)}${tail}.`;
    case 'complicacion':
      return `${String(f.tipo || 'Complicación').replace(/^./, c => c.toUpperCase())}${on(f)}${f.grado ? ` (${f.grado})` : ''}${at(e)}`
        + `${f.manejo ? `, manejada con ${f.manejo}` : ''}${tail}.`;
    case 'resultado':
      return `Resultado final${on(f)}: ${[has(f.residual) && `estenosis residual de ${f.residual}%`, f.timi && `flujo TIMI ${f.timi}`,
        f.blush && `blush miocárdico grado ${f.blush}`, f.comentario]
        .filter(Boolean).join(', ')}${tail}.`;
    case 'cierre':
      return `${f.metodo ? `Hemostasia con ${f.metodo}. ` : ''}${[has(f.contraste) && `Contraste total ${f.contraste} ml`, has(f.tfg) && `TFG ${f.tfg} ml/min/1.73 m²`,
        has(f.fluoro) && `tiempo de fluoroscopía ${f.fluoro} min`,
        has(f.kerma) && `kerma en aire ${f.kerma} mGy`, has(f.pda) && `producto dosis-área ${f.pda} Gy·cm²`].filter(Boolean).join(', ')}${tail}.`;
    default:
      return `${e.note || 'Nota'}${at(e)}.`;
  }
}

const byTime = (a: ProcEvent, b: ProcEvent) => (a.time && b.time ? a.time.localeCompare(b.time) : 0);

/** Narrative in paragraphs: technique, findings, intervention, complications, result. */
export function narrativeOf(events: ProcEvent[], acquisitions: string | null): { label: string; text: string }[] {
  const list = [...events].sort(byTime);
  const pick = (types: string[]) => list.filter(e => types.includes(e.type));
  const para = (label: string, items: ProcEvent[], prefix = '') =>
    (items.length ? [{ label, text: `${prefix}${items.map(sentenceOf).join(' ')}`.replace(/\s+/g, ' ').replace(/ ([,.;:])/g, '$1').trim() }] : []);
  const intervention = pick(['balon', 'stent', 'marcapasos', 'medicamento', 'nota'])
    .concat(pick(['imagen_intra', 'fisiologia']).filter(e => e.fields.momento === 'posterior a ICP')).sort(byTime);
  const findings = pick(['lesion']).concat(pick(['imagen_intra', 'fisiologia']).filter(e => e.fields.momento !== 'posterior a ICP'));
  const complications = list.filter(e => e.type === 'complicacion' || (e.flag === 'complicacion' && e.type !== 'complicacion'));
  const out = [
    ...(pick(['acceso', 'diagnostico', 'cierre']).length || !acquisitions
      ? para('Técnica', pick(['acceso', 'diagnostico', 'cierre']), acquisitions ? `${acquisitions} ` : '')
      : [{ label: 'Técnica', text: acquisitions }]),
    ...para('Hallazgos', findings),
    ...para('Intervención', intervention),
    ...(complications.length ? para('Complicaciones', complications, 'Complicaciones: ')
      : list.length ? [{ label: 'Complicaciones', text: 'Sin complicaciones durante el procedimiento.' }] : []),
    ...para('Resultado', pick(['resultado'])),
  ];
  const stents = pick(['stent']);
  if (stents.length) {
    const total = stents.reduce((a, s) => a + (Number(s.fields.long) || 0), 0);
    out.push({ label: 'Resumen', text: `${stents.length > 1 ? `Se implantaron ${stents.length} stents` : 'Se implantó 1 stent'}: `
      + `${stents.map(s => `${s.fields.vaso || '—'} ${dims(s.fields)}`.trim()).join('; ')}${stents.length > 1 && total ? ` (longitud total ${total} mm)` : ''}.` });
  }
  return out;
}

/** DICOM AcquisitionTime (HHMMSS.ffffff) → HH:MM:SS */
export const dicomTime = (t: string | null) => (t && /^\d{6}/.test(t) ? `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}` : '');
