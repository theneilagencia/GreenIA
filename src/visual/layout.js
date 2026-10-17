// Etapa 4 da produção visual: COMPOSIÇÃO determinística. O plano (páginas e blocos) e o conteúdo viram páginas com
// primitivas posicionadas: grade, margens, alinhamento, espaçamento, tipografia, quebras de linha, tabelas,
// gráficos, diagramas, imagens e logo. Mesma entrada, mesmo resultado: nada aqui depende de um modelo.
//
// Parâmetros que a correção automática ajusta (e só eles): escala da tipografia, número de colunas, quebra de
// conteúdo em páginas de continuação e altura dos gráficos. Cada página devolve também as caixas dos blocos e a
// área útil, que a conferência visual usa para achar transbordo, corte, sobreposição e margens.
import { FORMATOS } from './contrato.js';
import { misturar, tema } from './marca.js';
import { itensPorId, indicador } from './conteudo.js';
import { blocoCartoes, blocoCitacao, blocoCta, blocoImagem, blocoIndicadores, blocoLinhaTempo, blocoLista, blocoNota, blocoParagrafo, blocoTabela, blocoTituloBloco, caixa, mover, texto } from './blocos.js';
import { alturaGrafico, blocoGrafico } from './graficos.js';
import { blocoDiagrama, estruturaDaLista } from './diagramas.js';

export function tipografia(formato, escala = 1, impacto = false) {
  const f = FORMATOS[formato], c = f.corpo * escala;
  return { corpo: c, legenda: Math.max(c * 0.8, f.minimo), tabela: Math.max(c * 0.9, f.minimo), h3: c * 1.12, h2: c * 1.32, h1: c * (impacto ? 2.1 : 1.85), display: c * (impacto ? 2.5 : 2.7), kpi: c * 2.05, minimo: f.minimo };
}

const ROTULO_PAGINA = { pt: (n, t) => `${n} / ${t}`, en: (n, t) => `${n} / ${t}` };

// ---- Contexto ---------------------------------------------------------------------------------------------------
function contexto(plano, identidade, op) {
  const T = tema(identidade);
  const w = plano.canvas.w, h = plano.canvas.h;
  const tip = tipografia(plano.formato, op.escala || 1, plano.impacto);
  const M = Math.round(Math.min(w, h) * (plano.impacto ? 0.075 : 0.062));
  return { T, tip, M, w, h, plano, identidade, idioma: op.idioma || 'pt', op, gap: tip.corpo * 1.25 };
}

// ---- Bloco -> desenho --------------------------------------------------------------------------------------------
// Devolve { h, prims, partir(hMax) -> [antes, depois] | null } para a largura dada. `alturaLivre`: espaço que um
// bloco flexível (gráfico) pode ocupar.
export function desenharBloco(b, largura, C, itens, { alturaLivre = null, assets = {} } = {}) {
  const it = itens.get(b.refs?.[0]);
  const corpo = (() => {
    if (b.tipo === 'imagem') {
      const a = assets[b.asset] || null;
      const alt = Math.min(alturaLivre ?? largura * 0.6, largura * 0.75);
      return blocoImagem(a, largura, Math.max(C.tip.corpo * 6, alt), C, { proposito: b.proposito || '' });
    }
    if (!it) return { h: 0, prims: [] };
    switch (b.tipo) {
      case 'texto': {
        const partes = b.refs.map(r => itens.get(r)).filter(Boolean);
        let y = 0; const prims = [];
        partes.forEach((p, k) => {
          const txt = p.tipo === 'lista' ? p.itens.map(x => x.texto).join('\n') : p.tipo === 'tabela' ? '' : p.texto || p.itens?.map(x => `${x.valor} ${x.rotulo}`).join('\n') || '';
          const r = blocoParagrafo(txt, largura, C);
          prims.push(...mover(r.prims, 0, y)); y += r.h + (k < partes.length - 1 ? C.tip.corpo * 0.7 : 0);
        });
        return { h: y, prims, partirTexto: partes.length === 1 };
      }
      case 'subtitulo': { const t = texto(it.texto, { familia: C.T.fonteTitulos, peso: 700, tam: C.tip.h3, cor: C.T.primariaTexto, largura, lh: 1.25, papel: 'h3' }); return { h: t.h, prims: [t.prim] }; }
      case 'citacao': return blocoCitacao(it.texto || '', largura, C);
      case 'cta': return blocoCta(it.texto || '', largura, C, { centro: C.plano.impacto });
      case 'nota': return blocoNota(it.texto || '', largura, C);
      case 'lista': case 'checklist': {
        if (it.tipo === 'indicadores') return blocoIndicadores(it, largura, C);
        if (it.tipo !== 'lista') return blocoParagrafo(it.texto || '', largura, C);
        const lista = b.itensParte ? { ...it, itens: b.itensParte } : it;
        return { ...blocoLista(lista, largura, C, { checklist: b.tipo === 'checklist' }), partirLista: lista };
      }
      case 'indicadores': {
        const ind = it.tipo === 'indicadores' ? it : { itens: (it.itens || []).map(x => indicador(x.texto) || { rotulo: x.texto, valor: '' }) };
        return blocoIndicadores(ind, largura, C);
      }
      case 'cartoes': {
        if (it.tipo === 'tabela') {
          const pseudo = { itens: it.linhas.map(l => ({ texto: `${l[0] || '-'}: ${it.cabecalho.slice(1).map((h, k) => `${h}: ${l[k + 1] ?? ''}`).join('\n')}` })) };
          return blocoCartoes(pseudo, largura, C);
        }
        return blocoCartoes(it, largura, C);
      }
      case 'linha_tempo': return blocoLinhaTempo(it, largura, C);
      case 'tabela': {
        if (it.tipo !== 'tabela') return blocoParagrafo(it.texto || '', largura, C);
        const tam = C.tip.tabela * (it.cabecalho.length > 6 ? 0.88 : 1) * (C.op.escalaTabela || 1);
        const r = blocoTabela(it, largura, C, { tam: Math.max(tam, C.tip.minimo), linhas: b.linhasParte || null });
        return { ...r, partirTabela: { it, tam: Math.max(tam, C.tip.minimo), linhas: b.linhasParte || it.linhas } };
      }
      case 'grafico': {
        if (it.tipo !== 'tabela' || !b.grafico) return { h: 0, prims: [] };
        const natural = alturaGrafico(b.grafico, it, largura, C) * (C.op.escalaGrafico || 1);
        const alt = Math.max(C.tip.corpo * 7, alturaLivre ? Math.min(natural, alturaLivre) : natural);
        return blocoGrafico(it, b.grafico, largura, alt, C);
      }
      case 'diagrama': {
        const est = it.tipo === 'fluxo' ? { nos: it.nos, ligacoes: it.ligacoes } : it.tipo === 'lista' ? estruturaDaLista(it) : null;
        return est ? blocoDiagrama(est, b.diagrama?.tipo || 'fluxo', largura, C, { alturaMax: alturaLivre ?? Infinity }) : { h: 0, prims: [] };
      }
      default: return blocoParagrafo(it.texto || '', largura, C);
    }
  })();
  if (!b.titulo || b.semTitulo) return corpo;
  const t = blocoTituloBloco(b.titulo, largura, C);
  const g = C.tip.corpo * 0.55;
  return { ...corpo, h: t.h + g + corpo.h, prims: [...t.prims, ...mover(corpo.prims, 0, t.h + g)], tituloH: t.h + g };
}

// Partir um bloco que não cabe: lista por itens, tabela por linhas (cabeçalho repetido), texto por linhas.
function partir(b, d, hMax, largura, C, itens) {
  if (d.partirLista) {
    const lista = d.partirLista;
    for (let k = lista.itens.length - 1; k >= 1; k--) {
      const a = desenharBloco({ ...b, itensParte: lista.itens.slice(0, k) }, largura, C, itens);
      if (a.h <= hMax) return [{ ...b, itensParte: lista.itens.slice(0, k) }, { ...b, titulo: b.titulo ? `${b.titulo} (continuação)` : '', itensParte: lista.itens.slice(k), continuacao: true }];
    }
  }
  if (d.partirTabela) {
    const { linhas } = d.partirTabela;
    for (let k = linhas.length - 1; k >= 1; k--) {
      const a = desenharBloco({ ...b, linhasParte: linhas.slice(0, k) }, largura, C, itens);
      if (a.h <= hMax) return [{ ...b, linhasParte: linhas.slice(0, k) }, { ...b, titulo: b.titulo ? `${b.titulo} (continuação)` : '', linhasParte: linhas.slice(k), continuacao: true }];
    }
  }
  return null;
}

// ---- Moldura de página -----------------------------------------------------------------------------------------
function logoPrims(C, x, y, alturaMax, larguraMax, { sobreEscuro = false } = {}) {
  const id = C.identidade;
  const logo = sobreEscuro && id.logoClaro ? id.logoClaro : id.logo;
  if (!logo) return { prims: [], w: 0, h: 0 };
  const r = logo.w / logo.h;
  let h = alturaMax, w = h * r;
  if (w > larguraMax) { w = larguraMax; h = w / r; }
  const prims = [];
  // Logo escuro sobre fundo escuro: um selo claro atrás (o logo nunca é recolorido nem distorcido).
  if (sobreEscuro && !id.logoClaro) { const p = h * 0.28; prims.push({ t: 'rect', x: x - p, y: y - p, w: w + p * 2, h: h + p * 2, r: C.T.cantos + 2, fill: '#FFFFFF', papel: 'selo_logo' }); }
  prims.push({ t: 'image', x, y, w, h, href: logo.dataUrl, nw: logo.w, nh: logo.h, ajuste: 'contain', papel: 'logo' });
  return { prims, w, h };
}

function rodape(C, numero, total, { escuro = false } = {}) {
  const { M, w, h, tip, T } = C;
  const cor = escuro ? T.sobrePrimaria : T.suave;
  const y = h - M * 0.55 - tip.legenda * 1.2;
  const prims = [{ t: 'line', x1: M, y1: y - tip.legenda * 0.7, x2: w - M, y2: y - tip.legenda * 0.7, cor: escuro ? T.primaria : T.linha, sw: 1, papel: 'rodape' }];
  const esquerda = [C.identidade.empresa, C.plano.rotulo].filter(Boolean).join(' · ');
  const e = texto(esquerda, { familia: T.fonteCorpo, peso: 400, tam: tip.legenda, cor, largura: (w - 2 * M) * 0.7, lh: 1.2, papel: 'rodape' });
  prims.push(caixa(e.prim, M, y));
  if (total > 1) { const n = texto(ROTULO_PAGINA.pt(numero, total), { familia: T.fonteCorpo, peso: 600, tam: tip.legenda, cor, largura: (w - 2 * M) * 0.25, lh: 1.2, alin: 'end', papel: 'rodape' }); prims.push(caixa(n.prim, w - M - (w - 2 * M) * 0.25, y)); }
  return { prims, topo: y - tip.legenda * 0.7 - tip.corpo * 0.6 };
}

function cabecalhoConteudo(C, pg) {
  const { M, w, tip, T } = C;
  const prims = [];
  const lg = logoPrims(C, 0, 0, tip.h1 * 1.05, (w - 2 * M) * 0.2);
  const reservaLogo = lg.w ? lg.w + tip.corpo * 1.5 : 0;
  let y = M;
  if (pg.titulo) {
    prims.push({ t: 'rect', x: M, y, w: tip.corpo * 2.6, h: Math.max(3, tip.corpo * 0.26), fill: T.primaria, papel: 'decoracao' });
    y += Math.max(3, tip.corpo * 0.26) + tip.corpo * 0.7;
    const t = texto(pg.titulo, { familia: T.fonteTitulos, peso: 700, tam: tip.h1, cor: T.texto, largura: w - 2 * M - reservaLogo, lh: 1.15, papel: 'h1', maxLinhas: 2, minimo: tip.h2 });
    prims.push(caixa(t.prim, M, y)); y += t.h;
  }
  if (pg.subtitulo) {
    y += tip.corpo * 0.4;
    const s = texto(pg.subtitulo, { familia: T.fonteCorpo, peso: 400, tam: tip.h3, cor: T.suave, largura: w - 2 * M - reservaLogo, lh: 1.35, papel: 'subtitulo' });
    prims.push(caixa(s.prim, M, y)); y += s.h;
  }
  if (lg.w) prims.push(...mover(lg.prims, w - M - lg.w, M));
  return { prims, fim: Math.max(y, lg.h ? M + lg.h : 0) + (pg.titulo || pg.subtitulo ? tip.corpo * 1.3 : 0) };
}

// ---- Distribuição dos blocos numa área ---------------------------------------------------------------------------
// Empilha; na página larga, um bloco visual grande e texto curto ficam lado a lado; com 'duas_colunas', equilibra.
function distribuir(blocos, area, C, itens, assets, layout) {
  const gap = C.gap;
  const medir = (b, larg, livre) => desenharBloco(b, larg, C, itens, { alturaLivre: livre, assets });
  const visuais = new Set(['grafico', 'tabela', 'diagrama', 'imagem', 'linha_tempo']);
  const larga = area.w > area.h * 1.25;
  const colunas = C.op.colunas || (layout === 'duas_colunas' ? 2 : null);
  const empilhar = (bs, x, y, larg, hMax) => {
    const out = [];
    // Gráfico e imagem são flexíveis: dividem o que sobra depois dos blocos de altura fixa.
    const fixos = bs.filter(b => !['grafico', 'imagem'].includes(b.tipo)).map(b => medir(b, larg, null).h);
    const nFlex = bs.length - fixos.length;
    const livre = nFlex ? Math.max(C.tip.corpo * 8, (hMax - fixos.reduce((a, b) => a + b, 0) - gap * (bs.length - 1)) / nFlex) : null;
    let yy = y;
    for (const b of bs) { const d = medir(b, larg, livre); out.push({ b, d, x, y: yy, w: larg }); yy += d.h + gap; }
    return { itens: out, h: yy - y - (bs.length ? gap : 0) };
  };
  // Lado a lado: um visual dominante + o resto (ou duas colunas equilibradas).
  const ladoALado = () => {
    const v = blocos.filter(b => visuais.has(b.tipo)), t = blocos.filter(b => !visuais.has(b.tipo));
    if (v.length === 1 && t.length >= 1 && colunas !== 2) {
      const wv = (area.w - gap * 1.4) * 0.58, wt = area.w - gap * 1.4 - wv;
      const a = empilhar(v, area.x, area.y, wv, area.h), b = empilhar(t, area.x + wv + gap * 1.4, area.y, wt, area.h);
      return { itens: [...a.itens, ...b.itens], h: Math.max(a.h, b.h) };
    }
    const wc = (area.w - gap * 1.4) / 2;
    const alt = blocos.map(b => medir(b, wc, null).h);
    let melhor = 1, dif = Infinity;
    for (let k = 1; k < blocos.length; k++) { const e = alt.slice(0, k).reduce((a, b) => a + b, 0), d = alt.slice(k).reduce((a, b) => a + b, 0); if (Math.abs(e - d) < dif) { dif = Math.abs(e - d); melhor = k; } }
    const a = empilhar(blocos.slice(0, melhor), area.x, area.y, wc, area.h), b = empilhar(blocos.slice(melhor), area.x + wc + gap * 1.4, area.y, wc, area.h);
    return { itens: [...a.itens, ...b.itens], h: Math.max(a.h, b.h) };
  };
  const pilha = empilhar(blocos, area.x, area.y, area.w, area.h);
  if (blocos.length >= 2 && (colunas === 2 || (larga && colunas !== 1 && (pilha.h > area.h || (blocos.some(b => visuais.has(b.tipo)) && blocos.length <= 3 && pilha.h > area.h * 0.7))))) {
    const lado = ladoALado();
    if (lado.h <= area.h || lado.h < pilha.h) return lado;
  }
  return pilha;
}

function colocar(pagina, distrib, C) {
  for (const { b, d, x, y, w } of distrib.itens) {
    pagina.prims.push(...mover(d.prims, x, y));
    pagina.blocos.push({ id: b.id, tipo: b.tipo, refs: b.refs || [], x, y, w, h: d.h, placeholder: !!d.placeholder, continuacao: !!b.continuacao });
  }
}

const novaPagina = (C, extra = {}) => ({ w: C.w, h: C.h, fundo: C.T.fundo, prims: [], blocos: [], ...extra });

// ---- Páginas por papel --------------------------------------------------------------------------------------------
function capa(C, pg, itens, assets) {
  const { M, w, h, tip, T } = C;
  const p = novaPagina(C, { papel: 'capa' });
  const retrato = h > w;
  const heroi = assets.heroi;
  const painelW = retrato ? w : heroi ? w * 0.58 : w, painelH = retrato ? (heroi ? h * 0.58 : h) : h;
  p.prims.push({ t: 'rect', x: 0, y: 0, w: painelW, h: painelH, fill: T.primaria, papel: 'fundo_capa' });
  if (heroi) {
    const ix = retrato ? 0 : painelW, iy = retrato ? painelH : 0, iw = retrato ? w : w - painelW, ih = retrato ? h - painelH : h;
    p.prims.push({ t: 'image', x: ix, y: iy, w: iw, h: ih, href: heroi.dataUrl, nw: heroi.w, nh: heroi.h, ajuste: 'cover', papel: 'imagem', assetId: heroi.id || null });
    p.blocos.push({ id: 'heroi', tipo: 'imagem', refs: [], x: ix, y: iy, w: iw, h: ih, sangria: true });
  } else {
    // Sem imagem: composição geométrica discreta (decoração, não informação).
    const r = Math.min(w, h) * 0.34;
    p.prims.push({ t: 'circle', cx: painelW - r * 0.2, cy: r * 0.15, r, fill: T.secundaria, papel: 'decoracao', opacidade: 0.28 });
    p.prims.push({ t: 'rect', x: painelW - M - tip.corpo * 4, y: painelH - M * 0.8 - tip.corpo * 0.3, w: tip.corpo * 4, h: Math.max(4, tip.corpo * 0.3), fill: T.destaque, papel: 'decoracao' });
  }
  const lg = logoPrims(C, M, M, tip.h1 * 1.2, painelW * 0.35, { sobreEscuro: true });
  p.prims.push(...lg.prims);
  const larg = painelW - 2 * M;
  const kicker = texto(C.plano.rotulo.toUpperCase(), { familia: T.fonteCorpo, peso: 700, tam: tip.legenda * 1.05, cor: T.sobrePrimaria, largura: larg, lh: 1.2, papel: 'kicker' });
  const tt = texto(pg.titulo || C.plano.rotulo, { familia: T.fonteTitulos, peso: 700, tam: tip.display, cor: T.sobrePrimaria, largura: larg * 0.95, lh: 1.08, papel: 'display', maxLinhas: 4, minimo: tip.h1 });
  const st = pg.subtitulo ? texto(pg.subtitulo, { familia: T.fonteCorpo, peso: 400, tam: tip.h3 * 1.05, cor: T.sobrePrimaria, largura: larg * 0.9, lh: 1.4, papel: 'subtitulo' }) : null;
  const blocoH = kicker.h + tip.corpo * 0.9 + tt.h + (st ? tip.corpo * 1.1 + st.h : 0);
  let y = Math.max(M + lg.h + tip.corpo * 2, painelH - M * 1.4 - blocoH - tip.legenda * 3);
  p.prims.push(caixa(kicker.prim, M, y)); y += kicker.h + tip.corpo * 0.9;
  p.prims.push(caixa(tt.prim, M, y)); y += tt.h;
  if (st) { y += tip.corpo * 1.1; p.prims.push(caixa(st.prim, M, y)); y += st.h; }
  p.blocos.push({ id: 'capa', tipo: 'capa', refs: pg.refs || [], x: M, y: M, w: larg, h: y - M });
  const base = [C.identidade.empresa, C.op.data].filter(Boolean).join(' · ');
  if (base) {
    const b = texto(base, { familia: T.fonteCorpo, peso: 600, tam: tip.legenda, cor: retrato && heroi ? T.texto : T.sobrePrimaria, largura: larg, lh: 1.2, papel: 'rodape' });
    p.prims.push(caixa(b.prim, M, retrato && heroi ? h - M - b.h : painelH - M * 0.8 - b.h));
  }
  return p;
}

// Peça de impacto (post, anúncio, cartaz, slide de carrossel): título forte, pouco texto, chamada. Fundo na cor
// principal na capa e no fechamento; claro nas páginas de conteúdo (leitura).
function destaque(C, pg, itens, assets, { numero, total }) {
  const { M, w, h, tip, T } = C;
  const escuro = pg.papel !== 'conteudo' || total === 1;
  const fundo = escuro ? T.primaria : T.fundo, corTexto = escuro ? T.sobrePrimaria : T.texto;
  const p = novaPagina(C, { papel: pg.papel, fundo });
  p.prims.push({ t: 'rect', x: 0, y: 0, w, h, fill: fundo, papel: 'fundo' });
  const heroi = numero === 1 ? assets.heroi : null;
  let topo = M;
  // Imagem final: a imagem ocupa a peça inteira; o texto fica sobre uma faixa escura translúcida (legível).
  if (heroi && C.plano.imagemFinal) {
    p.prims.push({ t: 'image', x: 0, y: 0, w, h, href: heroi.dataUrl, nw: heroi.w, nh: heroi.h, ajuste: 'cover', papel: 'imagem', assetId: heroi.id || null });
    p.blocos.push({ id: 'heroi', tipo: 'imagem', refs: [], x: 0, y: 0, w, h, sangria: true });
    p.prims.push({ t: 'rect', x: 0, y: h * 0.38, w, h: h * 0.62, fill: T.primaria, opacidade: 0.82, papel: 'fundo' });
    topo = h * 0.38 + M * 0.6;
  } else if (heroi) {
    const ih = h * 0.42;
    p.prims.push({ t: 'image', x: 0, y: 0, w, h: ih, href: heroi.dataUrl, nw: heroi.w, nh: heroi.h, ajuste: 'cover', papel: 'imagem', assetId: heroi.id || null });
    p.blocos.push({ id: 'heroi', tipo: 'imagem', refs: [], x: 0, y: 0, w, h: ih, sangria: true });
    topo = ih + M * 0.8;
  }
  if (!escuro) p.prims.push({ t: 'rect', x: 0, y: 0, w, h: Math.max(6, tip.corpo * 0.35), fill: T.primaria, papel: 'decoracao' });
  const larg = w - 2 * M;
  const lg = logoPrims(C, M, 0, tip.corpo * 1.9, larg * 0.32, { sobreEscuro: escuro });
  const ind = total > 1 ? texto(`${numero}/${total}`, { familia: T.fonteCorpo, peso: 700, tam: tip.legenda, cor: escuro ? T.sobrePrimaria : T.primariaTexto, largura: larg * 0.3, lh: 1.2, alin: 'end', papel: 'rodape' }) : null;
  const baseH = Math.max(lg.h, ind?.h || 0);
  const fundoY = h - M - baseH;
  // Conteúdo: título + blocos, centrado verticalmente na área livre.
  const C2 = escuro ? { ...C, T: temaEscuro(T) } : C;
  const tt = pg.titulo ? texto(pg.titulo, { familia: T.fonteTitulos, peso: 700, tam: pg.papel === 'conteudo' && total > 1 ? tip.h1 : tip.display, cor: corTexto, largura: larg, lh: 1.08, papel: 'display', maxLinhas: 5, minimo: tip.h2 }) : null;
  const st = pg.subtitulo ? texto(pg.subtitulo, { familia: T.fonteCorpo, peso: 400, tam: tip.h3, cor: corTexto, largura: larg, lh: 1.35, papel: 'subtitulo' }) : null;
  const tituloH = (tt ? tt.h + tip.corpo * 1.2 : 0) + (st ? st.h + tip.corpo * 1.1 : 0);
  const area = { x: M, y: 0, w: larg, h: fundoY - topo - tip.corpo * 1.5 - tituloH };
  let dist = distribuir(pg.blocos, { ...area, y: 0 }, C2, itens, assets, 'uma_coluna'), Cb = C2;
  // Página de leitura rápida com pouco texto: o corpo cresce (em degraus), sem passar da área.
  if (C.op.preencher !== false && dist.h < area.h * 0.45) {
    for (const f of [1.45, 1.25, 1.1]) {
      const C3 = escalarCorpo(C2, f), d = distribuir(pg.blocos, { ...area, y: 0 }, C3, itens, assets, 'uma_coluna');
      if (d.h <= area.h * 0.7) { dist = d; Cb = C3; p.escalaCorpo = f; break; }
    }
  }
  const total_h = tituloH + dist.h;
  // Páginas de conteúdo de uma sequência (carrossel): o título fica sempre na mesma altura (leitura de uma página
  // para a outra); capa, fechamento e peça única: o conjunto centrado.
  const sequencia = !escuro && total > 1;
  let y = sequencia ? topo + (fundoY - topo) * 0.16 : Math.max(topo + (escuro ? 0 : tip.corpo), topo + (fundoY - topo - tip.corpo * 1.5 - total_h) / 2);
  if (sequencia && y + total_h > fundoY - tip.corpo * 1.5) y = Math.max(topo + tip.corpo, fundoY - tip.corpo * 1.5 - total_h);
  if (tt) { p.prims.push(caixa(tt.prim, M, y)); p.blocos.push({ id: `titulo_${numero}`, tipo: 'titulo', refs: pg.refs || [], x: M, y, w: larg, h: tt.h }); y += tt.h + tip.corpo * 1.2; }
  if (st) { p.prims.push(caixa(st.prim, M, y)); y += st.h + tip.corpo * 1.1; }
  colocar(p, { itens: dist.itens.map(x => ({ ...x, y: x.y + y })) }, Cb);
  p.prims.push(...mover(lg.prims, 0, fundoY + (baseH - lg.h)));
  if (ind) p.prims.push(caixa(ind.prim, w - M - larg * 0.3, fundoY + (baseH - ind.h)));
  p.areaUtil = { x: M, y: topo, w: larg, h: fundoY - topo };
  return p;
}
// Tema sobre a cor principal (capa, fechamento, peça de impacto): texto e formas claros, cartões um tom acima.
export function temaEscuro(T) {
  const claro = T.sobrePrimaria;
  return { ...T, fundo: T.primaria, texto: claro, suave: claro, primaria: claro, sobrePrimaria: T.primaria, primariaTexto: claro,
    superficie: misturar(T.primaria, claro, 0.12), superficie2: misturar(T.primaria, claro, 0.22), linha: misturar(T.primaria, claro, 0.35),
    serie: [claro, T.destaque, misturar(claro, T.primaria, 0.4), T.secundaria] };
}

// Escala do corpo de uma página (os títulos de página ficam iguais em todas): página de pouco conteúdo ganha texto
// maior, em degraus fixos, para não ficar um slide vazio com letra miúda.
export const escalarCorpo = (C, f) => (f === 1 ? C : { ...C, gap: C.gap * f, tip: { ...C.tip, corpo: C.tip.corpo * f, legenda: C.tip.legenda * f, tabela: C.tip.tabela * f, h3: C.tip.h3 * f, h2: C.tip.h2 * f, kpi: C.tip.kpi * f } });
function conteudoPagina(C, pg, itens, assets, { numero, total }) {
  const p = novaPagina(C, { papel: pg.papel });
  const cab = cabecalhoConteudo(C, pg);
  p.prims.push(...cab.prims);
  const rd = rodape(C, numero, total);
  p.prims.push(...rd.prims);
  const area = { x: C.M, y: cab.fim, w: C.w - 2 * C.M, h: rd.topo - cab.fim };
  p.areaUtil = area;
  let dist = distribuir(pg.blocos, area, C, itens, assets, pg.layout), Cp = C;
  if (C.op.preencher !== false && dist.h < area.h * 0.5) {
    for (const f of [1.5, 1.3, 1.15]) {
      const C2 = escalarCorpo(C, f), d2 = distribuir(pg.blocos, area, C2, itens, assets, pg.layout);
      if (d2.h <= area.h * 0.82) { dist = d2; Cp = C2; p.escalaCorpo = f; break; }
    }
  }
  // Pouco conteúdo: o bloco fica no terço superior do espaço livre (não colado no título nem solto no meio).
  const folga = dist.h < area.h * 0.8 ? (area.h - dist.h) * 0.28 : 0;
  colocar(p, { itens: dist.itens.map(x => ({ ...x, y: x.y + folga })) }, Cp);
  return p;
}

// Página única com vários blocos: faixa de título, indicadores e painéis em colunas (alvenaria).
// Página única: se o conteúdo ocupa pouco da área, o corpo cresce em degraus (como nos slides), sem passar dela.
function painel(C, pg, itens, assets) {
  const base = painel_(C, pg, itens, assets);
  if (C.op.preencher === false || base.ocupacao >= 0.55) return base;
  for (const f of [1.5, 1.3, 1.15]) {
    const p = painel_(escalarCorpo(C, f), pg, itens, assets, C);
    if (p.ocupacao <= 0.9) { p.escalaCorpo = f; return p; }
  }
  return base;
}
function painel_(C, pg, itens, assets, C0 = C) {
  const { M, w, h, T } = C;
  const tip = C0.tip === C.tip ? C.tip : { ...C.tip, h1: C0.tip.h1, h3: C0.tip.h3, display: C0.tip.display };
  const p = novaPagina(C, { papel: 'conteudo' });
  // Faixa de título na cor principal.
  const lg = logoPrims(C, 0, 0, tip.h1 * 1.1, (w - 2 * M) * 0.22, { sobreEscuro: true });
  const larg = w - 2 * M - (lg.w ? lg.w + tip.corpo * 1.5 : 0);
  const tt = texto(pg.titulo || C.plano.rotulo, { familia: T.fonteTitulos, peso: 700, tam: tip.h1, cor: T.sobrePrimaria, largura: larg, lh: 1.15, papel: 'h1', maxLinhas: 2, minimo: tip.h2 });
  const st = pg.subtitulo ? texto(pg.subtitulo, { familia: T.fonteCorpo, peso: 400, tam: tip.h3, cor: T.sobrePrimaria, largura: larg, lh: 1.35, papel: 'subtitulo' }) : null;
  const faixaH = M * 0.8 + tt.h + (st ? tip.corpo * 0.5 + st.h : 0) + M * 0.7;
  p.prims.push({ t: 'rect', x: 0, y: 0, w, h: faixaH, fill: T.primaria, papel: 'faixa' });
  let y = M * 0.8;
  p.prims.push(caixa(tt.prim, M, y)); y += tt.h;
  if (st) { y += tip.corpo * 0.5; p.prims.push(caixa(st.prim, M, y)); }
  if (lg.w) p.prims.push(...mover(lg.prims, w - M - lg.w, (faixaH - lg.h) / 2));
  p.blocos.push({ id: 'cabecalho', tipo: 'titulo', refs: pg.refs || [], x: M, y: M * 0.8, w: larg, h: faixaH - M * 1.5 });
  const rd = rodape(C, 1, 1);
  p.prims.push(...rd.prims);
  const inicioCorpo = p.prims.length;
  const area = { x: M, y: faixaH + tip.corpo * 1.3, w: w - 2 * M, h: rd.topo - faixaH - tip.corpo * 1.3 };
  p.areaUtil = area;
  // Grupos: blocos da mesma seção ficam juntos num painel.
  const grupos = [];
  for (const b of pg.blocos) { const g = grupos.at(-1); if (g && g.secao === b.secao && b.secao) g.blocos.push(b); else grupos.push({ secao: b.secao, blocos: [b] }); }
  // Colunas pela largura legível; com dois ou mais gráficos, duas colunas (gráfico estreito demais não lê).
  const nAuto = Math.max(1, Math.min(3, Math.floor((area.w + C.gap) / (tip.corpo * 20 + C.gap))));
  const nCol = C.op.colunas || (grupos.filter(g => g.blocos.some(b => b.tipo === 'grafico')).length >= 2 ? Math.min(2, nAuto) : nAuto);
  const gap = C.gap, pad = tip.corpo * 0.9;
  const wCol = (area.w - gap * (nCol - 1)) / nCol;
  // Ocupa a largura toda: diagrama, linha do tempo, imagem, cartões, tabela larga, faixa de indicadores; gráfico só
  // quando a coluna fica estreita demais para ele (num painel largo, gráficos ficam lado a lado).
  const ehLargo = g => g.blocos.some(b => ['diagrama', 'linha_tempo', 'imagem', 'cartoes'].includes(b.tipo) || (b.tipo === 'grafico' && wCol < tip.corpo * 15)
    || (b.tipo === 'tabela' && (itens.get(b.refs[0])?.cabecalho?.length || 0) >= 4) || (b.tipo === 'indicadores' && (itens.get(b.refs[0])?.itens?.length || 0) >= 3 && wCol < tip.corpo * 14));
  let alturas = Array(nCol).fill(area.y);
  const desenharGrupo = (g, x, yy, larg_) => {
    const inner = larg_ - pad * 2;
    let hy = pad;
    const partes = [];
    for (const b of g.blocos) {
      // Título do bloco igual ao da página (peça de uma seção só): não repete.
      const bb = b.titulo && pg.titulo && b.titulo.toLowerCase() === pg.titulo.toLowerCase() ? { ...b, semTitulo: true } : b;
      const d = desenharBloco(bb, inner, { ...C, dentroPainel: true }, itens, { assets, alturaLivre: area.h - tip.corpo * 3 });
      partes.push({ b, d, y: hy }); hy += d.h + tip.corpo * 0.75;
    }
    const hh = hy - tip.corpo * 0.75 + pad;
    p.prims.push({ t: 'rect', x, y: yy, w: larg_, h: hh, r: T.cantos + 2, fill: T.superficie, papel: 'painel' });
    for (const q of partes) { p.prims.push(...mover(q.d.prims, x + pad, yy + q.y)); p.blocos.push({ id: q.b.id, tipo: q.b.tipo, refs: q.b.refs || [], x: x + pad, y: yy + q.y, w: inner, h: q.d.h, placeholder: !!q.d.placeholder }); }
    return hh;
  };
  for (const g of grupos) {
    if (ehLargo(g) || nCol === 1) {
      const topo = Math.max(...alturas);
      const hh = desenharGrupo(g, area.x, topo, area.w);
      alturas = Array(nCol).fill(topo + hh + gap);
    } else {
      const k = alturas.indexOf(Math.min(...alturas));
      const hh = desenharGrupo(g, area.x + k * (wCol + gap), alturas[k], wCol);
      alturas[k] += hh + gap;
    }
  }
  p.ocupacao = (Math.max(...alturas) - gap - area.y) / area.h;
  // Pouco conteúdo: o corpo desce para o terço superior do espaço livre (nunca colado no topo de uma página vazia).
  if (p.ocupacao < 0.6 && C0.op.preencher !== false) {
    const dy = (1 - p.ocupacao) * area.h * 0.22;
    p.prims = [...p.prims.slice(0, inicioCorpo), ...mover(p.prims.slice(inicioCorpo), 0, dy)];
    p.blocos = p.blocos.map(b => (b.id === 'cabecalho' ? b : { ...b, y: b.y + dy }));
  }
  return p;
}

// Fluxo contínuo (relatório, documento, proposta): os blocos correm pelas páginas; listas e tabelas são partidas
// entre páginas (cabeçalho da tabela repetido); um título nunca fica sozinho no fim da página.
function continuo(C, pg, itens, assets, paginasAntes) {
  const out = [];
  let fila = [...pg.blocos];
  let p = null, area = null, y = 0, pagina = 0;
  const abrir = () => {
    pagina++;
    p = novaPagina(C, { papel: 'continuo', origem: pg.id || null });
    const cab = cabecalhoConteudo(C, pagina === 1 ? pg : pg.repetirTitulo && pg.titulo ? { titulo: `${pg.titulo} (continuação)`, subtitulo: '' } : { titulo: '', subtitulo: '' });
    if (pagina > 1 && pg.tituloCorrido && !pg.repetirTitulo) { const t = texto(pg.tituloCorrido, { familia: C.T.fonteCorpo, peso: 600, tam: C.tip.legenda, cor: C.T.suave, largura: C.w - 2 * C.M, lh: 1.2, papel: 'cabecalho_corrido' }); p.prims.push(caixa(t.prim, C.M, C.M * 0.6)); }
    p.prims.push(...cab.prims);
    const topo = pagina === 1 ? cab.fim : Math.max(cab.fim, C.M + C.tip.corpo);
    area = { x: C.M, y: topo, w: C.w - 2 * C.M, h: 0 };
    p.areaUtil = area;
    y = topo;
    out.push(p);
  };
  abrir();
  // Altura do rodapé (o número da página é desenhado no fim, quando o total é conhecido).
  const fimUtil = () => rodape(C, 1, 2).topo;
  area.h = fimUtil() - area.y;
  let guarda = 0;
  while (fila.length && guarda++ < 400) {
    const b = fila.shift();
    const d = desenharBloco(b, area.w, C, itens, { assets, alturaLivre: Math.min(fimUtil() - y, C.h * 0.45) });
    const resta = fimUtil() - y;
    if (d.h <= resta) { p.prims.push(...mover(d.prims, area.x, y)); p.blocos.push({ id: b.id, tipo: b.tipo, refs: b.refs || [], x: area.x, y, w: area.w, h: d.h, continuacao: !!b.continuacao }); y += d.h + C.gap; continue; }
    const vazia = y === area.y;
    const partes = C.op.quebrar !== false ? partir(b, d, resta, area.w, C, itens) : null;
    if (partes && resta > C.tip.corpo * 6) { fila.unshift(...partes); continue; }
    if (!vazia) { abrir(); area.h = fimUtil() - area.y; fila.unshift(b); continue; }
    // Bloco maior que uma página inteira e que não se parte: fica (a conferência acusa o transbordo).
    const partes2 = C.op.quebrar !== false ? partir(b, d, resta, area.w, C, itens) : null;
    if (partes2) { fila.unshift(...partes2); continue; }
    p.prims.push(...mover(d.prims, area.x, y)); p.blocos.push({ id: b.id, tipo: b.tipo, refs: b.refs || [], x: area.x, y, w: area.w, h: d.h });
    y += d.h + C.gap;
  }
  // Título de bloco que ficou sozinho no fim da página: o desenho já leva o título junto com o corpo do bloco.
  void paginasAntes;
  return out;
}

function fechamento(C, pg, itens, assets, { numero, total }) {
  if (C.plano.impacto) return destaque(C, { ...pg, papel: 'fechamento' }, itens, assets, { numero, total });
  const { M, w, h, tip, T } = C;
  const p = novaPagina(C, { papel: 'fechamento' });
  p.prims.push({ t: 'rect', x: 0, y: 0, w, h, fill: T.primaria, papel: 'fundo' });
  const C2 = { ...C, T: temaEscuro(T) };
  const larg = w - 2 * M;
  const tt = pg.titulo ? texto(pg.titulo, { familia: T.fonteTitulos, peso: 700, tam: tip.h1 * 1.1, cor: T.sobrePrimaria, largura: larg * 0.8, lh: 1.12, alin: 'start', papel: 'h1', maxLinhas: 3, minimo: tip.h2 }) : null;
  const dist = distribuir(pg.blocos, { x: M, y: 0, w: larg * 0.8, h: h * 0.6 }, C2, itens, assets, 'uma_coluna');
  const totalH = (tt ? tt.h + tip.corpo * 1.2 : 0) + dist.h;
  let y = (h - totalH) / 2;
  if (tt) { p.prims.push(caixa(tt.prim, M, y)); y += tt.h + tip.corpo * 1.2; }
  colocar(p, { itens: dist.itens.map(x => ({ ...x, y: x.y + y })) }, C2);
  const lg = logoPrims(C, M, h - M - tip.h1, tip.h1, larg * 0.3, { sobreEscuro: true });
  p.prims.push(...lg.prims);
  p.areaUtil = { x: M, y: M, w: larg, h: h - 2 * M - tip.h1 };
  void numero; void total;
  return p;
}

// ---- Composição ----------------------------------------------------------------------------------------------------
export function compor({ plano, conteudo, identidade, assets = {}, opcoes = {} }) {
  const C = contexto(plano, identidade, opcoes);
  const itens = itensPorId(conteudo);
  const paginas = [];
  const tituloCorrido = plano.paginas.find(p => p.papel === 'capa')?.titulo || plano.paginas[0]?.titulo || '';
  const totalPrevisto = plano.paginas.length;
  plano.paginas.forEach((pg, i) => {
    const n = { numero: paginas.length + 1, total: totalPrevisto }, antes = paginas.length;
    if (pg.papel === 'capa' || pg.layout === 'capa') paginas.push(plano.impacto ? destaque(C, { ...pg, papel: 'capa' }, itens, assets, n) : capa(C, pg, itens, assets));
    else if (pg.papel === 'fechamento') paginas.push(fechamento(C, pg, itens, assets, n));
    else if (pg.layout === 'continuo') paginas.push(...continuo(C, { ...pg, tituloCorrido }, itens, assets, paginas.length));
    else if (pg.layout === 'destaque' || plano.impacto) paginas.push(destaque(C, pg, itens, assets, n));
    else if (pg.layout === 'painel' || !plano.multipagina) paginas.push(painel(C, pg, itens, assets));
    else paginas.push(conteudoPagina(C, pg, itens, assets, n));
    for (let k = antes; k < paginas.length; k++) Object.assign(paginas[k], { origem: pg.id, papelPlano: pg.papel, impacto: !!(plano.impacto || pg.layout === 'destaque') });
    void i;
  });
  // Numeração final (o fluxo contínuo pode ter criado páginas): refaz o número nas páginas de conteúdo.
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.numero = i + 1;
    if (p.papel === 'continuo') {
      const rd = rodape(C, i + 1, total);
      p.prims.push(...rd.prims);
    } else if (total !== totalPrevisto) {
      for (const pr of p.prims) if (pr.papel === 'rodape' && pr.t === 'text' && /^\d+ \/ \d+$/.test(pr.linhas?.[0] || '')) pr.linhas = [ROTULO_PAGINA.pt(i + 1, total)];
      for (const pr of p.prims) if (pr.t === 'text' && /^\d+\/\d+$/.test(pr.linhas?.[0] || '')) pr.linhas = [`${i + 1}/${total}`];
    }
  });
  return { paginas, contexto: { M: C.M, tip: C.tip, tema: C.T } };
}
