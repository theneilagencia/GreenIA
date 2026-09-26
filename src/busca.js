// Busca nas bases: SQLite FTS5 com remoção de acentos, sem ranking sofisticado.
import { exec, todos } from './db.js';

const PARADAS = new Set('a o e as os um uma de da do das dos em no na nos nas por para com sem que se ao aos à às é ser são como mais mas ou ou seu sua seus suas qual quais quando onde isso esta este essa esse eu voce você me te lhe nos vos ele ela eles elas meu minha tem ter foi era pelo pela pelos pelas sobre entre até também muito já não sim'.split(' '));

// Pedaços de ~1.000 caracteres, com sobreposição, respeitando parágrafos.
export function pedacos(texto, tam = 1000, sobra = 150) {
  const out = [];
  let atual = '';
  for (const par of texto.split(/\n{2,}/)) {
    if ((atual + '\n\n' + par).length > tam && atual) { out.push(atual); atual = atual.slice(-sobra); }
    atual = atual ? `${atual}\n\n${par}` : par;
    while (atual.length > tam * 1.5) { out.push(atual.slice(0, tam)); atual = atual.slice(tam - sobra); }
  }
  if (atual.trim()) out.push(atual);
  return out;
}

export function indexar(db, documentoId, texto) {
  exec(db, 'delete from trechos where documento_id = ?', documentoId);
  for (const p of pedacos(texto)) exec(db, 'insert into trechos (texto, documento_id) values (?, ?)', p, documentoId);
}

export const desindexar = (db, documentoId) => exec(db, 'delete from trechos where documento_id = ?', documentoId);

const termos = consulta => [...new Set(String(consulta).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !PARADAS.has(t)))].slice(0, 12);

/** Trechos mais próximos da consulta, só dos documentos permitidos. */
export function buscar(db, consulta, documentoIds, limite = 5) {
  const t = termos(consulta);
  if (!t.length || !documentoIds.length) return [];
  const ids = documentoIds.map(Number);
  return todos(db, `select documento_id, texto from trechos where trechos match ? and documento_id in (${ids.map(() => '?').join(',')}) order by rank limit ?`,
    t.map(x => `"${x}"*`).join(' OR '), ...ids, limite);
}
