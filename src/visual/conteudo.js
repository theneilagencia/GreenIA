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
const CAPA = /^(capa|cover|abertura|slide de abertura|p[aá]gina de abertura)$/i;
const META = /^(escolhas feitas|observa[cç][oõ]es para quem (?:vai )?produzir|notas? de produ[cç][aã]o|briefing)\b/i;

const ehTabela = (l, prox) => /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(prox || '');
const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => limparInline(c));
const ITEM = /^\s*([-*+•]|\d{1,2}[.)])\s+/;
const ROTULADA = /^\**[^:*]{2,48}\**:\**\s*\S/;
const META_DESIGN = /^[*_]*(formato|layout|paleta( de cores)?|tipografia|orienta[cç][aã]o|dimens[oõ]es|propor[cç][aã]o)[*_]*\s*:\s*.{0,60}$/i;
const LACUNA = /^(?:n[aã]o (?:informad[oa]s?|dispon[ií]ve(?:l|is)|fornecid[oa]s?|identificad[oa]s?|consta)|sem (?:informa[cç][aã]o|dados?)|n\/a|n\.?\s?d\.?|-|—)\.?$/i;
// "Descrição: não informado" -> "" ; "Data: não informado | Setor: A" -> "Setor: A".
const semLacunas = t => String(t || '').split(/\s+\|\s+/).filter(p => { const v = ROTULADA.test(p.trim()) ? p.slice(p.indexOf(':') + 1).trim() : p.trim(); return v && !LACUNA.test(v.replace(/[*_]/g, '')); }).join(' | ');
const TITULO_LINHA = /^\s*[*_]*\s*(?:t[ií]tulo|title)\s*[*_]*\s*:\s*[*_]*(.+?)[*_]*\s*$/i;
const CTA = /^(?:chamada(?: para a[cç][aã]o)?|cta|call to action)\s*:\s*(.+)$/i;
const SETA = /\s*(?:->|→|=>|⇒|➜|➔)\s*/;

// Número com rótulo ("Receita: R$ 1,2 mi", "R$ 1,2 mi — receita do mês", "12% de redução"). O número é um dado:
// o token vai inteiro (milhar e decimal, pt-BR e en-US: "1.234,56", "1,234.56", "+3,3%", "4,3 de 5", "4.3 out of 5")
// e nunca é cortado no separador decimal; o que aparece na peça é o texto original (valor), e o número normalizado
// fica ao lado (numero), para gráfico e conferência — o texto exibido nunca é reconstruído a partir dele.
const NUM_TOKEN = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
const UNID = String.raw`%|pp|p\.p\.|mil|mi|bi|milh[oõ]es|bilh[oõ]es|k|h|horas?|min|minutos?|dias?(?: [úu]teis)?|semanas?|meses|anos?|x|vezes|pontos?|t|kg|km|un\.?|unidades|pessoas|clientes|itens`;
const VAL = String.raw`(?:\d{1,3}\s?h\s?\d{1,2}(?:\s?min)?|[+\-−]?\s?(?:R\$|US\$|€|\$)?\s?(?:${NUM_TOKEN})(?![\d]|[.,]\d)(?:\s?(?:${UNID})(?![a-zà-ú]))?(?:\s+(?:de|of|out of)\s+(?:${NUM_TOKEN})(?![\d]|[.,]\d))?(?:\/[a-zà-ú]+)?)`;
const VALOR = new RegExp(`^${VAL}$`, 'i');
const COM_DETALHE = new RegExp(String.raw`^(.{2,48}?)\s*[:–—]\s*(${VAL})(?:\s*[(;–—-]\s*|,\s+|\s+(?=[a-zà-ú(]))(.{2,80})$`, 'i');
const VALOR_PRIMEIRO = new RegExp(String.raw`^(${VAL})\s+(?:[–—-]\s*)?(.{3,60})$`, 'i');
// Round-trip: o valor tirado do texto tem de estar nele inteiro (sem dígito ou decimal colado depois).
const inteiro = (t, v) => { const i = t.indexOf(v); return i >= 0 && !/^[.,]?\d/.test(t.slice(i + v.length)); };
const comNumero = k => (k && inteiro(k.fonte, k.valor) ? { rotulo: k.rotulo, valor: k.valor, numero: valorNumerico(k.valor), ...(k.detalhe ? { detalhe: k.detalhe } : {}), texto: k.fonte } : null);
function indicador(texto) {
  const t = limparInline(texto);
  let m = /^(.{2,48}?)\s*[:–—]\s*(.{1,32})$/.exec(t);
  if (m && VALOR.test(m[2].trim())) return comNumero({ fonte: t, rotulo: m[1].trim(), valor: m[2].trim() });
  m = COM_DETALHE.exec(t);
  if (m) return comNumero({ fonte: t, rotulo: m[1].trim(), valor: m[2].trim(), detalhe: m[3].replace(/^\(|\)$/g, '').trim() });
  m = VALOR_PRIMEIRO.exec(t);
  if (m && /^[a-zà-ú(]/i.test(m[2])) return comNumero({ fonte: t, rotulo: m[2].trim(), valor: m[1].trim() });
  return null;
}
export { indicador };

// Um item "Título: explicação" (cartão).
const CARTAO = /^([^:]{2,48}):\s+(.{3,})$/;

export function analisarConteudo(markdown, { titulo = '' } = {}) {
  // Instrução de design que a execução às vezes escreve no conteúdo ("Formato: A4 retrato") não é conteúdo da peça.
  // "Título: ..." é estrutura (o título da peça), em qualquer linha: nunca vira texto do corpo.
  let tituloAchado = '';
  const linhas = String(markdown || '').replace(/\r/g, '').split('\n').filter(l => !META_DESIGN.test(l.trim())).filter(l => { const m = TITULO_LINHA.exec(l); if (m && !tituloAchado) tituloAchado = m[1]; return !m; });
  const secoes = [];
  let n = 0;
  const novaSecao = (t = null, pagina = null) => { const s = { id: `s${secoes.length + 1}`, titulo: t, pagina, itens: [] }; secoes.push(s); return s; };
  let atual = null, ignorar = false;
  const add = item => { if (ignorar) return; if (!atual) atual = novaSecao(); item.id = `${atual.id}.i${atual.itens.length + 1}`; atual.itens.push(item); n++; };
  const lista = (limpos, ordenada) => {
    if (!limpos.length) return;
    // Fluxo: itens com setas ("A -> B -> C") descrevem um processo, não uma lista.
    if (limpos.filter(x => SETA.test(x.texto)).length >= Math.max(1, limpos.length * 0.6)) { add(fluxoDe(limpos.map(x => x.texto))); return; }
    const kpis = limpos.map(x => indicador(x.texto));
    if (limpos.length >= 2 && kpis.filter(Boolean).length >= Math.ceil(limpos.length * 0.6)) { add({ tipo: 'indicadores', itens: limpos.map((x, k) => kpis[k] || { rotulo: x.texto, valor: '' }) }); return; }
    add({ tipo: 'lista', ordenada, checklist: limpos.some(x => x.marcado !== null), itens: limpos.map(x => ({ texto: x.texto, ...(x.marcado !== null ? { marcado: x.marcado } : {}), ...(x.nivel > 1 ? { nivel: 2 } : {}) })) });
  };
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
      // "Capa" / "Slide 1 — Capa": a seção traz o que vai na capa; "Capa" é estrutura, não título de conteúdo.
      else if (CAPA.test(t)) { atual = novaSecao(null, pagina); atual.capa = true; }
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
      const itens = []; let numerada = false; const ordenada0 = /^\s*\d/.test(l);
      while (i < linhas.length && (ITEM.test(linhas[i]) || (/^\s{2,}\S/.test(linhas[i]) && itens.length && !ITEM.test(linhas[i])))) {
        const bruto = linhas[i++];
        if (!ITEM.test(bruto)) { itens[itens.length - 1].texto += ` ${limparInline(bruto)}`; continue; }
        const nivel = /^\s{2,}/.test(bruto) ? 2 : 1;
        let texto = bruto.replace(ITEM, '').replace(/^(?:[-*+•]\s+)+/, '');
        // "- 1. passo": número escrito dentro do marcador é a ordem da lista, não texto.
        if (/^\d{1,2}[.)]\s+\S/.test(texto)) { texto = texto.replace(/^\d{1,2}[.)]\s+/, ''); numerada = true; }
        const ck = /^\[( |x|X)\]\s+(.*)$/.exec(texto);
        itens.push({ texto: limparInline(ck ? ck[2] : texto), marcado: ck ? ck[1] !== ' ' : null, nivel });
      }
      const ordenada = ordenada0 || numerada;
      // Introdução da lista ("Categorias de verificação:", sem valor depois dos dois-pontos) não é item: vira o
      // subtítulo do que vem a seguir, nunca uma caixa de marcar.
      for (let k = 0; k < itens.length - 1; k++) if (/:\s*$/.test(itens[k].texto) && itens[k].marcado === null) {
        lista(itens.slice(0, k).filter(x => x.texto && !CTA.test(x.texto)), ordenada);
        add({ tipo: 'subtitulo', texto: itens[k].texto.replace(/:\s*$/, '') });
        itens.splice(0, k + 1); k = -1;
      }
      // "Chamada: ..." no fim de uma lista é a chamada para ação, não mais um item.
      const ctaLista = itens.filter(x => CTA.test(x.texto));
      lista(itens.filter(x => x.texto && !CTA.test(x.texto)), ordenada);
      for (const x of ctaLista) add({ tipo: 'paragrafo', texto: CTA.exec(x.texto)[1].trim(), cta: true });
      continue;
    }
    // Parágrafo: linhas seguidas. Linha só em negrito vira subtítulo. Setas: fluxo.
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^\s*#{1,6}\s/.test(linhas[i]) && !ITEM.test(linhas[i]) && !ehTabela(linhas[i], linhas[i + 1]) && !/^\s*>/.test(linhas[i])) par.push(linhas[i++]);
    if (par.length === 1 && /^\s*\*\*[^*]+\*\*:?\s*$/.test(par[0])) { add({ tipo: 'subtitulo', texto: limparInline(par[0]).replace(/:$/, '') }); continue; }
    // Fluxo com introdução ("Fluxo:" numa linha, ou "Fluxo: A -> B -> C"): a introdução vira subtítulo e o resto é
    // o fluxo desenhado (nós e ligações), nunca uma frase com setas.
    if (par.length >= 2 && /:\s*$/.test(par[0]) && !SETA.test(par[0]) && par.slice(1).every(x => SETA.test(x))) { add({ tipo: 'subtitulo', texto: limparInline(par[0]).replace(/:\s*$/, '') }); add(fluxoDe(par.slice(1))); continue; }
    if (par.length === 1 && /^[^:>→]{2,40}:\s*\S/.test(par[0]) && (par[0].match(new RegExp(SETA.source, 'g')) || []).length >= 2 && !SETA.test(par[0].split(':')[0])) {
      const i = par[0].indexOf(':'); add({ tipo: 'subtitulo', texto: limparInline(par[0].slice(0, i)) }); add(fluxoDe([par[0].slice(i + 1).trim()])); continue;
    }
    if (par.every(x => SETA.test(x))) { add(fluxoDe(par)); continue; }
    // Linhas "Rótulo: valor" seguidas, sem marcador de lista: cada linha é um item (nunca um parágrafo emendado).
    if (par.length >= 2 && par.filter(x => ROTULADA.test(x.trim())).length >= Math.ceil(par.length * 0.6)) {
      const ctas = par.map(x => CTA.exec(limparInline(x))).filter(Boolean);
      lista(par.filter(x => !CTA.test(limparInline(x))).map(x => ({ texto: limparInline(x), marcado: null, nivel: 1 })).filter(x => x.texto), false);
      for (const c of ctas) add({ tipo: 'paragrafo', texto: c[1].trim(), cta: true });
      continue;
    }
    const texto = limparInline(par.join(' '));
    // "Chamada: Fale com a equipe" -> chamada para ação (o rótulo "Chamada:" é instrução de estrutura, não aparece).
    const cta = CTA.exec(texto);
    if (cta) { add({ tipo: 'paragrafo', texto: cta[1].trim(), cta: true }); continue; }
    const k = indicador(texto);
    if (k && texto.length <= 60) add({ tipo: 'indicadores', itens: [k] });
    else if (texto) add({ tipo: 'paragrafo', texto });
  }
  // Campo opcional sem dado ("Descrição: não informado") não vai para a peça: sai a linha, a coluna inteira de
  // lacunas sai da tabela e a célula solta vira "—". O que falta de verdade fica na seção de lacunas do resultado.
  for (const s of secoes) {
    s.itens = s.itens.map(it => {
      if (it.tipo === 'lista') { const itens = it.itens.map(x => ({ ...x, texto: semLacunas(x.texto) })).filter(x => x.texto); return itens.length ? { ...it, itens } : null; }
      if (it.tipo === 'paragrafo') { const t = semLacunas(it.texto); return t ? { ...it, texto: t } : null; }
      if (it.tipo === 'indicadores') { const itens = it.itens.filter(x => !LACUNA.test(String(x.valor || '').trim()) && !LACUNA.test(String(x.rotulo || '').trim())); return itens.length ? { ...it, itens } : null; }
      if (it.tipo === 'tabela') {
        const manter = it.cabecalho.map((_, k) => k === 0 || it.linhas.some(l => !LACUNA.test(String(l[k] || '').trim())));
        return { ...it, cabecalho: it.cabecalho.filter((_, k) => manter[k]), linhas: it.linhas.map(l => l.filter((_, k) => manter[k]).map(c => (LACUNA.test(String(c || '').trim()) ? '—' : c))) };
      }
      return it;
    }).filter(Boolean);
  }
  // Comparação: listas "Item: valores" com o mesmo conjunto de itens (os mesmos fornecedores em "Preços" e em
  // "Prazos") são uma matriz itens x critérios. Vira uma tabela de verdade, no lugar da primeira lista, com a
  // estrutura explícita (comparacao: itens, critérios); as outras listas saem (o conteúdo delas está na matriz).
  {
    const ENT = /^([^:]{1,40}):\s+(.+)$/;
    const chaveEnt = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const listas = [];
    // Texto original de cada linha (lista ou indicadores): o valor da célula é o que estava escrito, não remontado.
    const linhasDe = it => (it.tipo === 'lista' ? (it.itens.every(x => x.marcado === undefined) ? it.itens.map(x => x.texto) : null) : it.tipo === 'indicadores' && it.itens.every(x => x.texto) ? it.itens.map(x => x.texto) : null);
    for (const s of secoes) for (const it of s.itens) { const ls = linhasDe(it); if (ls && ls.length >= 2 && ls.every(t => ENT.test(t))) listas.push({ s, it, ls, chave: ls.map(t => chaveEnt(ENT.exec(t)[1])).sort().join('|') }); }
    const porChave = new Map();
    for (const l of listas) { if (!porChave.has(l.chave)) porChave.set(l.chave, []); porChave.get(l.chave).push(l); }
    for (const grupo of porChave.values()) {
      if (grupo.length < 2 || new Set(grupo[0].ls.map(t => chaveEnt(ENT.exec(t)[1]))).size !== grupo[0].ls.length) continue;
      const itensCmp = grupo[0].ls.map(t => ENT.exec(t)[1].trim());
      const criterios = grupo.map((g, k) => g.s.titulo || `Critério ${k + 1}`);
      const valorDe = (g, nome) => ENT.exec(g.ls.find(t => chaveEnt(ENT.exec(t)[1]) === chaveEnt(nome)))[2].trim();
      const tabela = { tipo: 'tabela', cabecalho: ['', ...criterios], linhas: itensCmp.map(nome => [nome, ...grupo.map(g => valorDe(g, nome))]), comparacao: { itens: itensCmp, criterios } };
      const primeira = grupo[0];
      primeira.s.itens[primeira.s.itens.indexOf(primeira.it)] = tabela;
      for (const g of grupo.slice(1)) { g.s.itens.splice(g.s.itens.indexOf(g.it), 1); if (!g.s.itens.length) g.s.titulo = null; }
      if (primeira.s.titulo && criterios.length > 1) primeira.s.titulo = 'Comparação';
    }
  }
  // Tabela com itens nas linhas e dois ou mais critérios em texto (matriz qualitativa) também é comparação.
  for (const s of secoes) for (const it of s.itens) if (it.tipo === 'tabela' && !it.comparacao && it.linhas.length >= 2 && it.cabecalho.length >= 3
    && it.cabecalho.slice(1).filter((_, k) => it.linhas.some(l => valorNumerico(l[k + 1]) === null)).length >= 1)
    it.comparacao = { itens: it.linhas.map(l => l[0]), criterios: it.cabecalho.slice(1) };
  // Registros paralelos: seções seguidas, cada uma só com campos "Rótulo: valor" e os mesmos rótulos (uma fase, um
  // fornecedor, uma etapa por seção) viram um item só, em ordem: nenhuma fase some por ser uma seção curta.
  for (let k = 0; k < secoes.length; k++) {
    const campos = s => (s.titulo && s.itens.length === 1 && s.itens[0].tipo === 'lista' && s.itens[0].itens.every(x => ROTULADA.test(x.texto)) ? s.itens[0].itens.map(x => x.texto.split(':')[0].trim().toLowerCase()).join('|') : null);
    const chave = campos(secoes[k]);
    if (!chave) continue;
    let j = k + 1;
    while (j < secoes.length && campos(secoes[j]) === chave) j++;
    if (j - k < 2) continue;
    const grupo = secoes.slice(k, j), rotulos = chave.split('|');
    const tempo = rotulos.findIndex(r => /^(per[ií]odo|data|datas|prazo|quando|m[eê]s|in[ií]cio|fim|date|when|period)$/.test(r));
    const valores = sec => sec.itens[0].itens.map(x => x.texto.slice(x.texto.indexOf(':') + 1).trim());
    const item = tempo >= 0
      ? { tipo: 'lista', ordenada: false, checklist: false, itens: grupo.map(sec => { const v = valores(sec); return { texto: `${v[tempo]}: ${[sec.titulo, ...v.filter((_, i) => i !== tempo)].join(' — ')}` }; }) }
      : { tipo: 'tabela', cabecalho: ['', ...grupo[0].itens[0].itens.map(x => x.texto.split(':')[0].trim())], linhas: grupo.map(sec => [sec.titulo, ...valores(sec)]) };
    secoes[k] = { ...secoes[k], titulo: secoes[k].pai || null, itens: [item] };
    secoes.splice(k + 1, j - k - 1);
  }
  // Seções vazias (só título) saem; uma seção sem título no começo é a introdução.
  const validas = secoes.filter(s => s.itens.length || s.titulo);
  validas.forEach((s, k) => { const novo = `s${k + 1}`; s.itens.forEach((it, j) => { it.id = `${novo}.i${j + 1}`; }); s.id = novo; });
  const conteudo = { titulo: limparInline(titulo || tituloAchado) || null, secoes: validas };
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
