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
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
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
  return { w: vp1.width, h: vp1.height, fundo, itens };
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
      paginas.push({ ...p, fundo: Buffer.from(p.fundo.split(',')[1], 'base64') });
    }
    // Tamanho do texto corrido do documento inteiro (num slide só de título, o título não é texto corrido).
    const corrido = tamanhoCorrido(paginas.flatMap(p => p.itens));
    for (const [k, p] of paginas.entries()) { p.blocos = agrupar(p.itens, k + 1, { corrido }); delete p.itens; }
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
export function agrupar(itens, pagina = 1, { corrido: corridoDoc } = {}) {
  // Palavra com espaçamento entre letras ("C O N T E X T O") vem num item só: volta a ser a palavra, marcada.
  // Marcador de lista em fonte de símbolos (Wingdings, OpenSymbol) vem como caractere de uso privado: vira "•".
  const ord = [...itens].map(i => { const t0 = /^[\uE000-\uF8FF]\s*$/.test(i.s) ? '•' : i.s.replace(/^[\uE000-\uF8FF](?=\s)/, '•'); const t = /^(\S )+\S$/.test(t0) ? t0.replace(/ /g, '') : t0; return { ...i, s: t, espacado: t !== t0, cor: CORES(i.cor) }; })
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
      l.s += (vao > i.tam * 0.18 && !/\s$/.test(l.s) && !/^\s/.test(i.s) ? ' ' : '') + i.s;
      // Um espaço solto não estende a linha até a próxima coluna (alguns PDFs desenham o espaço com a largura da célula).
      l.x1 = Math.max(l.x1, i.x + (i.s.trim() ? i.w : Math.min(i.w, i.tam * 0.4)));
      l.espaco = !i.s.trim();
      if (i.s.trim()) { l.pesos[`${i.fonte}|${i.cor}`] = (l.pesos[`${i.fonte}|${i.cor}`] || 0) + i.s.trim().length; l.espacado = l.espacado || i.espacado; }
    } else if (i.s.trim()) linhas.push({ s: i.s, x: i.x, x1: i.x + i.w, y: i.y, tam: i.tam, pesos: { [`${i.fonte}|${i.cor}`]: i.s.trim().length }, espacado: i.espacado, primeiro: { s: i.s.trim(), fonte: i.fonte, cor: i.cor } });
  }
  for (const l of linhas) { [l.fonte, l.cor] = Object.entries(l.pesos).sort((a, b) => b[1] - a[1])[0][0].split('|'); l.s = l.s.replace(/\s+/g, ' ').trim().replace(/^• (?=[◦▪▫●○■□‣⁃✓✔☐☑➢➤►▶→]\s)/, ''); l.item = MARCADOR.test(l.s);
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

export function mensagensAdaptacao({ slides, contexto, pedido }) {
  const modelo = slides.map(p => `Slide ${p.numero}:\n${p.blocos.map(b => `${b.id} [${Math.round(b.x ?? 0)}, ${Math.round(b.y ?? 0)}] (máx. ${LIMITE(b.texto)}): ${b.texto}`).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: INSTRUCAO },
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
  return fatos;
}
export function mensagensFatos({ slides, textos, pedido, contexto, faltam }) {
  const atual = slides.map(p => `Slide ${p.numero}:\n${p.blocos.map(b => `${b.id} [${Math.round(b.x ?? 0)}, ${Math.round(b.y ?? 0)}] (máx. ${LIMITE(b.texto)}): ${textos[b.id] ?? b.texto}`).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: `${INSTRUCAO}\n\nA apresentação abaixo já foi adaptada, mas estes dados do pedido da pessoa não aparecem em nenhum slide: ${faltam.join('; ')}. Ajuste os blocos necessários para que TODOS apareçam no lugar certo, coerentes com o resto (por exemplo: um slide de agenda que sobrou passa a tratar do outro dia; dois eventos do mesmo dia ficam no mesmo slide; o cronograma e a capa usam as mesmas datas). Responda só com os ids que mudam.` },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${String(contexto || '').slice(-30000)}\n</material>\n\nApresentação adaptada (texto atual de cada bloco):\n\n${atual}` },
  ];
}
// Rótulo em maiúsculas que voltou sem os espaços entre as palavras ("MÉTODODETRABALHO", depois de juntar letras
// espaçadas): as palavras são separadas de novo com o vocabulário do modelo, do material e do pedido.
const LIGA = ['DE', 'DO', 'DA', 'DOS', 'DAS', 'E', 'O', 'A', 'OS', 'AS', 'É', 'EM', 'NO', 'NA', 'QUE', 'COM', 'POR', 'PARA', 'AO', 'SEM', 'UM', 'UMA'];
export function separarPalavras(texto, vocab) {
  return String(texto || '').replace(/(?<![\p{L}])[\p{Lu}]{5,}(?![\p{L}])/gu, tok => {
    if (vocab.has(tok)) return tok;
    // Menor número de palavras que cobre o trecho inteiro (programação dinâmica).
    const n = tok.length, melhor = Array(n + 1).fill(null);
    melhor[0] = [];
    for (let i = 0; i < n; i++) {
      if (!melhor[i]) continue;
      for (let j = i + 1; j <= n; j++) {
        const w = tok.slice(i, j);
        if (vocab.has(w) && (w.length > 1 || LIGA.includes(w)) && (!melhor[j] || melhor[j].length > melhor[i].length + 1)) melhor[j] = [...melhor[i], w];
      }
    }
    return melhor[n] && melhor[n].length > 1 ? melhor[n].join(' ') : tok;
  });
}
export const vocabulario = (...textos) => new Set([...LIGA, ...textos.flatMap(t => String(t || '').toUpperCase().match(/\p{L}+/gu) || [])]);
const lerJson = t => { const m = /\{[\s\S]*\}/.exec(String(t || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

// Em partes de até ~8 slides (respostas menores e conferíveis). Devolve { textos: {id: texto}, faltando: [ids], custo }.
export async function adaptarModelo({ paginas, contexto, pedido, chamar, porParte = 8, simultaneas = 3, etapa = () => {}, hoje = new Date() }) {
  const textos = {}, faltando = [], longos = [];
  const original = new Map(paginas.flatMap(p => p.blocos.map(b => [b.id, b.texto])));
  const limite = id => LIMITE(original.get(id) || '');
  let custo = 0, economia = 0, prontas = 0;
  // Fora da adaptação: números puros (página, passo, item) ficam como estão; texto que se repete em 3 ou mais
  // slides (rodapé, nome do documento) vai uma vez só e a resposta vale para todas as ocorrências.
  const vezes = new Map();
  for (const p of paginas) for (const b of p.blocos) vezes.set(b.texto, (vezes.get(b.texto) || 0) + 1);
  const primeiro = new Map(), repetidos = [];
  const fica = b => /^\s*[\d.·/\s-]{1,6}\s*$/.test(b.texto);
  const slides = paginas.map((p, i) => ({ numero: i + 1, blocos: p.blocos.filter(b => {
    if (fica(b)) return false;
    if (vezes.get(b.texto) >= 3) { if (primeiro.has(b.texto)) { repetidos.push([b.id, primeiro.get(b.texto)]); return false; } primeiro.set(b.texto, b.id); }
    return true;
  }) }));
  const partes = [];
  for (let i = 0; i < slides.length; i += porParte) partes.push(slides.slice(i, i + porParte).filter(s => s.blocos.length));
  etapa(`Adaptando ${slides.length} slides ao novo projeto…`);
  // Partes em paralelo (até 3 por vez): uma apresentação longa não deixa a pessoa esperando parte por parte.
  const fila = partes.filter(p => p.length);
  const trabalhar = async () => { for (let parte = fila.shift(); parte; parte = fila.shift()) {
    const ids = parte.flatMap(s => s.blocos.map(b => b.id));
    // A melhor resposta (mais ids) vale; menos de 80% dos ids pede de novo, uma vez.
    let r = null, n = -1;
    for (let tentativa = 0; tentativa < 2 && n < ids.length * 0.8; tentativa++) {
      const x = await chamar(mensagensAdaptacao({ slides: parte, contexto, pedido }));
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
      if (typeof r?.[id] === 'string' && (r[id].trim() || r[id] === '')) { textos[id] = r[id].replace(/\s+/g, ' ').trim(); if (viciosDeEscrita(textos[id]).includes('letras separadas')) textos[id] = juntarLetrasEspacadas(textos[id]); textos[id] = limparVicios(textos[id]); if (textos[id].length > limite(id) * 1.3 || viciosDeEscrita(textos[id]).length || (!textos[id] && (original.get(id) || '').length > 40)) longos.push(id); }
      else faltando.push(id);
    }
    prontas++; etapa(`Adaptando os slides… ${prontas} de ${partes.length} partes prontas`);
  } };
  await Promise.all(Array.from({ length: Math.min(simultaneas, fila.length) }, trabalhar));
  // Blocos que a IA pulou: mais uma rodada só com eles (os slides vão com o texto já adaptado, para manter o sentido).
  // Texto bem mais longo que o espaço (passou 30% do máximo) também volta, pedindo para respeitar o limite.
  if (faltando.length || longos.length) {
    const falta = new Set([...faltando, ...longos]);
    const resto = slides.map(s => ({ numero: s.numero, blocos: s.blocos.filter(b => falta.has(b.id)) })).filter(s => s.blocos.length);
    await Promise.all(Array.from({ length: Math.ceil(resto.length / (porParte * 2)) }, async (_, k) => {
      const parte = resto.slice(k * porParte * 2, (k + 1) * porParte * 2);
      try {
        const aviso = longos.length ? '\n\nAtenção: cada texto precisa caber no espaço do bloco (respeite o máximo de caracteres indicado em cada um) e seguir as regras de escrita, sem os vícios de texto de IA. Parágrafo, descrição e título nunca ficam vazios.' : '';
        const x = await chamar(mensagensAdaptacao({ slides: parte, contexto, pedido: `${pedido || ''}${aviso}` }));
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
  let faltam = fatosDoPedido(pedido).filter(f => !f.presente(todosOsTextos()));
  if (faltam.length) {
    etapa('Conferindo se todos os dados do pedido estão nos slides…');
    try {
      const x = await chamar(mensagensFatos({ slides, textos, pedido, contexto, faltam: faltam.map(f => f.texto) }));
      custo += x.custo || 0; economia += x.economia || 0;
      const j = lerJson(x.texto) || {};
      for (const s of slides) for (const b of s.blocos) if (typeof j[b.id] === 'string') textos[b.id] = limparVicios(juntarLetrasEspacadas(j[b.id].replace(/\s+/g, ' ').trim()));
      faltam = faltam.filter(f => !f.presente(todosOsTextos()));
    } catch { /* fica a versão anterior */ }
  }
  // Linha de tabela que sobrou: se a primeira célula (horário, item) ficou vazia, a linha inteira sai.
  for (const p of paginas) {
    const linhas = [];
    for (const b of p.blocos) { const l = linhas.find(l => Math.abs(l.y - b.y) < b.tam * 0.6); if (l) l.blocos.push(b); else linhas.push({ y: b.y, blocos: [b] }); }
    for (const l of linhas) {
      if (l.blocos.length < 2) continue;
      const primeira = l.blocos.reduce((a, b) => (b.x < a.x ? b : a));
      if (textos[primeira.id] === '') for (const b of l.blocos) if (textos[b.id] !== undefined || !fica(b)) textos[b.id] = '';
    }
  }
  const vocab = vocabulario(...paginas.flatMap(p => p.blocos.map(b => b.texto)), contexto, pedido);
  for (const id of Object.keys(textos)) textos[id] = separarPalavras(textos[id], vocab);
  // Dia da semana que não bate com a data (o modelo dizia "segunda-feira" para outra data).
  for (const id of Object.keys(textos)) textos[id] = corrigirDiaDaSemana(textos[id], { hoje });
  // Rótulo que voltou com letras separadas (efeito visual, não texto): fica o do modelo, que o PowerPoint espaça.
  for (const id of Object.keys(textos)) if (viciosDeEscrita(textos[id]).includes('letras separadas')) textos[id] = original.get(id) ?? textos[id];
  for (const [id, de] of repetidos) if (textos[de] !== undefined) textos[id] = textos[de];
  return { textos, faltando, custo, economia, fatos_faltando: faltam.map(f => f.texto) };
}
