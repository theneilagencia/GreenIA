// Etapa 1 da produção visual: o CONTEÚDO. O texto de um entregável (produzido e conferido pela execução do Quick
// Win) vira itens estruturados com id: parágrafos, listas, checklists, tabelas, indicadores, citações e fluxos.
// O plano visual e a composição só referenciam esses itens: o que aparece na peça é sempre o conteúdo conferido,
// nunca um texto novo escrito pelo design. Daí sai também o conjunto de números do conteúdo, usado na conferência
// de fidelidade (nenhum número aparece na peça sem estar no conteúdo).

const limparInline = s => String(s ?? '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]*\)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
  .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1$2').replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1$2')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export { limparInline };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "Página 2: Riscos", "Slide 3 - Próximos passos", "Tela 1", "Lâmina 4." -> número e título.
const PAGINA = /^(?:p[aá]gina|slide|tela|l[aâ]mina|card|quadro|parte)\s*(\d{1,2})\s*(?:[:.\-–—)]\s*)?/i;
// Seções que não são conteúdo da peça (meta da execução): ficam no resultado em texto, fora do visual.
const META = /^(escolhas feitas|observa[cç][oõ]es para quem (?:vai )?produzir|notas? de produ[cç][aã]o|briefing)\b/i;

const ehTabela = (l, prox) => /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(prox || '');
const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => limparInline(c));
const ITEM = /^\s*([-*+•]|\d{1,2}[.)])\s+/;
const SETA = /\s*(?:->|→|=>|⇒|➜|➔)\s*/;

// Número com rótulo ("Receita: R$ 1,2 mi", "R$ 1,2 mi — receita do mês", "12% de redução").
const VALOR = /^[+\-−]?\s?(?:R\$|US\$|€|\$)?\s?\d[\d.,]*\s?(?:%|pp|p\.p\.|mil|mi|bi|milh[oõ]es|bilh[oõ]es|k|h|horas?|min|minutos?|dias?( [úu]teis)?|semanas?|meses|anos?|x|vezes|pontos?|t|kg|km|un\.?|unidades|pessoas|clientes|itens)?$/i;
function indicador(texto) {
  const t = limparInline(texto);
  let m = /^(.{2,48}?)\s*[:–—]\s*(.{1,32})$/.exec(t);
  if (m && VALOR.test(m[2].trim()) ) return { rotulo: m[1].trim(), valor: m[2].trim() };
  m = /^(.{2,48}?)\s*[:–—]\s*([+\-−]?\s?(?:R\$|US\$|€|\$)?\s?\d[\d.,]*\s?(?:%|pp|mil|mi|bi|milh[oõ]es|k|h|dias?|meses|anos?)?)\s*[(,;–—-]\s*(.{2,80})$/i.exec(t);
  if (m) return { rotulo: m[1].trim(), valor: m[2].trim(), detalhe: m[3].replace(/\)$/, '').trim() };
  m = /^([+\-−]?\s?(?:R\$|US\$|€|\$)?\s?\d[\d.,]*\s?(?:%|pp|mil|mi|bi|milh[oõ]es|k|h|dias?|meses|anos?|x)?)\s+(?:[–—-]\s*)?(.{3,60})$/i.exec(t);
  if (m && VALOR.test(m[1].trim()) && /^[a-zà-ú(]/i.test(m[2])) return { rotulo: m[2].trim(), valor: m[1].trim() };
  return null;
}
export { indicador };

// Um item "Título: explicação" (cartão).
const CARTAO = /^([^:]{2,48}):\s+(.{3,})$/;

export function analisarConteudo(markdown, { titulo = '' } = {}) {
  const linhas = String(markdown || '').replace(/\r/g, '').split('\n');
  const secoes = [];
  let n = 0;
  const novaSecao = (t = null, pagina = null) => { const s = { id: `s${secoes.length + 1}`, titulo: t, pagina, itens: [] }; secoes.push(s); return s; };
  let atual = null, ignorar = false;
  const add = item => { if (ignorar) return; if (!atual) atual = novaSecao(); item.id = `${atual.id}.i${atual.itens.length + 1}`; atual.itens.push(item); n++; };
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim() || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { i++; continue; }
    const h = /^\s*(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      const nivel = h[1].length;
      let t = limparInline(h[2]);
      const p = PAGINA.exec(t);
      const pagina = p ? Number(p[1]) : null;
      if (p) t = t.slice(p[0].length).trim();
      if (META.test(t)) { ignorar = true; atual = null; i++; continue; }
      ignorar = false;
      if (nivel >= 4 && atual) add({ tipo: 'subtitulo', texto: t });
      else atual = novaSecao(t || null, pagina);
      i++; continue;
    }
    if (ehTabela(l, linhas[i + 1])) {
      const cab = celulas(l), linhasT = [];
      i += 2;
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) { const c = celulas(linhas[i++]); if (c.some(Boolean)) linhasT.push(cab.map((_, k) => c[k] ?? '')); }
      add({ tipo: 'tabela', cabecalho: cab, linhas: linhasT });
      continue;
    }
    if (/^\s*>\s?/.test(l)) {
      const partes = [];
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) partes.push(linhas[i++].replace(/^\s*>\s?/, ''));
      add({ tipo: 'citacao', texto: limparInline(partes.join(' ')) });
      continue;
    }
    if (ITEM.test(l)) {
      const itens = [], ordenada = /^\s*\d/.test(l);
      while (i < linhas.length && (ITEM.test(linhas[i]) || (/^\s{2,}\S/.test(linhas[i]) && itens.length && !ITEM.test(linhas[i])))) {
        const bruto = linhas[i++];
        if (!ITEM.test(bruto)) { itens[itens.length - 1].texto += ` ${limparInline(bruto)}`; continue; }
        const nivel = /^\s{2,}/.test(bruto) ? 2 : 1;
        let texto = bruto.replace(ITEM, '');
        const ck = /^\[( |x|X)\]\s+(.*)$/.exec(texto);
        itens.push({ texto: limparInline(ck ? ck[2] : texto), marcado: ck ? ck[1] !== ' ' : null, nivel });
      }
      const limpos = itens.filter(x => x.texto);
      if (!limpos.length) continue;
      // Fluxo: itens com setas ("A -> B -> C") descrevem um processo, não uma lista.
      if (limpos.filter(x => SETA.test(x.texto)).length >= Math.max(1, limpos.length * 0.6)) { add(fluxoDe(limpos.map(x => x.texto))); continue; }
      const kpis = limpos.map(x => indicador(x.texto));
      if (limpos.length >= 2 && kpis.filter(Boolean).length >= Math.ceil(limpos.length * 0.6)) {
        add({ tipo: 'indicadores', itens: limpos.map((x, k) => kpis[k] || { rotulo: x.texto, valor: '' }) });
        continue;
      }
      add({ tipo: 'lista', ordenada, checklist: limpos.some(x => x.marcado !== null), itens: limpos.map(x => ({ texto: x.texto, ...(x.marcado !== null ? { marcado: x.marcado } : {}), ...(x.nivel > 1 ? { nivel: 2 } : {}) })) });
      continue;
    }
    // Parágrafo: linhas seguidas. Linha só em negrito vira subtítulo. Setas: fluxo.
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^\s*#{1,6}\s/.test(linhas[i]) && !ITEM.test(linhas[i]) && !ehTabela(linhas[i], linhas[i + 1]) && !/^\s*>/.test(linhas[i])) par.push(linhas[i++]);
    if (par.length === 1 && /^\s*\*\*[^*]+\*\*:?\s*$/.test(par[0])) { add({ tipo: 'subtitulo', texto: limparInline(par[0]).replace(/:$/, '') }); continue; }
    if (par.every(x => SETA.test(x))) { add(fluxoDe(par)); continue; }
    const texto = limparInline(par.join(' '));
    // "Chamada: Fale com a equipe" -> chamada para ação (o rótulo "Chamada:" é instrução de estrutura, não aparece).
    const cta = /^(?:chamada(?: para a[cç][aã]o)?|cta|call to action)\s*:\s*(.+)$/i.exec(texto);
    if (cta) { add({ tipo: 'paragrafo', texto: cta[1].trim(), cta: true }); continue; }
    const k = indicador(texto);
    if (k && texto.length <= 60) add({ tipo: 'indicadores', itens: [k] });
    else if (texto) add({ tipo: 'paragrafo', texto });
  }
  // Seções vazias (só título) saem; uma seção sem título no começo é a introdução.
  const validas = secoes.filter(s => s.itens.length || s.titulo);
  validas.forEach((s, k) => { const novo = `s${k + 1}`; if (s.id !== novo) { s.itens.forEach((it, j) => { it.id = `${novo}.i${j + 1}`; }); s.id = novo; } });
  const conteudo = { titulo: limparInline(titulo) || null, secoes: validas };
  return conteudo;
}

// Fluxo a partir de linhas com setas. "Decisão? -> (sim) Aprovar" e "Decisão? -> (não) Revisar" viram ramos.
function fluxoDe(linhas) {
  const nos = [], ligacoes = [];
  const no = rotulo => {
    const r = limparInline(rotulo).replace(/^\d{1,2}[.)]\s*/, '');
    let x = nos.find(n => norm(n.rotulo) === norm(r));
    if (!x) { x = { id: `n${nos.length + 1}`, rotulo: r, decisao: /\?\s*$/.test(r) }; nos.push(x); }
    return x;
  };
  for (const l of linhas) {
    // "(sim) Etapa" ou "[não] Etapa": o rótulo é do ramo que chega nesta etapa; a etapa é só "Etapa".
    const partes = String(l).split(SETA).map(p => p.trim()).filter(Boolean).map(p => {
      const m = /^\(([^)]{1,20})\)\s*(.+)$/.exec(p) || /^\[([^\]]{1,20})\]\s*(.+)$/.exec(p);
      return m ? { texto: m[2], rotulo: limparInline(m[1]) } : { texto: p, rotulo: null };
    });
    for (let k = 0; k + 1 < partes.length; k++) {
      const a = no(partes[k].texto), b = no(partes[k + 1].texto), rotulo = partes[k + 1].rotulo;
      if (a !== b && !ligacoes.some(x => x.de === a.id && x.para === b.id)) ligacoes.push({ de: a.id, para: b.id, ...(rotulo ? { rotulo } : {}) });
    }
    if (partes.length === 1) no(partes[0].texto);
  }
  return { tipo: 'fluxo', nos, ligacoes };
}

// Todos os itens do conteúdo, por id.
export function itensPorId(conteudo) {
  const m = new Map();
  for (const s of conteudo.secoes) for (const it of s.itens) m.set(it.id, { ...it, secao: s.id });
  return m;
}

// Texto de um item (para conferência de cobertura, de fidelidade e de densidade).
export function textoDoItem(it) {
  switch (it.tipo) {
    case 'lista': return it.itens.map(x => x.texto).join('\n');
    case 'tabela': return [it.cabecalho.join(' | '), ...it.linhas.map(l => l.join(' | '))].join('\n');
    case 'indicadores': return it.itens.map(x => `${x.valor} ${x.rotulo} ${x.detalhe || ''}`).join('\n');
    case 'fluxo': return it.nos.map(n => n.rotulo).join('\n') + '\n' + it.ligacoes.map(l => l.rotulo || '').join(' ');
    default: return it.texto || '';
  }
}
export const textoDoConteudo = c => [c.titulo || '', ...c.secoes.flatMap(s => [s.titulo || '', ...s.itens.map(textoDoItem)])].join('\n');

// Números (só dígitos, com 2 ou mais algarismos ou percentual) do texto: base da conferência de fidelidade.
const NUM = /\d[\d.,]*/g;
export const numerosDe = texto => new Set((String(texto || '').match(NUM) || []).map(n => n.replace(/[.,]+$/, '')).filter(n => n.replace(/\D/g, '').length >= 2 || /\d[.,]\d/.test(n)).map(n => n.replace(/\D/g, '')));

// Valor numérico de uma célula ("R$ 1.234,56", "12,5%", "-3", "1,2 mi"): para gráficos. null se não for número.
export function valorNumerico(s) {
  const t = String(s ?? '').trim();
  const m = /^[(]?[+\-−]?\s?(?:R\$|US\$|€|\$)?\s?(\d[\d.,\s]*)\s?(%|pp|mil|mi|bi|milh[oõ]es|bilh[oõ]es|k|h|min|dias?|meses|anos?|t|kg|un\.?)?[)]?$/i.exec(t);
  if (!m) return null;
  let num = m[1].replace(/\s/g, '');
  // Formato brasileiro (1.234,56) ou internacional (1,234.56): o último separador com 1-2 dígitos é o decimal.
  const ultimo = Math.max(num.lastIndexOf(','), num.lastIndexOf('.'));
  if (ultimo >= 0 && num.length - ultimo - 1 <= 2 && num.length - ultimo - 1 >= 1 && !(num[ultimo] === '.' && /\.\d{3}$/.test(num) )) {
    num = num.slice(0, ultimo).replace(/[.,]/g, '') + '.' + num.slice(ultimo + 1);
  } else num = num.replace(/[.,]/g, '');
  let v = Number(num);
  if (!Number.isFinite(v)) return null;
  if (/^[(\-−]/.test(t) || /^(R\$|US\$|€|\$)\s?[\-−]/.test(t)) v = -v;
  const mult = { mil: 1e3, mi: 1e6, milhoes: 1e6, 'milhões': 1e6, bi: 1e9, bilhoes: 1e9, 'bilhões': 1e9, k: 1e3 }[norm(m[2] || '')];
  return mult ? v * mult : v;
}
