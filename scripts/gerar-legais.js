// Gera public/termos.html e public/privacidade.html a partir de docs/legal/*.md (fonte única dos textos).
// Uso: node scripts/gerar-legais.js. O teste test/legais.test.js confere que as páginas estão em dia com o .md.
// Enquanto o documento tiver marcações de pendência, a página mostra um aviso de rascunho no topo.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = new URL('../', import.meta.url).pathname;
export const DOCUMENTOS = [
  { md: 'docs/legal/termos-de-uso.md', html: 'public/termos.html', titulo: 'Termos de Uso', caminho: '/termos' },
  { md: 'docs/legal/politica-de-privacidade.md', html: 'public/privacidade.html', titulo: 'Política de Privacidade', caminho: '/privacidade' },
];
const PENDENCIA = /\[(?:PENDÊNCIA|DADO DA THE[N]EIL)[^\]]*\]/;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  .replace(/\[(?:PENDÊNCIA|DADO DA THE[N]EIL)[^\]]*\]/g, m => `<mark class="pendencia">${m}</mark>`);
const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

// Markdown dos documentos legais: títulos, parágrafos, listas (com continuação), tabelas, citações e ênfase.
export function paraHtml(md) {
  const linhas = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const bloco = teste => { const b = []; while (i < linhas.length && teste(linhas[i])) b.push(linhas[i++]); return b; };
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(l))) { const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^>/.test(l)) { const b = bloco(x => /^>/.test(x)).map(x => x.replace(/^> ?/, '')); out.push(`<blockquote>${paraHtml(b.join('\n'))}</blockquote>`); continue; }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      const cab = celulas(l); i += 2;
      const corpo = bloco(x => /^\s*\|/.test(x)).map(celulas);
      out.push(`<div class="tabela-rolagem"><table class="tabela"><thead><tr>${cab.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^- /.test(l)) {
      const itens = [];
      while (i < linhas.length && (/^- /.test(linhas[i]) || (/^ {2,}\S/.test(linhas[i]) && itens.length))) {
        if (/^- /.test(linhas[i])) itens.push(linhas[i].slice(2)); else itens[itens.length - 1] += ' ' + linhas[i].trim();
        i++;
      }
      out.push(`<ul>${itens.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }
    const p = bloco(x => x.trim() && !/^(#{1,3} |>|- |\s*\|)/.test(x));
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

export function pagina({ titulo, md }) {
  const texto = readFileSync(raiz + md, 'utf8');
  const rascunho = PENDENCIA.test(texto);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo} · GreenIA</title>
<meta name="robots" content="${rascunho ? 'noindex' : 'index'}">
<link rel="icon" href="/assets/greenia-marca.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap">
<link rel="stylesheet" href="/estilo.css">
</head>
<body>
<!-- Gerado por scripts/gerar-legais.js a partir de ${md}. Não editar à mão. -->
<header class="topo">
  <a class="marca" href="/" style="text-decoration:none;color:var(--ink)"><img src="/assets/greenia-marca.svg" width="26" height="26" alt="" aria-hidden="true"><span>Green<span class="ia">IA</span></span></a>
  <a class="btn-texto" href="/">Voltar ao site</a>
</header>
<main class="politica legal">
${rascunho ? '<p class="faixa-aviso atencao" role="note"><b>Rascunho em revisão.</b> Este documento ainda tem pontos pendentes de aprovação e não está vigente.</p>\n' : ''}${paraHtml(texto)}
</main>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const d of DOCUMENTOS) { writeFileSync(raiz + d.html, pagina(d)); console.log(`gerado ${d.html}`); }
}
