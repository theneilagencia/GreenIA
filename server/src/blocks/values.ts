// Leitura de valores como aparecem em documentos e planilhas brasileiras:
// números ("1.250,50", "R$ 1.980,00", "1250.5"), datas ("30/09/2026",
// "2026-09-30T10:00:00-03:00", número de série do Excel), caminhos em objetos
// e padrões de nome de arquivo ("*pedido*").
import { normPt } from '../util/text.ts';

export function parseNumberBr(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '').replace(/%$/, '');
  if (!s || !/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');                 // 1.250,50
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');             // 1,250.50
  else if (lastDot >= 0 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, ''); // 1.250.000
  else if (lastDot >= 0 && /^\d{1,3}\.\d{3}$/.test(s.replace('-', ''))) s = s.replace('.', ''); // 1.250 (milhar)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Data (dia, sem hora) em UTC. Aceita ISO, dd/mm/aaaa, dd-mm-aaaa e série do Excel.
export function parseDateBr(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); // série do Excel
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? d : null;
  }
  return null;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Caminho "a.b.0.c". Em registros de planilha, a chave é o nome da coluna: se
// não houver coincidência exata, compara sem acento, maiúsculas e espaços.
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  if (Array.isArray(obj) && /^\d+$/.test(path)) return obj[Number(path)];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const rec = obj as Record<string, unknown>;
    if (path in rec) return rec[path];
    const target = normPt(path);
    const k = Object.keys(rec).find(key => normPt(key) === target);
    if (k) return rec[k];
  }
  const [head, ...rest] = path.split('.');
  if (!rest.length) return undefined;
  return getPath(getPath(obj, head), rest.join('.'));
}

// Padrão de nome de arquivo com * (sem diferenciar maiúsculas e acentos).
export function globMatch(pattern: string | undefined, name: string): boolean {
  if (!pattern) return true;
  const re = new RegExp('^' + normPt(pattern).split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(normPt(name));
}

// Chave de junção: sem espaços nas pontas e sem diferenciar maiúsculas; chave só
// com dígitos é comparada como número ("00123" = "123").
export function normKey(v: unknown): string {
  const s = normPt(String(v ?? ''));
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

// Frase inteira dentro de um texto normalizado (evita "rg" casar com "cargo").
export function containsPhrase(normalizedText: string, phrase: string): boolean {
  const p = normPt(phrase).replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
  return !!p && new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(normalizedText);
}
