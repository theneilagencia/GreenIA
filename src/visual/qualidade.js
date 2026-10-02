// Etapa 5 da produção visual: CONFERÊNCIA (quality check) do artefato composto. Lê as páginas prontas (as mesmas
// primitivas que viram PNG e PDF) e o conteúdo, e aponta, com o código e a página:
//   visual:    dimensões, transbordo, corte, texto cortado, sobreposição, contraste, legibilidade, margens,
//              alinhamento, consistência, logo deformado ou ausente, densidade, hierarquia, repetição, asset ausente,
//              marca (cor proibida);
//   semântico: conteúdo faltando, dados incorretos (número que não está no conteúdo), páginas faltando e o que o
//              pedido exige que apareça (objetivo).
// "erro" reprova; "aviso" fica registrado e aparece para quem usa quando importa (ex.: espaço reservado de imagem).
import { FORMATOS } from './contrato.js';
import { contraste, corValida } from './marca.js';
import { carregarFonte, medir } from './fontes.js';
import { numerosDe, textoDoItem } from './conteudo.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plano = s => norm(s).replace(/[^a-z0-9%]+/g, ' ').trim();
// Texto que não é conteúdo: número dentro de marcador, escala de eixo, rodapé (empresa e número da página).
const DECORATIVOS = new Set(['marcador']);
const FORA_DO_DADO = new Set(['eixo', 'rodape', 'kicker', 'cabecalho_corrido', 'marcador']);

export const CODIGOS = {
  dimensoes: 'Dimensões da página diferentes do formato', transbordo: 'Conteúdo passou da área útil da página', corte: 'Elemento cortado pela borda da página',
  texto_cortado: 'Texto maior que a caixa dele', sobreposicao: 'Blocos sobrepostos', contraste: 'Contraste insuficiente entre texto e fundo',
  legibilidade: 'Texto pequeno demais para o formato', margem: 'Conteúdo fora das margens', alinhamento: 'Blocos desalinhados', consistencia: 'Tamanhos de texto inconsistentes entre páginas',
  logo_deformado: 'Logo com proporção alterada', logo_ausente: 'Logo da empresa não aparece', densidade: 'Texto demais para a área', hierarquia: 'Hierarquia de títulos invertida',
  repeticao: 'Texto repetido em várias partes', quebra: 'Palavra partida no meio por falta de espaço', asset_ausente: 'Imagem não fornecida (espaço reservado)', marca: 'Cor proibida pela marca',
  conteudo_faltando: 'Parte do conteúdo não aparece na peça', dados_incorretos: 'Número que não está no conteúdo', paginas: 'Número de páginas diferente do pedido', objetivo: 'O que o pedido exige não aparece na peça',
};

const dentro = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const caixaTexto = p => ({ x: p.x, y: p.y, w: p.w, h: p.linhas.length * p.lh });

// Fundo efetivo sob um ponto: a última forma preenchida desenhada antes do texto que contém o ponto.
function fundoSob(pagina, idx, px, py) {
  for (let i = idx - 1; i >= 0; i--) {
    const p = pagina.prims[i];
    if (p.opacidade !== undefined && p.opacidade < 0.9) continue;
    if (p.t === 'rect' && p.fill && p.fill !== 'none' && dentro(px, py, p)) return { cor: p.fill };
    if (p.t === 'circle' && p.fill && (px - p.cx) ** 2 + (py - p.cy) ** 2 <= p.r ** 2) return { cor: p.fill };
    if (p.t === 'image' && dentro(px, py, p)) return { imagem: true };
  }
  return { cor: pagina.fundo || '#FFFFFF' };
}

// Texto corrido de uma página (para cobertura e fidelidade): linhas partidas com hífen voltam a ser uma palavra.
const textoDe = prims => prims.filter(p => p.t === 'text').map(p => p.linhas.reduce((s, l) => (s.endsWith('-') && /^[a-zà-ú]/i.test(l) ? s.slice(0, -1) + l : s ? `${s} ${l}` : l), '')).join('\n');

export function conferirVisual({ paginas, plano: pl, conteudo, tr, identidade = null, exigidos = [], opcoes = {} }) {
  const falhas = [];
  const f = (codigo, gravidade, pagina, detalhe = '', extra = {}) => falhas.push({ codigo, grupo: ['conteudo_faltando', 'dados_incorretos', 'paginas', 'objetivo'].includes(codigo) ? 'semantico' : 'visual', gravidade, pagina, detalhe, ...extra });
  const fmt = FORMATOS[pl.formato];
  const minimo = fmt.minimo;
  const tamanhosPorPapel = new Map();
  for (const pg of paginas) {
    const n = pg.numero;
    if (Math.round(pg.w) !== fmt.w || Math.round(pg.h) !== fmt.h) f('dimensoes', 'erro', n, `${pg.w}x${pg.h} em vez de ${fmt.w}x${fmt.h}`);
    const area = pg.areaUtil || { x: 0, y: 0, w: pg.w, h: pg.h };
    const M = Math.min(pg.w, pg.h) * 0.03;
    // Blocos: transbordo da área útil e sobreposição.
    const blocos = pg.blocos.filter(b => !b.sangria && b.tipo !== 'capa');
    for (const b of blocos) {
      if (b.y + b.h > area.y + area.h + 1.5) f('transbordo', 'erro', n, `${b.tipo} passa ${Math.round(b.y + b.h - area.y - area.h)}px da área útil`, { bloco: b.id, excesso: b.y + b.h - area.y - area.h });
      if (b.x < -0.5 || b.x + b.w > pg.w + 0.5 || b.y < -0.5 || b.y + b.h > pg.h + 0.5) f('corte', 'erro', n, `${b.tipo} sai da página`, { bloco: b.id });
    }
    for (let i = 0; i < blocos.length; i++) for (let j = i + 1; j < blocos.length; j++) {
      const a = blocos[i], b = blocos[j], s = inter(a, b);
      if (s > 0.02 * Math.min(a.w * a.h, b.w * b.h) && s > 4) f('sobreposicao', 'erro', n, `${a.tipo} e ${b.tipo}`, { blocos: [a.id, b.id] });
    }
    pg.prims.forEach((p, idx) => {
      if (p.t === 'image' && p.papel === 'logo' && p.nw && p.nh) {
        // O desenho usa "contain": confere que a caixa leva a proporção natural (nunca esticado).
        const r = p.w / p.h, nat = p.nw / p.nh;
        if (Math.abs(r - nat) / nat > 0.02) f('logo_deformado', 'erro', n, `proporção ${r.toFixed(2)} em vez de ${nat.toFixed(2)}`);
      }
      if (p.t !== 'text') return;
      const fonte = carregarFonte(p.familia, p.peso);
      const caixa = caixaTexto(p);
      if (!DECORATIVOS.has(p.papel)) {
        if (caixa.x < -0.5 || caixa.x + caixa.w > pg.w + 0.5 || caixa.y < -0.5 || caixa.y + caixa.h > pg.h + 0.5) f('corte', 'erro', n, `texto "${p.linhas[0]?.slice(0, 30)}" sai da página`);
        else if (caixa.x < M || caixa.x + caixa.w > pg.w - M || caixa.y < M * 0.5 || caixa.y + caixa.h > pg.h - M * 0.5) f('margem', 'aviso', n, `texto "${p.linhas[0]?.slice(0, 30)}" encosta na borda`);
      }
      for (const l of p.linhas) if (medir(l, fonte, p.tam) > p.w + 1) { f('texto_cortado', 'erro', n, `"${l.slice(0, 30)}"`); break; }
      // Palavra partida à força: em título, número ou rótulo é erro (lê mal); em texto corrido, aviso.
      if (p.partidas) f('quebra', ['h1', 'h2', 'h3', 'display', 'kpi', 'kpi_rotulo', 'tabela_cabecalho', 'cta', 'subtitulo'].includes(p.papel) ? 'erro' : 'aviso', n, `"${p.linhas.find(l => l.endsWith('-'))?.slice(0, 30) || ''}"`);
      if (p.tam < minimo - 0.05 && !['eixo', 'marcador'].includes(p.papel)) f('legibilidade', 'erro', n, `texto de ${p.tam.toFixed(1)}px (mínimo ${minimo}px) em "${p.linhas[0]?.slice(0, 30)}"`);
      // Contraste: no começo e no meio da primeira linha.
      const pontos = [[caixa.x + 2, caixa.y + p.lh / 2], [caixa.x + Math.min(caixa.w, medir(p.linhas[0] || '', fonte, p.tam)) / 2, caixa.y + p.lh / 2]];
      if (p.alin === 'middle') pontos[0] = [caixa.x + caixa.w / 2, caixa.y + p.lh / 2];
      if (p.alin === 'end') pontos[0] = [caixa.x + caixa.w - 2, caixa.y + p.lh / 2];
      const grande = p.tam >= 24 || (p.tam >= 18.6 && p.peso >= 700);
      for (const [x, y] of pontos) {
        const fu = fundoSob(pg, idx, x, y);
        if (fu.imagem) { if (!['rodape'].includes(p.papel)) f('contraste', 'aviso', n, `texto sobre imagem: "${p.linhas[0]?.slice(0, 30)}"`); break; }
        const c = contraste(p.cor, fu.cor);
        if (c < (grande ? 3 : 4.5)) { f('contraste', 'erro', n, `${c.toFixed(2)}:1 em "${p.linhas[0]?.slice(0, 30)}"`, { prim: idx, fundo: fu.cor, minimo: grande ? 3 : 4.5 }); break; }
      }
      if (['h1', 'corpo', 'h2', 'display'].includes(p.papel)) {
        const k = `${p.papel}`;
        if (!tamanhosPorPapel.has(k)) tamanhosPorPapel.set(k, new Set());
        tamanhosPorPapel.get(k).add(Math.round(p.tam * 10) / 10);
      }
    });
    // Hierarquia: título da página maior que o texto de corpo.
    const t1 = Math.max(0, ...pg.prims.filter(p => p.t === 'text' && ['h1', 'display'].includes(p.papel)).map(p => p.tam));
    const corpoMax = Math.max(0, ...pg.prims.filter(p => p.t === 'text' && p.papel === 'corpo').map(p => p.tam));
    if (t1 && corpoMax && t1 <= corpoMax) f('hierarquia', 'erro', n, 'título não é maior que o texto');
    // Densidade: caracteres por área útil (peças de impacto toleram bem menos texto).
    const chars = pg.prims.filter(p => p.t === 'text' && !FORA_DO_DADO.has(p.papel)).reduce((t, p) => t + p.linhas.join(' ').length, 0);
    const limite = (area.w * area.h) / (fmt.corpo * fmt.corpo) * (pl.impacto ? 0.55 : 1.15);
    if (chars > limite) f('densidade', pl.impacto ? 'erro' : 'aviso', n, `${chars} caracteres para ~${Math.round(limite)}`);
    // Alinhamento: bordas esquerdas quase iguais (1 a 4 px) são desalinhamento.
    const xs = [...new Set(blocos.map(b => Math.round(b.x * 2) / 2))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0.6 && xs[i] - xs[i - 1] < 4) { f('alinhamento', 'aviso', n, `bordas em ${xs[i - 1]} e ${xs[i]}`); break; }
    if (pg.blocos.some(b => b.placeholder)) f('asset_ausente', 'aviso', n, 'imagem não fornecida: espaço reservado na peça');
  }
  // Consistência: o corpo de texto e os títulos com o mesmo tamanho em todas as páginas.
  // (o corpo pode crescer em degraus numa página de pouco conteúdo; mais que 1,6x de diferença é inconsistência)
  for (const [papel, set] of tamanhosPorPapel) { const v = [...set]; if (['corpo', 'h1'].includes(papel) && Math.max(...v) / Math.min(...v) > 1.6) f('consistencia', 'aviso', null, `${papel}: de ${Math.min(...v)} a ${Math.max(...v)}px`); }
  // Logo: a empresa tem logo e a peça não mostra.
  if (identidade?.logo && !paginas.some(pg => pg.prims.some(p => p.t === 'image' && p.papel === 'logo'))) f('logo_ausente', 'erro', null, 'a empresa tem logo cadastrado');
  // Marca: nenhuma cor proibida pela empresa.
  const proibidas = new Set((identidade?.coresProibidas || []).map(c => corValida(c)));
  if (proibidas.size) for (const pg of paginas) for (const p of pg.prims) for (const c of [p.fill, p.stroke, p.cor]) if (c && proibidas.has(corValida(c))) { f('marca', 'erro', pg.numero, `cor ${c}`); break; }
  // Repetição: o mesmo texto (longo) em três ou mais lugares.
  const vistos = new Map();
  for (const pg of paginas) for (const p of pg.prims) if (p.t === 'text' && !FORA_DO_DADO.has(p.papel) && !['h1', 'display'].includes(p.papel)) {
    const k = plano(p.linhas.join(' ')); if (k.length > 40) vistos.set(k, (vistos.get(k) || 0) + 1);
  }
  for (const [k, q] of vistos) if (q >= 3) { f('repeticao', 'aviso', null, `"${k.slice(0, 40)}" ${q} vezes`); break; }

  // ---- Semântico ----------------------------------------------------------------------------------------------
  const todos = paginas.flatMap(pg => pg.prims);
  const visivel = plano(textoDe(todos.filter(p => p.t === 'text')));
  const faltando = [];
  for (const s of conteudo.secoes) for (const it of s.itens) {
    const partes = it.tipo === 'lista' ? it.itens.map(x => x.texto) : it.tipo === 'tabela' ? [...it.cabecalho, ...it.linhas.flat()] : it.tipo === 'indicadores' ? it.itens.flatMap(x => [x.valor, x.rotulo]) : it.tipo === 'fluxo' ? it.nos.map(x => x.rotulo) : [it.texto];
    const ausentes = partes.filter(t => { const k = plano(t); return k && !visivel.includes(k.slice(0, 60)); });
    if (ausentes.length) faltando.push({ item: it.id, secao: s.id, exemplos: ausentes.slice(0, 2) });
  }
  if (faltando.length) f('conteudo_faltando', 'erro', null, faltando.map(x => `${x.item}: "${String(x.exemplos[0]).slice(0, 40)}"`).join('; '), { itens: faltando.map(x => x.item) });
  // Fidelidade: todo número na peça está no conteúdo (ou no título dado, ou na data do rodapé).
  const base = numerosDe([conteudo.titulo, ...conteudo.secoes.flatMap(s => [s.titulo, ...s.itens.map(textoDoItem)]), ...(opcoes.textosLivres || [])].join('\n'));
  const naPeca = numerosDe(textoDe(todos.filter(p => p.t === 'text' && !FORA_DO_DADO.has(p.papel))));
  const novos = [...naPeca].filter(x => !base.has(x));
  if (novos.length) f('dados_incorretos', 'erro', null, `números sem origem no conteúdo: ${novos.slice(0, 5).join(', ')}`);
  if (tr.paginas && paginas.length !== tr.paginas) f('paginas', paginas.length < tr.paginas ? 'erro' : 'aviso', null, `${paginas.length} páginas para ${tr.paginas} pedidas`, { esperado: tr.paginas, obtido: paginas.length });
  const exigFalta = exigidos.filter(x => { const r = plano(x).split(' ').filter(w => w.length >= 4).map(w => w.slice(0, 5)); return r.length && !r.some(w => visivel.includes(w)); });
  if (exigFalta.length) f('objetivo', 'erro', null, `não aparece: ${exigFalta.join(', ')}`, { termos: exigFalta });
  const erros = falhas.filter(x => x.gravidade === 'erro');
  return { ok: !erros.length, falhas, erros, avisos: falhas.filter(x => x.gravidade === 'aviso'), metricas: { paginas: paginas.length, caracteres: visivel.length } };
}
