// Markdown mínimo para as respostas: parágrafos, títulos, listas, checklist,
// negrito, itálico, código (em linha e em bloco) e tabelas. Escapa tudo antes de formatar.
import { esc } from '/comum.js';
import { ICONE_RESPOSTA } from '/resposta-ui.js';
import { celulas, ehTabela, gerarCsv } from '/tabelas.js';

const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

// Devolve { html, tabelas }: tabelas guarda as linhas de cada tabela, para o CSV.
export function renderizar(texto, { csvHref, xlsxHref } = {}) {
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
      const n = tabelas.length - 1, linhasTxt = `${corpo.length} ${corpo.length === 1 ? 'linha' : 'linhas'}`;
      // Download como cartão de anexo (ícone, nome e tipo), logo abaixo da tabela.
      // Com endereço do servidor, a planilha é Excel (.xlsx, números como números); sem ele, CSV gerado aqui.
      const excel = !!xlsxHref;
      const cartao = `<span class="anexo-resposta-icone">${ICONE_RESPOSTA.planilha}</span><span class="anexo-resposta-texto"><b>Baixar planilha</b><small>${excel ? 'Excel' : 'CSV'} · Tabela ${n + 1} · ${linhasTxt}</small></span><span class="anexo-resposta-acao">${ICONE_RESPOSTA.baixar}</span>`;
      out.push(`<div class="tabela-wrap"><table><thead><tr>${cab.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        corpo.map(r => `<tr>${cab.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${excel
        ? `<div class="anexo-resposta-linha"><a class="anexo-resposta" data-planilha="${n}" href="${esc(xlsxHref(n))}" download title="Baixar a tabela em planilha do Excel">${cartao}</a>${csvHref ? `<a class="link-sutil anexo-resposta-csv" data-csv="${n}" href="${esc(csvHref(n))}" download="tabela.csv">CSV</a>` : ''}</div>`
        : csvHref ? `<a class="anexo-resposta" data-csv="${n}" href="${esc(csvHref(n))}" download="tabela.csv" title="Baixar a tabela em planilha">${cartao}</a>`
        : `<button type="button" class="anexo-resposta" data-csv="${n}" title="Baixar a tabela em planilha">${cartao}</button>`}`);
      continue;
    }
    // Bloco de código entre ```: monoespaçado, com "Copiar código" no canto (ligado em resposta-ui.js).
    if (/^\s*```/.test(l)) {
      const lingua = l.replace(/^\s*```/, '').trim().slice(0, 30), codigo = [];
      i++;
      while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) codigo.push(linhas[i++]);
      i++;
      out.push(`<div class="bloco-codigo"><div class="bloco-codigo-topo"><span>${esc(lingua || 'Código')}</span><button type="button" class="bloco-codigo-copiar" data-copiar-codigo aria-label="Copiar código" title="Copiar código">${ICONE_RESPOSTA.copiar}</button></div><pre tabindex="0"><code>${esc(codigo.join('\n'))}</code></pre></div>`);
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
    while (i < linhas.length && linhas[i].trim() && !ehTabela(linhas[i], linhas[i + 1]) && !/^(#{1,4})\s|^\s*([-*]|\d+[.)])\s+|^\s*```/.test(linhas[i])) par.push(inline(linhas[i++]));
    out.push(`<p>${par.join('<br>')}</p>`);
  }
  return { html: out.join(''), tabelas };
}

export function baixarCsv(linhas, nome = 'tabela.csv') {
  const blob = new Blob([gerarCsv(linhas)], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
