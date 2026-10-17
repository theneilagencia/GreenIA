// Prévia do PowerPoint na conversa: miniatura do primeiro slide no cartão do arquivo e, ao clicar, todos os slides
// num painel, na proporção do arquivo, com fundo, textos (fonte, tamanho e cor), faixas e tabelas. O desenho usa
// unidades do próprio slide (cqw), então a mesma descrição serve para a miniatura e para o slide grande.
import { esc } from '/comum.js';

const familia = f => (/mono|courier|consolas|menlo/i.test(f) ? "'Courier New',var(--mono)" : /serif|georgia|times|garamond|instrument|playfair|merriweather|lora|cambria|baskerville/i.test(f) && !/sans/i.test(f) ? `'${f}',var(--serif)` : `'${f}',var(--sans)`);
const cache = new Map();
export async function lerPrevia(url) {
  if (!cache.has(url)) cache.set(url, fetch(url, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : Promise.reject(new Error('previa')))));
  return cache.get(url);
}

export function slideHtml(p, s, rotulo = '') {
  const W = p.w, pt = W / 12700;   // largura do slide em pontos
  const pc = (v, t) => `${(v / t) * 100}%`, fs = sz => `${(sz / pt) * 100}cqw`;
  const formas = s.formas.map(f => {
    const caixa = `left:${pc(f.x, W)};top:${pc(f.y, p.h)};width:${pc(f.w, W)};height:${pc(f.h, p.h)}`;
    if (f.tipo === 'imagem') return p.midia ? `<img class="pv-img" style="${caixa}" src="${esc(p.midia + f.midia)}" alt="" loading="lazy">` : '';
    if (f.tipo === 'retangulo') return `<span class="pv-ret" style="${caixa};background:#${esc(f.cor)}"></span>`;
    if (f.tipo === 'caminho') return `<svg class="pv-svg" style="${caixa}" viewBox="0 0 ${Number(f.vw) || 1} ${Number(f.vh) || 1}" preserveAspectRatio="none" aria-hidden="true"><path d="${esc(f.d)}" fill="${f.cor ? `#${esc(f.cor)}` : 'none'}" fill-opacity="${Number(f.alfa) || 1}" stroke="${f.traco ? `#${esc(f.traco)}` : 'none'}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    if (f.tipo === 'tabela') return `<table class="pv-tab" style="left:${pc(f.x, W)};top:${pc(f.y, p.h)};width:${pc(f.w, W)}">${f.linhas.map((l, i) => `<tr>${l.map(c => `<td style="font-size:${fs(c.sz)};${c.b || i === 0 ? 'font-weight:700;' : ''}${c.fundo ? `background:#${esc(c.fundo)}` : ''}">${esc(c.texto)}</td>`).join('')}</tr>`).join('')}</table>`;
    const pars = f.paragrafos.map(par => `<p style="text-align:${{ ctr: 'center', r: 'right', just: 'justify' }[par.alinhamento] || 'left'};${par.entrelinha ? `line-height:${fs(par.entrelinha)};` : ''}${par.antes ? `margin-top:${fs(par.antes)};` : ''}${par.recuo ? `padding-left:${pc(par.recuo, f.w)};` : ''}">${par.marcador ? `<span class="pv-marca">${esc(par.marcador)}</span>` : ''}${par.runs.map(r => `<span style="font-family:${familia(r.fonte)};font-size:${fs(r.sz)};color:#${esc(r.cor)};${r.b ? 'font-weight:700;' : ''}${r.i ? 'font-style:italic;' : ''}${r.spc ? `letter-spacing:${fs(r.spc)};` : ''}">${esc(r.t)}</span>`).join('')}</p>`).join('');
    return `<div class="pv-txt${f.quebra ? '' : ' pv-sem-quebra'}" style="${caixa};justify-content:${{ b: 'flex-end', ctr: 'center' }[f.ancora] || 'flex-start'}">${pars}</div>`;
  }).join('');
  return `<div class="pv-slide" style="aspect-ratio:${p.w}/${p.h};background:#${esc(s.fundo || 'FFFFFF')}" role="img" aria-label="${esc(rotulo)}">${formas}</div>`;
}

// Miniatura no cartão: carrega a prévia quando o cartão aparece.
export function ligarMiniaturas(raiz) {
  for (const el of raiz.querySelectorAll('[data-previa]:not([data-previa-pronta])')) {
    el.dataset.previaPronta = '1';
    lerPrevia(el.dataset.previa).then(p => {
      if (!p.slides.length) return;
      el.innerHTML = slideHtml(p, p.slides[0], 'Primeiro slide');
      el.hidden = false;
      const total = el.closest('.arquivo-previa')?.querySelector('[data-previa-total]');
      if (total) total.textContent = `${p.slides.length} ${p.slides.length === 1 ? 'slide' : 'slides'}`;
    }).catch(() => { el.remove(); });
  }
}

// Painel com todos os slides; Esc fecha e devolve o foco.
export async function abrirPrevia(url, { baixar, nome } = {}) {
  const antes = document.activeElement;
  const fundo = document.createElement('div');
  fundo.className = 'pv-painel-fundo';
  fundo.innerHTML = `<div class="pv-painel" role="dialog" aria-modal="true" aria-label="Prévia de ${esc(nome || 'apresentação')}"><div class="pv-topo"><b>${esc(nome || 'Apresentação')}</b><span class="pv-conta" aria-live="polite">Carregando…</span>${baixar ? `<a class="btn btn-verde btn-pequeno" href="${esc(baixar)}" download>Baixar</a>` : ''}<button type="button" class="btn btn-linha btn-pequeno" data-fechar>Fechar</button></div><div class="pv-lista" tabindex="0"></div></div>`;
  document.body.append(fundo);
  const fechar = () => { fundo.remove(); antes?.focus?.(); };
  fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
  fundo.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
  fundo.querySelector('[data-fechar]').focus();
  try {
    const p = await lerPrevia(url);
    fundo.querySelector('.pv-conta').textContent = `${p.slides.length} ${p.slides.length === 1 ? 'slide' : 'slides'}`;
    fundo.querySelector('.pv-lista').innerHTML = p.slides.map((s, i) => `<figure class="pv-item">${slideHtml(p, s, `Slide ${i + 1}`)}<figcaption>${i + 1}</figcaption></figure>`).join('');
  } catch { fundo.querySelector('.pv-conta').textContent = 'Não foi possível carregar a prévia. O arquivo pode ser baixado normalmente.'; }
}
