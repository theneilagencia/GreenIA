// Composição dos blocos: cada função recebe o conteúdo do bloco e a largura disponível e devolve a altura e as
// primitivas de desenho (retângulo, texto, linha, caminho, círculo, imagem), com coordenadas relativas ao canto
// do bloco. Tudo é medido com as métricas reais da fonte: nenhuma posição depende de sorte. Texto nunca é
// cortado aqui: se não couber, a altura cresce e a conferência visual vê o transbordo.
import { carregarFonte, medir, quebrarLinhas, textoSeguro } from './fontes.js';
import { ICONES, iconePara } from './assets.js';
import { valorNumerico } from './conteudo.js';

// ---- Primitivas -----------------------------------------------------------------------------------------------
export const mover = (prims, dx, dy) => prims.map(p => {
  switch (p.t) {
    case 'line': return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
    case 'circle': return { ...p, cx: p.cx + dx, cy: p.cy + dy };
    case 'path': return { ...p, dx: (p.dx || 0) + dx, dy: (p.dy || 0) + dy };
    default: return { ...p, x: p.x + dx, y: p.y + dy };
  }
});

// Caixa de texto: quebra na largura e devolve a primitiva com as linhas. `encolher`: reduz o tamanho (até o mínimo)
// para caber numa linha só ou em `maxLinhas` (títulos e números grandes); o texto em si nunca muda.
export function texto(str, { familia = 'sans', peso = 400, tam, cor, largura, lh = 1.3, alin = 'start', papel = 'corpo', maxLinhas = 0, minimo = 0 }) {
  const fonte = carregarFonte(familia, peso);
  const t = textoSeguro(str, fonte);
  let tamanho = tam, linhas = quebrarLinhas(t, fonte, tamanho, largura);
  if (maxLinhas) while ((linhas.length > maxLinhas || linhas.partidas || linhas.largas) && tamanho * 0.93 >= minimo) { tamanho *= 0.93; linhas = quebrarLinhas(t, fonte, tamanho, largura); }
  const larg = Math.max(0, ...linhas.map(l => medir(l, fonte, tamanho)));
  const lhPx = tamanho * lh;
  return { h: linhas.length * lhPx, w: larg, linhas, tam: tamanho, prim: { t: 'text', x: 0, y: 0, w: largura, linhas: [...linhas], familia, peso, tam: tamanho, lh: lhPx, cor, alin, papel, texto: t, ...(linhas.partidas ? { partidas: linhas.partidas } : {}) } };
}

// Palavras como a quebra de linha as vê: moeda fica junto do número ("R$ 48.000" não se separa).
const PALAVRAS = /(?<!R\$|US\$|€|\$)\s+/;
const caixa = (prim, x = 0, y = 0) => ({ ...prim, x, y });
function icone(nome, x, y, tam, cor, espessura = 1.8) {
  const d = ICONES[nome];
  return d ? { t: 'path', d, dx: x, dy: y, escala: tam / 24, fill: 'none', stroke: cor, sw: espessura, papel: 'icone' } : null;
}

// ---- Blocos de texto ------------------------------------------------------------------------------------------
export function blocoParagrafo(str, largura, C, { papel = 'corpo', tam = C.tip.corpo, cor = C.T.texto, peso = 400, familia = C.T.fonteCorpo, lh = 1.42 } = {}) {
  const t = texto(str, { familia, peso, tam, cor, largura, lh, papel });
  return { h: t.h, prims: [t.prim] };
}

export function blocoTituloBloco(str, largura, C, { tam = C.tip.h2 } = {}) {
  const t = texto(str, { familia: C.T.fonteTitulos, peso: 700, tam, cor: C.T.texto, largura, lh: 1.2, papel: 'h2' });
  return { h: t.h, prims: [t.prim] };
}

export function blocoLista(it, largura, C, { checklist = false, tam = C.tip.corpo } = {}) {
  const prims = [];
  let y = 0;
  const gap = tam * 0.5, recuo = tam * (it.ordenada && !checklist ? 2.1 : 1.45);
  it.itens.forEach((x, k) => {
    const nivel = x.nivel === 2 ? 1 : 0, dx = nivel * recuo;
    const t = texto(x.texto, { familia: C.T.fonteCorpo, peso: 400, tam, cor: C.T.texto, largura: largura - recuo - dx, lh: 1.38, papel: 'corpo' });
    const meio = y + t.prim.lh / 2;
    if (checklist) {
      const s = tam * 0.98, by = meio - s / 2;
      if (x.marcado) {
        prims.push({ t: 'rect', x: dx, y: by, w: s, h: s, r: 3, fill: C.T.primaria, papel: 'marcador' });
        prims.push({ t: 'path', d: 'M5 12.5l4.2 4.2L19 7', dx, dy: by, escala: s / 24, fill: 'none', stroke: C.T.sobrePrimaria, sw: 2.6, papel: 'marcador' });
      } else prims.push({ t: 'rect', x: dx + 0.75, y: by + 0.75, w: s - 1.5, h: s - 1.5, r: 3, fill: C.T.fundo, stroke: C.T.primaria, sw: 1.5, papel: 'marcador' });
    } else if (it.ordenada && !nivel) {
      const r = tam * 0.72;
      prims.push({ t: 'circle', cx: dx + r, cy: meio, r, fill: C.T.primaria, papel: 'marcador' });
      const n = texto(String(k + 1 - it.itens.slice(0, k).filter(i => i.nivel === 2).length), { familia: C.T.fonteCorpo, peso: 700, tam: tam * 0.78, cor: C.T.sobrePrimaria, largura: r * 2, lh: 1, alin: 'middle', papel: 'marcador' });
      prims.push(caixa(n.prim, dx, meio - n.prim.lh / 2));
    } else {
      const r = nivel ? tam * 0.13 : tam * 0.2;
      prims.push({ t: 'circle', cx: dx + tam * 0.35, cy: meio, r, fill: nivel ? C.T.suave : C.T.primaria, papel: 'marcador' });
    }
    prims.push(caixa(t.prim, dx + recuo, y));
    y += t.h + (k < it.itens.length - 1 ? gap : 0);
  });
  return { h: y, prims };
}

export function blocoCitacao(str, largura, C) {
  const t = texto(str, { familia: C.T.fonteTitulos, peso: 600, tam: C.tip.h3 * 1.08, cor: C.T.texto, largura: largura - C.tip.corpo * 1.6, lh: 1.35, papel: 'destaque' });
  return { h: t.h, prims: [{ t: 'rect', x: 0, y: 0, w: Math.max(3, C.tip.corpo * 0.28), h: t.h, fill: C.T.destaque, papel: 'decoracao' }, caixa(t.prim, C.tip.corpo * 1.6, 0)] };
}

export function blocoCta(str, largura, C, { centro = false, tam = C.tip.corpo * 1.1 } = {}) {
  const padX = tam * 1.3, padY = tam * 0.75;
  const t = texto(str, { familia: C.T.fonteCorpo, peso: 700, tam, cor: C.T.sobrePrimaria, largura: largura - padX * 2, lh: 1.25, alin: 'middle', papel: 'cta' });
  const w = Math.min(largura, t.w + padX * 2), h = t.h + padY * 2, x = centro ? (largura - w) / 2 : 0;
  return { h, prims: [{ t: 'rect', x, y: 0, w, h, r: Math.min(h / 2, C.T.cantos * 3 + 6), fill: C.T.primaria, papel: 'cta' }, { ...t.prim, x: x + padX, y: padY, w: w - padX * 2 }] };
}

export function blocoNota(str, largura, C) {
  const t = texto(str, { familia: C.T.fonteCorpo, peso: 400, tam: C.tip.legenda, cor: C.T.suave, largura, lh: 1.35, papel: 'legenda' });
  return { h: t.h, prims: [t.prim] };
}

// ---- Indicadores (KPIs) ---------------------------------------------------------------------------------------
export function blocoIndicadores(it, largura, C) {
  const n = it.itens.length, gap = C.tip.corpo * 0.9;
  const minW = C.tip.corpo * 8.5;
  const porLinha = Math.max(1, Math.min(n, Math.floor((largura + gap) / (minW + gap)), n === 4 ? 4 : 3 + (largura > C.tip.corpo * 50 ? 1 : 0)));
  const w = (largura - gap * (porLinha - 1)) / porLinha, pad = C.tip.corpo * 0.95;
  const prims = [];
  let y = 0;
  for (let i = 0; i < n; i += porLinha) {
    const linha = it.itens.slice(i, i + porLinha);
    const cards = linha.map(k => {
      const v = k.valor ? texto(k.valor, { familia: C.T.fonteTitulos, peso: 700, tam: C.tip.kpi, cor: C.T.primariaTexto, largura: w - pad * 2, lh: 1.1, papel: 'kpi', maxLinhas: 1, minimo: C.tip.h2 }) : null;
      const r = texto(k.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam: Math.max(C.tip.minimo, C.tip.corpo * 0.95), cor: C.T.texto, largura: w - pad * 2, lh: 1.3, papel: 'kpi_rotulo' });
      const d = k.detalhe ? texto(k.detalhe, { familia: C.T.fonteCorpo, peso: 400, tam: C.tip.legenda, cor: C.T.suave, largura: w - pad * 2, lh: 1.3, papel: 'legenda' }) : null;
      return { v, r, d, h: pad * 2 + (v ? v.h + C.tip.corpo * 0.35 : 0) + r.h + (d ? d.h + C.tip.corpo * 0.25 : 0) };
    });
    const h = Math.max(...cards.map(c => c.h));
    cards.forEach((c, k) => {
      const x = k * (w + gap);
      prims.push({ t: 'rect', x, y, w, h, r: C.T.cantos + 2, fill: C.dentroPainel ? C.T.fundo : C.T.superficie, papel: 'cartao' });
      prims.push({ t: 'rect', x, y, w: Math.max(3, C.tip.corpo * 0.25), h, r: 0, fill: C.T.primaria, papel: 'decoracao' });
      let yy = y + pad;
      if (c.v) { prims.push(caixa(c.v.prim, x + pad, yy)); yy += c.v.h + C.tip.corpo * 0.35; }
      prims.push(caixa(c.r.prim, x + pad, yy)); yy += c.r.h + C.tip.corpo * 0.25;
      if (c.d) prims.push(caixa(c.d.prim, x + pad, yy));
    });
    y += h + (i + porLinha < n ? gap : 0);
  }
  return { h: y, prims };
}

// ---- Cartões ("Título: explicação") ---------------------------------------------------------------------------
export function blocoCartoes(it, largura, C) {
  const pares = it.itens.map(x => { const m = /^([^:]{2,48}):\s+(.+)$/.exec(x.texto); return m ? { t: m[1], d: m[2] } : { t: '', d: x.texto }; });
  const n = pares.length, gap = C.tip.corpo * 0.9;
  const porLinha = Math.max(1, Math.min(n === 4 ? 2 : 3, Math.floor((largura + gap) / (C.tip.corpo * 13 + gap)), n));
  const w = (largura - gap * (porLinha - 1)) / porLinha, pad = C.tip.corpo * 0.95;
  const prims = [];
  let y = 0;
  for (let i = 0; i < n; i += porLinha) {
    const linha = pares.slice(i, i + porLinha);
    const cards = linha.map(p => {
      const ic = iconePara(p.t);
      const tt = p.t ? texto(p.t, { familia: C.T.fonteTitulos, peso: 700, tam: C.tip.h3, cor: C.T.texto, largura: w - pad * 2 - (ic ? C.tip.h3 * 1.5 : 0), lh: 1.22, papel: 'h3' }) : null;
      const dd = texto(p.d, { familia: C.T.fonteCorpo, peso: 400, tam: C.tip.corpo, cor: C.T.texto, largura: w - pad * 2, lh: 1.4, papel: 'corpo' });
      return { ic, tt, dd, h: pad * 2 + (tt ? tt.h + C.tip.corpo * 0.45 : 0) + dd.h };
    });
    const h = Math.max(...cards.map(c => c.h));
    cards.forEach((c, k) => {
      const x = k * (w + gap);
      prims.push({ t: 'rect', x, y, w, h, r: C.T.cantos + 2, fill: C.T.fundo, stroke: C.T.linha, sw: 1, papel: 'cartao' });
      prims.push({ t: 'rect', x, y, w, h: Math.max(3, C.tip.corpo * 0.22), r: 0, fill: C.T.primaria, papel: 'decoracao' });
      let yy = y + pad;
      if (c.tt) {
        if (c.ic) { const p = icone(c.ic, x + pad, yy + (c.tt.prim.lh - C.tip.h3 * 1.1) / 2, C.tip.h3 * 1.1, C.T.primariaTexto); if (p) prims.push(p); }
        prims.push(caixa(c.tt.prim, x + pad + (c.ic ? C.tip.h3 * 1.5 : 0), yy)); yy += c.tt.h + C.tip.corpo * 0.45;
      }
      prims.push(caixa(c.dd.prim, x + pad, yy));
    });
    y += h + (i + porLinha < n ? gap : 0);
  }
  return { h: y, prims };
}

// ---- Tabela ---------------------------------------------------------------------------------------------------
// Larguras pelas medidas reais do conteúdo; números alinhados à direita; cabeçalho na cor principal; linhas
// zebradas. Nenhuma célula é abreviada: o texto quebra dentro da célula.
export function blocoTabela(it, largura, C, { tam = C.tip.tabela, linhas = null, repetirCabecalho = true } = {}) {
  const cab = it.cabecalho, corpo = linhas || it.linhas, nc = cab.length;
  const fB = carregarFonte(C.T.fonteCorpo, 700), fR = carregarFonte(C.T.fonteCorpo, 400);
  const pad = tam * 0.65;
  const numerica = cab.map((_, k) => k > 0 && it.linhas.length > 0 && it.linhas.filter(l => valorNumerico(l[k]) !== null).length >= Math.ceil(it.linhas.length * 0.8));
  // Célula de marcar ("[ ] Conforme [ ] Não conforme"): uma caixa desenhada por opção, nunca colchetes no texto.
  const opcoes = c => (/^\s*(\[[ xX]?\]\s*[^[\]]+?\s*){1,4}$/.test(String(c || '')) ? [...String(c).matchAll(/\[([ xX]?)\]\s*([^[\]]+)/g)].map(m => ({ marcado: /x/i.test(m[1]), texto: m[2].trim() })) : null);
  const lado = tam * 0.85, gap = tam * 0.45;
  const medirCel = (c, f, palavra) => { const o = opcoes(c); if (!o) return palavra ? Math.max(...String(c || '').split(PALAVRAS).map(w => medir(textoSeguro(w, f), f, tam))) : medir(textoSeguro(c || '', f), f, tam);
    return lado + gap + Math.max(...o.map(x => palavra ? Math.max(...x.texto.split(PALAVRAS).map(w => medir(textoSeguro(w, f), f, tam))) : medir(textoSeguro(x.texto, f), f, tam))); };
  const natural = cab.map((h, k) => Math.max(medir(textoSeguro(h, fB), fB, tam), ...it.linhas.map(l => medirCel(l[k], fR, false))) + pad * 2);
  const minimo = cab.map((h, k) => Math.max(medirCel(h, fB, true), ...it.linhas.map(l => medirCel(l[k], fB, true))) + pad * 2);
  let larg;
  const soma = natural.reduce((a, b) => a + b, 0);
  if (soma <= largura) larg = natural.map(w => w + (largura - soma) / nc);
  else {
    const base = minimo.map(m => Math.min(m, largura / nc * 1.6));
    const resto = Math.max(0, largura - base.reduce((a, b) => a + b, 0));
    const extra = natural.map((w, k) => Math.max(0, w - base[k]));
    const se = extra.reduce((a, b) => a + b, 0) || 1;
    larg = base.map((b, k) => b + resto * extra[k] / se);
    const s2 = larg.reduce((a, b) => a + b, 0);
    larg = larg.map(w => w * largura / s2);
  }
  const prims = [];
  const celula = (c, k, peso, cor, papel) => {
    const ops = papel !== 'cabecalho' && opcoes(c);
    const base = { familia: C.T.fonteCorpo, peso: k === 0 && papel !== 'cabecalho' ? 600 : peso, tam, cor, lh: 1.3, papel: papel === 'cabecalho' ? 'tabela_cabecalho' : 'tabela' };
    if (!ops) { const t = texto(c || '', { ...base, largura: larg[k] - pad * 2, alin: numerica[k] ? 'end' : 'start' }); return { h: t.h, prims: [t.prim] }; }
    const ps = []; let yy = 0;
    for (const o of ops) {
      const t = texto(o.texto, { ...base, largura: larg[k] - pad * 2 - lado - gap });
      ps.push({ t: 'rect', x: 0, y: yy + (tam * 1.3 - lado) / 2, w: lado, h: lado, r: 2, fill: o.marcado ? C.T.primaria : '#FFFFFF', stroke: C.T.texto, sw: 1, papel: 'caixa_marcar' });
      ps.push(caixa(t.prim, lado + gap, yy));
      yy += t.h + tam * 0.25;
    }
    return { h: yy - tam * 0.25, prims: ps };
  };
  const linhaH = (cells, peso, papel) => Math.max(...cells.map((c, k) => celula(c, k, peso, C.T.texto, papel).h)) + pad * 1.5;
  let y = 0;
  const desenharLinha = (cells, peso, fundo, cor, papel) => {
    const h = linhaH(cells, peso, papel);
    if (fundo) prims.push({ t: 'rect', x: 0, y, w: largura, h, fill: fundo, papel: papel === 'cabecalho' ? 'cabecalho' : 'zebra' });
    let x = 0;
    cells.forEach((c, k) => {
      for (const p of celula(c, k, peso, cor, papel).prims) prims.push({ ...p, x: (p.x || 0) + x + pad, y: (p.y || 0) + y + pad * 0.75 });
      x += larg[k];
    });
    y += h;
    return h;
  };
  if (repetirCabecalho) desenharLinha(cab, 700, C.T.primaria, C.T.sobrePrimaria, 'cabecalho');
  corpo.forEach((l, i) => {
    desenharLinha(cab.map((_, k) => l[k] ?? ''), 400, i % 2 ? C.T.superficie : null, C.T.texto, 'linha');
    prims.push({ t: 'line', x1: 0, y1: y, x2: largura, y2: y, cor: C.T.linha, sw: 1, papel: 'grade' });
  });
  // Altura de cada linha (para partir a tabela entre páginas sem cortar uma linha ao meio).
  const alturas = [linhaH(cab, 700, 'cabecalho'), ...corpo.map(l => linhaH(cab.map((_, k) => l[k] ?? ''), 400))];
  return { h: y, prims, alturas, larguras: larg };
}

// ---- Linha do tempo -------------------------------------------------------------------------------------------
const separarData = s => { const m = /^(.{1,28}?)\s*(?::|–|—|-)\s+(.+)$/.exec(s); return m ? { d: m[1], t: m[2] } : { d: '', t: s }; };
export function blocoLinhaTempo(it, largura, C) {
  const itens = it.itens.map(x => separarData(x.texto)), n = itens.length;
  const prims = [];
  const horizontal = !C.tip._colunaTempo && n <= 6 && largura >= C.tip.corpo * 40;
  if (horizontal) {
    const slot = largura / n, r = C.tip.corpo * 0.42, yLinha = C.tip.corpo * 0.6 + r;
    prims.push({ t: 'line', x1: slot / 2, y1: yLinha, x2: largura - slot / 2, y2: yLinha, cor: C.T.linha, sw: Math.max(2, C.tip.corpo * 0.18), papel: 'decoracao' });
    let h = 0;
    itens.forEach((x, k) => {
      const cx = slot * k + slot / 2;
      prims.push({ t: 'circle', cx, cy: yLinha, r, fill: C.T.primaria, papel: 'marcador' });
      let y = yLinha + r + C.tip.corpo * 0.7;
      if (x.d) { const d = texto(x.d, { familia: C.T.fonteTitulos, peso: 700, tam: C.tip.corpo, cor: C.T.primariaTexto, largura: slot - C.tip.corpo, lh: 1.25, alin: 'middle', papel: 'h3' }); prims.push(caixa(d.prim, cx - (slot - C.tip.corpo) / 2, y)); y += d.h + C.tip.corpo * 0.25; }
      const t = texto(x.t, { familia: C.T.fonteCorpo, peso: 400, tam: Math.max(C.tip.minimo, C.tip.corpo * 0.95), cor: C.T.texto, largura: slot - C.tip.corpo, lh: 1.35, alin: 'middle', papel: 'corpo' });
      prims.push(caixa(t.prim, cx - (slot - C.tip.corpo) / 2, y)); y += t.h;
      h = Math.max(h, y);
    });
    return { h, prims };
  }
  // Vertical: com largura sobrando (muitos marcos num painel largo), a sequência corre em colunas, em ordem
  // (de cima para baixo, depois a coluna seguinte), em vez de um fio estreito à esquerda com o resto vazio.
  const nc = C.tip._colunaTempo ? 1 : Math.min(Math.ceil(n / 3), Math.max(1, Math.floor(largura / (C.tip.corpo * 22))));
  if (nc > 1) {
    const gap = C.tip.corpo * 1.5, wc = (largura - gap * (nc - 1)) / nc, porCol = Math.ceil(n / nc);
    let h = 0;
    for (let k = 0; k < nc; k++) {
      const parte = it.itens.slice(k * porCol, (k + 1) * porCol);
      if (!parte.length) continue;
      const v = blocoLinhaTempo({ ...it, itens: parte }, wc, { ...C, tip: { ...C.tip, _colunaTempo: true } });
      prims.push(...v.prims.map(q => mover1(q, k * (wc + gap), 0)));
      h = Math.max(h, v.h);
    }
    return { h, prims };
  }
  return verticalTempo(itens, largura, C, prims);
}
const mover1 = (q, dx, dy) => mover([q], dx, dy)[0];
function verticalTempo(itens, largura, C, prims) {
  const n = itens.length;
  let y = 0;
  const r = C.tip.corpo * 0.38, xL = r + 1, recuo = r * 2 + C.tip.corpo * 0.9;
  const pontos = [];
  itens.forEach((x, k) => {
    const d = x.d ? texto(x.d, { familia: C.T.fonteTitulos, peso: 700, tam: C.tip.corpo, cor: C.T.primariaTexto, largura: largura - recuo, lh: 1.25, papel: 'h3' }) : null;
    const t = texto(x.t, { familia: C.T.fonteCorpo, peso: 400, tam: C.tip.corpo, cor: C.T.texto, largura: largura - recuo, lh: 1.38, papel: 'corpo' });
    pontos.push(y + (d ? d.prim.lh : t.prim.lh) / 2);
    if (d) { prims.push(caixa(d.prim, recuo, y)); y += d.h; }
    prims.push(caixa(t.prim, recuo, y)); y += t.h + (k < n - 1 ? C.tip.corpo * 0.8 : 0);
  });
  prims.unshift({ t: 'line', x1: xL, y1: pontos[0], x2: xL, y2: pontos.at(-1), cor: C.T.linha, sw: Math.max(2, C.tip.corpo * 0.16), papel: 'decoracao' });
  pontos.forEach(cy => prims.push({ t: 'circle', cx: xL, cy, r, fill: C.T.primaria, papel: 'marcador' }));
  return { h: y, prims };
}

// ---- Imagem ou espaço reservado -------------------------------------------------------------------------------
// Sem o asset (logo, foto real, imagem que não pôde ser gerada): espaço reservado explícito, nunca uma imagem
// que pareça real.
export function blocoImagem(asset, largura, altura, C, { proposito = '' } = {}) {
  if (asset?.dataUrl && asset.w && asset.h) {
    return { h: altura, prims: [{ t: 'image', x: 0, y: 0, w: largura, h: altura, href: asset.dataUrl, nw: asset.w, nh: asset.h, ajuste: 'cover', r: C.T.cantos, papel: asset.tipo === 'logo' ? 'logo' : 'imagem', assetId: asset.id || null }] };
  }
  const t = texto(`Espaço para imagem${proposito ? `: ${proposito}` : ''} (não fornecida)`, { familia: C.T.fonteCorpo, peso: 600, tam: C.tip.legenda, cor: C.T.suave, largura: largura * 0.8, lh: 1.3, alin: 'middle', papel: 'placeholder' });
  return { h: altura, placeholder: true, prims: [{ t: 'rect', x: 0.5, y: 0.5, w: largura - 1, h: altura - 1, r: C.T.cantos, fill: C.T.superficie, stroke: C.T.suave, sw: 1.2, dash: '6 5', papel: 'placeholder' },
    caixa(t.prim, largura * 0.1, (altura - t.h) / 2)] };
}

export { icone, caixa };
