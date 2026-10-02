// Diagramas: primeiro a ESTRUTURA lógica (nós e ligações, do conteúdo), depois o desenho, calculado aqui. Nenhum
// modelo de imagem desenha processo: cada caixa, seta e rótulo tem posição medida.
//   fluxo:    grafo em camadas (caminho mais longo), da esquerda para a direita na página larga e de cima para
//             baixo na estreita; decisões (texto terminado em "?") em losango; ramos com rótulo ("sim", "não").
//   processo: etapas em sequência, numeradas, em linhas que continuam na seguinte.
//   ciclo:    etapas em volta de um círculo, a última volta para a primeira.
import { texto, caixa } from './blocos.js';

const seta = (x1, y1, x2, y2, cor, sw, tam) => {
  const a = Math.atan2(y2 - y1, x2 - x1), l = tam * 0.55, w = tam * 0.32;
  const p = (dx, dy) => `${(x2 + dx).toFixed(1)} ${(y2 + dy).toFixed(1)}`;
  return { t: 'path', d: `M${p(0, 0)} L${p(-l * Math.cos(a) + w * Math.sin(a), -l * Math.sin(a) - w * Math.cos(a))} L${p(-l * Math.cos(a) - w * Math.sin(a), -l * Math.sin(a) + w * Math.cos(a))}Z`, fill: cor, stroke: cor, sw: 0.5, papel: 'seta' };
};

function caixaNo(no, larguraMax, C, numero = null, fixa = false) {
  const tam = Math.max(C.tip.minimo, C.tip.corpo * 0.95), pad = tam * 0.75;
  if (no.decisao) {
    const t = texto(no.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: larguraMax * 0.6, lh: 1.25, alin: 'middle', papel: 'diagrama' });
    const w = Math.min(larguraMax, Math.max(t.w / 0.6 + pad * 2, tam * 8)), h = Math.max(t.h * 2 + pad * 1.4, w * 0.5);
    return { w, h, desenhar: (x, y) => [{ t: 'path', d: `M${x + w / 2} ${y} L${x + w} ${y + h / 2} L${x + w / 2} ${y + h} L${x} ${y + h / 2}Z`, fill: C.T.superficie2, stroke: C.T.primaria, sw: 1.5, papel: 'no' },
      { ...t.prim, x: x + w * 0.2, y: y + (h - t.h) / 2, w: w * 0.6 }] };
  }
  const num = numero !== null ? tam * 1.9 : 0;
  const t = texto(no.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: larguraMax - pad * 2 - num, lh: 1.25, alin: numero !== null ? 'start' : 'middle', papel: 'diagrama' });
  const w = fixa ? larguraMax : Math.min(larguraMax, Math.max(t.w + pad * 2 + num, tam * 6)), h = Math.max(t.h + pad * 2, num ? tam * 2.6 : 0);
  return { w, h, desenhar: (x, y) => {
    const out = [{ t: 'rect', x, y, w, h, r: C.T.cantos + 2, fill: C.T.superficie, stroke: C.T.primaria, sw: 1.4, papel: 'no' }];
    if (numero !== null) {
      out.push({ t: 'circle', cx: x + pad + tam * 0.75, cy: y + h / 2, r: tam * 0.75, fill: C.T.primaria, papel: 'marcador' });
      const n = texto(String(numero), { familia: C.T.fonteCorpo, peso: 700, tam: tam * 0.8, cor: C.T.sobrePrimaria, largura: tam * 1.5, lh: 1, alin: 'middle', papel: 'marcador' });
      out.push(caixa(n.prim, x + pad, y + h / 2 - n.prim.lh / 2));
    }
    out.push({ ...t.prim, x: x + pad + num, y: y + (h - t.h) / 2, w: w - pad * 2 - num });
    return out;
  } };
}

export function blocoDiagrama(estrutura, tipo, largura, C, { alturaMax = Infinity } = {}) {
  if (tipo === 'ciclo' && estrutura.nos.length >= 3 && estrutura.nos.length <= 8) return ciclo(estrutura, largura, C);
  if (tipo === 'processo' || !estrutura.ligacoes.length) return processo(estrutura, largura, C);
  return fluxo(estrutura, largura, C, alturaMax);
}

// Estrutura a partir de uma lista ordenada (cada item é uma etapa, na ordem).
export const estruturaDaLista = it => ({ nos: it.itens.map((x, i) => ({ id: `n${i + 1}`, rotulo: x.texto, decisao: false })), ligacoes: it.itens.slice(1).map((_, i) => ({ de: `n${i + 1}`, para: `n${i + 2}` })) });

function processo(e, largura, C) {
  const nos = e.nos, tam = C.tip.corpo, gap = tam * 2.2;
  const porLinha = Math.max(1, Math.min(nos.length, Math.floor((largura + gap) / (tam * 11 + gap)), 5));
  const w = (largura - gap * (porLinha - 1)) / porLinha;
  const caixas = nos.map((n, i) => caixaNo({ ...n, decisao: false }, w, C, i + 1, true));
  const prims = [];
  let y = 0;
  for (let i = 0; i < nos.length; i += porLinha) {
    const linha = caixas.slice(i, i + porLinha), h = Math.max(...linha.map(c => c.h));
    linha.forEach((c, k) => {
      const x = k * (w + gap);
      prims.push(...c.desenhar(x, y + (h - c.h) / 2));
      if (k < linha.length - 1) {
        const ya = y + h / 2;
        prims.push({ t: 'line', x1: x + w + 3, y1: ya, x2: x + w + gap - 6, y2: ya, cor: C.T.primaria, sw: 1.8, papel: 'ligacao' }, seta(x + w + 3, ya, x + w + gap - 3, ya, C.T.primaria, 1.8, tam));
      }
    });
    y += h;
    if (i + porLinha < nos.length) {
      // Continua na linha seguinte: da última caixa desce, volta à esquerda e desce até a primeira da nova linha.
      const xu = (linha.length - 1) * (w + gap) + w / 2, xp = w / 2, y1 = y + 3, ym = y + gap * 0.45, y2 = y + gap - 3;
      prims.push({ t: 'path', d: `M${xu} ${y1} L${xu} ${ym} L${xp} ${ym} L${xp} ${y2 - 4}`, fill: 'none', stroke: C.T.primaria, sw: 1.8, papel: 'ligacao' }, seta(xp, ym, xp, y2, C.T.primaria, 1.8, tam));
      y += gap;
    }
  }
  return { h: y, prims };
}

function camadas(e) {
  const ids = e.nos.map(n => n.id), saida = new Map(ids.map(i => [i, []])), entra = new Map(ids.map(i => [i, 0]));
  // Ligações de volta (ciclo) não definem camada: são detectadas por busca em profundidade.
  const estado = new Map(), volta = new Set();
  const dfs = v => { estado.set(v, 1); for (const l of e.ligacoes.filter(x => x.de === v)) { if (estado.get(l.para) === 1) volta.add(l); else if (!estado.get(l.para)) dfs(l.para); } estado.set(v, 2); };
  ids.forEach(i => { if (!estado.get(i)) dfs(i); });
  for (const l of e.ligacoes) if (!volta.has(l)) { saida.get(l.de)?.push(l.para); entra.set(l.para, (entra.get(l.para) || 0) + 1); }
  const nivel = new Map(ids.map(i => [i, 0]));
  const fila = ids.filter(i => !entra.get(i));
  const grau = new Map(entra);
  while (fila.length) {
    const v = fila.shift();
    for (const p of saida.get(v)) { nivel.set(p, Math.max(nivel.get(p), nivel.get(v) + 1)); grau.set(p, grau.get(p) - 1); if (!grau.get(p)) fila.push(p); }
  }
  const L = Math.max(...nivel.values()) + 1;
  const por = Array.from({ length: L }, () => []);
  for (const i of ids) por[nivel.get(i)].push(i);
  return { por, nivel, volta };
}

function fluxo(e, largura, C, alturaMax) {
  const { por, volta } = camadas(e);
  const L = por.length, tam = C.tip.corpo, gap = tam * 2.6;
  const maxNaCamada = Math.max(...por.map(c => c.length));
  // Esquerda->direita quando as camadas cabem com caixas legíveis; senão, de cima para baixo.
  const colW = (largura - gap * (L - 1)) / L;
  const lr = colW >= tam * 7.5;
  const prims = [], pos = new Map();
  if (lr) {
    const larg = Math.min(colW, tam * 16);
    const cx = por.map(c => c.map(id => ({ id, c: caixaNo(e.nos.find(n => n.id === id), larg, C) })));
    const altCol = cx.map(c => c.reduce((t, x) => t + x.c.h, 0) + gap * 0.6 * (c.length - 1));
    const H = Math.max(...altCol);
    const passo = L > 1 ? (largura - larg) / (L - 1) : 0;
    cx.forEach((c, i) => {
      let y = (H - altCol[i]) / 2;
      const x0 = L > 1 ? passo * i : (largura - larg) / 2;
      for (const x of c) { const xx = x0 + (larg - x.c.w) / 2; pos.set(x.id, { x: xx, y, w: x.c.w, h: x.c.h }); prims.push(...x.c.desenhar(xx, y)); y += x.c.h + gap * 0.6; }
    });
    ligar(e, pos, volta, prims, C, true, H);
    return { h: H + (volta.size ? gap : 0), prims };
  }
  const larg = Math.min((largura - gap * 0.6 * (maxNaCamada - 1)) / maxNaCamada, tam * 18);
  let y = 0;
  for (const c of por) {
    const cx = c.map(id => ({ id, c: caixaNo(e.nos.find(n => n.id === id), larg, C) }));
    const h = Math.max(...cx.map(x => x.c.h)), total = cx.reduce((t, x) => t + x.c.w, 0) + gap * 0.6 * (cx.length - 1);
    let x = (largura - total) / 2;
    for (const k of cx) { const yy = y + (h - k.c.h) / 2; pos.set(k.id, { x, y: yy, w: k.c.w, h: k.c.h }); prims.push(...k.c.desenhar(x, yy)); x += k.c.w + gap * 0.6; }
    y += h + gap;
  }
  ligar(e, pos, volta, prims, C, false, y - gap);
  return { h: y - gap, prims, alturaMax };
}

function ligar(e, pos, volta, prims, C, lr, H) {
  const tam = C.tip.corpo, cor = C.T.primaria;
  for (const l of e.ligacoes) {
    const a = pos.get(l.de), b = pos.get(l.para);
    if (!a || !b) continue;
    let pts;
    if (volta.has(l)) {
      // Volta: contorna por baixo (ou pela direita), sem cruzar as caixas.
      pts = lr ? [[a.x + a.w / 2, a.y + a.h], [a.x + a.w / 2, H + tam * 1.6], [b.x + b.w / 2, H + tam * 1.6], [b.x + b.w / 2, b.y + b.h + 2]]
        : [[a.x + a.w, a.y + a.h / 2], [Math.max(a.x + a.w, b.x + b.w) + tam * 1.4, a.y + a.h / 2], [Math.max(a.x + a.w, b.x + b.w) + tam * 1.4, b.y + b.h / 2], [b.x + b.w + 2, b.y + b.h / 2]];
    } else if (lr) {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 2, y2 = b.y + b.h / 2, xm = (x1 + x2) / 2;
      pts = Math.abs(y1 - y2) < 1 ? [[x1, y1], [x2, y2]] : [[x1, y1], [xm, y1], [xm, y2], [x2, y2]];
    } else {
      const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y - 2, ym = (y1 + y2) / 2;
      pts = Math.abs(x1 - x2) < 1 ? [[x1, y1], [x2, y2]] : [[x1, y1], [x1, ym], [x2, ym], [x2, y2]];
    }
    const [u, v] = [pts.at(-2), pts.at(-1)];
    const ang = Math.atan2(v[1] - u[1], v[0] - u[0]);
    const fim = [v[0] - Math.cos(ang) * tam * 0.4, v[1] - Math.sin(ang) * tam * 0.4];
    prims.push({ t: 'path', d: 'M' + [...pts.slice(0, -1), fim].map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L'), fill: 'none', stroke: cor, sw: 1.6, papel: 'ligacao' }, seta(u[0], u[1], v[0], v[1], cor, 1.6, tam));
    if (l.rotulo) {
      const t = texto(l.rotulo, { familia: C.T.fonteCorpo, peso: 700, tam: C.tip.legenda, cor: C.T.primariaTexto, largura: tam * 6, lh: 1.15, alin: 'middle', papel: 'rotulo_diagrama' });
      const m = pts.length >= 3 ? pts[1] : [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      const mx = pts.length >= 3 ? (pts[1][0] + pts[2][0]) / 2 : m[0], my = pts.length >= 3 ? (pts[1][1] + pts[2][1]) / 2 : m[1];
      prims.push({ t: 'rect', x: mx - t.w / 2 - 4, y: my - t.h / 2 - 2, w: t.w + 8, h: t.h + 4, r: 3, fill: C.T.fundo, papel: 'rotulo_fundo' }, { ...t.prim, x: mx - tam * 3, y: my - t.h / 2 });
    }
  }
}

function ciclo(e, largura, C) {
  const n = e.nos.length, tam = C.tip.corpo;
  const R = Math.min(largura * 0.32, tam * 12), larg = Math.min(tam * 12, R * 1.1);
  const cxs = e.nos.map(no => caixaNo(no, larg, C));
  const maxH = Math.max(...cxs.map(c => c.h));
  const H = R * 2 + maxH + tam;
  const cx = largura / 2, cy = H / 2;
  const prims = [], pos = [];
  cxs.forEach((c, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = cx + R * Math.cos(a) - c.w / 2, y = cy + R * Math.sin(a) * (1 - maxH / (2 * R + maxH) * 0.4) - c.h / 2;
    pos.push({ x, y, w: c.w, h: c.h, a });
  });
  // Arcos entre etapas consecutivas (desenhados antes das caixas, que ficam por cima).
  pos.forEach((p, i) => {
    const q = pos[(i + 1) % n];
    const a1 = p.a + 0.32, a2 = q.a - 0.32 + (i === n - 1 ? Math.PI * 2 : 0);
    const P = t => [cx + R * Math.cos(t), cy + R * Math.sin(t)];
    const [x1, y1] = P(a1), [x2, y2] = P(a2);
    prims.push({ t: 'path', d: `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`, fill: 'none', stroke: C.T.primaria, sw: 1.8, papel: 'ligacao' });
    const [x0, y0] = P(a2 - 0.05);
    prims.push(seta(x0, y0, x2, y2, C.T.primaria, 1.8, tam));
  });
  cxs.forEach((c, i) => prims.push(...c.desenhar(pos[i].x, pos[i].y)));
  return { h: H, prims };
}
