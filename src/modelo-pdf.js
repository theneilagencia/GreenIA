// Apresentação enviada em PDF como MODELO: "monte a do novo cliente seguindo exatamente o mesmo layout". Três etapas:
//  1. leitura (navegador isolado, pdf.js): cada página vira um fundo SEM o texto (fotos, linhas, faixas e cores
//     exatamente como no original) e a lista de textos com posição, fonte, tamanho e cor;
//  2. blocos: os textos viram blocos (linhas da mesma fonte, tamanho, cor e alinhamento), cada um com o espaço que
//     ocupa no slide;
//  3. o PowerPoint: um slide por página, fundo + caixas de texto EDITÁVEIS na mesma posição, fonte, tamanho e cor.
// A troca do conteúdo (adaptarModelo) mantém a estrutura de cada slide e só usa o que o material da conversa traz.
import { comLeitorPdf, memoriaLivreMb } from './visual/chromium.js';
import { pdfLeveSeparado } from './pdf-leve.js';
import { REGRAS_DE_ESCRITA } from './escrita.js';

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
      paginas.push({ ...p, fundo: Buffer.from(p.fundo.split(',')[1], 'base64'), blocos: agrupar(p.itens, n) });
      delete paginas.at(-1).itens;
    }
    return paginas;
  });
}

// ---------- 2. blocos ----------
const CORES = c => { const h = String(c || '').trim(); if (/^#[0-9a-f]{6}$/i.test(h)) return h.toUpperCase(); const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(h); return m ? `#${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()}` : '#000000'; };
export const nomeDaFonte = n => String(n || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](Regular|Roman|Book|Normal)$/i, '').replace(/(PS)?MT$/, '').replace(/[-,]?(Bold|Black|Heavy|Semi ?Bold|Demi ?Bold|ExtraBold|Medium|Light|Thin|Italic|Oblique)+$/i, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim() || 'Arial';
const negrito = n => /bold|black|heavy|semibold|demibold/i.test(String(n || ''));
export function agrupar(itens, pagina = 1) {
  // Palavra com espaçamento entre letras ("C O N T E X T O") vem num item só: volta a ser a palavra, marcada.
  const ord = [...itens].map(i => { const t = /^(\S )+\S$/.test(i.s) ? i.s.replace(/ /g, '') : i.s; return { ...i, s: t, espacado: t !== i.s, cor: CORES(i.cor) }; })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // Itens -> linhas (mesma altura e tamanho, um depois do outro). Fonte e cor podem variar na linha (negrito, um
  // "·" em outra fonte): vale a dominante, pelo número de letras.
  const linhas = [];
  for (const i of ord) {
    // Vão grande só depois de um espaço explícito (palavras da mesma frase); sem ele, é outra coluna.
    const l = linhas.find(l => Math.abs(l.tam - i.tam) < 0.5 && Math.abs(l.y - i.y) < i.tam * 0.35 && i.x >= l.x1 - i.tam * 0.3 && i.x - l.x1 < i.tam * (l.espaco ? 1.6 : 0.6));
    if (l) {
      const vao = i.x - l.x1;
      l.s += (vao > i.tam * 0.18 && !/\s$/.test(l.s) && !/^\s/.test(i.s) ? ' ' : '') + i.s;
      l.x1 = Math.max(l.x1, i.x + i.w);
      l.espaco = !i.s.trim();
      if (i.s.trim()) { l.pesos[`${i.fonte}|${i.cor}`] = (l.pesos[`${i.fonte}|${i.cor}`] || 0) + i.s.trim().length; l.espacado = l.espacado || i.espacado; }
    } else if (i.s.trim()) linhas.push({ s: i.s, x: i.x, x1: i.x + i.w, y: i.y, tam: i.tam, pesos: { [`${i.fonte}|${i.cor}`]: i.s.trim().length }, espacado: i.espacado });
  }
  for (const l of linhas) { [l.fonte, l.cor] = Object.entries(l.pesos).sort((a, b) => b[1] - a[1])[0][0].split('|'); l.s = l.s.replace(/\s+/g, ' ').trim(); }
  // Linhas -> blocos: mesma fonte, tamanho e cor, alinhadas à esquerda (ou centradas) e logo abaixo da anterior.
  const blocos = [];
  for (const l of linhas.filter(x => x.s).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const b = blocos.find(b => b.fonte === l.fonte && Math.abs(b.tam - l.tam) < 0.5 && b.cor === l.cor && !b.espacado && !l.espacado
      && l.y - b.ultimaY > l.tam * 0.8 && l.y - b.ultimaY < l.tam * 1.9 && (Math.abs(b.x - l.x) < l.tam * 0.6 || Math.abs((b.x + b.x1) / 2 - (l.x + l.x1) / 2) < l.tam * 0.6)
      && (b.linhas.length < 2 || Math.abs(l.y - b.ultimaY - b.entrelinha) < l.tam * 0.3));
    if (b) { b.entrelinha = b.linhas.length === 1 ? l.y - b.ultimaY : b.entrelinha; b.linhas.push(l.s); b.ultimaY = l.y; b.x = Math.min(b.x, l.x); b.x1 = Math.max(b.x1, l.x1); }
    else blocos.push({ linhas: [l.s], x: l.x, x1: l.x1, y: l.y, ultimaY: l.y, tam: l.tam, fonte: l.fonte, cor: l.cor, espacado: l.espacado, entrelinha: l.tam * 1.2 });
  }
  return blocos.map((b, k) => ({ id: `${pagina}.${k + 1}`, texto: b.linhas.join(' ').replace(/\s+/g, ' ').trim(), linhas: b.linhas.length, x: b.x, y: b.y, largura: b.x1 - b.x,
    tam: Math.round(b.tam * 10) / 10, entrelinha: b.entrelinha, fonte: nomeDaFonte(b.fonte), negrito: negrito(b.fonte), cor: b.cor, espacado: b.espacado }));
}

// ---------- 3. adaptação do conteúdo ----------
// Instrução de adaptação: mesma estrutura, mesmo tom, dados só do material; tamanho parecido com o original.
const INSTRUCAO = [
  'Você adapta uma apresentação MODELO para outro projeto ou cliente, mantendo exatamente a estrutura: mesmos slides, mesma função de cada bloco de texto (título, rótulo de seção, número, item de lista, rodapé, data, nome), mesmo tom e o mesmo nível de detalhe.',
  'Para cada bloco, escreva o texto novo no lugar do original, com o conteúdo do NOVO projeto tirado do material e da conversa. Troque nomes de empresa, pessoas, áreas, sistemas, datas, horários, números e exemplos pelos do novo projeto.',
  'Rótulos de estrutura (como "01 · CONTEXTO", numeração "1", "2", "02", títulos de método que valem para qualquer projeto) ficam iguais quando continuam corretos.',
  'Não invente fatos. Dado específico que o material não traz (uma data, um nome de responsável, um horário, um número): escreva "[a definir]" no lugar só do dado. Item de lista, linha de tabela ou exemplo complementar sem conteúdo no material: devolva "" (texto vazio) e o bloco sai do slide, em vez de repetir "[a definir]".',
  'Cada bloco vem com a posição no slide [x, y] (em pontos, a partir do canto superior esquerdo): blocos na mesma altura são colunas de uma linha; na mesma coluna, itens de uma lista ou linhas de uma tabela. Mantenha cada texto na sua posição e na sua função; não troque conteúdo entre colunas nem entre linhas.',
  'O briefing da pessoa (no pedido e na conversa) manda: escopo, frentes, prazos, entregáveis e o que fica fora seguem o que ela definiu para o novo projeto, mesmo que o modelo diga outra coisa.',
  'Tamanho: cada texto novo deve caber no mesmo espaço do original, com no máximo o número de caracteres indicado.',
  REGRAS_DE_ESCRITA,
  'Responda só com um objeto JSON: {"<id do bloco>": "<texto novo>", ...}, com TODOS os ids recebidos e nada mais.',
].join('\n');

export function mensagensAdaptacao({ slides, contexto, pedido }) {
  const modelo = slides.map(p => `Slide ${p.numero}:\n${p.blocos.map(b => `${b.id} [${Math.round(b.x ?? 0)}, ${Math.round(b.y ?? 0)}] (máx. ${Math.max(8, Math.round(b.texto.length * 1.15))}): ${b.texto}`).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: INSTRUCAO },
    { role: 'user', content: `Pedido: ${pedido}\n\n<material>\n${contexto}\n</material>\n\nApresentação modelo (blocos a adaptar):\n\n${modelo}` },
  ];
}
const lerJson = t => { const m = /\{[\s\S]*\}/.exec(String(t || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

// Em partes de até ~8 slides (respostas menores e conferíveis). Devolve { textos: {id: texto}, faltando: [ids], custo }.
export async function adaptarModelo({ paginas, contexto, pedido, chamar, porParte = 8, simultaneas = 3, etapa = () => {} }) {
  const textos = {}, faltando = [];
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
    for (const id of ids) {
      if (typeof r?.[id] === 'string' && (r[id].trim() || r[id] === '')) textos[id] = r[id].replace(/\s+/g, ' ').trim();
      else faltando.push(id);
    }
    prontas++; etapa(`Adaptando os slides… ${prontas} de ${partes.length} partes prontas`);
  } };
  await Promise.all(Array.from({ length: Math.min(simultaneas, fila.length) }, trabalhar));
  for (const [id, de] of repetidos) if (textos[de] !== undefined) textos[id] = textos[de];
  return { textos, faltando, custo, economia };
}
