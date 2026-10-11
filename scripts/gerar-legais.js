// Gera public/termos.html e public/privacidade.html a partir de docs/legal/*.md (fonte única dos textos).
// Uso: node scripts/gerar-legais.js. O teste test/legais.test.js confere que as páginas estão em dia com o .md.
// Enquanto o documento tiver marcações de pendência, ou enquanto docs/legal/estado.json não marcar a publicação final,
// a página sai com noindex e com uma faixa de versão candidata no topo.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = new URL('../', import.meta.url).pathname;
export const DOCUMENTOS = [
  { md: 'docs/legal/termos-de-uso.md', html: 'public/termos.html', titulo: 'Termos de Uso', caminho: '/termos' },
  { md: 'docs/legal/politica-de-privacidade.md', html: 'public/privacidade.html', titulo: 'Política de Privacidade', caminho: '/privacidade' },
];
const PENDENCIA = /\[(?:PENDÊNCIA|PENDENTE|DADO DA THE[N]EIL)[^\]]*\]/;
export const publicado = () => JSON.parse(readFileSync(raiz + 'docs/legal/estado.json', 'utf8')).publicado === true;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  .replace(/\[(?:PENDÊNCIA|PENDENTE|DADO DA THE[N]EIL)[^\]]*\]/g, m => `<mark class="pendencia">${m}</mark>`)
  // Contatos clicáveis: email e site citados no texto.
  .replace(/\b[a-z0-9._-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, m => `<a href="mailto:${m}">${m}</a>`)
  .replace(/\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, m => `<a href="https://${m}" rel="noopener">${m}</a>`);
// Âncora das seções numeradas ("## 7. Hospedagem…" → #secao-7); as demais, pelo texto.
const ancora = t => { const n = /^(\d+)\./.exec(t); return n ? `secao-${n[1]}` : t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
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
    if ((m = /^(#{1,3}) (.*)$/.exec(l))) { const n = m[1].length; out.push(n === 2 ? `<h2 id="${ancora(m[2])}">${inline(m[2])}</h2>` : `<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
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

// Índice das seções (## do documento), logo depois do título e da linha de versão.
function indice(texto) {
  const secoes = [...texto.matchAll(/^## (.*)$/gm)].map(m => m[1]);
  if (secoes.length < 3) return '';
  return `<nav class="legal-indice" aria-label="Índice"><details><summary>Índice · ${secoes.length} seções</summary><ol>${secoes.map(t => `<li><a href="#${ancora(t)}">${esc(t.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></details></nav>`;
}

export function pagina({ titulo, md, caminho }) {
  const texto = readFileSync(raiz + md, 'utf8');
  const pendente = PENDENCIA.test(texto), candidata = pendente || !publicado();
  const corpo = paraHtml(texto).replace(/(<\/h1>\n<p>[^\n]*<\/p>)/, `$1\n${indice(texto)}`);
  const outro = DOCUMENTOS.find(d => d.caminho !== caminho);
  const contato = /\b[a-z0-9._-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.exec(texto)?.[0];   // canal citado no próprio documento
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo} · GreenIA</title>
<meta name="robots" content="${candidata ? 'noindex' : 'index'}">
<link rel="icon" href="/assets/greenia-marca.svg">
<link rel="stylesheet" href="/fontes/fontes.css">
<link rel="stylesheet" href="/estilo.css">
<style>
.legal-indice{margin:8px 0 32px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}
.legal-indice summary{cursor:pointer;padding:12px 16px;min-height:44px;box-sizing:border-box;font:600 15px/1.4 var(--sans);color:var(--ink)}
.legal-indice ol{margin:0;padding:0 16px 14px 40px;columns:2 260px;column-gap:32px}
.legal-indice li{break-inside:avoid;padding:3px 0;font:400 14.5px/1.5 var(--sans)}
.legal h2[id]{scroll-margin-top:16px}
.legal a{color:var(--forest-text)}
.legal-rodape{max-width:1080px;margin:56px auto 0;padding:24px 24px calc(32px + env(safe-area-inset-bottom));border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px 24px;font:400 14px/1.5 var(--sans);color:var(--muted)}
.legal-rodape a{color:var(--ink);text-decoration:none;min-height:24px}
.legal-rodape a:hover{text-decoration:underline}
</style>
</head>
<body>
<!-- Gerado por scripts/gerar-legais.js a partir de ${md}. Não editar à mão. -->
<header class="topo">
  <a class="marca" href="/" style="text-decoration:none;color:var(--ink)"><img src="/assets/greenia-marca.svg" width="26" height="26" alt="" aria-hidden="true"><span>Green<span class="ia">IA</span></span></a>
  <a class="btn-texto" href="/">Voltar ao site</a>
</header>
<main class="politica legal" id="topo-legal">
${candidata ? `<p class="faixa-aviso atencao" role="note"><b>Versão final candidata, ainda não publicada.</b> ${pendente ? 'Há pontos pendentes de registro, marcados no texto. ' : ''}Este documento não está vigente.</p>\n` : ''}${corpo}
<p><a href="#topo-legal">Voltar ao topo</a></p>
</main>
<footer class="legal-rodape">
  <a href="${outro.caminho}">${outro.titulo}</a>
${contato ? `  <a href="mailto:${contato}">Contato: ${contato}</a>\n` : ''}  <a href="/">Voltar ao site</a>
</footer>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const d of DOCUMENTOS) { writeFileSync(raiz + d.html, pagina(d)); console.log(`gerado ${d.html}`); }
}
