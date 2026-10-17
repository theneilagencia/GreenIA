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
  'Use só o conteúdo do slide, com as mesmas frases (pode encurtar, não acrescentar). Não invente nada: nenhum número, percentual, valor, prazo, caso, nome, contato, slogan, chamada ou conclusão que não esteja no conteúdo. O texto do modelo é só exemplo de layout e nunca entra na apresentação.',
  'Bloco do layout que não tem conteúdo correspondente volta "" (texto vazio) e sai do slide, seja item, parágrafo, rótulo ou célula de tabela. Só o título nunca fica vazio.',
  'Em tabela ou agenda, cada informação vai para a coluna do mesmo tipo (horário com horário, atividade com atividade, quem participa com quem participa), uma linha da tabela por item do conteúdo; linhas que sobram ficam vazias.',
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
// Contato (telefone, CEP, email) sai do material antes: os dígitos dele não são dados ("3000" de (43) 3000-0000 virou
// "até 3000 hectares" em produção).
const semContatos = t => String(t || '').replace(/\S+@\S+/g, ' ').replace(/\(?\b\d{2}\)?\s?\d{4,5}-?\d{4}\b/g, ' ').replace(/\b\d{5}-\d{3}\b/g, ' ');
export function numerosForaDoMaterial(texto, material) {
  const tem = new Set((semContatos(material).match(NUMERO) || []).map(normNumero));
  // Inteiro pequeno sozinho (capítulo, item, "3 profundidades") não conta: renumerar capítulos é pedido comum.
  return (semContatos(texto).match(NUMERO) || []).filter(n => !tem.has(normNumero(n)) && !(/^\d{1,2}$/.test(n) && Number(n) <= 60));
}
/**
 * Página que serve para um slide de texto ou lista: sem tabela (duas ou mais linhas com 3 ou mais blocos lado a lado)
 * e sem diagrama de muitas caixas. QA em produção: numa página de tabela, a IA misturou casos e planos nas colunas.
 */
export function paginaDeTexto(p) {
  const linhas = new Map();
  for (const b of p.blocos) { const k = Math.round(b.y / Math.max(4, (b.tam || 12) * 0.6)); linhas.set(k, (linhas.get(k) || 0) + 1); }
  const linhasLargas = [...linhas.values()].filter(n => n >= 3).length;
  return linhasLargas < 2 && p.blocos.length <= 16;
}
const resumoDaPagina = (p, n) => {
  const t = p.blocos.find(b => papelDoBloco(b, p.blocos) === 'título');
  const linhas = new Set(p.blocos.map(b => Math.round(b.y / 6))).size, colunas = new Set(p.blocos.map(b => Math.round(b.x / 20))).size;
  return `Página ${n}: ${p.blocos.length} blocos de texto em ${linhas} linhas e ${colunas} colunas${t ? `; título: "${t.texto.slice(0, 70)}"` : ''}; textos: ${p.blocos.slice(0, 14).map(b => `"${b.texto.slice(0, 50)}"`).join(', ')}`;
};
export function mensagensPlanoReestilo({ paginas, fonte, pedido, contexto, maximo = null }) {
  return [
    { role: 'system', content: [
      'Você monta a apresentação da pessoa no design de uma apresentação modelo. Decida quais slides a apresentação final terá e, para cada um, qual página do modelo serve de layout.',
      `A apresentação final tem os slides da apresentação da pessoa, na ordem dela, com os ajustes do pedido aplicados (juntar slides, enriquecer com outro documento citado, remover). Não divida um slide em vários e não acrescente slides de temas que a apresentação da pessoa não tem${maximo ? `: no máximo ${maximo} slides` : ''}.`,
      'Para cada slide, escolha a página do modelo cujo layout melhor acomoda o conteúdo: capa para o primeiro slide, página de encerramento ou contato para o último, página com lista para itens, com tabela para dados em linhas e colunas, com colunas para comparações. A mesma página pode servir para mais de um slide.',
      'conteudo: o texto completo do slide (título na primeira linha, depois os itens, um por linha), tirado só da apresentação da pessoa, do pedido e dos documentos da conversa, com as mesmas palavras. Números, nomes e contatos ficam exatamente como estão. Não invente números, casos, prazos, dados, frases de efeito, slogans nem "antes e depois" que o material não tem.',
      'Responda só JSON: {"slides":[{"pagina":<número da página do modelo>,"conteudo":"..."}]}',
    ].join('\n') },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${String(contexto || '').slice(-40000)}\n</material>\n\n<apresentacao_da_pessoa>\n${fonte}\n</apresentacao_da_pessoa>\n\nPáginas do modelo (layout) que podem ser usadas:\n${paginas.map((p, k) => [p, k]).filter(([p, k]) => k === 0 || k === paginas.length - 1 || paginaDeTexto(p)).map(([p, k]) => resumoDaPagina(p, k + 1)).join('\n')}` },
  ];
}
// Frase que não vem do material: palavras de conteúdo (4+ letras, sem acento) que não aparecem nele. QA em produção: a
// IA escreveu "Antes: irrigação manual, custos altos", "Semana 14+: expansão" e slogans que a apresentação não tinha.
const palavrasDe = t => (String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]{4,}/g) || []).map(w => w.replace(/(es|s)$/, ''));
// Pares de palavras seguidas: frase inventada que reusa palavras do material em combinações novas tem poucos pares
// em comum com ele (QA em produção: "relatório técnico com achados, projeção de economia, cronograma e proposta
// customizada" saiu de um contrato que não diz nada disso).
const VAZIAS = new Set(['com', 'para', 'por', 'dos', 'das', 'sua', 'seu', 'que', 'uma', 'nos', 'nas', 'mais', 'sem', 'cada', 'ate', 'como']);
const palavrasSeguidas = t => (String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || []).filter(w => w.length >= 3 && !VAZIAS.has(w)).map(w => w.replace(/(es|s)$/, ''));
const pares = ws => ws.slice(1).map((w, i) => `${ws[i]} ${w}`);
const cacheDePares = new Map();
export function paresNoMaterial(texto, material) {
  let tem = cacheDePares.get(material);
  if (!tem) { tem = new Set(pares(palavrasSeguidas(material))); cacheDePares.clear(); cacheDePares.set(material, tem); }
  const b = pares(palavrasSeguidas(texto));
  return b.length < 3 ? 1 : b.filter(x => tem.has(x)).length / b.length;
}
export function fracaoForaDoMaterial(texto, material) {
  const tem = new Set(palavrasDe(material)), ws = palavrasDe(texto);
  return ws.length < 3 ? 0 : ws.filter(w => !tem.has(w)).length / ws.length;
}
// Pedido de juntar slides ("os slides de Resultados e Planos podem virar um só", "junte X e Y"): pares de nomes.
const semAcento = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function juncoesPedidas(pedido) {
  const t = semAcento(pedido), pares = [];
  for (const m of t.matchAll(/(?:slides?|paginas?)\s+(?:de\s+|do\s+|da\s+)?["“]?([a-z0-9][\w\- ]{1,40}?)["”]?\s+e\s+(?:de\s+|do\s+|da\s+)?["“]?([a-z0-9][\w\- ]{1,40}?)["”]?\s+(?:podem\s+|devem\s+|vao\s+)?(?:virar|ser|ficar|formar|em)\s+(?:um\s+so|um\s+unico|uma?\s+slide|um$)/g)) pares.push([m[1].trim(), m[2].trim()]);
  for (const m of t.matchAll(/\b(?:junt\w*|un[ai]\w*|mescl\w*|combin\w*)\s+(?:os\s+slides\s+(?:de\s+)?)?["“]?([a-z0-9][\w\- ]{1,40}?)["”]?\s+e\s+["“]?([a-z0-9][\w\- ]{1,40}?)["”]?(?=[\s.,;:]|$)/g)) pares.push([m[1].trim(), m[2].trim()]);
  return pares;
}
// Slides do plano onde foi parar cada lado de uma junção pedida: pelo título e, principalmente, pelo conteúdo (os
// itens do slide da apresentação que tem esse nome). QA em produção: os resultados foram juntados com "Benefícios" e
// os planos ficaram num slide à parte, e a conferência só pelo título não viu.
function juncoesNaoFeitas(slides, pares, fonte = '') {
  const norm = t => semAcento(t).replace(/^[•\-–\s]+/, '').replace(/\s+/g, ' ').trim();
  const fonteSlides = slidesDaFonte(fonte);
  const ondeEsta = nome => {
    const origem = fonteSlides.find(x => norm(x.split('\n')[0]).includes(nome));
    const itens = origem ? origem.split('\n').slice(1).map(l => norm(l).slice(0, 30)).filter(l => l.length >= 8) : [];
    let melhor = -1, max = 0;
    slides.forEach((s, i) => {
      const corpo = norm(s.conteudo);
      const n = itens.filter(l => corpo.includes(l)).length + (norm(String(s.conteudo).split('\n')[0]).includes(nome) ? 0.5 : 0);
      if (n > max) { max = n; melhor = i; }
    });
    return melhor;
  };
  return pares.map(([a, b]) => { const ia = ondeEsta(a), ib = ondeEsta(b); return ia >= 0 && ib >= 0 && ia !== ib ? { a, b, ia, ib } : null; }).filter(Boolean);
}
/** Slides da apresentação da pessoa ("## Slide N" e as linhas dele), sem os ids de edição. */
export const slidesDaFonte = fonte => String(fonte || '').split(/^## Slide \d+\s*$/m).map(s => s.replace(/^\[[^\]]+\]\s*/gm, '').trim()).filter(Boolean);
/**
 * Plano do reestilo: [{ pagina (índice 0..n-1 no modelo), conteudo }]. Sem resposta utilizável da IA, cada slide da
 * pessoa vai, na ordem, para a capa, as páginas do meio e a última página do modelo.
 */
export async function planejarReestilo({ paginas, fonte, pedido, contexto, chamar, material: fontes = null }) {
  // Material para conferir o conteúdo: a apresentação, os documentos e o pedido (não a resposta da IA).
  const material = `${fonte}\n${fontes ?? contexto ?? ''}\n${pedido || ''}`;
  // Linha com número que não está no material sai do conteúdo (no título, sai só o número); linha que não vem do
  // material (a maior parte das palavras não está nele) também sai.
  const limpar = c => String(c || '').split('\n').map((l, i) => {
    if (i > 0 && (fracaoForaDoMaterial(l, material) >= 0.4 || paresNoMaterial(l, material) < 0.25)) return null;
    // Linha de uma palavra só que não é título da apresentação ("Antes", "Depois"): cabeçalho sem seção, sai.
    if (i > 0 && /^\s*[•\-–]?\s*[\p{L}]+\s*:?\s*$/u.test(l) && !titulosDaFonte.has(semAcento(l.replace(/[•\-–:]/g, '').trim()))) return null;
    const fora = numerosForaDoMaterial(l, material);
    if (!fora.length) return l;
    return i === 0 ? fora.reduce((t, n) => t.replace(n, ''), l).replace(/\s{2,}/g, ' ').trim() : null;
  }).filter(l => l != null && l.trim()).join('\n');
  const fam = correspondenciaDaFonte(paginas, fonte);
  if (fam.familia) return planoDaFamilia({ paginas, fonte, pedido, contexto: fontes ?? contexto, chamar, material, ...fam });
  const titulosDaFonte = new Set(slidesDaFonte(fonte).map(x => semAcento(x.split('\n')[0].trim())));
  // No máximo os slides da apresentação da pessoa: juntar reduz, dividir em mais slides não (QA: 6 viraram 11).
  const maximo = Math.max(1, slidesDaFonte(fonte).length);
  let custo = 0, economia = 0, slides = null;
  const textuais = paginas.map((p, k) => k).filter(k => k > 0 && k < paginas.length - 1 && paginaDeTexto(paginas[k]));
  try {
    let j = null;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const msgs = mensagensPlanoReestilo({ paginas, fonte, pedido, contexto, maximo });
      if (tentativa) msgs.push({ role: 'assistant', content: JSON.stringify(j) }, { role: 'user', content: `Esse plano tem ${j.slides.length} slides; o máximo é ${maximo}, o número de slides da apresentação da pessoa. Não divida slides; junte os que o pedido manda juntar. Responda o plano corrigido, só o JSON.` });
      const x = await chamar(msgs);
      custo += x.custo || 0; economia += x.economia || 0;
      j = lerJson(x.texto);
      if (!Array.isArray(j?.slides) || j.slides.length <= maximo) break;
    }
    if (Array.isArray(j?.slides) && j.slides.length > maximo) j = null;
    const lista = (Array.isArray(j?.slides) ? j.slides : []).map(s => ({ pagina: Math.round(Number(s?.pagina)) - 1, conteudo: limpar(s?.conteudo) }))
      .filter(s => s.pagina >= 0 && s.pagina < paginas.length && s.conteudo).slice(0, MAX_PAGINAS_MODELO)
      // Página de tabela ou diagrama no meio: troca pela página de texto mais próxima (a capa e a última ficam).
      .map(s => s.pagina === 0 || s.pagina === paginas.length - 1 || paginaDeTexto(paginas[s.pagina]) || !textuais.length ? s : { ...s, pagina: textuais.reduce((m, k) => Math.abs(k - s.pagina) < Math.abs(m - s.pagina) ? k : m) });
    if (lista.length) slides = lista;
    // Slide que perdeu linhas na conferência (paráfrase do contrato que não deu para conferir): pede uma vez o
    // conteúdo desses slides com frases copiadas do material. QA em produção: o slide de evidências ficou só com o prazo.
    const brutos = (Array.isArray(j?.slides) ? j.slides : []).map(x => String(x?.conteudo || '').split('\n').filter(l => l.trim()).length);
    const magros = slides ? slides.map((x, i) => ({ i, antes: brutos[i] || 0, depois: x.conteudo.split('\n').length })).filter(x => x.antes - x.depois >= 2 && x.depois <= x.antes / 2) : [];
    if (magros.length) {
      try {
        const msgs = mensagensPlanoReestilo({ paginas, fonte, pedido, contexto, maximo });
        msgs.push({ role: 'assistant', content: JSON.stringify(j) }, { role: 'user', content: `Nos slides ${magros.map(x => x.i + 1).join(', ')}, a maior parte das linhas não pôde ser conferida no material e saiu. Reescreva só o conteúdo desses slides copiando frases do material (apresentação, contrato, proposta) com as mesmas palavras, sem resumir com palavras novas. Responda só JSON: {"slides": [{"indice": <número do slide no plano>, "conteudo": "..."}]}` });
        const x = await chamar(msgs);
        custo += x.custo || 0; economia += x.economia || 0;
        for (const n of lerJson(x.texto)?.slides || []) {
          const k = Math.round(Number(n?.indice)) - 1, novo = limpar(n?.conteudo);
          if (magros.some(m => m.i === k) && novo && novo.split('\n').length > slides[k].conteudo.split('\n').length) slides[k] = { ...slides[k], conteudo: novo };
        }
      } catch { /* fica o conteúdo conferido */ }
    }
    // Junção pedida que o plano não fez: pede de novo uma vez; se continuar separada, a plataforma junta os dois
    // slides (o conteúdo do segundo vai para o primeiro, com o título "A e B").
    const pares = juncoesPedidas(pedido);
    // Slide que juntou as duas partes pedidas mas ficou com o título de uma só: o título passa a citar as duas.
    if (slides) for (const [a, b] of pares) for (const s of slides) {
      const [t, ...r] = s.conteudo.split('\n'), tt = semAcento(t), corpo = semAcento(r.join(' '));
      const fonteDe = n => semAcento(slidesDaFonte(fonte).find(x => semAcento(x.split('\n')[0]).includes(n)) || '');
      const temDe = n => { const linhas = fonteDe(n).split('\n').slice(1).map(l => l.replace(/^[•\-\s]+/, '').slice(0, 25)).filter(Boolean); return linhas.some(l => corpo.includes(l)); };
      if (tt.includes(a) !== tt.includes(b) && !/\se\s/.test(tt) && temDe(a) && temDe(b)) s.conteudo = [`${t.trim()} e ${(tt.includes(a) ? b : a).replace(/^./, c => c.toUpperCase())}`, ...r].join('\n');
    }
    if (slides && juncoesNaoFeitas(slides, pares, fonte).length) {
      try {
        const falta = juncoesNaoFeitas(slides, pares, fonte).map(f => `"${f.a}" e "${f.b}"`).join(', ');
        const msgs = mensagensPlanoReestilo({ paginas, fonte, pedido, contexto, maximo });
        msgs.push({ role: 'assistant', content: JSON.stringify({ slides: slides.map(s => ({ pagina: s.pagina + 1, conteudo: s.conteudo })) }) }, { role: 'user', content: `O pedido manda juntar os slides ${falta} num slide só, e o plano os deixou separados. Responda o plano corrigido, só o JSON.` });
        const x = await chamar(msgs);
        custo += x.custo || 0; economia += x.economia || 0;
        const j2 = lerJson(x.texto);
        const l2 = (Array.isArray(j2?.slides) ? j2.slides : []).map(s => ({ pagina: Math.round(Number(s?.pagina)) - 1, conteudo: limpar(s?.conteudo) })).filter(s => s.pagina >= 0 && s.pagina < paginas.length && s.conteudo);
        if (l2.length && l2.length <= maximo && !juncoesNaoFeitas(l2, pares, fonte).length) slides = l2.map(s => s.pagina === 0 || s.pagina === paginas.length - 1 || paginaDeTexto(paginas[s.pagina]) || !textuais.length ? s : { ...s, pagina: textuais.reduce((m, k) => Math.abs(k - s.pagina) < Math.abs(m - s.pagina) ? k : m) });
      } catch { /* junção pela plataforma abaixo */ }
      for (let f = juncoesNaoFeitas(slides, pares, fonte)[0]; f; f = juncoesNaoFeitas(slides, pares, fonte)[0]) {
        const [i, k] = [Math.min(f.ia, f.ib), Math.max(f.ia, f.ib)];
        const [t1, ...r1] = slides[i].conteudo.split('\n'), [t2, ...r2] = slides[k].conteudo.split('\n');
        slides[i] = { ...slides[i], conteudo: [`${t1.trim()} e ${t2.trim()}`, ...r1, ...r2].join('\n') };
        slides.splice(k, 1);
      }
    }
  } catch { /* plano simples abaixo */ }
  if (!slides) {
    const fonteSlides = slidesDaFonte(fonte), n = paginas.length, meio = textuais.length ? textuais : [Math.min(1, n - 1)];
    slides = fonteSlides.map((c, i) => ({ pagina: i === 0 ? 0 : i === fonteSlides.length - 1 && n > 1 ? n - 1 : meio[(i - 1) % meio.length], conteudo: c }));
  }
  // Título que promete o que o slide não tem: todas as linhas vêm de um único slide da apresentação e o título fala de
  // outra coisa (QA em produção: "Diagnóstico Operacional: Escopo e Próximos Passos" só com os próximos passos, porque
  // as linhas do diagnóstico não passaram na conferência). O título volta a ser o do slide de origem.
  const origem = slidesDaFonte(fonte).map(x => { const [t, ...r] = x.split('\n'); return { titulo: t.trim(), itens: r.map(l => semAcento(l).replace(/^[•\-–\s]+/, '').trim().slice(0, 30)).filter(l => l.length >= 6) }; });
  const palavrasDoTitulo = t => palavrasSeguidas(t);
  for (const s of slides || []) {
    const [t, ...r] = s.conteudo.split('\n'), linhas = r.map(l => semAcento(l).replace(/^[•\-–\s]+/, '').trim()).filter(Boolean);
    if (!linhas.length) continue;
    const dona = origem.find(o => o.itens.length && linhas.every(l => o.itens.some(i => l.startsWith(i) || i.startsWith(l.slice(0, 30)))));
    if (!dona) continue;
    const doTitulo = palavrasDoTitulo(t), conhecidas = new Set([...palavrasDoTitulo(dona.titulo), ...palavrasDoTitulo(r.join(' '))]);
    if (doTitulo.length && doTitulo.filter(w => !conhecidas.has(w)).length / doTitulo.length > 0.5) s.conteudo = [dona.titulo, ...r].join('\n');
  }
  return { slides, custo, economia };
}
// ---------- mesma família: a apresentação da pessoa e o modelo têm as mesmas seções ----------
// Caso real: um kick-off no design de outro kick-off da mesma consultoria (MENSAGEM CENTRAL, PAPÉIS, MÉTODO…). Escolher
// páginas pelo tipo (lista, tabela) e encaixar texto pela ordem deixava slides só com o título ou com o conteúdo no
// lugar errado, e os filtros de frase cortavam o enriquecimento pedido. Aqui cada slide vai para a página equivalente
// do modelo e a IA aplica o pedido (renumerar, renomear, enriquecer com a proposta e o contrato) no texto da pessoa.
const linhasDe = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
export function correspondenciaDaFonte(paginas, fonte) {
  const fonteSlides = slidesDaFonte(fonte);
  const corresp = fonteSlides.map(s => paginaCorrespondente(paginas, linhasDe(s)));
  const familia = fonteSlides.length >= 3 && corresp.filter(c => c.nota >= 0.4).length >= fonteSlides.length * 0.6;
  return { fonteSlides, corresp, familia };
}
// Divisórias (slide de uma linha) seguidas de um slide com o mesmo assunto no título ou no rótulo: a lista vai para a IA
// como fato, para o pedido "a divisória tem o mesmo nome do slide seguinte" ser aplicado na divisória certa.
export function divisoriasRepetidas(fonte) {
  const sl = slidesDaFonte(fonte).map(linhasDe), achados = [];
  sl.forEach((s, i) => {
    if (s.length !== 1 || !sl[i + 1]) return;
    const prox = sl[i + 1].slice(0, 3).map(l => l.replace(/^\d{1,2}\s*·\s*/, ''));
    const n = Math.max(...prox.map(l => parecenca(s[0], l)));
    if (n >= 0.55) achados.push(`- slide ${i + 1} (divisória) "${s[0]}" e slide ${i + 2}: "${sl[i + 1].slice(0, 2).join(' / ')}"`);
  });
  return achados.length ? `Divisórias com o mesmo nome do slide seguinte (achadas pela plataforma):\n${achados.join('\n')}\n\n` : '';
}
export function mensagensPlanoFamilia({ fonte, pedido, contexto }) {
  return [
    { role: 'system', content: [
      'Você aplica um pedido de ajustes a uma apresentação. O design vem de uma apresentação modelo da mesma família (as mesmas seções); a plataforma cuida do layout, você cuida só do TEXTO de cada slide.',
      'Devolva a apresentação inteira, slide a slide, na ordem, com o pedido aplicado. Cada slide: uma linha por caixa de texto, na mesma ordem e com o mesmo papel das linhas do slide original (título, rótulo, item, rodapé). Não junte linhas de caixas diferentes numa só.',
      'Faça de verdade tudo o que o pedido manda: corrigir numeração de capítulos e seções em todos os slides, renomear divisórias e títulos, enriquecer itens genéricos com fatos concretos dos documentos da conversa (proposta, contrato, anexos): nomes de sistemas, documentos, entregáveis, frentes, prazos e responsabilidades que eles citam. Escreva como um consultor sênior: frases curtas, específicas e claras para uma apresentação falada.',
      'O que o pedido não manda mudar fica como está, com as mesmas palavras. Acrescente, remova ou junte slides só se o pedido mandar.',
      'Nunca mude o sentido de um slide: o que está fora do escopo continua fora, o que é proibido continua proibido; não inverta, não negue, não troque a lista de um slide por outra.',
      'Divisória (slide de uma linha que abre um capítulo) com o mesmo nome do slide seguinte: dê à divisória um nome novo, curto, tirado do assunto do capítulo e dos documentos, que anuncie o mesmo tema com outras palavras. O slide seguinte não muda. Não use frases genéricas nem de exemplo.',
      'Não invente: todo número, data, prazo, valor, nome e fato novo precisa estar nos documentos da conversa. Item enriquecido continua cabendo numa caixa de slide (até uns 120 caracteres).',
      'Responda só JSON, com todos os slides na ordem final: {"slides":[{"origem":<número do slide original, ou null se for novo>,"conteudo":"linha 1\\nlinha 2\\n..."}],"mudancas":["o que mudou, em uma frase", ...]}. Slide que fica exatamente igual vai só como {"origem":<número>,"igual":true}, sem o conteúdo.',
    ].join('\n') },
    { role: 'user', content: `Pedido: ${pedido}\n\n${divisoriasRepetidas(fonte)}<documentos_da_conversa>\n${String(contexto || '').slice(0, 120000)}\n</documentos_da_conversa>\n\n<apresentacao>\n${slidesDaFonte(fonte).map((s, i) => `## Slide ${i + 1}\n${s}`).join('\n\n')}\n</apresentacao>` },
  ];
}
async function planoDaFamilia({ paginas, fonte, pedido, contexto, chamar, material, fonteSlides, corresp }) {
  let custo = 0, economia = 0, j = null;
  try {
    const x = await chamar(mensagensPlanoFamilia({ fonte, pedido, contexto }));
    custo += x.custo || 0; economia += x.economia || 0;
    j = lerJson(x.texto);
  } catch { /* fica a apresentação como está, no design do modelo */ }
  // Linha nova (que não estava no slide original): sai se tiver número que não está no material ou se a maior parte
  // das palavras não vier dele. Linha que já estava na apresentação passa sempre.
  const originais = new Set(fonteSlides.flatMap(linhasDe).map(semAcento));
  const conferir = c => linhasDe(c).filter(l => originais.has(semAcento(l)) || (!numerosForaDoMaterial(l, material).length && fracaoForaDoMaterial(l, material) < 0.5)).join('\n');
  const maximo = fonteSlides.length + Math.max(2, Math.ceil(fonteSlides.length * 0.2));
  let lista = (Array.isArray(j?.slides) ? j.slides : []).slice(0, maximo).map(s => {
    const o = Math.round(Number(s?.origem)) - 1;
    const origem = o >= 0 && o < fonteSlides.length ? o : -1;
    // Slide que já existia: as linhas são conferidas uma a uma contra as originais (abaixo); slide novo: conferência simples.
    return { origem, conteudo: s?.igual === true && origem >= 0 ? fonteSlides[origem] : origem >= 0 ? String(s?.conteudo || '') : conferir(s?.conteudo) };
  }).filter(s => s.conteudo.trim());
  const remover = /\b(remov|retir|exclu|apag|tir[ae]|elimin|enxug|reduz|resum)/i.test(semAcento(pedido));
  // Resposta que perdeu boa parte da apresentação (cortada, ou slides esquecidos): fica a apresentação original.
  // Travas por slide: frase que perde ou ganha negação ("não", "sem", "fora") em relação à linha original equivalente
  // volta à original (QA em produção: "O que não está no escopo" virou "O que está no escopo"); slide que, depois da
  // conferência, ficou com menos da metade das linhas do original volta inteiro ao original (o mesmo slide ficou vazio).
  const NEG = /\b(n[aã]o|sem|fora|nunca|nenhum|nenhuma|exceto)\b/i;
  // Alinhamento com o slide original: cada linha nova se liga à linha original mais parecida. Linha editada que não
  // passa na conferência (número ou palavras fora do material) volta à original, em vez de sumir; linha original que
  // a IA deixou de fora volta ao seu lugar, a menos que o pedido mande remover ou enxugar. QA em produção: a linha
  // "Evidência · Documentos…", justamente a que o pedido mandou enriquecer, sumiu do slide.
  const passa = l => originais.has(semAcento(l)) || (!numerosForaDoMaterial(l, material).length && fracaoForaDoMaterial(l, material) < 0.5);
  lista = lista.map(s => {
    if (s.origem < 0) return s;
    const orig = linhasDe(fonteSlides[s.origem]), novas = linhasDe(s.conteudo);
    const pares = [];
    novas.forEach((l, j) => orig.forEach((o, i) => { const n = parecenca(o, l); if (n >= 0.3) pares.push([n, i, j]); }));
    pares.sort((a, b) => b[0] - a[0]);
    const deNova = new Map(), usadas = new Set();
    for (const [, i, j] of pares) if (!deNova.has(j) && !usadas.has(i)) { deNova.set(j, i); usadas.add(i); }
    // Linha reescrita por inteiro (nome novo de divisória, título trocado): se liga à linha original livre no mesmo
    // trecho do slide, a de tamanho mais parecido.
    novas.forEach((l, j) => {
      if (deNova.has(j)) return;
      const antes = Math.max(-1, ...[...deNova].filter(([jj]) => jj < j).map(([, i]) => i)), depois = Math.min(orig.length, ...[...deNova].filter(([jj]) => jj > j).map(([, i]) => i));
      const livres = orig.map((o, i) => i).filter(i => i > antes && i < depois && !usadas.has(i));
      if (!livres.length) return;
      const i = livres.reduce((m, i) => Math.abs(orig[i].length - l.length) < Math.abs(orig[m].length - l.length) ? i : m);
      deNova.set(j, i); usadas.add(i);
    });
    let invertido = false;
    const itens = novas.map((l, j) => {
      const i = deNova.get(j), o = i == null ? null : orig[i];
      if (o != null && NEG.test(semAcento(o)) !== NEG.test(semAcento(l))) { invertido = true; return { k: i, l: o, i }; }
      if (!passa(l)) return o == null ? null : { k: i, l: o, i };
      return { k: i ?? -1, l, i };
    });
    // Linha nova sem par: entra logo depois da linha anterior dela.
    let ant = -0.5;
    for (const x of itens) { if (!x) continue; if (x.k === -1) x.k = ant + 0.01; ant = x.k; }
    const juntas = itens.filter(Boolean);
    if (!remover) orig.forEach((o, i) => { if (!usadas.has(i)) juntas.push({ k: i, l: o, i }); });
    juntas.sort((a, b) => a.k - b.k);
    const resultado = juntas.map(x => x.l);
    // Sentido invertido (a lista do slide também mudou junto) ou slide esvaziado: volta ao original, mas a
    // renumeração pedida no rótulo ("09 · ESCOPO" → "08 · ESCOPO") fica.
    if (invertido || (orig.length >= 3 && resultado.length < orig.length / 2)) {
      const so = l => semAcento(l).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
      return { ...s, conteudo: orig.map(o => novas.find(l => l !== o && so(l) === so(o)) ?? o).join('\n') };
    }
    return { ...s, conteudo: resultado.join('\n'), pares: juntas.map(x => x.i) };
  });
  // Slide de conteúdo que repete o nome da divisória logo antes dele (o pedido era justamente evitar a repetição):
  // a linha volta à original. QA em produção: a divisória ganhou nome novo e o título do slide seguinte também.
  lista.forEach((s, n) => {
    const div = lista[n - 1];
    if (!div || s.origem < 0 || linhasDe(div.conteudo).length !== 1 || linhasDe(s.conteudo).length < 2) return;
    const nome = linhasDe(div.conteudo)[0], orig = linhasDe(fonteSlides[s.origem]);
    s.conteudo = linhasDe(s.conteudo).map((l, k) => {
      const i = s.pares?.[k];
      return parecenca(l, nome) >= 0.8 && i != null && orig[i] && parecenca(orig[i], nome) < 0.8 ? orig[i] : l;
    }).join('\n');
  });
  // Slide da apresentação que a resposta deixou de fora (sem pedido de remover): volta no lugar dele.
  // QA em produção: a divisória "Como o trabalho acontece" sumiu do arquivo.
  if (!remover) fonteSlides.forEach((c, i) => {
    if (lista.some(s => s.origem === i)) return;
    const depois = lista.findIndex(s => s.origem > i);
    lista.splice(depois < 0 ? lista.length : depois, 0, { origem: i, conteudo: c });
  });
  // Capítulos fora de sequência ("07" e depois "09") com pedido sobre numeração: a plataforma renumera os rótulos
  // "NN · …" na ordem em que aparecem, além do que a IA fizer.
  if (/cap[ií]tulo|numera|pul[ao]m?\b|sequ[eê]ncia/i.test(pedido || '')) {
    const rot = /^(\d{2})(\s*·\s*)/;
    const vistos = [];
    for (const s of lista) for (const l of linhasDe(s.conteudo)) { const m = rot.exec(l); if (m && !vistos.includes(m[1])) vistos.push(m[1]); }
    const ns = vistos.map(Number);
    if (ns.length >= 3 && ns.every((n, i) => !i || n > ns[i - 1]) && ns.some((n, i) => i && n !== ns[i - 1] + 1)) {
      const novo = new Map(vistos.map((v, i) => [v, String(ns[0] + i).padStart(2, '0')]));
      for (const s of lista) s.conteudo = linhasDe(s.conteudo).map(l => l.replace(rot, (t, n, sep) => `${novo.get(n) ?? n}${sep}`)).join('\n');
    }
  }
  const cobertos = new Set(lista.map(s => s.origem).filter(o => o >= 0));
  if (lista.length < fonteSlides.length * 0.6 || cobertos.size < fonteSlides.length * 0.6) lista = fonteSlides.map((c, i) => ({ origem: i, conteudo: c }));
  const textuais = paginas.map((p, k) => k).filter(k => k > 0 && k < paginas.length - 1 && paginaDeTexto(paginas[k]));
  const slides = lista.map((s, i) => {
    // Slide que já existia fica na página equivalente dele (o texto novo de uma divisória não parece com nenhuma
    // página); só slide novo, ou sem página equivalente, procura pelo conteúdo.
    const m = s.origem >= 0 && corresp[s.origem].nota >= 0.3 ? corresp[s.origem] : paginaCorrespondente(paginas, linhasDe(s.conteudo));
    const pagina = m.nota >= 0.3 ? m.k : s.origem >= 0 && corresp[s.origem].nota >= 0.3 ? corresp[s.origem].k
      : i === 0 ? 0 : i === lista.length - 1 ? paginas.length - 1 : (textuais[i % Math.max(1, textuais.length)] ?? Math.min(1, paginas.length - 1));
    return { pagina, conteudo: s.conteudo, correspondencia: true, ...(s.origem >= 0 ? { original: fonteSlides[s.origem] } : {}) };
  });
  // O que mudou, lido do resultado (não do que a IA diz ter feito: uma trava pode ter desfeito a mudança).
  const curto = t => (t.length > 90 ? `${t.slice(0, 87)}…` : t);
  const todas = [];
  slides.forEach((s, n) => {
    const o = lista[n].origem;
    if (o < 0) { todas.push(`Slide ${n + 1} (novo): "${curto(linhasDe(s.conteudo)[0] || '')}"`); return; }
    const orig = linhasDe(fonteSlides[o]), novo = linhasDe(s.conteudo), tem = new Set(orig);
    const trocas = novo.filter(l => !tem.has(l)).map(l => {
      const par = orig.reduce((m, x) => { const v = parecenca(x, l); return v > m.v && !novo.includes(x) ? { v, x } : m; }, { v: 0, x: null });
      return par.x ? `"${curto(par.x.replace(/\s+/g, ' '))}" → "${curto(l.replace(/\s+/g, ' '))}"` : `+ "${curto(l)}"`;
    });
    for (const t of trocas) todas.push(`Slide ${n + 1}: ${t}`);
  });
  const mudancas = todas.slice(0, 12);
  if (todas.length > 12) mudancas.push(`… e mais ${todas.length - 12} ${todas.length - 12 === 1 ? 'mudança' : 'mudanças'} (veja no arquivo)`);
  return { slides, custo, economia, mudancas, familia: true };
}

/** Páginas do modelo na ordem do plano (a mesma página pode repetir), com ids novos e a numeração "n / total" refeita. */
export function paginasDoPlano(paginas, plano) {
  return plano.map((s, i) => {
    const p = paginas[s.pagina];
    // Número de página solto no rodapé ("03" na página 3 do modelo) passa a ser o número do slide novo.
    const numero = b => /^\s*\d{1,3}\s*$/.test(b.texto) && p.h && b.y > p.h * 0.9 ? String(i + 1).padStart(b.texto.trim().length, '0') : b.texto;
    return { ...p, ...(s.correspondencia ? { correspondencia: true } : {}), ...(s.original ? { original: s.original } : {}), blocos: p.blocos.map((b, k) => ({ ...b, id: `${i + 1}.${k + 1}`, texto: /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(b.texto) ? `${i + 1} / ${plano.length}` : numero(b) })) };
  });
}

// ---------- correspondência entre o slide da pessoa e a página do modelo ----------
// Apresentações da mesma família (o caso real: um kick-off no design de outro kick-off) têm páginas com os mesmos
// blocos: "01 · MENSAGEM CENTRAL", "MOBILIZAR", "O responsável da frente é…". Cada linha vai para o bloco cujo texto
// original mais se parece com ela (pares de letras, sem espaços: "MO BILIZAR" do PDF = "MOBILIZAR").
const letras = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[•▪●\-–\s]+/, '').replace(/[^a-z0-9]/g, '');
const paresDeLetras = t => { const x = letras(t), m = new Map(); for (let i = 0; i < x.length - 1; i++) { const b = x.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; };
export function parecenca(a, b) {
  // Símbolo igual ("→", "•"): mesmo bloco, mesmo sem letras.
  if (String(a).trim() && String(a).trim() === String(b).trim()) return 1;
  const x = letras(a), y = letras(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 3 || y.length < 3) return 0;
  const pa = paresDeLetras(a), pb = paresDeLetras(b);
  let comum = 0; for (const [k, n] of pa) comum += Math.min(n, pb.get(k) || 0);
  return (2 * comum) / (x.length - 1 + y.length - 1);
}
const CONTADOR = /^\s*\d{1,3}\s*(\/\s*\d{1,3})?\s*$/;
/**
 * Encaixe por correspondência: { textos: {id: texto}, nota: 0..1 } — nota = parte dos blocos com par bom (≥ 0,6).
 * Pares bons primeiro (maior parecença); o que sobra segue a ordem de leitura; linha sem bloco vai para o último
 * bloco de texto usado; bloco sem linha fica vazio. Contador de página (03, 2 / 6) fica como está.
 */
export function encaixarPorCorrespondencia(pagina, linhas) {
  const blocos = pagina.blocos.filter(b => !CONTADOR.test(b.texto));
  // Linha "Evidência · Documentos, dados…" (rótulo e descrição numa caixa só) para um modelo que tem as duas caixas
  // separadas: se cada parte tem o seu bloco, e melhor que a linha inteira, a linha se divide.
  const melhorBloco = t => blocos.reduce((m, b, i) => { const n = parecenca(b.texto, t); return n > m.n ? { n, i } : m; }, { n: 0, i: -1 });
  // Números que o layout já desenha (passos "1"…"5", número da página): a linha só com o número sai, e o número no
  // começo da linha ("10 Onde existem exceções?") sai quando o modelo tem esse número numa caixa própria.
  const numeros = new Set(pagina.blocos.filter(b => CONTADOR.test(b.texto)).map(b => Number(b.texto.trim())));
  const comNumero = new Set(blocos.map(b => /^\s*(\d{1,3})\s/.exec(b.texto)?.[1]).filter(Boolean).map(Number));
  // Frase quebrada em duas caixas no arquivo de origem ("Qual resultado" + "precisa existir no final?"): a continuação
  // (começa em minúscula, a anterior não termina frase) volta a ser uma linha só.
  const inteiras = linhas.map(l => String(l).trim()).filter(Boolean).reduce((a, l) => {
    if (a.length && /^\p{Ll}/u.test(l) && !/[.!?:;]$/.test(a.at(-1)) && !/\s·\s/.test(l)) a[a.length - 1] = `${a.at(-1)} ${l}`; else a.push(l);
    return a;
  }, []);
  const ls = inteiras.filter(l => l && !(numeros.size && CONTADOR.test(l)))
    .map(l => { const m = /^(\d{1,3})\s+(?=\p{L})/u.exec(l); return m && numeros.has(Number(m[1])) && !comNumero.has(Number(m[1])) ? l.slice(m[0].length) : l; })
    .flatMap(l => {
    const partes = l.split(/\s+·\s+/).map(x => x.trim()).filter(Boolean);
    if (partes.length < 2) return [l];
    const ms = partes.map(melhorBloco), inteira = melhorBloco(l).n;
    if (ms.every(m => m.n >= 0.6) && new Set(ms.map(m => m.i)).size === ms.length && Math.min(...ms.map(m => m.n)) > inteira) return partes;
    // Rótulo curto do modelo no começo ("Evidência") e o resto reescrito: o rótulo vai para o bloco dele, o resto segue.
    const r = ms[0];
    return r.n >= 0.8 && r.n > inteira && blocos[r.i].texto.length <= 30 && !/·/.test(blocos[r.i].texto) ? [partes[0], partes.slice(1).join(' · ')] : [l];
  });
  const pares = [];
  blocos.forEach((b, i) => ls.forEach((l, j) => { const n = parecenca(b.texto, l); if (n >= 0.6) pares.push([n, i, j]); }));
  pares.sort((a, b) => b[0] - a[0]);
  const deBloco = new Map(), usadas = new Set();
  for (const [, i, j] of pares) if (!deBloco.has(i) && !usadas.has(j)) { deBloco.set(i, j); usadas.add(j); }
  const nota = blocos.length ? deBloco.size / Math.max(blocos.length, ls.length) : 0;
  const fortes = pares.filter(([n, i, j]) => n >= 0.8 && deBloco.get(i) === j).length;
  // Sobra: na ordem (blocos em ordem de leitura; linhas na ordem do slide).
  const ordem = blocos.map((b, i) => ({ b, i })).sort((p, q) => Math.abs(p.b.y - q.b.y) < (p.b.tam || 10) * 0.6 ? p.b.x - q.b.x : p.b.y - q.b.y);
  const livresB = ordem.filter(x => !deBloco.has(x.i)), livresL = ls.map((l, j) => j).filter(j => !usadas.has(j));
  livresB.forEach((x, k) => { if (k < livresL.length) deBloco.set(x.i, livresL[k]); });
  const textos = {};
  for (const b of pagina.blocos) if (!CONTADOR.test(b.texto)) textos[b.id] = '';
  blocos.forEach((b, i) => { if (deBloco.has(i)) textos[b.id] = ls[deBloco.get(i)]; });
  const sobra = livresL.slice(livresB.length).map(j => ls[j]);
  if (sobra.length) {
    // Sobra vai para o último bloco de texto (nunca o rodapé).
    const ultimo = [...ordem].reverse().find(x => deBloco.has(x.i) && x.b.texto.length > 20 && !(pagina.h && x.b.y > pagina.h * 0.9)) || ordem.at(-1);
    if (ultimo) textos[ultimo.b.id] = [textos[ultimo.b.id], ...sobra].filter(Boolean).join(' · ');
  }
  return { textos, nota, fortes };
}
/** Página do modelo mais parecida com o slide (mesma seção e mesmos blocos), com a nota da correspondência. */
export function paginaCorrespondente(paginas, linhas) {
  let melhor = { k: -1, nota: 0 };
  paginas.forEach((p, k) => {
    const { nota } = encaixarPorCorrespondencia(p, linhas);
    const titulo = parecenca(p.blocos[0]?.texto || '', linhas[0] || '');
    const n = nota + (titulo >= 0.6 ? 0.2 : 0);
    if (n > melhor.nota) melhor = { k, nota: n };
  });
  return melhor;
}

/**
 * Reestilo sem a IA reescrever: as frases do conteúdo de cada slide entram como estão nos blocos do layout. Título no
 * bloco de título; os itens nos blocos de texto, na ordem de leitura (os que sobram vão juntos no último); rótulos,
 * rodapés e blocos que sobram ficam vazios. QA em produção: ao encaixar o texto no layout, a IA reescrevia, inventava
 * ("estação coleta temperatura, chuva e vento") e perdia itens (os preços dos planos).
 */
export function preencherReestilo(paginas, conteudos) {
  const textos = {}, contador = /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/;
  paginas.forEach((p, k) => {
    // Página da mesma família do slide: encaixe por correspondência (rótulo no rótulo, item no item).
    const todas = String(conteudos[k] || '').split('\n').map(l => l.trim()).filter(Boolean);
    const enc = encaixarPorCorrespondencia(p, todas);
    // Página escolhida por correspondência (mesma família) também usa este encaixe, mesmo com poucos pares exatos.
    if (p.correspondencia || enc.nota >= 0.3 || enc.fortes >= 2) { Object.assign(textos, enc.textos); return; }
    const [titulo = '', ...itens] = todas;
    const tituloB = p.blocos.find(b => papelDoBloco(b, p.blocos) === 'título') || [...p.blocos].sort((a, b) => (b.tam || 0) - (a.tam || 0))[0];
    // Subtítulo (texto menor logo abaixo do título): fica vazio, para o primeiro item não virar subtítulo.
    const subtitulo = tituloB && p.blocos.find(b => b !== tituloB && b.y > tituloB.y && b.y - tituloB.y < (tituloB.tam || 20) * 1.8 && (b.tam || 0) < (tituloB.tam || 0) * 0.75);
    const corpo = p.blocos.filter(b => b !== tituloB && b !== subtitulo && !contador.test(b.texto) && papelDoBloco(b, p.blocos) !== 'rótulo'
      && b.y < p.h * 0.93 && (b.texto.length >= 12 || /\s/.test(b.texto.trim()))
      // Rótulo curto em negrito ("O Ganho", "Antes"): é cabeçalho do modelo, não lugar de item.
      && !(b.negrito && b.texto.length < 20 && b.texto.trim().split(/\s+/).length <= 3))
      .sort((a, b) => Math.abs(a.y - b.y) < (a.tam || 10) * 0.6 ? a.x - b.x : a.y - b.y);
    for (const b of p.blocos) if (!contador.test(b.texto)) textos[b.id] = '';
    if (tituloB) textos[tituloB.id] = titulo;
    if (!corpo.length) { if (tituloB && itens.length) textos[tituloB.id] = [titulo, ...itens].join(' · '); return; }
    // Itens repartidos por igual entre os blocos, na ordem; bloco que já desenha marcador não ganha outro "•".
    // Marcador desenhado como forma pequena à esquerda do bloco (bolinha, quadradinho) também conta.
    const caixas = (p.elementos || []).filter(e => e.t === 'forma' && Array.isArray(e.d)).map(e => { const xs = [], ys = []; for (const [, ...v] of e.d) for (let i = 0; i < v.length; i += 2) { xs.push(v[i]); ys.push(v[i + 1]); } return xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : null; }).filter(Boolean);
    const desenhado = b => caixas.some(c => c.w < Math.min(p.w, p.h) * 0.03 && c.h < Math.min(p.w, p.h) * 0.03 && c.x < b.x && b.x - (c.x + c.w) < (b.tam || 12) * 2 && Math.abs(c.y + c.h / 2 - (b.y - (b.tam || 12) * 0.35)) < (b.tam || 12) * 0.7);
    const marcado = b => !!b.marcador || /^\s*[•▪●\-–]\s/.test(b.texto) || desenhado(b);
    const limpo = (b, l) => marcado(b) ? l.replace(/^\s*[•▪●\-–]\s*/, '') : l;
    const m = Math.min(corpo.length, itens.length), grupos = Array.from({ length: m }, () => []);
    itens.forEach((l, i) => grupos[Math.floor(i * m / itens.length)].push(l));
    // Vários itens no mesmo bloco: separados por " · " (ou pelo ponto final do item), para não virar um texto corrido.
    const juntar = ls => ls.reduce((t, l, i) => !i ? l : /[.!?;:]$/.test(t) ? `${t} ${l}` : `${t} · ${l}`, '');
    grupos.forEach((g, i) => { textos[corpo[i].id] = juntar(g.map(l => limpo(corpo[i], l).replace(/^\s*[•▪●\-–]\s*/, g.length > 1 ? '' : '$&'))); });
  });
  return textos;
}

async function reestiloSemReescrever({ paginas, conteudos, chamar, etapa, fontes, pedido }) {
  etapa('Montando os slides no design do modelo…');
  const textos = preencherReestilo(paginas, conteudos);
  let custo = 0, economia = 0;
  // Página equivalente com estrutura diferente (o slide da pessoa é uma lista; o modelo, uma tabela de agenda): o
  // encaixe por ordem espalha o conteúdo pelas células. A IA distribui o conteúdo pelos blocos; o resultado só vale se
  // cada texto vier do conteúdo do slide (sem número nem palavras novas), senão fica o encaixe por ordem.
  const fracos = paginas.map((p, k) => ({ p, k })).filter(({ p, k }) => p.correspondencia && p.blocos.length > 6 && encaixarPorCorrespondencia(p, linhasDe(conteudos[k])).nota < 0.45);
  if (fracos.length) {
    try {
      const slides = fracos.map(({ p, k }) => ({ numero: k + 1, blocos: p.blocos.filter(b => !CONTADOR.test(b.texto)) }));
      const x = await chamar(mensagensAdaptacao({ slides, contexto: '', pedido, conteudos }));
      custo += x.custo || 0; economia += x.economia || 0;
      const j = lerJson(x.texto) || {};
      for (const { k } of fracos) {
        const ids = slides.find(s => s.numero === k + 1).blocos.map(b => b.id), daqui = String(conteudos[k] || '');
        // Cada texto vale se vier do conteúdo do slide ou se for o próprio rótulo do layout, sem número (cabeçalho de
        // tabela como "ATIVIDADE"); texto que não vem de nenhum dos dois sai. O encaixe da IA só substitui o por ordem
        // se colocar a maior parte das linhas do conteúdo.
        const original = new Map(paginas[k].blocos.map(b => [b.id, b.texto]));
        const novos = ids.map(id => [id, String(j[id] ?? '').trim()]).map(([id, t]) => [id, !t ? '' : (t === original.get(id) && !/\d/.test(t)) || (!numerosForaDoMaterial(t, daqui).length && fracaoForaDoMaterial(t, daqui) < 0.3) ? t : '']);
        const corpo = novos.map(([, t]) => t).filter(Boolean).join(' ');
        const linhas = linhasDe(daqui).slice(1).filter(l => l.length > 3), postas = linhas.filter(l => parecenca(l, corpo) > 0 && corpo.includes(l.slice(0, 20)));
        if (linhas.length && postas.length >= linhas.length * 0.6) for (const [id, t] of novos) textos[id] = t;
      }
    } catch { /* fica o encaixe por ordem */ }
  }
  // Conferência final de sentido (o conteúdo veio do plano): frase que afirma o que o material não diz sai.
  if (fontes) {
    etapa('Conferindo se cada frase vem do seu material…');
    try {
      const blocos = paginas.flatMap((p, k) => p.blocos.filter(b => textos[b.id] && papelDoBloco(b, p.blocos) !== 'título' && !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(b.texto)).map(b => `${b.id} (slide ${k + 1}): ${textos[b.id]}`));
      if (blocos.length) {
        const x = await chamar([
          { role: 'system', content: 'Você confere uma apresentação contra o material de origem. Liste os blocos que afirmam algo que o material NÃO diz: número, resultado, promessa, conclusão, comparação ou fato novo. Frase que só resume ou repete o material está certa. Responda só JSON: {"remover": ["<id>", ...]}.' },
          { role: 'user', content: `<material>\n${String(fontes).slice(0, 60000)}\n</material>\n\nPedido: ${pedido || ''}\n\nBlocos da apresentação:\n${blocos.join('\n')}` },
        ]);
        custo += x.custo || 0; economia += x.economia || 0;
        // Só os blocos enviados para conferência podem sair (nunca o título).
        const ids = new Set(blocos.map(l => l.split(' ')[0])), antes = { ...textos };
        for (const id of lerJson(x.texto)?.remover || []) if (ids.has(String(id))) textos[String(id)] = '';
        // Slide da apresentação da pessoa: bloco editado que a conferência tirou volta ao texto original equivalente
        // (a linha ou a parte "rótulo · descrição" mais parecida). QA em produção: a descrição enriquecida da
        // evidência foi tirada e o bloco ficou vazio.
        paginas.forEach(p => {
          if (!p.original) return;
          const partes = linhasDe(p.original).flatMap(l => [l, ...l.split(/\s+·\s+/)]);
          const presentes = new Set(p.blocos.map(b => textos[b.id]).filter(Boolean));
          for (const b of p.blocos) {
            if (!antes[b.id] || textos[b.id]) continue;
            // Parecida com o texto tirado ou com o texto do modelo naquele bloco (mesma família: o mesmo papel).
            const m = partes.reduce((a, l) => { const n = Math.max(parecenca(l, antes[b.id]), parecenca(l, b.texto)); return n > a.n && !presentes.has(l) ? { n, l } : a; }, { n: 0, l: null });
            if (m.l && m.n >= 0.4) { textos[b.id] = m.l; presentes.add(m.l); }
          }
        });
        // A conferência não esvazia um slide: se tirou tudo além do título, voltam as linhas do plano (já
        // conferidas pelas regras de números e palavras). QA em produção: o slide de evidências saiu só com o título.
        paginas.forEach(p => {
          const corpo = p.blocos.filter(b => antes[b.id] && papelDoBloco(b, p.blocos) !== 'título' && !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(b.texto));
          if (corpo.length && corpo.every(b => !textos[b.id])) for (const b of corpo) textos[b.id] = antes[b.id];
        });
      }
    } catch { /* fica o conteúdo do plano, já conferido pelas regras */ }
  }
  return { textos, faltando: [], custo, economia, fatos_faltando: [] };
}

// Em partes de até ~8 slides (respostas menores e conferíveis). Devolve { textos: {id: texto}, faltando: [ids], custo }.
// Com base (os textos da versão já gerada), o pedido é tratado como CORREÇÃO dessa versão: a IA recebe o texto atual
// de cada bloco e devolve só o que muda; o resto fica como estava. Sem base, adapta o modelo do zero.
export async function adaptarModelo({ paginas, contexto, pedido, chamar, porParte = 8, simultaneas = 3, etapa = () => {}, hoje = new Date(), base = null, conteudos = null, material: fontes = null }) {
  if (conteudos) return reestiloSemReescrever({ paginas, conteudos, chamar, etapa, fontes, pedido });
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
  // Mesma página do modelo usada em mais de um slide (versão em reestilo sendo corrigida): o texto que se repete é do
  // layout, não rodapé; cada slide fica com o seu. QA em produção: a correção copiou o slide "01 · Contexto" para dez slides.
  const paginaRepetida = paginas.some((p, i) => paginas.findIndex(q => (q.elementos && q.elementos === p.elementos) || (q.fundo && q.fundo === p.fundo)) !== i);
  // Número puro fica como está, a menos que esteja colado a um texto na mesma linha ("19" + "OUT", "45" + "DIAS
  // ÚTEIS"): aí é parte de uma data ou prazo e é adaptado junto.
  const vizinhoNaLinha = b => paginas.some(p => p.blocos.includes(b) && p.blocos.some(o => o !== b && Math.abs(o.y - b.y) < b.tam * 0.5 && o.x > b.x && o.x - (b.x + (b.largura || 0)) < b.tam * 1.5 && /\p{L}/u.test(o.texto)));
  // No reestilo, número solto do modelo é dado do modelo (célula de tabela, indicador): só a numeração "n / total" fica.
  const fica = b => conteudos ? /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(b.texto) : /^\s*[\d.·/\s-]{1,6}\s*$/.test(b.texto) && !vizinhoNaLinha(b);
  const slides = paginas.map((p, i) => ({ numero: i + 1, blocos: p.blocos.filter(b => {
    if (fica(b)) return false;
    // No reestilo a mesma página do modelo pode repetir: o texto repetido é layout, não rodapé, e cada slide tem o seu.
    if (!conteudos && !paginaRepetida && vezes.get(b.texto) >= 3) { if (primeiro.has(b.texto)) { repetidos.push([b.id, primeiro.get(b.texto)]); return false; } primeiro.set(b.texto, b.id); }
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
    // Reestilo: valor do conteúdo do slide (preço, percentual, quantidade) que não entrou em nenhum bloco volta numa
    // rodada de correção daquele slide (QA em produção: "Resultados e Planos" saiu sem os preços dos planos).
    const valores = c => [...new Set((String(c || '').match(/R\$\s?\d[\d.,]*|\d[\d.,]*\s?%|\d{1,3}(?:\.\d{3})+|\d{3,}/g) || []).map(v => v.replace(/\s+/g, ' ').trim()))];
    const textoDoSlide = p => p.blocos.map(b => textos[b.id] ?? '').join(' ').replace(/\s+/g, ' ');
    const faltas = paginas.map((p, k) => ({ k, faltam: valores(conteudos[k]).filter(v => !textoDoSlide(p).includes(v)) })).filter(x => x.faltam.length);
    if (faltas.length) {
      etapa('Conferindo se cada slide tem todo o seu conteúdo…');
      try {
        const alvo = slides.filter(sl => faltas.some(f => f.k + 1 === sl.numero));
        const x = await chamar(mensagensEdicao({ slides: alvo, textos, contexto: faltas.map(f => `Conteúdo do slide ${f.k + 1}:\n${conteudos[f.k]}`).join('\n\n'),
          pedido: `${faltas.map(f => `No slide ${f.k + 1}, inclua estes dados do conteúdo do slide, que ficaram de fora: ${f.faltam.join(', ')}.`).join(' ')} Use os blocos vazios ou resuma itens do mesmo slide para caber; não invente nada.` }));
        custo += x.custo || 0; economia += x.economia || 0;
        const j = lerJson(x.texto) || {};
        for (const sl of alvo) for (const b of sl.blocos) if (typeof j[b.id] === 'string') textos[b.id] = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim()));
      } catch { /* fica a versão anterior */ }
    }
    // Reestilo: número que não está no material nem no conteúdo do slide é inventado; o bloco sai (o título fica sem o
    // número). Slide que ficou sem texto recebe o conteúdo dele (título no maior bloco, resto no segundo), nunca o
    // texto do modelo.
    const material = `${fontes ?? contexto ?? ''}\n${pedido || ''}\n${conteudos.join('\n')}`;
    paginas.forEach((p, k) => {
      for (const b of p.blocos) {
        if (textos[b.id] === undefined && !fica(b)) textos[b.id] = '';   // texto do modelo nunca entra
        const t = textos[b.id];
        if (!t || fica(b)) continue;
        // Frase que não vem do material (slogan, "antes e depois" inventado) sai; o título pode ser reescrito.
        if (papelDoBloco(b, p.blocos) !== 'título' && fracaoForaDoMaterial(t, `${material}\n${conteudos[k] || ''}`) >= 0.4) { textos[b.id] = ''; continue; }
        const fora = numerosForaDoMaterial(t, material);
        if (!fora.length) continue;
        textos[b.id] = papelDoBloco(b, p.blocos) === 'título' ? fora.reduce((x, n) => x.replace(n, ''), t).replace(/\s{2,}/g, ' ').trim() : '';
      }
      // Texto repetido no mesmo slide ("Escopo" | "Escopo"): fica a primeira ocorrência.
      const vistos = new Set();
      for (const b of p.blocos) { const t = String(textos[b.id] || '').trim().toLowerCase(); if (!t || fica(b)) continue; if (vistos.has(t)) textos[b.id] = ''; else vistos.add(t); }
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
  // Reestilo: conferência final de sentido. A IA aponta frases que afirmam algo que o material não diz (QA em produção:
  // "economia de água e energia pagam o investimento inicial"); elas saem. O título fica.
  if (conteudos && fontes) {
    etapa('Conferindo se cada frase vem do seu material…');
    try {
      const blocos = paginas.flatMap((p, k) => p.blocos.filter(b => textos[b.id] && !fica(b) && papelDoBloco(b, p.blocos) !== 'título').map(b => `${b.id} (slide ${k + 1}): ${textos[b.id]}`));
      if (blocos.length) {
        const x = await chamar([
          { role: 'system', content: 'Você confere uma apresentação contra o material de origem. Liste os blocos que afirmam algo que o material NÃO diz: número, resultado, promessa, conclusão, comparação ou fato novo. Frase que só resume ou repete o material está certa. Rótulos curtos e títulos de seção estão certos. Responda só JSON: {"remover": ["<id>", ...]}.' },
          { role: 'user', content: `<material>\n${String(fontes).slice(0, 60000)}\n</material>\n\nBlocos da apresentação:\n${blocos.join('\n')}` },
        ]);
        custo += x.custo || 0; economia += x.economia || 0;
        const ids = new Set(paginas.flatMap(p => p.blocos.map(b => b.id)));
        for (const id of lerJson(x.texto)?.remover || []) if (ids.has(String(id))) textos[String(id)] = '';
      }
    } catch { /* fica a versão conferida pelas regras */ }
  }
  return { textos, faltando, custo, economia, fatos_faltando: faltam.map(f => f.texto) };
}
