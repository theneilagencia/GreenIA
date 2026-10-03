// Diagramas: primeiro a ESTRUTURA lógica (nós e ligações, do conteúdo), depois o desenho, calculado aqui. Nenhum
// modelo de imagem desenha processo: cada caixa, seta e rótulo tem posição medida.
//   fluxo:    grafo em camadas (caminho mais longo), da esquerda para a direita na página larga e de cima para
//             baixo na estreita; decisões (texto terminado em "?") em losango; ramos com rótulo ("sim", "não").
//   processo: etapas em sequência, numeradas, em linhas que continuam na seguinte.
//   ciclo:    etapas em volta de um círculo, a última volta para a primeira.
import { texto, caixa } from './blocos.js';
import { carregarFonte, medir, textoSeguro } from './fontes.js';

const seta = (x1, y1, x2, y2, cor, sw, tam) => {
  const a = Math.atan2(y2 - y1, x2 - x1), l = tam * 0.55, w = tam * 0.32;
  const p = (dx, dy) => `${(x2 + dx).toFixed(1)} ${(y2 + dy).toFixed(1)}`;
  return { t: 'path', d: `M${p(0, 0)} L${p(-l * Math.cos(a) + w * Math.sin(a), -l * Math.sin(a) - w * Math.cos(a))} L${p(-l * Math.cos(a) - w * Math.sin(a), -l * Math.sin(a) + w * Math.cos(a))}Z`, fill: cor, stroke: cor, sw: 0.5, papel: 'seta' };
};

// A maior palavra do rótulo sempre cabe inteira (nada de "orça-mento" dentro de uma caixa).
const maiorPalavra = (rotulo, tam) => { const f = carregarFonte('sans', 600); return Math.max(0, ...textoSeguro(rotulo, f).split(/\s+/).map(w => medir(w, f, tam))); };
function caixaNo(no, larguraMax, C, numero = null, fixa = false) {
  const tam = Math.max(C.tip.minimo, C.tip.corpo * 0.95), pad = tam * 0.75;
  if (no.decisao) {
    const interna = Math.max(larguraMax * 0.6, maiorPalavra(no.rotulo, tam) + 2);
    const t = texto(no.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: interna, lh: 1.25, alin: 'middle', papel: 'diagrama' });
    const w = Math.max(Math.min(larguraMax, Math.max(t.w / 0.6 + pad * 2, tam * 8)), interna / 0.6), h = Math.max(t.h * 2 + pad * 1.4, w * 0.5);
    return { w, h, desenhar: (x, y) => [{ t: 'path', d: `M${x + w / 2} ${y} L${x + w} ${y + h / 2} L${x + w / 2} ${y + h} L${x} ${y + h / 2}Z`, fill: C.T.superficie2, stroke: C.T.primaria, sw: 1.5, papel: 'no' },
      { ...t.prim, x: x + w * 0.2, y: y + (h - t.h) / 2, w: w * 0.6 }] };
  }
  const num = numero !== null ? tam * 1.9 : 0;
  const larg = Math.max(larguraMax, maiorPalavra(no.rotulo, tam) + pad * 2 + num + 2);
  const t = texto(no.rotulo, { familia: C.T.fonteCorpo, peso: 600, tam, cor: C.T.texto, largura: larg - pad * 2 - num, lh: 1.25, alin: numero !== null ? 'start' : 'middle', papel: 'diagrama' });
  const w = fixa ? larg : Math.min(larg, Math.max(t.w + pad * 2 + num, tam * 6)), h = Math.max(t.h + pad * 2, num ? tam * 2.6 : 0);
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

// ---- Fluxo em camadas (Sugiyama simplificado) --------------------------------------------------------------------
// 1) ligações de volta (ciclos) saem do cálculo de camadas; 2) camada = caminho mais longo; 3) ligações que pulam
// camadas ganham nós fictícios (a seta passa por um corredor livre, nunca por cima de uma caixa); 4) ordem dentro da
// camada por baricentro (menos cruzamentos); 5) posição: cada nó perto da média dos vizinhos, sem sobrepor;
// 6) rotas ortogonais pelos corredores entre camadas.
function camadas(e) {
  const ids = e.nos.map(n => n.id);
  const estado = new Map(), volta = new Set();
  const dfs = v => { estado.set(v, 1); for (const l of e.ligacoes.filter(x => x.de === v)) { if (estado.get(l.para) === 1) volta.add(l); else if (!estado.get(l.para)) dfs(l.para); } estado.set(v, 2); };
  // Começa pelas fontes (sem entrada), na ordem do texto: o fluxo lido de cima para baixo define a direção.
  const entra = new Set(e.ligacoes.map(l => l.para));
  [...ids.filter(i => !entra.has(i)), ...ids].forEach(i => { if (!estado.get(i)) dfs(i); });
  const diretas = e.ligacoes.filter(l => !volta.has(l));
  const nivel = new Map(ids.map(i => [i, 0]));
  for (let k = 0; k < ids.length; k++) for (const l of diretas) nivel.set(l.para, Math.max(nivel.get(l.para), nivel.get(l.de) + 1));
  return { nivel, volta, diretas };
}

function fluxo(e, largura, C, alturaMax) {
  const tam = C.tip.corpo;
  const { nivel, volta, diretas } = camadas(e);
  const L = Math.max(...nivel.values()) + 1;
  // Nós fictícios nas ligações longas.
  const nos = new Map(e.nos.map(n => [n.id, { ...n, camada: nivel.get(n.id), ficticio: false }]));
  const arestas = [];
  let f = 0;
  for (const l of diretas) {
    const caminho = [l.de];
    for (let c = nivel.get(l.de) + 1; c < nivel.get(l.para); c++) { const id = `f${f++}`; nos.set(id, { id, camada: c, ficticio: true }); caminho.push(id); }
    caminho.push(l.para);
    arestas.push({ l, caminho });
  }
  const porCamada = Array.from({ length: L }, () => []);
  for (const n of nos.values()) porCamada[n.camada].push(n.id);
  const viz = (id, sentido) => arestas.flatMap(a => a.caminho.flatMap((x, i) => (sentido < 0 ? (a.caminho[i + 1] === id ? [x] : []) : (a.caminho[i - 1] === id ? [x] : []))));
  // Ordem por baricentro, algumas varreduras para baixo e para cima.
  const pos = new Map();
  const numerar = () => porCamada.forEach(c => c.forEach((id, i) => pos.set(id, i)));
  numerar();
  for (let it = 0; it < 6; it++) {
    const sentido = it % 2 ? 1 : -1;
    const ordem = sentido < 0 ? porCamada.keys() : [...porCamada.keys()].reverse();
    for (const c of ordem) {
      const bari = id => { const v = viz(id, sentido); return v.length ? v.reduce((t, x) => t + pos.get(x), 0) / v.length : pos.get(id); };
      porCamada[c].sort((a, b) => bari(a) - bari(b) || pos.get(a) - pos.get(b));
      porCamada[c].forEach((id, i) => pos.set(id, i));
    }
  }
  const maxNaCamada = Math.max(...porCamada.map(c => c.filter(id => !nos.get(id).ficticio).length));
  // Direção: a que deixa as caixas maiores (texto legível) na largura disponível.
  const gapP = tam * 2.8, gapS = tam * 1.1;
  const lrW = (largura - gapP * (L - 1)) / L, tbW = (largura - gapS * (maxNaCamada - 1)) / Math.max(1, maxNaCamada);
  // Espaço largo (página deitada): da esquerda para a direita, se as caixas ficam legíveis; senão, de cima para baixo.
  const alt = Number.isFinite(alturaMax) ? alturaMax : largura * 0.6;
  // Coluna legível: cabe a maior palavra de cada nó (losango precisa de mais largura que a caixa).
  const minCol = Math.max(tam * 5, ...[...nos.values()].filter(n => !n.ficticio).map(n => (maiorPalavra(n.rotulo, Math.max(C.tip.minimo, tam * 0.95)) + tam * 1.6) / (n.decisao ? 0.6 : 1)));
  const lr = lrW >= minCol && (largura > alt * 1.15 || lrW >= tbW * 0.75 || L <= 3);
  const larguraNo = Math.max(tam * 6, Math.min(lr ? lrW : tbW, tam * 15));
  const caixas = new Map();
  for (const n of nos.values()) caixas.set(n.id, n.ficticio ? { w: 0, h: tam * 0.6 } : caixaNo(n, larguraNo, C));
  // Eixo principal: posição das camadas; eixo secundário: posição dentro da camada (pela média dos vizinhos).
  const tamP = c => Math.max(...porCamada[c].map(id => (lr ? caixas.get(id).w : caixas.get(id).h)), tam);
  const iniP = []; let acc = 0;
  for (let c = 0; c < L; c++) { iniP.push(acc); acc += tamP(c) + gapP; }
  const totalP = acc - gapP;
  const ext = id => (lr ? caixas.get(id).h : caixas.get(id).w);
  const centro = new Map();
  // Primeira passada: empilha cada camada; depois aproxima do centro dos vizinhos (duas varreduras), sem sobrepor.
  for (const c of porCamada) { let a = 0; for (const id of c) { centro.set(id, a + ext(id) / 2); a += ext(id) + gapS; } }
  for (let it = 0; it < 6; it++) {
    // Varredura para frente alinha com quem vem antes; para trás, com quem vem depois (correntes ficam retas).
    const sentido = it % 2 ? 1 : -1;
    const camadasOrdem = sentido < 0 ? [...Array(L).keys()] : [...Array(L).keys()].reverse();
    for (const c of camadasOrdem) {
      const ordem = porCamada[c];
      const alvo = ordem.map(id => { const v = viz(id, sentido).length ? viz(id, sentido) : [...viz(id, -1), ...viz(id, 1)]; return v.length ? v.reduce((t, x) => t + centro.get(x), 0) / v.length : centro.get(id); });
      let minimo = -Infinity;
      ordem.forEach((id, i) => { const c0 = Math.max(alvo[i], minimo + ext(id) / 2); centro.set(id, c0); minimo = c0 + ext(id) / 2 + gapS; });
    }
  }
  const minS = Math.min(...[...nos.keys()].map(id => centro.get(id) - ext(id) / 2));
  for (const id of nos.keys()) centro.set(id, centro.get(id) - minS);
  const totalS = Math.max(...[...nos.keys()].map(id => centro.get(id) + ext(id) / 2));
  // Centraliza na largura.
  const desloc = lr ? Math.max(0, (largura - totalP) / 2) : Math.max(0, (largura - totalS) / 2);
  const caixaDe = id => {
    const c = nos.get(id).camada, b = caixas.get(id);
    if (lr) { const x = desloc + iniP[c] + (tamP(c) - b.w) / 2; return { x, y: centro.get(id) - b.h / 2, w: b.w, h: b.h }; }
    return { x: desloc + centro.get(id) - b.w / 2, y: iniP[c] + (tamP(c) - b.h) / 2, w: b.w, h: b.h };
  };
  const prims = [];
  const H = lr ? totalS : totalP;
  // Ligações (antes das caixas, que ficam por cima).
  const cor = C.T.primaria;
  // Portas de saída: de um nó com mais de uma saída (decisão), o ramo mais alinhado segue em frente e os outros
  // saem pelos lados (cima/baixo na horizontal, esquerda/direita na vertical). Cada ramo tem a sua saída e o seu rótulo.
  const porta = new Map();
  const saidas = new Map();
  for (const a of arestas) { const k = a.caminho[0]; if (!saidas.has(k)) saidas.set(k, []); saidas.get(k).push(a); }
  for (const [k, lista] of saidas) {
    if (lista.length < 2) continue;
    const c0 = centro.get(k);
    const ord = [...lista].sort((x, y) => Math.abs(centro.get(x.caminho[1]) - c0) - Math.abs(centro.get(y.caminho[1]) - c0));
    ord.forEach((a, i) => { if (i > 0) porta.set(a, centro.get(a.caminho[1]) < c0 || (centro.get(a.caminho[1]) === c0 && i % 2) ? 'antes' : 'depois'); });
  }
  for (const a of arestas) {
    const { l, caminho } = a;
    const pts = [];
    caminho.forEach((id, i) => {
      const b = caixaDe(id);
      if (i === 0) pts.push(lr ? [b.x + b.w, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h]);
      else if (i === caminho.length - 1) pts.push(lr ? [b.x - 2, b.y + b.h / 2] : [b.x + b.w / 2, b.y - 2]);
      else pts.push(lr ? [b.x, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h / 2]);
    });
    let rota;
    const lado = porta.get(a);
    if (lado) {
      // Saída lateral: sai pelo lado, vai até o alinhamento do próximo ponto e segue.
      const b = caixaDe(caminho[0]);
      const p0 = lr ? [b.x + b.w / 2, lado === 'antes' ? b.y : b.y + b.h] : [lado === 'antes' ? b.x : b.x + b.w, b.y + b.h / 2];
      rota = [p0, lr ? [p0[0], pts[1][1]] : [pts[1][0], p0[1]]];
    } else rota = [pts[0]];
    // Ortogonal: entre dois pontos, a curva fica no meio do corredor entre as camadas.
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = [rota.at(-1), pts[i]];
      if (lr) { if (Math.abs(x[1] - y[1]) > 0.5) { const xm = Math.max(x[0], caixaDe(caminho[i - 1]).x + caixaDe(caminho[i - 1]).w) + gapP / 2; rota.push([xm, x[1]], [xm, y[1]]); } }
      else if (Math.abs(x[0] - y[0]) > 0.5) { const ym = Math.max(x[1], caixaDe(caminho[i - 1]).y + caixaDe(caminho[i - 1]).h) + gapP / 2; rota.push([x[0], ym], [y[0], ym]); }
      rota.push(y);
    }
    desenharLigacao(rota, l.rotulo, prims, C, cor, lr);
  }
  for (const l of volta) {
    const a = caixaDe(l.de), b = caixaDe(l.para);
    const rota = lr ? [[a.x + a.w / 2, a.y + a.h], [a.x + a.w / 2, H + tam * 1.4], [b.x + b.w / 2, H + tam * 1.4], [b.x + b.w / 2, b.y + b.h + 2]]
      : [[a.x + a.w, a.y + a.h / 2], [Math.max(a.x + a.w, b.x + b.w) + tam * 1.4, a.y + a.h / 2], [Math.max(a.x + a.w, b.x + b.w) + tam * 1.4, b.y + b.h / 2], [b.x + b.w + 2, b.y + b.h / 2]];
    desenharLigacao(rota, l.rotulo, prims, C, cor, lr);
  }
  for (const n of nos.values()) if (!n.ficticio) { const b = caixaDe(n.id); prims.push(...caixas.get(n.id).desenhar(b.x, b.y)); }
  // Rótulos dos ramos por cima de tudo (nunca escondidos atrás de um losango).
  const rotulos = prims.filter(p => p.papel === 'rotulo_fundo' || p.papel === 'rotulo_diagrama');
  return { h: H + (volta.size && lr ? tam * 2.2 : 0), prims: [...prims.filter(p => !rotulos.includes(p)), ...rotulos], alturaMax };
}

// Desenha a rota (polilinha ortogonal) com a seta no fim e o rótulo do ramo logo depois da saída.
function desenharLigacao(rota, rotulo, prims, C, cor, lr) {
  const tam = C.tip.corpo;
  const [u, v] = [rota.at(-2), rota.at(-1)];
  const ang = Math.atan2(v[1] - u[1], v[0] - u[0]);
  const fim = [v[0] - Math.cos(ang) * tam * 0.4, v[1] - Math.sin(ang) * tam * 0.4];
  prims.push({ t: 'path', d: 'M' + [...rota.slice(0, -1), fim].map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L'), fill: 'none', stroke: cor, sw: 1.6, papel: 'ligacao' }, seta(u[0], u[1], v[0], v[1], cor, 1.6, tam));
  if (!rotulo) return;
  const t = texto(rotulo, { familia: C.T.fonteCorpo, peso: 700, tam: C.tip.legenda, cor: C.T.primariaTexto, largura: tam * 5, lh: 1.15, alin: 'middle', papel: 'rotulo_diagrama' });
  // No primeiro trecho, perto da saída do nó de decisão (cada ramo tem a sua saída: os rótulos não se sobrepõem).
  const [a, b] = [rota[0], rota[1]];
  const k = Math.min(1, (tam * 1.8) / Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])));
  const mx = a[0] + (b[0] - a[0]) * Math.max(0.35, k), my = a[1] + (b[1] - a[1]) * Math.max(0.35, k);
  prims.push({ t: 'rect', x: mx - t.w / 2 - 4, y: my - t.h / 2 - 2, w: t.w + 8, h: t.h + 4, r: 3, fill: C.T.fundo, papel: 'rotulo_fundo' }, { ...t.prim, x: mx - tam * 2.5, y: my - t.h / 2 });
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
