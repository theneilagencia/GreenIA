// Apresentação enviada em PDF como MODELO: "monte a do novo cliente seguindo exatamente o mesmo layout". Três etapas:
//  1. leitura (navegador isolado, pdf.js): cada página vira um fundo SEM o texto (fotos, linhas, faixas e cores
//     exatamente como no original) e a lista de textos com posição, fonte, tamanho e cor;
//  2. blocos: os textos viram blocos (linhas da mesma fonte, tamanho, cor e alinhamento), cada um com o espaço que
//     ocupa no slide;
//  3. o PowerPoint: um slide por página, fundo + caixas de texto EDITÁVEIS na mesma posição, fonte, tamanho e cor.
// A troca do conteúdo (adaptarModelo) mantém a estrutura de cada slide e só usa o que o material da conversa traz.
import { comLeitorPdf, memoriaLivreMb } from './visual/chromium.js';
import { pdfLeveSeparado } from './pdf-leve.js';
import { REGRAS_DE_ESCRITA, limparVicios, viciosDeEscrita, juntarLetrasEspacadas, corrigirDiaDaSemana } from './escrita.js';

export const MAX_PAGINAS_MODELO = 60;

// ---------- 1. leitura ----------
// Executado dentro da página do leitor (pdf.js carregado da origem virtual).
async function lerPagina({ n, escala }) {
  // Caminhos (Path2D) anotados: cada forma desenhada vira forma nativa no PowerPoint (fundo, faixa, linha, ícone).
  if (!window.__caminhos) {
    window.__caminhos = true;
    const P = window.Path2D;
    window.Path2D = class extends P {
      constructor(p) { super(p); this.__s = p && p.__s ? p.__s.map(x => [...x]) : []; }
      moveTo(x, y) { this.__s.push(['M', x, y]); return super.moveTo(x, y); }
      lineTo(x, y) { this.__s.push(['L', x, y]); return super.lineTo(x, y); }
      bezierCurveTo(a, b, c, d, e, f) { this.__s.push(['C', a, b, c, d, e, f]); return super.bezierCurveTo(a, b, c, d, e, f); }
      quadraticCurveTo(a, b, c, d) { this.__s.push(['Q', a, b, c, d]); return super.quadraticCurveTo(a, b, c, d); }
      rect(x, y, w, h) { this.__s.push(['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']); return super.rect(x, y, w, h); }
      closePath() { this.__s.push(['Z']); return super.closePath(); }
      addPath(p, m) {
        const t = m ? (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] : (x, y) => [x, y];
        for (const [k, ...v] of p.__s || []) { const o = [k]; for (let i = 0; i < v.length; i += 2) o.push(...t(v[i], v[i + 1])); this.__s.push(o); }
        return super.addPath(p, m);
      }
    };
  }
  const doc = window.__doc || (window.__doc = await (await import('/pdfjs.mjs')).getDocument({ data: new Uint8Array(await (await fetch('/arquivo.pdf')).arrayBuffer()), isEvalSupported: false }).promise);
  if (n === 0) return { paginas: doc.numPages };
  const page = await doc.getPage(n);
  const vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: escala });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  // O texto não é desenhado no fundo; cada glifo desenhado é anotado (posição e cor) para saber a cor de cada texto.
  const glifos = [];
  ctx.fillText = function (t, x, y) { const m = this.getTransform(); glifos.push([m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f, this.fillStyle]); };
  ctx.strokeText = () => {};
  // Formas e imagens desenhadas, em coordenadas da página (pontos) e na ordem do desenho.
  const elementos = [];
  let complexo = false, seg = [];
  const mt = () => ctx.getTransform();
  const ponto = (m, x, y) => [(m.a * x + m.c * y + m.e) / escala, (m.b * x + m.d * y + m.f) / escala];
  const transformar = (lista, m) => lista.map(([k, ...v]) => { const o = [k]; for (let i = 0; i < v.length; i += 2) o.push(...ponto(m, v[i], v[i + 1])); return o; });
  const cor = (estilo) => typeof estilo === 'string' ? estilo : (complexo = complexo || `estilo:${estilo?.constructor?.name}`, '#808080');
  const proto = Object.getPrototypeOf(ctx);
  const orig = { fill: proto.fill, stroke: proto.stroke, fillRect: proto.fillRect, drawImage: proto.drawImage, beginPath: proto.beginPath, moveTo: proto.moveTo, lineTo: proto.lineTo, bezierCurveTo: proto.bezierCurveTo, rect: proto.rect, closePath: proto.closePath };
  const I = new DOMMatrix();
  ctx.beginPath = function () { seg = []; return orig.beginPath.call(this); };
  ctx.moveTo = function (x, y) { seg.push(['M', ...ponto(mt(), x, y)]); return orig.moveTo.call(this, x, y); };
  ctx.lineTo = function (x, y) { seg.push(['L', ...ponto(mt(), x, y)]); return orig.lineTo.call(this, x, y); };
  ctx.bezierCurveTo = function (a, b, c, d, e, f) { const m = mt(); seg.push(['C', ...ponto(m, a, b), ...ponto(m, c, d), ...ponto(m, e, f)]); return orig.bezierCurveTo.call(this, a, b, c, d, e, f); };
  ctx.rect = function (x, y, w, h) { const m = mt(); seg.push(['M', ...ponto(m, x, y)], ['L', ...ponto(m, x + w, y)], ['L', ...ponto(m, x + w, y + h)], ['L', ...ponto(m, x, y + h)], ['Z']); return orig.rect.call(this, x, y, w, h); };
  ctx.closePath = function () { seg.push(['Z']); return orig.closePath.call(this); };
  const anotar = (modo, alvo) => {
    const lista = alvo && alvo.__s ? transformar(alvo.__s, mt()) : seg.map(x => [...x]);
    if (!lista.length || elementos.length > 3000) { if (elementos.length > 3000) complexo = 'muitas'; return; }
    const m = mt(), escalaLinha = Math.hypot(m.a, m.b) / escala;
    const estilo = modo === 'fill' ? ctx.fillStyle : ctx.strokeStyle;
    if (typeof estilo !== 'string') {
      // Padrão ou degradê (barra pontilhada, textura): só esta forma vira uma imagem pequena no lugar dela.
      const xs = [], ys = [];
      for (const [, ...v] of lista) for (let i = 0; i < v.length; i += 2) { xs.push(v[i]); ys.push(v[i + 1]); }
      const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1, w = Math.max(...xs) - x0 + 2, h = Math.max(...ys) - y0 + 2;
      try {
        const k = Math.min(4, 1600 / Math.max(w, h, 1)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        const c2 = cv.getContext('2d');
        c2.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
        c2.fillStyle = estilo; c2.strokeStyle = estilo; c2.lineWidth = ctx.lineWidth * escalaLinha; c2.globalAlpha = ctx.globalAlpha;
        const caminho = new Path2D();
        for (const [cmd, ...v] of lista) cmd === 'M' ? caminho.moveTo(...v) : cmd === 'L' ? caminho.lineTo(...v) : cmd === 'C' ? caminho.bezierCurveTo(...v) : cmd === 'Q' ? caminho.quadraticCurveTo(...v) : caminho.closePath();
        modo === 'fill' ? orig.fill.call(c2, caminho) : orig.stroke.call(c2, caminho);
        elementos.push({ t: 'imagem', x: x0, y: y0, w, h, src: cv.toDataURL('image/png'), alfa: 1 });
      } catch (e) { complexo = `padrao:${e?.message}`; }
      return;
    }
    elementos.push({ t: 'forma', modo, d: lista, cor: estilo, alfa: ctx.globalAlpha, largura: modo === 'stroke' ? ctx.lineWidth * escalaLinha : 0 });
  };
  ctx.fill = function (a, b) { anotar('fill', a instanceof Path2D ? a : null); return orig.fill.apply(this, arguments); };
  ctx.stroke = function (a) { anotar('stroke', a instanceof Path2D ? a : null); return orig.stroke.apply(this, arguments); };
  ctx.fillRect = function (x, y, w, h) { const m = mt(), antes = seg; seg = [['M', ...ponto(m, x, y)], ['L', ...ponto(m, x + w, y)], ['L', ...ponto(m, x + w, y + h)], ['L', ...ponto(m, x, y + h)], ['Z']]; anotar('fill', null); seg = antes; return orig.fillRect.call(this, x, y, w, h); };
  ctx.drawImage = function (img, ...a) {
    try {
      const [dx, dy, dw, dh] = a.length >= 8 ? a.slice(4, 8) : a.length >= 4 ? a : [a[0], a[1], img.width, img.height];
      const m = mt(), cs = [ponto(m, dx, dy), ponto(m, dx + dw, dy), ponto(m, dx, dy + dh), ponto(m, dx + dw, dy + dh)];
      const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
      if (w > 2 && h > 2) {
        // Cópia da imagem no tamanho em que aparece (até 1600 px), virada como no desenho.
        const lado = Math.min(1600, Math.max(w, h) * 2), k = lado / Math.max(w, h);
        const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        const c2 = cv.getContext('2d');
        c2.setTransform(m.a / escala * k, m.b / escala * k, m.c / escala * k, m.d / escala * k, (m.e / escala - x0) * k, (m.f / escala - y0) * k);
        orig.drawImage.call(c2, img, ...a);
        const amostra = c2.getImageData(0, 0, cv.width, cv.height).data;
        let alfa = false;
        for (let i = 3; i < amostra.length; i += 4 * 97) if (amostra[i] < 250) { alfa = true; break; }
        elementos.push({ t: 'imagem', x: x0, y: y0, w, h, src: alfa ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88), alfa: ctx.globalAlpha });
      }
    } catch (e) { complexo = `imagem:${e?.message}`; }
    return orig.drawImage.call(this, img, ...a);
  };
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  for (const k of Object.keys(orig)) delete ctx[k];
  const tc = await page.getTextContent();
  const nomeFonte = id => { try { return page.commonObjs.get(id)?.name || ''; } catch { return ''; } };
  const itens = [];
  for (const it of tc.items) {
    if (!it.str || !it.transform) continue;
    const [a, b, cc, d, e, f] = it.transform;
    const tam = Math.hypot(cc, d);
    if (!(tam > 0) || Math.abs(b) > 0.01 * tam) continue;   // texto girado: fica no fundo? não — é descartado (raro em slides)
    const [x, y] = vp1.convertToViewportPoint(e, f);
    const [cx, cy] = vp.convertToViewportPoint(e, f);
    let cor = '#000000', melhor = Infinity;
    for (const [gx, gy, gc] of glifos) { const dd = Math.abs(gx - cx) + Math.abs(gy - cy) * 2; if (dd < melhor) { melhor = dd; cor = gc; } }
    itens.push({ s: it.str, x, y, w: it.width, tam, fonte: nomeFonte(it.fontName) || tc.styles[it.fontName]?.fontFamily || '', cor: typeof cor === 'string' ? cor : '#000000' });
  }
  const fundo = c.toDataURL('image/jpeg', 0.86);
  page.cleanup();
  return { w: vp1.width, h: vp1.height, fundo, itens, elementos: complexo ? null : elementos, motivoRaster: complexo || null };
}

// Memória livre mínima para ler um modelo (navegador enxuto + PDF com imagens reduzidas, medido em ~360 MB).
export const MEMORIA_MODELO_MB = Number(process.env.MODELO_MEMORIA_MIN_MB || 420);
export async function lerModeloPdf(pdfOriginal, { maxPaginas = MAX_PAGINAS_MODELO, escala = 1.34, memoria = memoriaLivreMb } = {}) {
  // Sem memória para ler com folga: recusa com motivo, em vez de derrubar o servidor.
  if (memoria() < MEMORIA_MODELO_MB) throw Object.assign(new Error('memoria'), { codigo: 'modelo_sem_memoria' });
  const { pdf } = await pdfLeveSeparado(pdfOriginal);
  return comLeitorPdf(pdf, async page => {
    const { paginas: total } = await page.evaluate(lerPagina, { n: 0, escala });
    if (total > maxPaginas) throw Object.assign(new Error('paginas'), { codigo: 'modelo_grande', total });
    const paginas = [];
    for (let n = 1; n <= total; n++) {
      const p = await page.evaluate(lerPagina, { n, escala });
      // Imagens das formas nativas: dataURL -> bytes (o PowerPoint guarda cada imagem uma vez).
      const elementos = p.elementos ? p.elementos.map(e => e.t === 'imagem' ? { ...e, mime: e.src.startsWith('data:image/png') ? 'png' : 'jpg', dados: Buffer.from(e.src.split(',')[1], 'base64'), src: undefined } : e) : null;
      paginas.push({ ...p, elementos, fundo: Buffer.from(p.fundo.split(',')[1], 'base64') });
    }
    // Tamanho do texto corrido do documento inteiro (num slide só de título, o título não é texto corrido).
    const corrido = tamanhoCorrido(paginas.flatMap(p => p.itens)), vocab = vocabularioDoDocumento(paginas.flatMap(p => p.itens));
    for (const [k, p] of paginas.entries()) { p.blocos = agrupar(p.itens, k + 1, { corrido, vocab }); delete p.itens; }
    return paginas;
  });
}

// ---------- 2. blocos ----------
const CORES = c => { const h = String(c || '').trim(); if (/^#[0-9a-f]{6}$/i.test(h)) return h.toUpperCase(); const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(h); return m ? `#${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()}` : '#000000'; };
export const nomeDaFonte = n => String(n || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](Regular|Roman|Book|Normal)$/i, '').replace(/(PS)?MT$/, '').replace(/[-,]?(Bold|Black|Heavy|Semi ?Bold|Demi ?Bold|ExtraBold|Medium|Light|Thin|Italic|Oblique)+$/i, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim() || 'Arial';
const negrito = n => /bold|black|heavy|semibold|demibold/i.test(String(n || ''));
// Marcador de item: símbolo, "1."/"1)" ou número de dois dígitos antes de palavra com maiúscula ("05 Que sistemas").
const MARCADOR = /^\s*([•◦▪▫●○■□‣⁃–—\-*✓✔☐☑➢➤►▶→]|\d{1,2}[.)]|\d{2}(?=\s+\p{Lu}))\s/u;
export function tamanhoCorrido(itens) {
  const porTam = {};
  for (const i of itens) if (i.s.trim()) porTam[Math.round(i.tam)] = (porTam[Math.round(i.tam)] || 0) + i.s.trim().length;
  return Number(Object.entries(porTam).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);
}
// Palavras do documento (para recompor rótulo que o PDF entrega picotado: "SI STEMAS E TECN OL OG I A"), com plural.
export function vocabularioDoDocumento(itens) {
  const v = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS', 'E', 'O', 'A', 'OS', 'AS', 'É', 'EM', 'NO', 'NA', 'QUE', 'COM', 'POR', 'PARA', 'AO', 'SEM', 'UM', 'UMA']);
  // Só do texto corrido (com minúsculas): os rótulos em maiúsculas podem estar picotados e não servem de referência.
  const contagem = new Map();
  v.contagem = contagem;
  for (const i of itens) {
    if (!/\p{Ll}/u.test(i.s || '')) continue;
    for (const w of String(i.s).normalize('NFC').toUpperCase().match(/\p{L}{2,}/gu) || []) { contagem.set(w, (contagem.get(w) || 0) + 1); v.add(w); v.add(`${w}S`); if (/[RZL]$/.test(w)) v.add(`${w}ES`); if (/S$/.test(w)) v.add(w.slice(0, -1)); }
  }
  return v;
}
// Linha em maiúsculas com pedaços que não são palavras: as letras são juntas e separadas de novo em palavras do
// documento. Só vale se der certo por inteiro; senão a linha fica como veio.
function recomporMaiusculas(s, vocab) {
  return s.replace(/(?<![\p{L}])\p{Lu}+(?: \p{Lu}+)+(?![\p{L}])/gu, trecho => {
    const toks = trecho.split(' ');
    if (toks.every(t => vocab.has(t) || t.length <= 2 && vocab.has(t))) return trecho;
    const junto = toks.join(''), n = junto.length, melhor = Array(n + 1).fill(null);
    melhor[0] = [];
    for (let i = 0; i < n; i++) if (melhor[i]) for (let j = i + 1; j <= n; j++) {
      const w = junto.slice(i, j);
      if (!vocab.has(w) || (w.length < 3 && !['DE', 'DO', 'DA', 'E', 'O', 'A', 'É', 'EM', 'NO', 'NA', 'OS', 'AS', 'AO', 'UM'].includes(w))) continue;
      const c = [...melhor[i], w], q = x => x.reduce((a, y) => a + y.length ** 2, 0);
      if (!melhor[j] || melhor[j].length > c.length || (melhor[j].length === c.length && q(c) > q(melhor[j]))) melhor[j] = c;
    }
    return melhor[n] && melhor[n].length < toks.length ? melhor[n].join(' ') : trecho;
  });
}
// A linha de baixo é continuação do mesmo parágrafo (quebra automática) ou começa outro (item de lista sem marcador
// de texto, célula de tabela, linha solta)? Quebra automática só acontece quando a primeira palavra de baixo não
// cabia na linha de cima. No texto corrido, linha que começa com maiúscula ou número depois de uma linha sem
// pontuação final é outro item (títulos grandes podem ter cada palavra em maiúscula, então ali não vale).
function continua(b, l, corrido) {
  const anterior = b.linhas.at(-1), largAnt = b.larguras.at(-1);
  const larg = Math.max(...b.larguras, l.x1 - l.x);
  const palavra = (l.x1 - l.x) / Math.max(1, l.s.length) * (l.s.split(' ')[0].length + 1);
  if (largAnt + palavra < larg * 0.97) return false;
  const ultima = anterior.split(' ').at(-1);
  const liga = /[.!?:;,&+/–—-]$/.test(anterior) || LIGACAO.test(ultima) || (/^\p{Lu}/u.test(ultima) && anterior.includes(' '));
  if (l.tam <= corrido * 1.15 && !/^\p{Ll}/u.test(l.s) && !liga) return false;
  return true;
}
// Palavra que pede continuação ("de", "e", "para", "the", "and"...): a linha de baixo é do mesmo parágrafo.
const LIGACAO = /^(a|o|as|os|e|é|ou|de|do|da|dos|das|em|no|na|nos|nas|um|uma|para|pra|por|pelo|pela|com|sem|entre|sobre|que|se|ao|aos|à|às|seu|sua|the|of|and|or|to|in|on|for|with|by|at|from|a|an|y|del|el|la|los|las|en|con|por|para)$/i;
export function agrupar(itens, pagina = 1, { corrido: corridoDoc, vocab: vocabDoc } = {}) {
  // Palavra com espaçamento entre letras ("C O N T E X T O") vem num item só: volta a ser a palavra, marcada.
  // Marcador de lista em fonte de símbolos (Wingdings, OpenSymbol) vem como caractere de uso privado: vira "•".
  const ord = [...itens].map(i => { const t0 = /^[\uE000-\uF8FF]\s*$/.test(i.s) ? '•' : i.s.replace(/^[\uE000-\uF8FF](?=\s)/, '•'); const t = /^(\S )+\S$/.test(t0) ? t0.replace(/ /g, '').replace(/\s*([·|•–—])\s*/g, ' $1 ').trim() : t0; return { ...i, s: t, espacado: t !== t0, cor: CORES(i.cor) }; })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // Itens -> linhas (mesma altura e tamanho, um depois do outro). Fonte e cor podem variar na linha (negrito, um
  // "·" em outra fonte): vale a dominante, pelo número de letras.
  const linhas = [];
  for (const i of ord) {
    // Vão grande só depois de um espaço explícito (palavras da mesma frase); sem ele, é outra coluna.
    // Espaço entre palavras é ~0,3 do tamanho da letra; vão maior que 0,9 é outra célula de tabela ou outra coluna.
    const l = linhas.find(l => Math.abs(l.tam - i.tam) < Math.max(0.5, i.tam * 0.08) && Math.abs(l.y - i.y) < i.tam * 0.35 && i.x >= l.x1 - i.tam * 0.3 && i.x - l.x1 < i.tam * (l.espaco ? 0.9 : 0.6));
    if (l) {
      const vao = i.x - l.x1;
      // Vão pequeno sem espaço no PDF: pode ser só o ajuste entre letras ("AUDI" "TORI" "AS"). Fica marcado e, se a
      // linha tiver espaços de verdade (o PDF marca onde terminam as palavras), não vira espaço.
      if (/\s/.test(i.s) || /\s$/.test(l.s)) l.temEspaco = true;
      l.s += (vao > i.tam * 0.18 && !/\s$/.test(l.s) && !/^\s/.test(i.s) ? (vao < i.tam * 0.6 ? '\u0001' : ' ') : '') + i.s;
      // Um espaço solto não estende a linha até a próxima coluna (alguns PDFs desenham o espaço com a largura da célula).
      l.x1 = Math.max(l.x1, i.x + (i.s.trim() ? i.w : Math.min(i.w, i.tam * 0.4)));
      l.espaco = !i.s.trim();
      if (i.s.trim()) { l.pesos[`${i.fonte}|${i.cor}`] = (l.pesos[`${i.fonte}|${i.cor}`] || 0) + i.s.trim().length; l.espacado = l.espacado || i.espacado; }
    } else if (i.s.trim()) linhas.push({ s: i.s, x: i.x, x1: i.x + i.w, y: i.y, tam: i.tam, pesos: { [`${i.fonte}|${i.cor}`]: i.s.trim().length }, espacado: i.espacado, primeiro: { s: i.s.trim(), fonte: i.fonte, cor: i.cor } });
  }
  const vocabLeitura = vocabDoc || vocabularioDoDocumento(itens);
  const contagem = vocabLeitura.contagem || new Map();
  for (const l of linhas) {
    l.s = recomporMaiusculas(l.s.replace(/\u0001/g, l.temEspaco && !/\p{Ll}/u.test(l.s) ? '' : ' '), vocabLeitura);
    // Rótulo com todas as letras espaçadas por igual ("M E N S A G E M C E N T R A L") virou uma palavra só ao
    // juntar as letras: as palavras são separadas pelo texto corrido do documento.
    if (l.espacado) l.s = separarPalavras(l.s, vocabLeitura);
    // Palavra corrida colada pelo PDF ("cadaprocesso"): se só aparece aqui e as duas partes aparecem em outros
    // lugares do documento, volta a ser duas palavras.
    l.s = l.s.replace(/\p{Ll}{8,}/gu, tok => {
      if ((contagem.get(tok.toUpperCase()) || 0) > 1) return tok;
      for (let i = 2; i <= tok.length - 3; i++) {
        const a = tok.slice(0, i).toUpperCase(), b = tok.slice(i).toUpperCase();
        if ((contagem.get(a) || 0) >= 2 && (contagem.get(b) || 0) >= 2) return `${tok.slice(0, i)} ${tok.slice(i)}`;
      }
      return tok;
    });
  }
  for (const l of linhas) { [l.fonte, l.cor] = Object.entries(l.pesos).sort((a, b) => b[1] - a[1])[0][0].split('|'); l.s = l.s.replace(/\u0001/g, l.temEspaco && !/\p{Ll}/u.test(l.s) ? '' : ' ').replace(/\s+/g, ' ').trim().replace(/^• (?=[◦▪▫●○■□‣⁃✓✔☐☑➢➤►▶→]\s)/, ''); l.item = MARCADOR.test(l.s);
    // Marcador com cor ou peso próprios (número verde em negrito, "•" colorido): guardado para o PowerPoint repetir.
    const mk = l.item && MARCADOR.exec(l.s)[1], p = l.primeiro;
    if (mk && p && p.s === mk && (p.cor !== l.cor || negrito(p.fonte) !== negrito(l.fonte))) l.marcador = { cor: p.cor, negrito: negrito(p.fonte) };
  }
  // Linhas -> blocos: mesma fonte, tamanho e cor, alinhadas à esquerda (ou centradas) e logo abaixo da anterior.
  // Tamanho do texto corrido da página (o mais usado, por número de letras).
  const corrido = corridoDoc || tamanhoCorrido(linhas);
  const blocos = [];
  for (const l of linhas.filter(x => x.s).sort((a, b) => a.y - b.y || a.x - b.x)) {
    // Item de lista (marcador ou número no começo) sempre abre um bloco; as linhas seguintes do mesmo item (recuadas
    // depois do marcador) entram nele.
    const b = l.item ? null : blocos.find(b => b.fonte === l.fonte && Math.abs(b.tam - l.tam) < Math.max(0.5, l.tam * 0.08) && b.cor === l.cor && !b.espacado && !l.espacado
      && l.y - b.ultimaY > l.tam * 0.8 && l.y - b.ultimaY < l.tam * 1.9
      && (b.item ? l.x > b.x - l.tam * 0.6 && l.x < b.x + l.tam * 3 : Math.abs(b.x - l.x) < l.tam * 0.6 || Math.abs((b.x + b.x1) / 2 - (l.x + l.x1) / 2) < l.tam * 0.6)
      && (b.linhas.length < 2 || Math.abs(l.y - b.ultimaY - b.entrelinha) < l.tam * 0.3)
      && continua(b, l, corrido));
    if (b) { b.entrelinha = b.linhas.length === 1 ? l.y - b.ultimaY : b.entrelinha; b.linhas.push(l.s); b.larguras.push(l.x1 - l.x); b.ultimaY = l.y; b.x = Math.min(b.x, l.x); b.x1 = Math.max(b.x1, l.x1); }
    else blocos.push({ linhas: [l.s], larguras: [l.x1 - l.x], x: l.x, x1: l.x1, y: l.y, ultimaY: l.y, tam: l.tam, fonte: l.fonte, cor: l.cor, espacado: l.espacado, entrelinha: l.tam * 1.2, item: l.item, marcador: l.marcador });
  }
  return blocos.map((b, k) => ({ id: `${pagina}.${k + 1}`, texto: b.linhas.join(' ').replace(/\s+/g, ' ').trim(), linhas: b.linhas.length, x: b.x, y: b.y, largura: b.x1 - b.x,
    tam: Math.round(b.tam * 10) / 10, entrelinha: b.entrelinha, fonte: nomeDaFonte(b.fonte), negrito: negrito(b.fonte), cor: b.cor, espacado: b.espacado, ...(b.marcador ? { marcador: b.marcador } : {}) }));
}

// ---------- 3. adaptação do conteúdo ----------
const LIMITE = texto => Math.max(8, Math.round(texto.length * 1.15));
// Instrução de adaptação: mesma estrutura, mesmo tom, dados só do material; tamanho parecido com o original.
const INSTRUCAO = [
  'Você adapta uma apresentação MODELO para outro projeto ou cliente, mantendo exatamente a estrutura: mesmos slides, mesma função de cada bloco de texto (título, rótulo de seção, número, item de lista, rodapé, data, nome), mesmo tom e o mesmo nível de detalhe.',
  'Para cada bloco, escreva o texto novo no lugar do original, com o conteúdo do NOVO projeto tirado do material e da conversa. Troque nomes de empresa, pessoas, áreas, sistemas, datas, horários, números e exemplos pelos do novo projeto.',
  'Rótulos de estrutura (como "01 · CONTEXTO", numeração "1", "2", "02", títulos de método que valem para qualquer projeto) ficam iguais quando continuam corretos.',
  'Não invente fatos. Dado específico que o material não traz (uma data, um nome de responsável, um horário, um número): escreva "[a definir]" no lugar só do dado. Só um item de lista ou uma linha de tabela que sobra (o novo projeto tem menos itens que o modelo) pode voltar "" (texto vazio), e então sai do slide. Título, rótulo, parágrafo e slide inteiro nunca ficam vazios: quando o tema do slide não aparece no material, mantenha o texto do modelo, trocando só nomes de empresa, pessoas e sistemas pelos do novo projeto.',
  'Cada bloco vem com a posição no slide [x, y] (em pontos, a partir do canto superior esquerdo): blocos na mesma altura são colunas de uma linha; na mesma coluna, itens de uma lista ou linhas de uma tabela. Mantenha cada texto na sua posição e na sua função; não troque conteúdo entre colunas nem entre linhas.',
  'O briefing da pessoa (no pedido e na conversa) manda: escopo, frentes, prazos, entregáveis e o que fica fora seguem o que ela definiu para o novo projeto, mesmo que o modelo diga outra coisa.',
  'Tamanho: cada texto novo deve caber no mesmo espaço do original, com no máximo o número de caracteres indicado.',
  REGRAS_DE_ESCRITA,
  'Responda só com um objeto JSON: {"<id do bloco>": "<texto novo>", ...}, com TODOS os ids recebidos e nada mais.',
].join('\n');

// Reestilo: o conteúdo de cada slide já foi decidido (o material da pessoa); o modelo só empresta o layout.
const INSTRUCAO_REESTILO = [
  'Você coloca o conteúdo de uma apresentação JÁ EXISTENTE no design de uma apresentação modelo. Cada slide abaixo vem com os blocos de texto do layout do modelo e com o CONTEÚDO que esse slide deve ter.',
  'Distribua o conteúdo do slide pelos blocos, respeitando a função de cada um: o título do conteúdo no bloco de título, os itens nos blocos de lista ou de coluna, na ordem. Rótulos pequenos de seção podem receber uma palavra que resuma o slide.',
  'Use só o conteúdo do slide. Não invente nada: nenhum número, percentual, valor, prazo, caso, nome ou contato que não esteja no conteúdo. O texto do modelo é só exemplo de layout e nunca entra na apresentação.',
  'Bloco do layout que não tem conteúdo correspondente volta "" (texto vazio) e sai do slide, seja item, parágrafo, rótulo ou célula de tabela. Só o título nunca fica vazio.',
  'Cada bloco vem com a posição no slide [x, y] (em pontos): blocos na mesma altura são colunas de uma linha; na mesma coluna, itens de uma lista ou linhas de uma tabela.',
  'Tamanho: cada texto deve caber no espaço do bloco, com no máximo o número de caracteres indicado; se o conteúdo não couber, resuma sem perder números e nomes.',
  REGRAS_DE_ESCRITA,
  'Responda só com um objeto JSON: {"<id do bloco>": "<texto novo>", ...}, com TODOS os ids recebidos e nada mais.',
].join('\n');

export function mensagensAdaptacao({ slides, contexto, pedido, conteudos = null }) {
  const modelo = slides.map(p => `Slide ${p.numero}:\n${conteudos ? `Conteúdo deste slide:\n${conteudos[p.numero - 1] || ''}\nBlocos do layout:\n` : ''}${p.blocos.map(b => linhaDoBloco(b, p.blocos, b.texto)).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: conteudos ? INSTRUCAO_REESTILO : INSTRUCAO },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${contexto}\n</material>\n\nApresentação modelo (blocos a adaptar):\n\n${modelo}` },
  ];
}
// Datas e horários escritos no pedido ("22/10 às 9h", "das 9h às 12h"): cada um precisa aparecer em algum slide.
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fatosDoPedido(pedido) {
  const t = String(pedido || ''), fatos = [], visto = new Set();
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    const d = Number(m[1]), me = Number(m[2]);
    if (d < 1 || d > 31 || me < 1 || me > 12 || visto.has(`d${d}/${me}`)) continue;
    visto.add(`d${d}/${me}`);
    const mes = MES3[me - 1], D = `0?${d}`;
    const res = [new RegExp(`(?<!\\d)${D}\\s*\\/\\s*0?${me}(?!\\d)`), new RegExp(`(?<!\\d)${D}\\s+(de\\s+)?${mes}`, 'i'),
      new RegExp(`(?<!\\d)${D}\\s*(e|a|–|-)\\s*\\d{1,2}\\s*(\\/\\s*0?${me}|(de\\s+)?${mes})`, 'i'), new RegExp(`\\d{1,2}\\s*(e|a|–|-)\\s*${D}\\s*(\\/\\s*0?${me}|(de\\s+)?${mes})`, 'i')];
    fatos.push({ texto: m[0], presente: x => res.some(r => r.test(x)) });
  }
  for (const m of t.matchAll(/\b(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?![\w])/g)) {
    const h = Number(m[1]), mi = m[2] || m[3] || '';
    if (h > 23 || visto.has(`h${h}:${mi}`)) continue;
    if (/(dura[cç][aã]o\s*(de\s*)?|\(\s*|durante\s*|por\s*)$/i.test(t.slice(Math.max(0, m.index - 14), m.index))) continue;   // duração ("1h"), não horário
    visto.add(`h${h}:${mi}`);
    const r = mi && mi !== '00' ? new RegExp(`(?<!\\d)0?${h}\\s*(h|:)\\s*${mi}`) : new RegExp(`(?<!\\d)0?${h}\\s*(h(?!\\d)|h00|:00|\\s*hora)`, 'i');
    fatos.push({ texto: m[0], presente: x => r.test(x) });
  }
  // Texto entre aspas no pedido ("troque o título para \"Plano de ação\"") precisa aparecer como foi pedido.
  for (const m of t.matchAll(/["“]([^"”\n]{3,80})["”]/g)) {
    const alvo = m[1].trim().toLowerCase();
    if (visto.has(`q${alvo}`)) continue;
    visto.add(`q${alvo}`);
    const titulo = /t[íi]tulo/i.test(t.slice(Math.max(0, m.index - 60), m.index));   // "troque o título para …"
    fatos.push({ texto: `"${m[1].trim()}"`, titulo, presente: x => x.toLowerCase().replace(/\s+/g, ' ').includes(alvo.replace(/\s+/g, ' ')) });
  }
  return fatos;
}
export function mensagensFatos({ slides, textos, pedido, contexto, faltam }) {
  const atual = slides.map(p => `Slide ${p.numero}:\n${p.blocos.map(b => linhaDoBloco(b, p.blocos, textos[b.id] ?? b.texto)).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: `${INSTRUCAO}\n\nA apresentação abaixo já foi adaptada, mas estes dados do pedido da pessoa não aparecem em nenhum slide (o que foi pedido para um título vai no bloco marcado como título): ${faltam.join('; ')}. Ajuste os blocos necessários para que TODOS apareçam no lugar certo, coerentes com o resto (por exemplo: um slide de agenda que sobrou passa a tratar do outro dia; dois eventos do mesmo dia ficam no mesmo slide; o cronograma e a capa usam as mesmas datas). Responda só com os ids que mudam.` },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${String(contexto || '').slice(-30000)}\n</material>\n\nApresentação adaptada (texto atual de cada bloco):\n\n${atual}` },
  ];
}
// Rótulo em maiúsculas que voltou sem os espaços entre as palavras ("MÉTODODETRABALHO", depois de juntar letras
// espaçadas): as palavras são separadas de novo com o vocabulário do modelo, do material e do pedido.
const LIGA = ['DE', 'DO', 'DA', 'DOS', 'DAS', 'E', 'O', 'A', 'OS', 'AS', 'É', 'EM', 'NO', 'NA', 'QUE', 'COM', 'POR', 'PARA', 'AO', 'SEM', 'UM', 'UMA'];
export function separarPalavras(texto, vocab) {
  return String(texto || '').normalize('NFC').replace(/(?<![\p{L}\p{M}])[\p{Lu}]{5,}(?![\p{L}\p{M}])/gu, tok => {
    if (vocab.has(tok)) return tok;
    // Menor número de palavras que cobre o trecho inteiro (programação dinâmica).
    const n = tok.length, melhor = Array(n + 1).fill(null);
    melhor[0] = [];
    for (let i = 0; i < n; i++) {
      if (!melhor[i]) continue;
      for (let j = i + 1; j <= n; j++) {
        const w = tok.slice(i, j);
        if (!vocab.has(w) || (w.length < 2 && !LIGA.includes(w))) continue;
        // Menos palavras; no empate, palavras mais longas ("SISTEMAS E" e não "SISTEMA SE").
        const cand = [...melhor[i], w], q = x => x.reduce((a, y) => a + y.length ** 2, 0);
        if (!melhor[j] || melhor[j].length > cand.length || (melhor[j].length === cand.length && q(cand) > q(melhor[j]))) melhor[j] = cand;
      }
    }
    return melhor[n] && melhor[n].length > 1 ? melhor[n].join(' ') : tok;
  });
}
// Só palavras escritas com minúsculas na fonte (rótulo em maiúsculas pode estar colado e não serve de referência),
// com plural e singular.
export const vocabulario = (...textos) => {
  const v = new Set(LIGA);
  for (const t of textos) for (const w of String(t || '').normalize('NFC').match(/\p{L}+/gu) || []) {
    if (!/\p{Ll}/u.test(w) && w.length > 4) continue;   // sigla curta (IA, TI, DRE) vale
    const W = w.toUpperCase();
    v.add(W); v.add(`${W}S`); if (/[RZL]$/.test(W)) v.add(`${W}ES`); if (/S$/.test(W)) v.add(W.slice(0, -1));
  }
  return v;
};
// Slides de agenda com linha fora do intervalo do dia declarado no próprio slide.
const FAIXA = /(\d{1,2})h(\d{2})?\s*(?:às|as|a|até|–|-)\s*(\d{1,2})h(\d{2})?/i;
const CELULA = /^\s*(\d{1,2})h(\d{2})?\s*[–-]\s*(\d{1,2})h(\d{2})?\s*$/;
const minutos = (h, m) => Number(h) * 60 + Number(m || 0);
export function agendasForaDoHorario(paginas, textos) {
  const out = [];
  paginas.forEach((p, k) => {
    const t = b => textos[b.id] ?? b.texto;
    const celulas = p.blocos.filter(b => CELULA.test(t(b)));
    if (celulas.length < 2) return;
    const topo = Math.min(...celulas.map(b => b.y));
    const decl = p.blocos.filter(b => b.y < topo && !CELULA.test(t(b)) && FAIXA.test(t(b))).sort((a, b) => a.y - b.y)[0];
    if (!decl) return;
    const [, h1, m1, h2, m2] = FAIXA.exec(t(decl)), ini = minutos(h1, m1), fim = minutos(h2, m2);
    const ruins = celulas.filter(b => { const [, a, am, c, cm] = CELULA.exec(t(b)); return minutos(a, am) < ini || minutos(c, cm) > fim; });
    // Fora de ordem: uma linha começa antes da linha de cima.
    const ordem = [...celulas].sort((a, b) => a.y - b.y).map(b => { const [, a, am] = CELULA.exec(t(b)); return { b, ini: minutos(a, am) }; });
    for (let i = 1; i < ordem.length; i++) if (ordem[i].ini < ordem[i - 1].ini && !ruins.includes(ordem[i].b)) ruins.push(ordem[i].b);
    if (ruins.length) out.push({ numero: k + 1, faixa: FAIXA.exec(t(decl))[0], linhas: ruins.map(b => t(b)) });
  });
  return out;
}
export function mensagensAgenda({ slides, textos, pedido, contexto, fora }) {
  const atual = slides.map(p => `Slide ${p.numero}:\n${p.blocos.map(b => linhaDoBloco(b, p.blocos, textos[b.id] ?? b.texto)).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: `${INSTRUCAO}\n\nNestes slides, a agenda tem horários fora do intervalo do dia que o próprio slide declara, fora da ordem cronológica ou na coluna errada (horário só na coluna de horário; atividade e participantes nas suas colunas; título nunca "[a definir]"): ${fora.map(f => `slide ${f.numero} (${f.faixa}): ${f.linhas.join(', ')}`).join('; ')}. Ajuste horários e atividades para que a agenda caiba no intervalo, fique em ordem cronológica de cima para baixo e siga o pedido. Linha que sobrar: devolva "" no horário, na atividade, na descrição e em quem participa dessa linha. Responda só com os ids que mudam.` },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${String(contexto || '').slice(-20000)}\n</material>\n\nSlides (texto atual de cada bloco):\n\n${atual}` },
  ];
}
// Função do bloco no slide, para a IA saber o que é "o título" e o que é rótulo: o maior texto do slide é o título;
// texto pequeno em maiúsculas (ou espaçado) acima dele é rótulo.
export function papelDoBloco(b, blocos) {
  const maior = Math.max(...blocos.map(o => o.tam || 0));
  if ((b.tam || 0) >= maior - 0.5 && /\p{L}{3,}/u.test(b.texto)) return 'título';
  if (b.espacado || (!/\p{Ll}/u.test(b.texto) && /\p{L}{3,}/u.test(b.texto))) return 'rótulo';
  return '';
}
const linhaDoBloco = (b, blocos, texto) => { const p = papelDoBloco(b, blocos); return `${b.id} [${Math.round(b.x ?? 0)}, ${Math.round(b.y ?? 0)}]${p ? ` ${p}` : ''} (máx. ${LIMITE(b.texto)}): ${texto}`; };
export function mensagensEdicao({ slides, textos, pedido, contexto }) {
  const atual = slides.map(p => `Slide ${p.numero}:\n${p.blocos.map(b => linhaDoBloco(b, p.blocos, textos[b.id] ?? b.texto)).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: [
      'Você corrige uma apresentação JÁ PRONTA conforme o pedido de correção da pessoa. Cada bloco abaixo traz o texto atual.',
      'Aplique TODAS as correções pedidas que tocam estes slides, e só elas: o que o pedido não menciona fica exatamente como está. Se o pedido muda um dado que aparece em vários blocos (data, horário, duração, nome, prazo, etapa), mude em todos eles, de forma coerente (agenda, cronograma, capa, rodapés).',
      'Agenda: horários em ordem, dentro do intervalo do dia; linha que sobra volta "" em todas as células dela. Para tirar um item, devolva "" no bloco. Título, rótulo e parágrafo nunca ficam vazios.',
      'Cada bloco vem com a posição [x, y], a função quando é título (o texto principal do slide) ou rótulo (texto pequeno acima do título) e o máximo de caracteres. "Título" no pedido é o bloco marcado como título, nunca o rótulo. Mantenha cada texto na sua posição e função, cabendo no espaço.',
      REGRAS_DE_ESCRITA,
      'Responda só com um objeto JSON {"<id>": "<texto novo>"} com os ids que mudam. Se nada nestes slides precisa mudar, responda {}.',
    ].join('\n') },
    { role: 'user', content: `Pedido de correção: ${pedido}\n\n<material>\n${String(contexto || '').slice(-30000)}\n</material>\n\nApresentação atual (texto de cada bloco):\n\n${atual}` },
  ];
}
const lerJson = t => { const m = /\{[\s\S]*\}/.exec(String(t || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

// ---------- reestilo: o material da pessoa no design do modelo ----------
// "Quero o design o mais próximo possível da apresentação X.pdf" sobre uma apresentação que já existe: o conteúdo é o
// da apresentação da pessoa (com os ajustes pedidos) e o modelo só empresta o layout. Usar todas as páginas do modelo
// enchia a apresentação de slides que ela não tinha, com números inventados (QA em produção: 6 slides viraram 15).
const NUMERO = /\d+(?:[.,]\d+)*/g;
const normNumero = n => String(n).replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
/** Números do texto que não aparecem no material (anos, valores, percentuais inventados). */
export function numerosForaDoMaterial(texto, material) {
  const tem = new Set((String(material || '').match(NUMERO) || []).map(normNumero));
  // Inteiro pequeno sozinho (capítulo, item, "3 profundidades") não conta: renumerar capítulos é pedido comum.
  return (String(texto || '').match(NUMERO) || []).filter(n => !tem.has(normNumero(n)) && !(/^\d{1,2}$/.test(n) && Number(n) <= 60));
}
const resumoDaPagina = (p, n) => {
  const t = p.blocos.find(b => papelDoBloco(b, p.blocos) === 'título');
  const linhas = new Set(p.blocos.map(b => Math.round(b.y / 6))).size, colunas = new Set(p.blocos.map(b => Math.round(b.x / 20))).size;
  return `Página ${n}: ${p.blocos.length} blocos de texto em ${linhas} linhas e ${colunas} colunas${t ? `; título: "${t.texto.slice(0, 70)}"` : ''}; textos: ${p.blocos.slice(0, 14).map(b => `"${b.texto.slice(0, 50)}"`).join(', ')}`;
};
export function mensagensPlanoReestilo({ paginas, fonte, pedido, contexto }) {
  return [
    { role: 'system', content: [
      'Você monta a apresentação da pessoa no design de uma apresentação modelo. Decida quais slides a apresentação final terá e, para cada um, qual página do modelo serve de layout.',
      'A apresentação final tem os slides da apresentação da pessoa, na ordem dela, com os ajustes do pedido aplicados (juntar slides, dividir, enriquecer com outro documento citado, remover). Não acrescente slides de temas que a apresentação da pessoa não tem.',
      'Para cada slide, escolha a página do modelo cujo layout melhor acomoda o conteúdo: capa para o primeiro slide, página de encerramento ou contato para o último, página com lista para itens, com tabela para dados em linhas e colunas, com colunas para comparações. A mesma página pode servir para mais de um slide.',
      'conteudo: o texto completo do slide (título na primeira linha, depois os itens, um por linha), tirado só da apresentação da pessoa, do pedido e dos documentos da conversa. Números, nomes e contatos ficam exatamente como estão. Não invente números, casos, prazos nem dados.',
      'Responda só JSON: {"slides":[{"pagina":<número da página do modelo>,"conteudo":"..."}]}',
    ].join('\n') },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${String(contexto || '').slice(-40000)}\n</material>\n\n<apresentacao_da_pessoa>\n${fonte}\n</apresentacao_da_pessoa>\n\nPáginas do modelo (layout):\n${paginas.map((p, k) => resumoDaPagina(p, k + 1)).join('\n')}` },
  ];
}
/** Slides da apresentação da pessoa ("## Slide N" e as linhas dele), sem os ids de edição. */
export const slidesDaFonte = fonte => String(fonte || '').split(/^## Slide \d+\s*$/m).map(s => s.replace(/^\[[^\]]+\]\s*/gm, '').trim()).filter(Boolean);
/**
 * Plano do reestilo: [{ pagina (índice 0..n-1 no modelo), conteudo }]. Sem resposta utilizável da IA, cada slide da
 * pessoa vai, na ordem, para a capa, as páginas do meio e a última página do modelo.
 */
export async function planejarReestilo({ paginas, fonte, pedido, contexto, chamar }) {
  const material = `${fonte}\n${contexto || ''}\n${pedido || ''}`;
  // Linha com número que não está no material sai do conteúdo (no título, sai só o número).
  const limpar = c => String(c || '').split('\n').map((l, i) => {
    const fora = numerosForaDoMaterial(l, material);
    if (!fora.length) return l;
    return i === 0 ? fora.reduce((t, n) => t.replace(n, ''), l).replace(/\s{2,}/g, ' ').trim() : null;
  }).filter(l => l != null && l.trim()).join('\n');
  let custo = 0, economia = 0, slides = null;
  try {
    const x = await chamar(mensagensPlanoReestilo({ paginas, fonte, pedido, contexto }));
    custo += x.custo || 0; economia += x.economia || 0;
    const j = lerJson(x.texto);
    const lista = (Array.isArray(j?.slides) ? j.slides : []).map(s => ({ pagina: Math.round(Number(s?.pagina)) - 1, conteudo: limpar(s?.conteudo) }))
      .filter(s => s.pagina >= 0 && s.pagina < paginas.length && s.conteudo).slice(0, MAX_PAGINAS_MODELO);
    if (lista.length) slides = lista;
  } catch { /* plano simples abaixo */ }
  if (!slides) {
    const fonteSlides = slidesDaFonte(fonte), n = paginas.length, meio = Math.max(1, n - 2);
    slides = fonteSlides.map((c, i) => ({ pagina: i === 0 ? 0 : i === fonteSlides.length - 1 && n > 1 ? n - 1 : n > 2 ? 1 + ((i - 1) % meio) : Math.min(i, n - 1), conteudo: c }));
  }
  return { slides, custo, economia };
}
/** Páginas do modelo na ordem do plano (a mesma página pode repetir), com ids novos e a numeração "n / total" refeita. */
export function paginasDoPlano(paginas, plano) {
  return plano.map((s, i) => {
    const p = paginas[s.pagina];
    return { ...p, blocos: p.blocos.map((b, k) => ({ ...b, id: `${i + 1}.${k + 1}`, texto: /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(b.texto) ? `${i + 1} / ${plano.length}` : b.texto })) };
  });
}

// Em partes de até ~8 slides (respostas menores e conferíveis). Devolve { textos: {id: texto}, faltando: [ids], custo }.
// Com base (os textos da versão já gerada), o pedido é tratado como CORREÇÃO dessa versão: a IA recebe o texto atual
// de cada bloco e devolve só o que muda; o resto fica como estava. Sem base, adapta o modelo do zero.
export async function adaptarModelo({ paginas, contexto, pedido, chamar, porParte = 8, simultaneas = 3, etapa = () => {}, hoje = new Date(), base = null, conteudos = null }) {
  const textos = {}, faltando = [], longos = [];
  if (base) for (const p of paginas) for (const b of p.blocos) if (typeof base[b.id] === 'string') textos[b.id] = base[b.id];
  const original = new Map(paginas.flatMap(p => p.blocos.map(b => [b.id, b.texto])));
  const limite = id => LIMITE(original.get(id) || '');
  let custo = 0, economia = 0, prontas = 0;
  // Fora da adaptação: números puros (página, passo, item) ficam como estão; texto que se repete em 3 ou mais
  // slides (rodapé, nome do documento) vai uma vez só e a resposta vale para todas as ocorrências.
  const vezes = new Map();
  for (const p of paginas) for (const b of p.blocos) vezes.set(b.texto, (vezes.get(b.texto) || 0) + 1);
  const primeiro = new Map(), repetidos = [];
  // Número puro fica como está, a menos que esteja colado a um texto na mesma linha ("19" + "OUT", "45" + "DIAS
  // ÚTEIS"): aí é parte de uma data ou prazo e é adaptado junto.
  const vizinhoNaLinha = b => paginas.some(p => p.blocos.includes(b) && p.blocos.some(o => o !== b && Math.abs(o.y - b.y) < b.tam * 0.5 && o.x > b.x && o.x - (b.x + (b.largura || 0)) < b.tam * 1.5 && /\p{L}/u.test(o.texto)));
  const fica = b => /^\s*[\d.·/\s-]{1,6}\s*$/.test(b.texto) && !vizinhoNaLinha(b);
  const slides = paginas.map((p, i) => ({ numero: i + 1, blocos: p.blocos.filter(b => {
    if (fica(b)) return false;
    // No reestilo a mesma página do modelo pode repetir: o texto repetido é layout, não rodapé, e cada slide tem o seu.
    if (!conteudos && vezes.get(b.texto) >= 3) { if (primeiro.has(b.texto)) { repetidos.push([b.id, primeiro.get(b.texto)]); return false; } primeiro.set(b.texto, b.id); }
    return true;
  }) }));
  const partes = [];
  for (let i = 0; i < slides.length; i += porParte) partes.push(slides.slice(i, i + porParte).filter(s => s.blocos.length));
  if (base) {
    etapa('Aplicando as correções pedidas na apresentação…');
    const grupos = [];
    for (let i = 0; i < slides.length; i += porParte * 2) grupos.push(slides.slice(i, i + porParte * 2).filter(s => s.blocos.length));
    await Promise.all(grupos.filter(g => g.length).map(async g => {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          const x = await chamar(mensagensEdicao({ slides: g, textos, pedido, contexto }));
          custo += x.custo || 0; economia += x.economia || 0;
          const j = lerJson(x.texto);
          if (!j) continue;
          // Rótulo de seção (repetido em vários slides) só muda quando o pedido fala dele: senão uma correção pontual
          // espalha o rótulo errado por todos os slides da seção.
          const falaDeRotulo = /\b(r[óo]tulo|se[çc][ãa]o|se[çc][õo]es|cabe[çc]alho)\b/i.test(pedido);
          for (const s of g) for (const b of s.blocos) {
            if (typeof j[b.id] !== 'string') continue;
            if (papelDoBloco(b, s.blocos) === 'rótulo' && !falaDeRotulo && !String(pedido).toUpperCase().includes(String(textos[b.id] ?? b.texto).replace(/^[\d\s·.-]+/, '').toUpperCase())) continue;
            textos[b.id] = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim()));
          }
          return;
        } catch { /* tenta de novo uma vez */ }
      }
    }));
  } else etapa(`Adaptando ${slides.length} slides ao novo projeto…`);
  // Partes em paralelo (até 3 por vez): uma apresentação longa não deixa a pessoa esperando parte por parte.
  const fila = base ? [] : partes.filter(p => p.length);
  const trabalhar = async () => { for (let parte = fila.shift(); parte; parte = fila.shift()) {
    const ids = parte.flatMap(s => s.blocos.map(b => b.id));
    // A melhor resposta (mais ids) vale; menos de 80% dos ids pede de novo, uma vez.
    let r = null, n = -1;
    for (let tentativa = 0; tentativa < 2 && n < ids.length * 0.8; tentativa++) {
      const x = await chamar(mensagensAdaptacao({ slides: parte, contexto, pedido, conteudos }));
      custo += x.custo || 0; economia += x.economia || 0;
      const j = lerJson(x.texto), k = j ? ids.filter(id => typeof j[id] === 'string').length : -1;
      if (k > n) { r = j; n = k; }
    }
    // Parte que falhou (resposta cortada ou fora do formato): divide em duas e refaz, até um slide por vez.
    if (n < ids.length * 0.8 && parte.length > 1) {
      const meio = Math.ceil(parte.length / 2);
      fila.push(parte.slice(0, meio), parte.slice(meio)); partes.push(parte.slice(meio));
      continue;
    }
    for (const id of ids) {
      if (typeof r?.[id] === 'string' && (r[id].trim() || r[id] === '')) { textos[id] = r[id].replace(/\s+/g, ' ').trim(); if (viciosDeEscrita(textos[id]).includes('letras separadas')) textos[id] = juntarLetrasEspacadas(textos[id]); textos[id] = limparVicios(textos[id]); if (textos[id].length > limite(id) * 1.3 || viciosDeEscrita(textos[id]).length || (!conteudos && !textos[id] && (original.get(id) || '').length > 40)) longos.push(id); }
      else faltando.push(id);
    }
    prontas++; etapa(`Adaptando os slides… ${prontas} de ${partes.length} partes prontas`);
  } };
  await Promise.all(Array.from({ length: Math.min(simultaneas, fila.length) }, trabalhar));
  // Blocos que a IA pulou: mais uma rodada só com eles (os slides vão com o texto já adaptado, para manter o sentido).
  // Texto bem mais longo que o espaço (passou 30% do máximo) também volta, pedindo para respeitar o limite.
  if (!base && (faltando.length || longos.length)) {
    const falta = new Set([...faltando, ...longos]);
    const resto = slides.map(s => ({ numero: s.numero, blocos: s.blocos.filter(b => falta.has(b.id)) })).filter(s => s.blocos.length);
    await Promise.all(Array.from({ length: Math.ceil(resto.length / (porParte * 2)) }, async (_, k) => {
      const parte = resto.slice(k * porParte * 2, (k + 1) * porParte * 2);
      try {
        const aviso = longos.length ? '\n\nAtenção: cada texto precisa caber no espaço do bloco (respeite o máximo de caracteres indicado em cada um) e seguir as regras de escrita, sem os vícios de texto de IA. Parágrafo, descrição e título nunca ficam vazios.' : '';
        const x = await chamar(mensagensAdaptacao({ slides: parte, contexto, pedido: `${pedido || ''}${aviso}`, conteudos }));
        custo += x.custo || 0; economia += x.economia || 0;
        const j = lerJson(x.texto);
        for (const s of parte) for (const b of s.blocos) {
          if (typeof j?.[b.id] !== 'string') continue;
          const novo = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim())), antes = textos[b.id];
          // Fica a versão nova quando não havia texto, quando é mais curta ou quando tem menos vícios.
          if (antes === undefined || (!antes && novo) || (novo && novo.length < antes.length) || viciosDeEscrita(novo).length < viciosDeEscrita(antes).length) textos[b.id] = novo;
          falta.delete(b.id);
        }
      } catch { /* fica com o texto do modelo */ }
    }));
    faltando.splice(0, faltando.length, ...faltando.filter(id => falta.has(id) && textos[id] === undefined));
  }
  // Item que perdeu o marcador na adaptação ("05 Que sistemas…" virou "Que sistemas…"): o marcador volta.
  for (const [id, t] of Object.entries(textos)) {
    const mk = MARCADOR.exec(original.get(id) || '')?.[1];
    if (mk && t && !MARCADOR.test(t)) textos[id] = `${mk} ${t}`;
  }
  // Dados do pedido (datas, horários) que não apareceram em nenhum slide: mais uma rodada com a apresentação inteira
  // já adaptada, pedindo para encaixar o que falta (outro slide de agenda, dois eventos no mesmo slide…).
  const todosOsTextos = () => paginas.flatMap(p => p.blocos.map(b => textos[b.id] ?? b.texto)).join('\n');
  // Texto pedido para um título precisa estar num bloco que é título (não no rótulo de cima).
  const textosDeTitulo = () => paginas.flatMap(p => p.blocos.filter(b => papelDoBloco(b, p.blocos) === 'título').map(b => textos[b.id] ?? b.texto)).join('\n');
  const presente = f => f.presente(f.titulo ? textosDeTitulo() : todosOsTextos());
  let faltam = fatosDoPedido(pedido).filter(f => !presente(f));
  if (faltam.length) {
    etapa('Conferindo se todos os dados do pedido estão nos slides…');
    try {
      const x = await chamar(mensagensFatos({ slides, textos, pedido, contexto, faltam: faltam.map(f => f.texto) }));
      custo += x.custo || 0; economia += x.economia || 0;
      const j = lerJson(x.texto) || {};
      // Rodada de correção não apaga nada: texto vazio é ignorado (só o ajuste de agenda pode tirar linhas).
      for (const s of slides) for (const b of s.blocos) if (typeof j[b.id] === 'string' && j[b.id].trim()) textos[b.id] = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim()));
      faltam = faltam.filter(f => !presente(f));
    } catch { /* fica a versão anterior */ }
  }
  // Texto pedido "para o título" que a IA pôs em outro bloco do slide (o rótulo de cima): vai para o título desse
  // slide e o outro bloco volta ao texto anterior.
  for (const f of faltam.filter(f => f.titulo)) {
    const alvo = f.texto.replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, ' ');
    for (const p of paginas) {
      const errado = p.blocos.find(b => papelDoBloco(b, p.blocos) !== 'título' && String(textos[b.id] ?? '').toLowerCase().replace(/\s+/g, ' ').includes(alvo));
      const titulo = errado && p.blocos.find(b => papelDoBloco(b, p.blocos) === 'título');
      if (!titulo) continue;
      textos[titulo.id] = f.texto.replace(/^"|"$/g, '');
      textos[errado.id] = base?.[errado.id] ?? errado.texto;
      break;
    }
  }
  faltam = faltam.filter(f => !presente(f));
  // Agenda coerente com o horário do dia declarado no próprio slide ("dia 2 · 9h às 12h" com linhas até 17h): os
  // slides com linha fora do intervalo voltam para a IA ajustar (linha que sobra volta vazia e sai).
  const fora = agendasForaDoHorario(paginas, textos);
  if (fora.length) {
    etapa('Conferindo as agendas…');
    try {
      const x = await chamar(mensagensAgenda({ slides: slides.filter(s => fora.some(f => f.numero === s.numero)), textos, pedido, contexto, fora }));
      custo += x.custo || 0; economia += x.economia || 0;
      const j = lerJson(x.texto) || {};
      // Só os slides de agenda apontados mudam; texto vazio só vale em linha com horário (a linha que sobra).
      const alvo = new Set(fora.map(f => f.numero));
      for (const s of slides) {
        if (!alvo.has(s.numero)) continue;
        for (const b of s.blocos) {
          if (typeof j[b.id] !== 'string') continue;
          const v = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim()));
          if (v || s.blocos.some(c => CELULA.test(textos[c.id] ?? c.texto) && Math.abs(c.y - b.y) < b.tam * 1.5)) textos[b.id] = v;
        }
      }
    } catch { /* fica a versão anterior */ }
  }
  // Estrutura das tabelas e agendas: horário só na coluna de horário (e nada de horário nas outras colunas), título
  // nunca vira "[a definir]". Slide que viola volta para a IA uma vez; se continuar, fica a versão anterior.
  const anterior = id => (base && base[id] !== undefined ? base[id] : original.get(id));
  const ehHorario = t => CELULA.test(String(t || '')) || /^\s*\d{1,2}h(\d{2})?\s*$/.test(String(t || ''));
  const violacoes = p => p.blocos.filter(b => {
    const t = textos[b.id];
    if (t === undefined || t === '') return false;
    if (papelDoBloco(b, p.blocos) === 'título' && /^\s*\[a definir\]\s*$/i.test(t)) return true;
    return ehHorario(b.texto) ? !ehHorario(t) && !/^\s*\[a definir\]\s*$/i.test(t) : ehHorario(t);
  });
  const ruins = paginas.map((p, k) => ({ p, k, v: violacoes(p) })).filter(x => x.v.length);
  if (ruins.length) {
    try {
      const x = await chamar(mensagensAgenda({ slides: slides.filter(s => ruins.some(r => r.k + 1 === s.numero)), textos, pedido, contexto,
        fora: ruins.map(r => ({ numero: r.k + 1, faixa: 'estrutura do modelo', linhas: r.v.map(b => `${textos[b.id]} (no lugar de "${b.texto}")`) })) }));
      custo += x.custo || 0; economia += x.economia || 0;
      const j = lerJson(x.texto) || {};
      for (const r of ruins) for (const b of r.p.blocos) if (typeof j[b.id] === 'string') textos[b.id] = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim()));
    } catch { /* fica a versão anterior abaixo */ }
    for (const r of ruins) if (violacoes(r.p).length) for (const b of r.p.blocos) if (textos[b.id] !== undefined) textos[b.id] = anterior(b.id);
  }
  // Linha de tabela que sobrou: se a primeira célula (horário, item) ficou vazia, sai tudo o que está à direita dela
  // até a próxima célula da mesma coluna (a atividade e a descrição em letra menor, logo abaixo).
  for (const p of paginas) {
    for (const e of p.blocos) {
      if (textos[e.id] !== '' || !e.texto) continue;
      const mesmaLinha = p.blocos.filter(o => o !== e && Math.abs(o.y - e.y) < e.tam * 0.6);
      if (!mesmaLinha.length || mesmaLinha.some(o => o.x < e.x)) continue;   // só a primeira célula da linha
      // Célula de tabela tem vão de coluna até a próxima; pedaço da mesma frase ("19" + "OUT") não.
      if (Math.min(...mesmaLinha.map(o => o.x)) - (e.x + (e.largura || 0)) < e.tam * 0.8) continue;
      const proxima = p.blocos.filter(o => o !== e && Math.abs(o.x - e.x) < e.tam && o.y > e.y + e.tam * 0.6).reduce((m, o) => Math.min(m, o.y), e.y + e.tam * 3);
      for (const o of p.blocos) if (o.x > e.x && o.y > e.y - e.tam * 0.6 && o.y < proxima - o.tam * 0.6) textos[o.id] = '';
    }
    // Número repetido: o texto ganhou o número que já está num bloco próprio logo à esquerda ("18" + "18 Onde…").
    for (const b of p.blocos) {
      const m = /^(\d{1,2})\s+(?=\S)/.exec(textos[b.id] || '');
      if (!m || /^\d/.test(b.texto)) continue;
      if (p.blocos.some(o => o !== b && o.texto.trim() === m[1] && Math.abs(o.y - b.y) < b.tam * 0.6 && o.x < b.x && b.x - o.x < b.tam * 4)) textos[b.id] = textos[b.id].slice(m[0].length);
    }
  }
  // Dia da semana que não bate com a data (o modelo dizia "segunda-feira" para outra data).
  // Rótulo que voltou sem os espaços entre as palavras: separado de novo pelo vocabulário do modelo, material e pedido.
  const vocab = vocabulario(...paginas.flatMap(p => p.blocos.map(b => b.texto)), contexto, pedido);
  for (const id of Object.keys(textos)) textos[id] = separarPalavras(textos[id], vocab);
  for (const id of Object.keys(textos)) textos[id] = corrigirDiaDaSemana(textos[id], { hoje });
  // Rótulo que voltou com letras separadas (efeito visual, não texto): fica o do modelo, que o PowerPoint espaça.
  for (const id of Object.keys(textos)) if (viciosDeEscrita(textos[id]).includes('letras separadas')) textos[id] = original.get(id) ?? textos[id];
  for (const [id, de] of repetidos) if (textos[de] !== undefined) textos[id] = textos[de];
  // Slide nunca fica sem texto: se todos os blocos de um slide que tinha texto ficaram vazios, volta o do modelo
  // (com os nomes trocados pela IA onde houver), em vez de um slide em branco.
  if (conteudos) {
    // Reestilo: número que não está no material nem no conteúdo do slide é inventado; o bloco sai (o título fica sem o
    // número). Slide que ficou sem texto recebe o conteúdo dele (título no maior bloco, resto no segundo), nunca o
    // texto do modelo.
    const material = `${contexto || ''}\n${pedido || ''}\n${conteudos.join('\n')}`;
    paginas.forEach((p, k) => {
      for (const b of p.blocos) {
        if (textos[b.id] === undefined && !fica(b)) textos[b.id] = '';   // texto do modelo nunca entra
        const t = textos[b.id];
        if (!t || fica(b)) continue;
        const fora = numerosForaDoMaterial(t, material);
        if (!fora.length) continue;
        textos[b.id] = papelDoBloco(b, p.blocos) === 'título' ? fora.reduce((x, n) => x.replace(n, ''), t).replace(/\s{2,}/g, ' ').trim() : '';
      }
      const comTexto = p.blocos.filter(b => b.texto.trim() && !fica(b));
      if (comTexto.length && comTexto.every(b => !textos[b.id])) {
        const [titulo, ...resto] = String(conteudos[k] || '').split('\n');
        const ordem = [...comTexto].sort((a, b) => (b.tam || 0) - (a.tam || 0));
        textos[ordem[0].id] = titulo || '';
        if (ordem[1]) textos[ordem[1].id] = resto.join(' · ');
      }
    });
  } else for (const p of paginas) {
    const comTexto = p.blocos.filter(b => b.texto.trim() && !fica(b));
    if (comTexto.length && comTexto.every(b => textos[b.id] === '')) for (const b of comTexto) textos[b.id] = b.texto;
  }
  return { textos, faltando, custo, economia, fatos_faltando: faltam.map(f => f.texto) };
}
