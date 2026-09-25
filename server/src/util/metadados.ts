// Metadados das linhas acima de uma tabela (título, período, unidade,
// responsável...), comuns em planilhas e relatórios exportados. As linhas não
// são descartadas: viram metadados com a linha de origem, disponíveis para o
// assistente e para o mapeamento de importação.
import { normPt } from './text.ts';

type Valor = string | number | null;
export interface Metadados {
  titulo?: string;
  campos: Record<string, string>;                // rótulo como está no arquivo → valor
  linhaDe: Record<string, number>;               // rótulo → linha de origem (e "titulo")
  linhas: { n: number; texto: string }[];        // todas as linhas, como vieram
}

const ROTULO = /^([^:]{1,40}?)\s*:\s*(.+)$/;
const rotuloCurto = (s: string) => s.length <= 40 && !/\d/.test(s) && /[A-Za-zÀ-ÿ]/.test(s);

export function lerMetadados(linhas: { n: number; celulas: Valor[] }[]): Metadados {
  const m: Metadados = { campos: {}, linhaDe: {}, linhas: [] };
  const poe = (k: string, v: string, n: number) => { const key = k.trim().replace(/:$/, '').trim(); if (key && v.trim() && !(key in m.campos)) { m.campos[key] = v.trim(); m.linhaDe[key] = n; } };
  for (const l of linhas) {
    const cs = l.celulas.map(c => (c === null || c === undefined ? '' : String(c).trim())).filter(Boolean);
    if (!cs.length) continue;
    m.linhas.push({ n: l.n, texto: cs.join(' | ') });
    let usou = false;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.endsWith(':') && cs[i + 1] !== undefined) { poe(c, cs[i + 1], l.n); i++; usou = true; continue; }
      const r = ROTULO.exec(c);
      if (r && !/^https?$/i.test(r[1])) { poe(r[1], r[2], l.n); usou = true; }
    }
    if (!usou && cs.length === 2 && rotuloCurto(cs[0])) { poe(cs[0], cs[1], l.n); usou = true; }
    if (!usou && !m.titulo) { m.titulo = cs.join(' '); m.linhaDe.titulo = l.n; }
  }
  return m;
}

// Valor de um metadado pelo rótulo (sem diferenciar acento e maiúsculas); "titulo" é o título.
export function metadado(m: Metadados | undefined, chave: string): { valor: string; linha: number } | null {
  if (!m) return null;
  if (normPt(chave) === 'titulo' && m.titulo) return { valor: m.titulo, linha: m.linhaDe.titulo };
  const k = Object.keys(m.campos).find(x => normPt(x) === normPt(chave));
  return k ? { valor: m.campos[k], linha: m.linhaDe[k] } : null;
}

export const temMetadados = (m: Metadados | undefined) => !!m && (!!m.titulo || Object.keys(m.campos).length > 0);
