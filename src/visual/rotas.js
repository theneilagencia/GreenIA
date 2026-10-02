// API dos artefatos visuais: lista, detalhe editável, prévia (PNG por página), exportação (PDF, PNG, JPG, SVG),
// edição sem refazer a execução (texto, ordem, títulos, tipo de bloco, formato, cores desta peça, imagem),
// derivação de outro artefato do mesmo conteúdo, versões e restauração.
//
// Acesso: o artefato é da execução e da conversa, e a conversa é de quem a criou (nem o admin lê o conteúdo de
// outra pessoa). Toda rota confere `pessoa_id` e a conversa; a empresa é o próprio banco (multiempresa: um banco
// por empresa), então um id de outra empresa simplesmente não existe aqui.
import { crc32 } from 'node:zlib';
import { erro } from '../http.js';
import { exec, json, todos, transacao, um } from '../db.js';
import { registrar } from '../eventos.js';
import { EXPORTACOES, EXPORTACOES_FUTURAS, FORMATOS, formatoValido, limparVisual, tipoDe, tracos, TIPOS } from './contrato.js';
import { planejar, BLOCOS, graficoParaTabela as planejarGrafico } from './plano.js';
import { itensPorId } from './conteudo.js';
import { corta, montar, produzir, produzirSemCorte } from './motor.js';
import { svgDaPagina } from './svg.js';
import { pngDaPagina, jpgDaPagina } from './raster.js';
import { pdfDasPaginas } from './pdf.js';
import { carregarAssets, guardarAsset, resumoArtefato } from './producao.js';
import { corValida, HEX, resolverIdentidade } from './marca.js';
import { lerConfig } from '../config.js';

const MAX_TEXTO_EDICAO = 800;
const cache = new Map();
const guardarCache = (k, v) => { cache.set(k, v); if (cache.size > 60) cache.delete(cache.keys().next().value); return v; };

export function meuArtefato(app, pessoa, id) {
  const a = um(app.db, 'select a.* from artefatos_visuais a join conversas c on c.id = a.conversa_id where a.id = ? and a.pessoa_id = ? and c.pessoa_id = ?', Number(id), pessoa.id, pessoa.id);
  if (!a) throw erro(404, 'artefato', 'Artefato não encontrado.');
  return a;
}

// Páginas compostas de uma versão (determinístico: plano + conteúdo + opções + identidade guardados).
export function paginasDoArtefato(app, a) {
  const k = `p:${app.tenant?.companyId ?? ''}:${a.id}`;
  if (cache.has(k)) return cache.get(k);
  const opcoes = json(a.opcoes, {});
  const assets = carregarAssets(app, a.conversa_id, opcoes.assets);
  const r = montar({ plano: json(a.plano, {}), conteudo: json(a.conteudo, {}), identidade: json(a.identidade, {}), assets, opcoes });
  return guardarCache(k, r.paginas);
}

const nomeArquivo = (a, ext, pagina = null) => `${String(a.titulo || a.rotulo || 'artefato').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'artefato'}${pagina ? `-p${pagina}` : ''}.${ext}`;

// ZIP mínimo (sem compressão: PNG e JPG já são comprimidos), para baixar todas as páginas de uma vez.
export function zip(arquivos) {
  const partes = [], central = [];
  let pos = 0;
  for (const { nome, dados } of arquivos) {
    const n = Buffer.from(nome, 'utf8'), c = crc32(dados);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt32LE(0, 10);
    h.writeUInt32LE(c, 14); h.writeUInt32LE(dados.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    partes.push(h, n, dados);
    const d = Buffer.alloc(46);
    d.writeUInt32LE(0x02014b50, 0); d.writeUInt16LE(20, 4); d.writeUInt16LE(20, 6); d.writeUInt16LE(0x0800, 8); d.writeUInt16LE(0, 10); d.writeUInt32LE(0, 12);
    d.writeUInt32LE(c, 16); d.writeUInt32LE(dados.length, 20); d.writeUInt32LE(dados.length, 24); d.writeUInt16LE(n.length, 28); d.writeUInt32LE(pos, 42);
    central.push(d, n);
    pos += 30 + n.length + dados.length;
  }
  const tc = Buffer.concat(central), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(tc.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, tc, fim]);
}

function enviarArquivo(res, mime, nome, dados, { inline = false } = {}) {
  res.writeHead(200, { 'content-type': mime, 'content-length': dados.length, 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${nome}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
  res.end(dados);
}

// Exporta uma versão. Devolve { mime, nome, dados }.
export function exportar(app, a, formato, pagina = null) {
  if (EXPORTACOES_FUTURAS.includes(formato)) throw erro(400, 'formato_nao_suportado', `A exportação em ${formato.toUpperCase()} ainda não está disponível. Use PDF, PNG, JPG ou SVG.`);
  if (!EXPORTACOES[formato]) throw erro(400, 'formato', 'Formato de exportação inválido.');
  const paginas = paginasDoArtefato(app, a);
  const fmt = FORMATOS[a.formato] || FORMATOS.a4;
  if (pagina !== null && !(pagina >= 1 && pagina <= paginas.length)) throw erro(400, 'pagina', 'Página inexistente.');
  if (formato === 'pdf') return { mime: EXPORTACOES.pdf.mime, nome: nomeArquivo(a, 'pdf'), dados: pdfDasPaginas(pagina ? [paginas[pagina - 1]] : paginas, { escala: fmt.pdf, titulo: a.titulo }) };
  const um_ = p => formato === 'png' ? pngDaPagina(p, fmt.png).bytes : formato === 'jpg' ? jpgDaPagina(p, fmt.png).bytes : Buffer.from(svgDaPagina(p, { embutirFontes: true, id: `p${p.numero}` }));
  const ext = formato;
  if (pagina || paginas.length === 1) { const n = pagina || 1; return { mime: EXPORTACOES[formato].mime, nome: nomeArquivo(a, ext, paginas.length > 1 ? n : null), dados: um_(paginas[n - 1]) }; }
  return { mime: 'application/zip', nome: nomeArquivo(a, 'zip'), dados: zip(paginas.map(p => ({ nome: nomeArquivo(a, ext, p.numero), dados: um_(p) }))) };
}

// Modelo editável para a tela: páginas, blocos e os textos de cada item (sem detalhe técnico de composição).
function editavel(app, a) {
  const plano = json(a.plano, {}), conteudo = json(a.conteudo, {}), itens = itensPorId(conteudo);
  const aceita = { paragrafo: ['texto', 'citacao', 'cta', 'nota'], lista: ['lista', 'checklist', 'cartoes', 'linha_tempo', 'diagrama'], tabela: ['tabela', 'grafico', 'cartoes'], indicadores: ['indicadores', 'lista'], fluxo: ['diagrama', 'lista'] };
  return {
    titulo: a.titulo,
    paginas: plano.paginas.map((p, i) => ({ id: p.id, numero: i + 1, papel: p.papel, titulo: p.titulo || '', subtitulo: p.subtitulo || '',
      blocos: p.blocos.map(b => {
        const it = itens.get(b.refs?.[0]);
        return { id: b.id, tipo: b.tipo, tipos: it ? (aceita[it.tipo] || [b.tipo]) : [b.tipo], itens: (b.refs || []).map(r => itens.get(r)).filter(Boolean).map(x => ({ id: x.id, tipo: x.tipo,
          ...(x.tipo === 'lista' ? { itens: x.itens.map(y => y.texto) } : x.tipo === 'tabela' ? { cabecalho: x.cabecalho, linhas: x.linhas } : x.tipo === 'indicadores' ? { indicadores: x.itens }
            : x.tipo === 'fluxo' ? { nos: x.nos.map(n => n.rotulo) } : { texto: x.texto }) })) };
      }) })),
    formatos: Object.entries(FORMATOS).map(([id, f]) => ({ id, rotulo: f.rotulo })),
    tipos: Object.entries(TIPOS).filter(([k]) => k !== 'custom').map(([id, t]) => ({ id, rotulo: t.rotulo })),
    cores: json(a.identidade, {}).cores || {}, origem: json(a.identidade, {}).origem || {}, temLogo: !!json(a.identidade, {}).logo,
  };
}

// Aplica as edições ao conteúdo e ao plano (cópias). Só o que existe é editado; textos limpos e limitados.
function aplicarEdicoes(a, corpo) {
  const conteudo = json(a.conteudo, {}), plano = json(a.plano, {}), opcoes = json(a.opcoes, {}), identidade = json(a.identidade, {});
  const campos = [];
  const txt = v => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_EDICAO);
  const itens = new Map(conteudo.secoes.flatMap(s => s.itens.map(i => [i.id, i])));
  let titulo = a.titulo;
  if (corpo.titulo !== undefined) { titulo = txt(corpo.titulo).slice(0, 90) || a.titulo; const capa = plano.paginas.find(p => p.papel === 'capa') || (!plano.multipagina && plano.paginas[0]); if (capa) capa.titulo = titulo; conteudo.titulo = titulo; campos.push('titulo'); }
  for (const e of Array.isArray(corpo.textos) ? corpo.textos.slice(0, 200) : []) {
    const it = itens.get(String(e?.item)), t = txt(e?.texto);
    if (!it) throw erro(400, 'item', 'Item inexistente no artefato.');
    if (it.tipo === 'lista') { const k = Number(e.indice); if (!it.itens[k]) throw erro(400, 'item', 'Item de lista inexistente.'); if (t) it.itens[k].texto = t; else it.itens.splice(k, 1); }
    else if (it.tipo === 'tabela') { const l = Number(e.linha), c = Number(e.coluna); if (l === -1 && it.cabecalho[c] !== undefined) it.cabecalho[c] = t; else if (it.linhas[l]?.[c] !== undefined) it.linhas[l][c] = t; else throw erro(400, 'item', 'Célula inexistente.'); }
    else if (it.tipo === 'indicadores') { const k = Number(e.indice), campo = e.campo === 'valor' ? 'valor' : e.campo === 'detalhe' ? 'detalhe' : 'rotulo'; if (!it.itens[k]) throw erro(400, 'item', 'Indicador inexistente.'); it.itens[k][campo] = t; }
    else if (it.tipo === 'fluxo') { const k = Number(e.indice); if (!it.nos[k]) throw erro(400, 'item', 'Etapa inexistente.'); if (t) it.nos[k].rotulo = t; }
    else if (t) it.texto = t;
    campos.push('texto');
  }
  const porId = new Map(plano.paginas.map(p => [p.id, p]));
  for (const e of Array.isArray(corpo.paginas) ? corpo.paginas : []) {
    const p = porId.get(String(e?.id)); if (!p) throw erro(400, 'pagina', 'Página inexistente.');
    if (e.titulo !== undefined) p.titulo = txt(e.titulo).slice(0, 90);
    if (e.subtitulo !== undefined) p.subtitulo = txt(e.subtitulo).slice(0, 240);
    campos.push('pagina');
  }
  if (Array.isArray(corpo.remover) && corpo.remover.length) {
    const fora = new Set(corpo.remover.map(String));
    if (fora.size >= plano.paginas.length) throw erro(400, 'remover', 'O artefato precisa de pelo menos uma página.');
    plano.paginas = plano.paginas.filter(p => !fora.has(p.id));
    campos.push('remover');
  }
  if (Array.isArray(corpo.ordem)) {
    const ids = corpo.ordem.map(String);
    if (ids.length !== plano.paginas.length || !ids.every(id => porId.has(id)) || new Set(ids).size !== ids.length) throw erro(400, 'ordem', 'A nova ordem precisa ter todas as páginas, uma vez cada.');
    plano.paginas = ids.map(id => plano.paginas.find(p => p.id === id));
    campos.push('ordem');
  }
  for (const e of Array.isArray(corpo.blocos) ? corpo.blocos : []) {
    const b = plano.paginas.flatMap(p => p.blocos).find(x => x.id === String(e?.id));
    if (!b || !BLOCOS.includes(e.tipo)) throw erro(400, 'bloco', 'Bloco ou tipo inválido.');
    const it = itens.get(b.refs?.[0]);
    const ok = { paragrafo: ['texto', 'citacao', 'cta', 'nota'], lista: ['lista', 'checklist', 'cartoes', 'linha_tempo', 'diagrama'], tabela: ['tabela', 'grafico', 'cartoes'], indicadores: ['indicadores', 'lista'], fluxo: ['diagrama', 'lista'] }[it?.tipo] || [];
    if (!ok.includes(e.tipo)) throw erro(400, 'bloco', 'Este conteúdo não pode virar esse tipo de bloco.');
    b.tipo = e.tipo;
    if (e.tipo === 'grafico') { const g = planejarGrafico(it); if (!g) throw erro(400, 'bloco', 'Esta tabela não tem números para um gráfico.'); b.grafico = g; }
    if (e.tipo === 'diagrama') b.diagrama = { tipo: it.tipo === 'fluxo' ? 'fluxo' : 'processo' };
    campos.push('bloco');
  }
  if (corpo.formato !== undefined) {
    const f = formatoValido(corpo.formato); if (!f) throw erro(400, 'formato', 'Formato inválido.');
    plano.formato = f; plano.canvas = { w: FORMATOS[f].w, h: FORMATOS[f].h }; delete opcoes.escala; campos.push('formato');
  }
  if (corpo.cores && typeof corpo.cores === 'object') {
    // Cor escolhida para esta peça: vale só aqui (origem "inferida"), nunca vira regra; cor proibida pela empresa não entra.
    const proibidas = new Set((identidade.coresProibidas || []).map(corValida));
    for (const k of ['primaria', 'secundaria', 'destaque']) {
      const c = corpo.cores[k];
      if (c === undefined) continue;
      if (!HEX.test(String(c))) throw erro(400, 'cor', 'Cor inválida.');
      if (identidade.origem?.[`cores.${k}`] === 'empresa') throw erro(409, 'cor_da_marca', 'Esta cor é regra da marca da empresa e não pode ser trocada numa peça.');
      if (proibidas.has(corValida(c))) throw erro(409, 'cor_proibida', 'A empresa proibiu esta cor.');
      identidade.cores[k] = corValida(c); identidade.origem[`cores.${k}`] = 'inferida';
    }
    campos.push('cores');
  }
  if (corpo.remover_imagem === true) { opcoes.assets = { ...(opcoes.assets || {}) }; delete opcoes.assets.heroi; campos.push('imagem'); }
  return { conteudo, plano, opcoes: { ...opcoes, ajustesCor: [] }, identidade, titulo, campos: [...new Set(campos)] };
}
// Nova versão (edição, imagem nova ou restauração): composição e conferência de novo, com correção automática.
function novaVersao(app, pessoa, a, { conteudo, plano, opcoes, identidade, titulo, campos, acao = 'visual.edited' }) {
  // Traços da versão: os do plano editado (a edição pode ter mudado formato e páginas); sem exigir número de páginas.
  const tr = { ...tracos({ tipo: a.tipo, formato: plano.formato }, { secoes: conteudo.secoes.length }), multipagina: !!plano.multipagina, capa: plano.paginas.some(p => p.papel === 'capa'), impacto: !!plano.impacto, paginas: null };
  const assets = carregarAssets(app, a.conversa_id, opcoes.assets);
  const { escala, colunas, colunasTentadas, ...resto } = opcoes;
  void escala; void colunas; void colunasTentadas;
  const r = produzir({ plano, conteudo, identidade, tr, assets, opcoes: resto, textosLivres: [titulo] });
  // Edição que faria uma peça de página única cortar conteúdo não é gravada (a restauração devolve o que existia).
  if (!r.plano.multipagina && corta(r) && !campos.includes('restauracao')) throw erro(422, 'nao_cabe', 'Com essa mudança o conteúdo não cabe inteiro na página sem cortar. Escolha outro formato ou tire parte do texto.');
  const q = json(a.qualidade, {});
  const novo = transacao(app.db, () => {
    exec(app.db, 'update artefatos_visuais set atual = 0 where base_id = ?', a.base_id);
    const v = um(app.db, 'select max(versao) as v from artefatos_visuais where base_id = ?', a.base_id).v + 1;
    return Number(exec(app.db, `insert into artefatos_visuais (base_id, versao, atual, conversa_id, mensagem_id, roteamento_id, quick_win_id, quick_win_versao, pessoa_id, entregavel_id, derivado_de, tipo, rotulo, titulo, formato, paginas,
      conteudo, plano, opcoes, identidade, qualidade, status, exportacoes, editado_por, criado_em) values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.base_id, v, a.conversa_id, a.mensagem_id, a.roteamento_id, a.quick_win_id, a.quick_win_versao, a.pessoa_id, a.entregavel_id, a.derivado_de, a.tipo, a.rotulo, titulo, r.plano.formato, r.paginas.length,
      JSON.stringify(conteudo), JSON.stringify(r.plano), JSON.stringify({ ...r.opcoes, assets: opcoes.assets || {} }), JSON.stringify(identidade),
      JSON.stringify({ ...r.registro, plano: q.plano || 'deterministico', imagem: q.imagem || null, avisos: r.explicacoes }), r.registro.status, a.exportacoes, pessoa.id, app.agora().toISOString()).lastInsertRowid);
  });
  registrar(app, acao, pessoa.id, { conversa: a.conversa_id, quick_win: a.quick_win_id, artefato: novo, base: a.base_id, campos, status: r.registro.status, correcoes: r.registro.correcoes });
  return um(app.db, 'select * from artefatos_visuais where id = ?', novo);
}

export function rotasArtefatos(app, r) {
  r.get('/api/artefatos', ({ pessoa, query }) => {
    const conv = um(app.db, 'select id from conversas where id = ? and pessoa_id = ?', Number(query.conversa), pessoa.id);
    if (!conv) throw erro(404, 'conversa', 'Conversa não encontrada.');
    return { artefatos: todos(app.db, 'select * from artefatos_visuais where conversa_id = ? and pessoa_id = ? and atual = 1 order by id', conv.id, pessoa.id).map(a => resumoArtefato(app, a)) };
  });

  r.get('/api/artefatos/:id', ({ pessoa, params }) => {
    const a = meuArtefato(app, pessoa, params.id);
    const versoes = todos(app.db, 'select id, versao, status, criado_em, atual from artefatos_visuais where base_id = ? and pessoa_id = ? order by versao', a.base_id, pessoa.id);
    return { artefato: resumoArtefato(app, a), editavel: editavel(app, a), versoes: versoes.map(v => ({ ...v, atual: !!v.atual })), exportacoes: Object.keys(EXPORTACOES), futuras: EXPORTACOES_FUTURAS };
  });

  // Prévia de uma página (a mesma composição da exportação), em PNG.
  r.get('/api/artefatos/:id/paginas/:n', ({ pessoa, params, query, res }) => {
    const a = meuArtefato(app, pessoa, params.id);
    const paginas = paginasDoArtefato(app, a), n = Number(String(params.n).replace(/\.png$/, ''));
    if (!(n >= 1 && n <= paginas.length)) throw erro(404, 'pagina', 'Página inexistente.');
    const fmt = FORMATOS[a.formato] || FORMATOS.a4;
    const escala = query.miniatura ? Math.min(1, 360 / fmt.w) : Math.min(2, Math.max(0.5, 1400 / Math.max(fmt.w, fmt.h)));
    const k = `png:${app.tenant?.companyId ?? ''}:${a.id}:${n}:${escala}`;
    const png = cache.get(k) || guardarCache(k, pngDaPagina(paginas[n - 1], escala).bytes);
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
    res.end(png);
  });

  r.get('/api/artefatos/:id/baixar', ({ pessoa, params, query, res }) => {
    const a = meuArtefato(app, pessoa, params.id);
    const formato = String(query.formato || 'pdf').toLowerCase();
    const t = Date.now();
    const x = exportar(app, a, formato, query.pagina ? Number(query.pagina) : null);
    registrar(app, 'visual.exported', pessoa.id, { conversa: a.conversa_id, quick_win: a.quick_win_id, artefato: a.id, formato, pagina: query.pagina ? Number(query.pagina) : null, bytes: x.dados.length, ms: Date.now() - t });
    enviarArquivo(res, x.mime, x.nome, x.dados);
  });

  r.patch('/api/artefatos/:id', ({ pessoa, params, corpo }) => {
    const a = meuArtefato(app, pessoa, params.id);
    if (!a.atual) throw erro(409, 'versao_antiga', 'Edite a versão atual (ou restaure esta versão antes).');
    const ed = aplicarEdicoes(a, corpo);
    if (!ed.campos.length) throw erro(400, 'sem_edicao', 'Nada para alterar.');
    const novo = novaVersao(app, pessoa, a, ed);
    return { artefato: resumoArtefato(app, novo), editavel: editavel(app, novo) };
  }, { limiteMb: 2 });

  // Imagem fornecida pela pessoa (foto do produto, da equipe...): validada pelos bytes, nunca executada.
  r.post('/api/artefatos/:id/imagem', ({ pessoa, params, corpo }) => {
    const a = meuArtefato(app, pessoa, params.id);
    if (!a.atual) throw erro(409, 'versao_antiga', 'Edite a versão atual.');
    const dataUrl = String(corpo.imagem || '');
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw erro(400, 'imagem', 'Envie uma imagem PNG, JPG ou WEBP.');
    const g = guardarAsset(app, { conversaId: a.conversa_id, pessoaId: pessoa.id, tipo: 'foto', origem: 'enviado', dataUrl });
    if (!g) throw erro(400, 'imagem', 'A imagem é inválida, maior que 5 MB ou o tipo do arquivo não confere.');
    if (g.w > 10000 || g.h > 10000) throw erro(400, 'imagem', 'Imagem com dimensões grandes demais.');
    const ed = aplicarEdicoes(a, {});
    ed.opcoes.assets = { ...(ed.opcoes.assets || {}), heroi: g.id };
    // Sem lugar para a imagem (capa ou peça de impacto já usam a imagem principal): ela entra na primeira página.
    const usaHeroi = ed.plano.paginas.some(p => p.papel === 'capa' || p.layout === 'destaque') || ed.plano.paginas.some(p => p.blocos.some(b => b.tipo === 'imagem'));
    if (!usaHeroi) (ed.plano.paginas.find(p => p.papel !== 'capa') || ed.plano.paginas[0]).blocos.unshift({ id: `b_img${Date.now() % 1e6}`, tipo: 'imagem', asset: 'heroi', refs: [], proposito: '' });
    ed.campos = ['imagem'];
    const novo = novaVersao(app, pessoa, a, ed);
    return { artefato: resumoArtefato(app, novo), editavel: editavel(app, novo) };
  }, { limiteMb: 8 });

  // Outro artefato com o MESMO conteúdo (apresentação -> one-page, post -> carrossel...): sem nova execução e sem
  // custo de IA (planejador determinístico).
  r.post('/api/artefatos/:id/derivar', ({ pessoa, params, corpo }) => {
    const a = meuArtefato(app, pessoa, params.id);
    const visual = limparVisual({ tipo: corpo.tipo, formato: corpo.formato, paginas: corpo.paginas });
    if (!visual || (tipoDe(corpo.tipo) === 'custom' && !corpo.rotulo)) throw erro(400, 'tipo', 'Escolha o tipo do novo artefato.');
    if (corpo.rotulo) visual.rotulo = String(corpo.rotulo).slice(0, 60);
    // Artefato novo: identidade atual da empresa (as versões antigas guardam a delas, para o histórico).
    const conteudo = json(a.conteudo, {}), identidade = resolverIdentidade(lerConfig(app.db));
    const tr = tracos(visual, { secoes: conteudo.secoes.length });
    const plano = planejar(conteudo, tr, { titulo: a.titulo });
    const opcoes0 = json(a.opcoes, {});
    const assets = carregarAssets(app, a.conversa_id, opcoes0.assets);
    const x = produzirSemCorte({ plano, conteudo, identidade, tr, assets, opcoes: { data: opcoes0.data, idioma: opcoes0.idioma }, textosLivres: [a.titulo] }, { formatoPedido: !!corpo.formato });
    // Nunca um artefato cortado: o que não cabe numa página só é dito, e nada é gravado.
    if (corta(x)) throw erro(422, 'nao_cabe', `O conteúdo não cabe inteiro numa página de ${tr.rotulo} sem cortar. Escolha um tipo de várias páginas (apresentação, relatório) ou um one-page em A4.`);
    const id = Number(exec(app.db, `insert into artefatos_visuais (versao, atual, conversa_id, mensagem_id, roteamento_id, quick_win_id, quick_win_versao, pessoa_id, entregavel_id, derivado_de, tipo, rotulo, titulo, formato, paginas,
      conteudo, plano, opcoes, identidade, qualidade, status, exportacoes, editado_por, criado_em) values (1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.conversa_id, a.mensagem_id, a.roteamento_id, a.quick_win_id, a.quick_win_versao, pessoa.id, a.entregavel_id, a.base_id, tr.tipo, tr.rotulo, a.titulo, x.plano.formato, x.paginas.length,
      JSON.stringify(conteudo), JSON.stringify(x.plano), JSON.stringify({ ...x.opcoes, assets: opcoes0.assets || {} }), JSON.stringify(identidade), JSON.stringify({ ...x.registro, plano: 'deterministico', avisos: x.explicacoes }),
      x.registro.status, JSON.stringify(x.plano.exportacoes), pessoa.id, app.agora().toISOString()).lastInsertRowid);
    exec(app.db, 'update artefatos_visuais set base_id = ? where id = ?', id, id);
    registrar(app, 'visual.derived', pessoa.id, { conversa: a.conversa_id, quick_win: a.quick_win_id, artefato: id, de: a.id, tipo: tr.tipo, formato: x.plano.formato, status: x.registro.status, correcoes: x.registro.correcoes });
    const novo = um(app.db, 'select * from artefatos_visuais where id = ?', id);
    return { artefato: resumoArtefato(app, novo), editavel: editavel(app, novo) };
  });

  r.post('/api/artefatos/:id/restaurar', ({ pessoa, params }) => {
    const a = meuArtefato(app, pessoa, params.id);
    if (a.atual) throw erro(409, 'ja_atual', 'Esta já é a versão atual.');
    const atual = um(app.db, 'select * from artefatos_visuais where base_id = ? and atual = 1', a.base_id) || a;
    const novo = novaVersao(app, pessoa, atual, { conteudo: json(a.conteudo, {}), plano: json(a.plano, {}), opcoes: json(a.opcoes, {}), identidade: json(a.identidade, {}), titulo: a.titulo, campos: ['restauracao'], acao: 'visual.restored' });
    return { artefato: resumoArtefato(app, novo), editavel: editavel(app, novo) };
  });
}
