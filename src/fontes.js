// Fontes do Quick Win: o que a execução usa como base, além do pedido do dia. Uma fonte é um arquivo, um link, o
// conhecimento da empresa ou um material da conversa, sempre com um PAPEL:
//   KNOWLEDGE_BASE   base de conhecimento: fundamento factual (política, manual, norma, documento do projeto);
//   REFERENCE        referência: estilo, estrutura, linguagem, formato — NUNCA fato do novo caso;
//   REQUIRED_SOURCE  fonte obrigatória: o resultado precisa usá-la; ilegível ou ausente, o resultado não sai aprovado;
//   SUPPLEMENTARY    material complementar: ajuda se houver, não bloqueia.
// Sem arquitetura paralela: arquivos e links do Quick Win são documentos (tabela documentos, com quick_win_id, papel,
// tipo e situação da leitura); o conhecimento da empresa é a base já existente (escopo em quick_wins.bases); o
// material da conversa são os anexos. O link é lido pela MESMA rede segura do Integration Builder (bloqueia
// localhost, rede interna, metadados, redirecionamento suspeito, DNS rebinding) e só a forma mascarada aparece.
import { createHash } from 'node:crypto';
import { erro } from './http.js';
import { exec, json, todos, um } from './db.js';
import { registrar } from './eventos.js';
import { extrairTexto } from './texto.js';
import { indexar, desindexar } from './busca.js';
import { buscaSegura, ErroRede } from './integracoes/rede.js';
import { cifrar } from './plataforma/segredo.js';

export const PAPEIS = {
  KNOWLEDGE_BASE: { rotulo: 'Base de conhecimento', descricao: 'Fundamento factual do trabalho.' },
  REFERENCE: { rotulo: 'Referência', descricao: 'Estilo, estrutura, linguagem e formato; não é fato do novo caso.' },
  REQUIRED_SOURCE: { rotulo: 'Fonte obrigatória', descricao: 'O resultado precisa usar esta fonte.' },
  SUPPLEMENTARY: { rotulo: 'Material complementar', descricao: 'Ajuda quando houver; não bloqueia.' },
};
export const TIPOS_FONTE = ['file', 'url', 'company_knowledge', 'conversation_material'];
export const STATUS_FONTE = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'UNSUPPORTED'];
export const papelValido = p => (PAPEIS[p] ? p : null);
const sha = t => createHash('sha256').update(String(t)).digest('hex').slice(0, 32);
const limpar = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---- Links -----------------------------------------------------------------------------------------------------
// Forma que pode aparecer na tela e no registro: sem usuário/senha e sem a query (token, assinatura, chave).
export function mascararUrl(u) {
  try { const x = new URL(String(u)); return `${x.protocol}//${x.host}${x.pathname}${x.search ? '?…' : ''}`.slice(0, 300); } catch { return '(link inválido)'; }
}
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodificar = t => t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()] ?? m));
// HTML -> texto com a estrutura útil (títulos, itens, linhas de tabela). Nada do HTML é executado.
export function textoDoHtml(html) {
  let h = String(html || '');
  const titulo = decodificar((/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(h) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '').replace(/\s+/g, ' ').trim();
  h = h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template|iframe|nav|footer|aside|form|head)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  h = h.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, t) => `\n\n${'#'.repeat(Math.min(3, Number(n) + 1))} ${t}\n`)
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<tr[^>]*>/gi, '\n| ').replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<(br|\/p|\/div|\/section|\/article|\/table|\/ul|\/ol|p|div)[^>]*>/gi, '\n');
  const texto = decodificar(h.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { titulo, texto };
}
export class ErroFonte extends Error { constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; } }
// Lê um link público (só https). Link que exige login não é "adivinhado": falha com o motivo.
// `buscar` (padrão: buscaSegura) só existe para os testes servirem páginas falsas; quem chama em produção não passa.
export async function lerLink(url, { lookup, tempoMs = 15000, maxBytes = 4 * 1024 * 1024, buscar = buscaSegura } = {}) {
  let u;
  try { u = new URL(String(url).trim()); } catch { throw new ErroFonte('link_invalido', 'Link inválido.'); }
  if (u.protocol !== 'https:') throw new ErroFonte('so_https', 'Use um link https.');
  if (u.username || u.password) throw new ErroFonte('credencial_no_link', 'O link não pode ter usuário ou senha.');
  // Nomes de rede interna: nem chegam ao DNS (a rede segura também bloqueia pelo IP resolvido).
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.intranet|.*\.lan|metadata(\..*)?)$/i.test(u.hostname)) throw new ErroFonte('destino_bloqueado', 'Este endereço não pode ser acessado (rede interna ou endereço reservado).');
  const host = u.hostname.toLowerCase(), hosts = [...new Set([host, host.startsWith('www.') ? host.slice(4) : `www.${host}`])];
  let r;
  try {
    r = await buscar({ url: u.toString(), metodo: 'GET', hosts, redePrivada: false, tempoMs, maxBytes, lookup,
      cabecalhos: { accept: 'text/html,application/xhtml+xml,text/plain,application/json,application/pdf;q=0.9,*/*;q=0.5', 'user-agent': 'GreenIA-Fontes/1.0' } });
  } catch (e) {
    if (e instanceof ErroRede) throw new ErroFonte(e.codigo === 'host_nao_autorizado' ? 'redirecionamento_externo' : e.codigo, e.codigo === 'destino_bloqueado' ? 'Este endereço não pode ser acessado (rede interna ou endereço reservado).'
      : e.codigo === 'host_nao_autorizado' ? 'O link redireciona para outro site: use o endereço final.' : e.codigo === 'tempo_esgotado' ? 'O site demorou demais para responder.' : 'Não foi possível ler o link.');
    throw new ErroFonte('falha_leitura', 'Não foi possível ler o link.');
  }
  if (r.status === 401 || r.status === 403) throw new ErroFonte('exige_autenticacao', 'Este link exige login. Para conteúdo restrito, use uma integração configurada pela empresa.');
  if (r.status >= 400) throw new ErroFonte('http_' + r.status, `O site respondeu com erro (${r.status}).`);
  const tipo = String(r.cabecalhos['content-type'] || '').toLowerCase();
  const corpo = Buffer.from(r.corpo || []);
  if (tipo.includes('pdf') || corpo.subarray(0, 4).toString() === '%PDF') {
    const x = await extrairTexto({ nome: 'link.pdf', base64: corpo.toString('base64') });
    return { titulo: decodeURIComponent(u.pathname.split('/').pop() || host), texto: x.texto, mime: 'application/pdf' };
  }
  if (tipo.includes('html') || /^\s*<(!doctype|html)/i.test(corpo.subarray(0, 200).toString())) {
    const { titulo, texto } = textoDoHtml(corpo.toString('utf8'));
    if (!texto || texto.length < 20) throw new ErroFonte('sem_texto', 'A página não tem texto legível (pode depender de JavaScript ou de login).');
    return { titulo: titulo || host, texto, mime: 'text/html' };
  }
  if (tipo.includes('json') || tipo.startsWith('text/')) return { titulo: host + u.pathname, texto: corpo.toString('utf8'), mime: tipo.split(';')[0] || 'text/plain' };
  throw new ErroFonte('formato_nao_suportado', 'Este tipo de conteúdo não é suportado como fonte (use página, texto, JSON ou PDF).');
}

// ---- Fontes do Quick Win (documentos) -----------------------------------------------------------------------
const MAX_TEXTO_FONTE = 400_000;
function gravar(app, { qwId, pessoaId, titulo, nome, texto, papel, tipo, url = null, mime = null, sigiloso = false }) {
  const id = Number(exec(app.db, `insert into documentos (titulo, arquivo, quick_win_id, sigiloso, texto, enviado_por, papel, tipo_fonte, url_cifrada, url_exibida, status, hash, mime)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)`, limpar(titulo, 200) || nome, nome, qwId, Number(!!sigiloso), texto.slice(0, MAX_TEXTO_FONTE), pessoaId, papel, tipo,
  url && app.mestra ? JSON.stringify(cifrar(app.mestra(), url)) : null, url ? mascararUrl(url) : null, sha(texto), mime).lastInsertRowid);
  indexar(app.db, id, texto.slice(0, MAX_TEXTO_FONTE));
  return id;
}
export async function adicionarArquivo(app, pessoa, qw, { arquivo, titulo, papel = 'KNOWLEDGE_BASE', sigiloso = false }) {
  const p = papelValido(papel) || 'KNOWLEDGE_BASE';
  const { nome, texto } = await extrairTexto(arquivo || {}, { ocr: app.ocr, limitesOcr: app.limitesOcr });
  const id = gravar(app, { qwId: qw.id, pessoaId: pessoa.id, titulo: String(titulo || '').trim() || nome.replace(/\.[^.]+$/, ''), nome, texto, papel: p, tipo: 'file', mime: mimeDoNome(nome), sigiloso });
  registrar(app, 'source.added', pessoa.id, { quick_win: qw.id, fonte: id, tipo: 'file', papel: p, caracteres: texto.length });
  return id;
}
export async function adicionarLink(app, pessoa, qw, { url, titulo, papel = 'KNOWLEDGE_BASE' }) {
  const p = papelValido(papel) || 'KNOWLEDGE_BASE';
  const exibida = mascararUrl(url);
  try {
    const r = await lerLink(url, { lookup: app.dnsLookup, buscar: app.buscarLink });
    const id = gravar(app, { qwId: qw.id, pessoaId: pessoa.id, titulo: String(titulo || '').trim() || r.titulo, nome: exibida, texto: r.texto, papel: p, tipo: 'url', url, mime: r.mime });
    registrar(app, 'source.added', pessoa.id, { quick_win: qw.id, fonte: id, tipo: 'url', papel: p, host: new URL(url).hostname, caracteres: r.texto.length });
    return id;
  } catch (e) {
    // Fonte que falhou fica registrada (situação FAILED/UNSUPPORTED e o motivo): obrigatória que falhou não some.
    const codigo = e instanceof ErroFonte ? e.codigo : 'falha_leitura';
    const status = codigo === 'formato_nao_suportado' ? 'UNSUPPORTED' : 'FAILED';
    const id = Number(exec(app.db, `insert into documentos (titulo, arquivo, quick_win_id, sigiloso, texto, enviado_por, papel, tipo_fonte, url_cifrada, url_exibida, status, erro)
      values (?, ?, ?, 0, '', ?, ?, 'url', ?, ?, ?, ?)`, limpar(titulo, 200) || exibida, exibida, qw.id, pessoa.id, p, url && app.mestra ? JSON.stringify(cifrar(app.mestra(), String(url))) : null, exibida, status,
    e instanceof ErroFonte ? e.message : 'Não foi possível ler o link.').lastInsertRowid);
    registrar(app, 'source.failed', pessoa.id, { quick_win: qw.id, fonte: id, tipo: 'url', papel: p, motivo: codigo });
    return id;
  }
}
const mimeDoNome = n => ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[String(n).split('.').pop().toLowerCase()] || null;
export async function substituirArquivo(app, pessoa, qw, docId, arquivo) {
  const d = um(app.db, 'select * from documentos where id = ? and quick_win_id = ?', Number(docId), qw.id);
  if (!d) throw erro(404, 'fonte', 'Fonte não encontrada.');
  const { nome, texto } = await extrairTexto(arquivo || {}, { ocr: app.ocr, limitesOcr: app.limitesOcr });
  exec(app.db, "update documentos set arquivo = ?, texto = ?, hash = ?, versao_fonte = versao_fonte + 1, status = 'READY', erro = null, mime = ?, atualizado_em = datetime('now') where id = ?", nome, texto.slice(0, MAX_TEXTO_FONTE), sha(texto), mimeDoNome(nome), d.id);
  indexar(app.db, d.id, texto.slice(0, MAX_TEXTO_FONTE));
  registrar(app, 'source.updated', pessoa.id, { quick_win: qw.id, fonte: d.id, versao: d.versao_fonte + 1 });
}
export function mudarPapel(app, pessoa, qw, docId, papel) {
  const p = papelValido(papel); if (!p) throw erro(400, 'papel', 'Papel inválido.');
  const d = um(app.db, 'select id from documentos where id = ? and quick_win_id = ?', Number(docId), qw.id);
  if (!d) throw erro(404, 'fonte', 'Fonte não encontrada.');
  exec(app.db, "update documentos set papel = ?, atualizado_em = datetime('now') where id = ?", p, d.id);
  registrar(app, 'source.role_changed', pessoa.id, { quick_win: qw.id, fonte: d.id, papel: p });
}
export function removerFonte(app, pessoa, qw, docId) {
  const d = um(app.db, 'select id from documentos where id = ? and quick_win_id = ?', Number(docId), qw.id);
  if (!d) throw erro(404, 'fonte', 'Fonte não encontrada.');
  desindexar(app.db, d.id);
  exec(app.db, 'delete from documentos where id = ?', d.id);
  registrar(app, 'source.removed', pessoa.id, { quick_win: qw.id, fonte: d.id });
}

// Lista unificada (o modelo genérico de fonte), sem conteúdo nem link real.
export function fontesDoQw(app, qw) {
  const docs = todos(app.db, 'select id, titulo, arquivo, papel, tipo_fonte, url_exibida, status, erro, hash, versao_fonte, mime, sigiloso, criado_em, length(texto) as caracteres from documentos where quick_win_id = ? order by id', qw.id);
  const out = docs.map(d => ({ id: `doc:${d.id}`, documento_id: d.id, tipo: d.tipo_fonte || 'file', papel: d.papel || 'KNOWLEDGE_BASE', titulo: d.titulo, origem: d.tipo_fonte === 'url' ? d.url_exibida : d.arquivo,
    mime_type: d.mime, url: d.url_exibida || null, status: d.status || 'READY', erro: d.erro || null, obrigatoria: d.papel === 'REQUIRED_SOURCE', versao: d.versao_fonte || 1, hash: d.hash || null, caracteres: d.caracteres, sigilosa: !!d.sigiloso, criada_em: d.criado_em }));
  const b = json(qw.bases, { modo: 'area' });
  if (b.modo !== 'nenhuma') out.push({ id: 'base', tipo: 'company_knowledge', papel: papelValido(b.papel) || 'KNOWLEDGE_BASE', titulo: b.modo === 'escolhidas' ? `Base da empresa (${(b.ids || []).length} documento(s))` : 'Base da empresa (permitida para as áreas do Quick Win)',
    origem: 'base_da_empresa', escopo: b.modo === 'escolhidas' ? { modo: 'documentos', ids: b.ids || [] } : { modo: 'toda_permitida' }, status: 'READY', obrigatoria: b.papel === 'REQUIRED_SOURCE' });
  return out;
}
// Retrato das fontes para a versão publicada e para cada execução (auditoria e reprodutibilidade).
export const retratoFontes = (app, qw) => fontesDoQw(app, qw).map(f => ({ id: f.id, tipo: f.tipo, papel: f.papel, titulo: f.titulo, versao: f.versao ?? null, hash: f.hash ?? null, status: f.status }));
export function mudaramDesde(app, qw, retrato) {
  if (!Array.isArray(retrato)) return false;
  const agora = new Map(retratoFontes(app, qw).map(f => [f.id, f]));
  return retrato.length !== agora.size || retrato.some(f => { const a = agora.get(f.id); return !a || a.hash !== f.hash || a.papel !== f.papel || a.status !== f.status; });
}

// ---- Papel na conversa (comandos naturais) --------------------------------------------------------------------
// "ignore esse documento", "use só esta planilha", "considere este link apenas como referência", "esse PDF é a fonte
// principal": muda o papel do material da conversa (o mais recente do tipo citado; ou o citado pelo nome).
const TIPO_CITADO = [[/\b(link|site|pagina|página|url)\b/, a => a.tipo_fonte === 'url'], [/\b(planilha|xlsx|csv)\b/, a => /\.(xlsx|csv)$/i.test(a.nome)],
  [/\b(pdf)\b/, a => /\.pdf$/i.test(a.nome)], [/\b(imagem|foto|png|jpe?g)\b/, a => /\.(png|jpe?g|webp)$/i.test(a.nome)], [/\b(documento|arquivo|anexo|material)\b/, () => true]];
export function comandoDeFonte(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.length > 200) return null;
  let acao = null;
  if (/\b(ignore|ignora|desconsidere|nao use|não use|tire)\b/.test(t)) acao = { ignorar: true };
  else if (/\b(apenas|so|somente)\s+como\s+referencia|\bcomo\s+referencia\b/.test(t)) acao = { papel: 'REFERENCE' };
  else if (/\bfonte principal\b|\bfonte obrigatoria\b|\bbase principal\b/.test(t)) acao = { papel: 'REQUIRED_SOURCE' };
  else if (/\b(use so|use somente|use apenas|usar so|usar somente)\b/.test(t)) acao = { exclusiva: true };
  else if (/\b(use|usar|considere)\s+(este|esta|esse|essa|o|a)\s+/.test(t)) acao = { papel: 'KNOWLEDGE_BASE', reativar: true };
  if (!acao) return null;
  const filtro = TIPO_CITADO.find(([re]) => re.test(t));
  if (!filtro) return null;
  return { ...acao, filtro: filtro[1], trecho: t };
}
export function aplicarComandoDeFonte(app, conv, cmd) {
  // Só o material que foi lido (link que falhou não é alvo de "use", "só referência"...).
  const anexos = todos(app.db, "select id, nome, tipo_fonte, papel, ignorada from anexos where conversa_id = ? and texto not like '[Este link não pôde ser lido%' order by id desc", conv.id);
  const pelo = anexos.filter(cmd.filtro);
  const nomeado = pelo.find(a => cmd.trecho.includes(String(a.nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]+$/, '')));
  const alvo = nomeado || pelo[0];
  if (!alvo) return null;
  if (cmd.exclusiva) { exec(app.db, 'update anexos set ignorada = 1 where conversa_id = ? and id != ?', conv.id, alvo.id); exec(app.db, 'update anexos set ignorada = 0 where id = ?', alvo.id); }
  else if (cmd.ignorar) exec(app.db, 'update anexos set ignorada = 1 where id = ?', alvo.id);
  else exec(app.db, 'update anexos set papel = ?, ignorada = 0 where id = ?', cmd.papel, alvo.id);
  return { anexo: alvo.id, nome: alvo.nome, acao: cmd.exclusiva ? 'exclusiva' : cmd.ignorar ? 'ignorada' : cmd.papel };
}

// ---- Bloco do prompt -----------------------------------------------------------------------------------------
// Cada fonte entra marcada com o id curto e o papel; a referência entra separada e com a instrução de não virar fato.
export const INSTRUCAO_FONTES = [
  'Fontes deste trabalho: cada uma tem um código [F1], [F2]... e um papel.',
  '- Base de conhecimento e fonte obrigatória: fundamento factual. A fonte obrigatória precisa ser usada no que for relevante.',
  '- Material complementar: use se ajudar.',
  '- Referência: use só como modelo de estilo, estrutura, linguagem e formato. Nunca copie dela números, nomes, clientes, datas, condições ou resultados como se fossem deste caso.',
  'Quando uma informação do resultado vier de uma fonte, indique a origem no fim do item ou parágrafo, assim: (Fonte: <título> — <página, seção ou trecho, se houver>). Em peças visuais curtas, a indicação pode ficar fora da peça.',
  'O que não estiver no pedido, no material nem nas fontes de fato, não afirme: marque como não informado ou como inferência.',
].join('\n');
