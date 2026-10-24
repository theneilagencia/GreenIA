// Gráficos a partir de dados estruturados (tabela do conteúdo). O valor escrito na peça é sempre o texto da célula
// (o mesmo número do conteúdo, com a mesma formatação); o valor numérico só posiciona barras, pontos e fatias.
// Os números do eixo são escala (papel "eixo") e não contam como dado na conferência de fidelidade.
import { texto, caixa } from './blocos.js';
import { valorNumerico } from './conteudo.js';

const passoBonito = bruto => { const p = 10 ** Math.floor(Math.log10(bruto || 1)), r = bruto / p; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p; };
function escala(min, max, alvo = 4) {
  if (min === max) { max = max === 0 ? 1 : max * 1.2; min = Math.min(0, min); }
  const passo = passoBonito((max - min) / alvo);
  return { min: Math.floor(min / passo) * passo, max: Math.ceil(max / passo) * passo, passo };
}
// Rótulo do eixo com as casas decimais que o passo da escala pede (1,25 mi / 1,5 mi, nunca dois "1,5 mi").
const fmtEixo = (v, idioma, passo = null) => {
  const a = Math.max(Math.abs(v), Math.abs(passo || 0)), en = idioma === 'en';
  const casas = d => (passo ? Math.max(0, Math.min(3, Math.ceil(-Math.log10(passo / d) - 1e-9))) : 1);
  const n = (x, d) => x.toLocaleString(en ? 'en-US' : 'pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  if (a >= 1e9) return `${n(v / 1e9, casas(1e9))}${en ? 'B' : ' bi'}`;
  if (a >= 1e6) return `${n(v / 1e6, casas(1e6))}${en ? 'M' : ' mi'}`;
  if (a >= 1e4) return `${n(v / 1e3, casas(1e3))}${en ? 'k' : ' mil'}`;
  return n(v, casas(1));
};

// Desenha o gráfico na área (largura x altura). Devolve { h, prims }.
export function blocoGrafico(it, spec, largura, altura, C) {
  const series = spec.series.filter(k => k < it.cabecalho.length);
  const linhas = it.linhas.filter(l => series.some(k => valorNumerico(l[k]) !== null));
  const dados = linhas.map(l => ({ rotulo: l[spec.rotulos || 0], valores: series.map(k => ({ v: valorNumerico(l[k]), txt: l[k] })) }));
  const cores = C.T.serie;
  const prims = [];
  const tam = C.tip.legenda;
  const legendaH = series.length > 1 || spec.tipo !== 'pizza' ? tam * 2.2 : 0;
  // Uma série só: o nome dela (o que está sendo medido) em cima, como legenda.
  if (series.length === 1 && spec.tipo !== 'pizza') {
    const t = texto(it.cabecalho[series[0]], { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.suave, largura, lh: 1.2, papel: 'legenda' });
    prims.push(caixa(t.prim, 0, 0));
  }
  if (spec.tipo === 'pizza') {
    const t = texto(it.cabecalho[series[0]], { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.suave, largura, lh: 1.2, papel: 'legenda' });
    prims.push(caixa(t.prim, 0, 0));
  }
  if (series.length > 1) {
    let x = 0;
    series.forEach((k, i) => {
      prims.push({ t: 'rect', x, y: tam * 0.3, w: tam, h: tam, r: 2, fill: cores[i % cores.length], papel: 'legenda' });
      const t = texto(it.cabecalho[k], { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: largura / series.length - tam * 2, lh: 1.2, papel: 'legenda' });
      prims.push(caixa(t.prim, x + tam * 1.5, 0));
      x += Math.min(largura / series.length, t.w + tam * 4);
    });
  }
  const area = { x: 0, y: legendaH || (spec.tipo === 'pizza' ? tam * 2.2 : 0), w: largura, h: altura - (legendaH || (spec.tipo === 'pizza' ? tam * 2.2 : 0)) };
  const f = { pizza, progresso, barras_h: barrasH, linhas: linhasG }[spec.tipo] || barras;
  prims.push(...f(dados, area, C, cores, it, series));
  return { h: altura, prims };
}

function barras(dados, a, C, cores, it, series) {
  const prims = [], tam = C.tip.legenda;
  const todos = dados.flatMap(d => d.valores.map(v => v.v)).filter(v => v !== null);
  const e = escala(Math.min(0, ...todos), Math.max(0, ...todos));
  const rotY = [];
  for (let v = e.min; v <= e.max + e.passo / 2; v += e.passo) rotY.push(v);
  const eixoW = Math.max(...rotY.map(v => texto(fmtEixo(v, C.idioma, e.passo), { tam, largura: 400, cor: C.T.suave }).w)) + tam * 0.8;
  // Rótulos das categorias: até 3 linhas na largura da categoria.
  const catW = (a.w - eixoW) / dados.length;
  const rots = dados.map(d => texto(d.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: catW - tam * 0.4, lh: 1.2, alin: 'middle', papel: 'rotulo_grafico', maxLinhas: 3, minimo: C.tip.minimo }));
  const baseH = Math.max(...rots.map(r => r.h)) + tam * 0.6;
  const topo = a.y + tam * 1.6, plotH = a.h - baseH - tam * 1.6, plotX = a.x + eixoW;
  const y = v => topo + plotH * (1 - (v - e.min) / (e.max - e.min));
  for (const v of rotY) {
    prims.push({ t: 'line', x1: plotX, y1: y(v), x2: a.x + a.w, y2: y(v), cor: v === 0 ? C.T.suave : C.T.linha, sw: v === 0 ? 1.2 : 0.8, papel: 'grade' });
    const t = texto(fmtEixo(v, C.idioma, e.passo), { familia: C.T.fonteCorpo, tam, cor: C.T.suave, largura: eixoW - tam * 0.6, lh: 1, alin: 'end', papel: 'eixo' });
    prims.push(caixa(t.prim, a.x, y(v) - t.prim.lh / 2));
  }
  const ns = series.length, grupoW = catW * 0.72, barW = grupoW / ns;
  dados.forEach((d, i) => {
    const x0 = plotX + catW * i + (catW - grupoW) / 2;
    d.valores.forEach((val, s) => {
      if (val.v === null) return;
      const ya = y(Math.max(0, val.v)), yb = y(Math.min(0, val.v));
      prims.push({ t: 'rect', x: x0 + barW * s + barW * 0.08, y: ya, w: barW * 0.84, h: Math.max(1, yb - ya), r: Math.min(3, barW * 0.15), fill: cores[s % cores.length], papel: 'barra' });
      const lt = texto(val.txt, { familia: C.T.fonteCorpo, peso: 700, tam: tam * (ns > 2 ? 0.85 : 1), cor: C.T.texto, largura: Math.max(barW, tam * 4), lh: 1.1, alin: 'middle', papel: 'valor', maxLinhas: 1, minimo: C.tip.minimo });
      prims.push(caixa(lt.prim, x0 + barW * s + barW / 2 - Math.max(barW, tam * 4) / 2, (val.v >= 0 ? ya - lt.h - tam * 0.2 : yb + tam * 0.2)));
    });
    prims.push(caixa(rots[i].prim, plotX + catW * i + tam * 0.2, topo + plotH + tam * 0.5));
  });
  return prims;
}

function barrasH(dados, a, C, cores, it, series) {
  const prims = [], tam = C.tip.legenda;
  const rotW = Math.min(a.w * 0.36, Math.max(...dados.map(d => texto(d.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, largura: 2000 }).w)) + tam);
  const todos = dados.flatMap(d => d.valores.map(v => v.v)).filter(v => v !== null);
  const max = Math.max(...todos.map(Math.abs), 1e-9), temNeg = todos.some(v => v < 0);
  const valW = Math.max(...dados.flatMap(d => d.valores.map(v => texto(v.txt, { familia: C.T.fonteCorpo, peso: 700, tam, largura: 2000 }).w))) + tam * 0.8;
  const plotX = a.x + rotW, plotW = a.w - rotW - valW;
  const zero = temNeg ? plotX + plotW / 2 : plotX, escalaW = temNeg ? plotW / 2 : plotW;
  const ns = series.length, linhaH = a.h / dados.length, barH = Math.min(linhaH * 0.7 / ns, tam * 2.2);
  dados.forEach((d, i) => {
    const y0 = a.y + linhaH * i + (linhaH - barH * ns) / 2;
    const r = texto(d.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: rotW - tam * 0.8, lh: 1.2, alin: 'end', papel: 'rotulo_grafico', maxLinhas: 2, minimo: C.tip.minimo });
    prims.push(caixa(r.prim, a.x, y0 + (barH * ns - r.h) / 2));
    d.valores.forEach((val, s) => {
      if (val.v === null) return;
      const w = Math.max(1, Math.abs(val.v) / max * escalaW), x = val.v >= 0 ? zero : zero - w;
      prims.push({ t: 'rect', x, y: y0 + barH * s, w, h: barH * 0.88, r: Math.min(3, barH * 0.2), fill: cores[s % cores.length], papel: 'barra' });
      const lt = texto(val.txt, { familia: C.T.fonteCorpo, peso: 700, tam, cor: C.T.texto, largura: valW, lh: 1.1, papel: 'valor' });
      prims.push(caixa(lt.prim, (val.v >= 0 ? x + w : zero) + tam * 0.4, y0 + barH * s + (barH * 0.88 - lt.h) / 2));
    });
  });
  prims.push({ t: 'line', x1: zero, y1: a.y, x2: zero, y2: a.y + a.h, cor: C.T.suave, sw: 1, papel: 'grade' });
  return prims;
}

function linhasG(dados, a, C, cores, it, series) {
  const prims = [], tam = C.tip.legenda;
  const todos = dados.flatMap(d => d.valores.map(v => v.v)).filter(v => v !== null);
  const e = escala(Math.min(...todos) >= 0 && Math.min(...todos) < Math.max(...todos) * 0.5 ? 0 : Math.min(...todos), Math.max(...todos));
  const rotY = []; for (let v = e.min; v <= e.max + e.passo / 2; v += e.passo) rotY.push(v);
  const eixoW = Math.max(...rotY.map(v => texto(fmtEixo(v, C.idioma, e.passo), { tam, largura: 400 }).w)) + tam * 0.8;
  // Pontos com folga nas pontas (o rótulo do primeiro e do último ponto cabe na área).
  const n = dados.length, slotW = (a.w - eixoW - tam) / n, passoX = n > 1 ? slotW : 0;
  const rotW = Math.max(tam * 3, slotW - tam * 0.4);
  const rots = dados.map(d => texto(d.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: rotW, lh: 1.2, alin: 'middle', papel: 'rotulo_grafico', maxLinhas: 2, minimo: C.tip.minimo }));
  const baseH = Math.max(...rots.map(r => r.h)) + tam * 0.6;
  const topo = a.y + tam * 1.6, plotH = a.h - baseH - tam * 1.6, plotX = a.x + eixoW + tam + slotW / 2 - tam / 2;
  const dentroX = (x, w) => Math.max(a.x + eixoW, Math.min(a.x + a.w - w, x));
  const y = v => topo + plotH * (1 - (v - e.min) / (e.max - e.min));
  for (const v of rotY) {
    prims.push({ t: 'line', x1: a.x + eixoW + tam * 0.4, y1: y(v), x2: a.x + a.w, y2: y(v), cor: C.T.linha, sw: 0.8, papel: 'grade' });
    const t = texto(fmtEixo(v, C.idioma, e.passo), { familia: C.T.fonteCorpo, tam, cor: C.T.suave, largura: eixoW - tam * 0.6, lh: 1, alin: 'end', papel: 'eixo' });
    prims.push(caixa(t.prim, a.x, y(v) - t.prim.lh / 2));
  }
  const x = i => plotX + passoX * i;
  series.forEach((_, s) => {
    const pts = dados.map((d, i) => d.valores[s].v === null ? null : [x(i), y(d.valores[s].v)]).filter(Boolean);
    if (pts.length > 1) prims.push({ t: 'path', d: 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L'), fill: 'none', stroke: cores[s % cores.length], sw: Math.max(2, tam * 0.2), papel: 'serie' });
    dados.forEach((d, i) => {
      const val = d.valores[s];
      if (val.v === null) return;
      prims.push({ t: 'circle', cx: x(i), cy: y(val.v), r: Math.max(3, tam * 0.3), fill: cores[s % cores.length], stroke: C.T.fundo, sw: 1.5, papel: 'ponto' });
      if (series.length === 1 && dados.length <= 12) {
        const lw = Math.max(tam * 4, slotW - tam * 0.4);
        const lt = texto(val.txt, { familia: C.T.fonteCorpo, peso: 700, tam, cor: C.T.texto, largura: lw, lh: 1.1, alin: 'middle', papel: 'valor', maxLinhas: 1, minimo: C.tip.minimo });
        prims.push(caixa(lt.prim, dentroX(x(i) - lw / 2, lw), y(val.v) - lt.h - tam * 0.75));
      }
    });
  });
  dados.forEach((d, i) => prims.push(caixa(rots[i].prim, dentroX(x(i) - rotW / 2, rotW), topo + plotH + tam * 0.5)));
  return prims;
}

function pizza(dados, a, C, cores) {
  const prims = [], tam = C.tip.legenda;
  const lado = Math.min(a.h, a.w * 0.5), r = lado / 2 - 2, cx = a.x + r + 2, cy = a.y + a.h / 2;
  const total = dados.reduce((t, d) => t + Math.max(0, d.valores[0].v || 0), 0) || 1;
  let ang = -Math.PI / 2;
  const ri = r * 0.55;
  dados.forEach((d, i) => {
    const frac = Math.max(0, d.valores[0].v || 0) / total, a2 = ang + frac * Math.PI * 2;
    const grande = a2 - ang > Math.PI ? 1 : 0;
    const p = (rr, t) => `${(cx + rr * Math.cos(t)).toFixed(2)} ${(cy + rr * Math.sin(t)).toFixed(2)}`;
    const dPath = frac >= 0.9999 ? `M${p(r, 0)} A${r} ${r} 0 1 1 ${p(r, Math.PI)} A${r} ${r} 0 1 1 ${p(r, 0)} M${p(ri, 0)} A${ri} ${ri} 0 1 0 ${p(ri, Math.PI)} A${ri} ${ri} 0 1 0 ${p(ri, 0)}Z`
      : `M${p(r, ang)} A${r} ${r} 0 ${grande} 1 ${p(r, a2)} L${p(ri, a2)} A${ri} ${ri} 0 ${grande} 0 ${p(ri, ang)}Z`;
    prims.push({ t: 'path', d: dPath, fill: cores[i % cores.length], stroke: C.T.fundo, sw: 2, papel: 'fatia' });
    ang = a2;
  });
  // Legenda com o valor de cada fatia (o texto do conteúdo).
  const lx = cx + r + tam * 2, lw = a.x + a.w - lx;
  const itens = dados.map((d, i) => ({ i, t: texto(`${d.rotulo}: ${d.valores[0].txt}`, { familia: C.T.fonteCorpo, peso: 600, tam: tam * 1.05, cor: C.T.texto, largura: lw - tam * 1.8, lh: 1.25, papel: 'valor' }) }));
  const total_h = itens.reduce((t, x) => t + x.t.h + tam * 0.6, 0);
  let y = cy - total_h / 2;
  for (const x of itens) {
    prims.push({ t: 'rect', x: lx, y: y + (x.t.prim.lh - tam) / 2, w: tam, h: tam, r: 2, fill: cores[x.i % cores.length], papel: 'legenda' });
    prims.push(caixa(x.t.prim, lx + tam * 1.6, y));
    y += x.t.h + tam * 0.6;
  }
  return prims;
}

function progresso(dados, a, C, cores) {
  const prims = [], tam = C.tip.legenda * 1.05;
  const linhaH = Math.min(a.h / dados.length, tam * 4.2);
  dados.forEach((d, i) => {
    const y0 = a.y + linhaH * i;
    const r = texto(d.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: a.w * 0.75, lh: 1.2, papel: 'rotulo_grafico', maxLinhas: 1, minimo: C.tip.minimo });
    const v = texto(d.valores[0].txt, { familia: C.T.fonteCorpo, peso: 700, tam, cor: C.T.primariaTexto, largura: a.w * 0.24, lh: 1.2, alin: 'end', papel: 'valor' });
    prims.push(caixa(r.prim, a.x, y0), caixa(v.prim, a.x + a.w * 0.76, y0));
    const yb = y0 + r.h + tam * 0.35, bh = tam * 0.8;
    prims.push({ t: 'rect', x: a.x, y: yb, w: a.w, h: bh, r: bh / 2, fill: C.T.superficie2, papel: 'trilho' });
    const frac = Math.max(0, Math.min(1, (d.valores[0].v || 0) / 100));
    if (frac > 0) prims.push({ t: 'rect', x: a.x, y: yb, w: Math.max(bh, a.w * frac), h: bh, r: bh / 2, fill: cores[0], papel: 'barra' });
  });
  return prims;
}

// Altura natural de um gráfico na largura dada (proporção que lê bem em cada tipo).
export function alturaGrafico(spec, it, largura, C) {
  if (spec.tipo === 'progresso') return Math.min(it.linhas.length * C.tip.legenda * 4.4, C.tip.legenda * 4.4 * 12);
  if (spec.tipo === 'barras_h') return Math.max(C.tip.legenda * 6, it.linhas.length * C.tip.legenda * 2.6);
  if (spec.tipo === 'pizza') return Math.min(largura * 0.42, C.tip.corpo * 16);
  return Math.min(largura * 0.5, C.tip.corpo * 20);
}
