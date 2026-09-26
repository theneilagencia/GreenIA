// Markdown mínimo para as respostas: parágrafos, títulos, listas, checklist,
// negrito, itálico, código e tabelas. Escapa tudo antes de formatar.
import { esc } from '/comum.js';

const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const ehTabela = (l, prox) => /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(prox || '');

// Devolve { html, tabelas }: tabelas guarda as linhas de cada tabela, para o CSV.
export function renderizar(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const out = [], tabelas = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    if (ehTabela(l, linhas[i + 1])) {
      const cab = celulas(l);
      const corpo = [];
      i += 2;
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      tabelas.push([cab, ...corpo]);
      out.push(`<div class="tabela-wrap"><table><thead><tr>${cab.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        corpo.map(r => `<tr>${cab.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div><button type="button" class="btn btn-linha btn-pequeno" data-csv="${tabelas.length - 1}">Baixar tabela em CSV</button></div>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length < 3 ? 3 : 4}>${inline(h[2])}</h${h[1].length < 3 ? 3 : 4}>`); i++; continue; }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      const ordenada = /^\s*\d/.test(l);
      const itens = [];
      while (i < linhas.length && /^\s*([-*]|\d+[.)])\s+/.test(linhas[i])) {
        const item = linhas[i++].replace(/^\s*([-*]|\d+[.)])\s+/, '');
        const ck = /^\[( |x|X)\]\s+(.*)$/.exec(item);
        itens.push(ck ? `<li>${ck[1] === ' ' ? '☐' : '☑'} ${inline(ck[2])}</li>` : `<li>${inline(item)}</li>`);
      }
      out.push(ordenada ? `<ol>${itens.join('')}</ol>` : `<ul>${itens.join('')}</ul>`);
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !ehTabela(linhas[i], linhas[i + 1]) && !/^(#{1,4})\s|^\s*([-*]|\d+[.)])\s+/.test(linhas[i])) par.push(inline(linhas[i++]));
    out.push(`<p>${par.join('<br>')}</p>`);
  }
  return { html: out.join(''), tabelas };
}

export function baixarCsv(linhas, nome = 'tabela.csv') {
  const cel = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
