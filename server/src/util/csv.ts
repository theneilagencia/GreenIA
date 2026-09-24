// CSV simples (RFC 4180): leitura com separador detectado (; ou ,), BOM e aspas,
// e escrita com ; (o padrão do Excel em português). Os CSVs exportados do ERP
// são simples e não justificam uma dependência.

export function parseCsv(text: string, sep?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const d = sep ?? ((firstLine.split(';').length >= firstLine.split(',').length) ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

// Linhas como objetos, pela primeira linha (cabeçalho).
export function parseCsvObjects(text: string, sep?: string): Record<string, string>[] {
  const [head, ...rest] = parseCsv(text, sep);
  if (!head) return [];
  const keys = head.map(h => h.trim());
  return rest.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const cellOut = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Fórmula no começo da célula vira texto (evita injeção de fórmula ao abrir no Excel).
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[";\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap(r => Object.keys(r)))];
  return '\uFEFF' + [cols.map(cellOut).join(';'), ...rows.map(r => cols.map(c => cellOut(r[c])).join(';'))].join('\r\n') + '\r\n';
}
