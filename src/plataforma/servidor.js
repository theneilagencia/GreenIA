// Servidor multiempresa: uma base de código e um processo para todas as empresas.
// Resolve a empresa (tenant) pelo domínio próprio, pelo subdomínio ou pelo caminho /<slug>,
// sempre no servidor, e entrega a requisição ao ambiente daquela empresa com a sessão e as
// permissões lidas do banco da plataforma. O console do operador da plataforma fica em /plataforma.
import { erroParaLog } from '../registro-seguro.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { criarApp, VERSAO } from '../servidor.js';
import { criarEmail, explicarFalhaEmail } from '../email.js';
import { registrarEmailEmpresa } from '../admin.js';
import { semMarcaDaPlataforma } from '../../public/marca-branca.js';
import { aplicarHomologacoesPlataforma } from '../modelos.js';
import { REQUISITOS_PLATAFORMA } from '../sigilo.js';
import { registrarFalhaEmail, registrarEnvioOk } from './email-falhas.js';
import { criarSimulada, criarOpenRouter } from '../ia.js';
import { chaveMestra, cifrar, decifrar, mascarar } from './segredo.js';
import { ErroIA } from '../ia.js';
import { impressaoChave, fusoValido, FUSO_PADRAO, registrarRecusa, registrarLeitura, chaveRecusada, podeRevalidar, marcarRevalidacao, conferirChave } from './chave-validade.js';
import { lerConfig, salvarConfig } from '../config.js';
import { carregarPessoa, dominioPermitido } from '../auth.js';
import { cabecalhosSeguranca, criarRoteador, enviarJson, ErroHttp, lerCookies, lerCorpo, servirEstatico } from '../http.js';
import { exec, todos, um, json } from '../db.js';
import { abrirPlataforma, lerAjuste, salvarAjuste } from './db.js';
import { semearRbac, permissoesNaEmpresa, ehAdminPlataforma, roleDeSistema } from './rbac.js';
import { acessoValido, encerrarAcesso } from './acessos.js';
import * as E from './empresas.js';
import { COOKIE_CONTEXTO, lerSessaoBruta, checarCsrf } from './sessao.js';
import { rotasAuthEmpresa, rotasPublicoEmpresa } from './api-publica.js';
import { rotasPlataforma } from './api-plataforma.js';
import { rotasEmpresa } from './api-empresa.js';
import { slugDe, SLUGS_RESERVADOS } from './validar.js';
import { sincronizarProvedor, verificarDominio } from './dominio.js';
import { criarEncontrar } from './encontrar.js';
import { rotasEncerramentoEmpresa, migrarCanceladas, paginaDevolucao, entregarDevolucao } from './encerramento.js';
import { migrarContatosAntigos, registrarFormulario } from './contatos.js';
import { randomUUID } from 'node:crypto';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const PUBLICO = join(RAIZ, 'public');
const PAGINAS_EMPRESA = { '/': 'index.html', '/entrar': 'entrar.html', '/app': 'app.html', '/politica': 'politica.html', '/encerramento': 'encerramento.html' };
const PAGINAS_EMPRESA_ARQUIVOS = new Set(Object.values(PAGINAS_EMPRESA));
const DOCUMENTOS_LEGAIS = { '/termos': '/termos', '/termos.html': '/termos', '/privacidade': '/privacidade', '/privacidade.html': '/privacidade' };
const ICONE_PADRAO = '/assets/ia-neutro.svg';   // empresa sem ícone próprio: ícone neutro (white label)

/**
 * @param {{ banco?: string, pastaEmpresas?: string, ia?: object, email?: object, agora?: () => Date, log?: Function, cookieSeguro?: boolean,
 *   hostPlataforma?: string, urlBase?: string, subdominioBase?: string, admins?: string[], paginaInicial?: string, legado?: object }} op
 */
export function criarPlataforma(op = {}) {
  const db = abrirPlataforma(op.banco ?? ':memory:');
  const P = {
    db, agora: op.agora ?? (() => new Date()), log: op.log ?? console.log, ia: iaTrocavel(op.ia ?? criarSimulada(), { aoRecusar: () => P.aoRecusarChave?.(), bloqueio: () => P.bloqueioChave?.() }), iaPadrao: op.ia ?? criarSimulada(),
    cookieSeguro: op.cookieSeguro ?? true, pastaEmpresas: op.pastaEmpresas ?? (op.banco && op.banco !== ':memory:' ? join(dirname(op.banco), 'empresas') : ':memory:'),
    hostPlataforma: (op.hostPlataforma || '').toLowerCase(), urlBase: op.urlBase || '', subdominioBase: (op.subdominioBase || '').toLowerCase(),
    paginaInicial: op.paginaInicial === 'vendas' ? 'vendas' : 'plataforma', tenants: new Map(),
    dns: op.dns || null, provedorDominios: op.provedorDominios || null, emAndamento: new Map(),
  };
  if (P.pastaEmpresas !== ':memory:') mkdirSync(P.pastaEmpresas, { recursive: true });
  // Cópias operacionais das exportações (exportacoes.js): ao lado dos bancos, ou numa pasta temporária em memória.
  P.pastaExportacoes = op.pastaExportacoes ?? (P.pastaEmpresas !== ':memory:' ? join(dirname(P.pastaEmpresas), 'exportacoes') : join(tmpdirSeguro(), 'greenia-exportacoes', randomUUID()));
  P.exclusaoAplicar = op.exclusaoAplicar === true;
  // Chave do OpenRouter informada no console: cifrada no banco; vale sobre a variável OPENROUTER_API_KEY.
  P.criarIA = op.criarIA ?? (chave => criarOpenRouter({ chave }));
  P.chaveVariavel = op.chaveVariavel || null;   // só a máscara da chave da variável de ambiente
  P.chaveVariavelId = op.chaveVariavelId || null;
  // Fuso da plataforma: só para exibir datas (e converter a data digitada no console). O cálculo é em UTC.
  P.fuso = fusoValido(op.fuso) ? op.fuso : FUSO_PADRAO;
  if (op.fuso && !fusoValido(op.fuso)) P.log(`PLATAFORMA_FUSO inválido ("${op.fuso}"): usando ${FUSO_PADRAO}.`);   // impressão digital da chave da variável (nunca a chave)
  P.chaveAtual = () => origemChaveOpenRouter(P);
  // Recusa (401) num envio: registra na hora, derruba o cache da conta e avisa os admins já.
  P.aoRecusarChave = () => { const cfg = P.chaveAtual(); registrarRecusa(P, cfg, 'envio'); P._contaOR = null; conferirChave(P, cfg).catch(e => P.log('aviso de chave', e.message)); };
  // Chave já recusada: não insiste no OpenRouter a cada mensagem; revalida no máximo a cada 10 minutos.
  P.bloqueioChave = async () => {
    const cfg = P.chaveAtual();
    if (!chaveRecusada(P, cfg)) return;
    if (podeRevalidar(P, cfg)) {
      marcarRevalidacao(P, cfg);
      registrarLeitura(P, cfg, await P.ia.conta().catch(() => null));
      P._contaOR = null;
      if (!chaveRecusada(P, cfg)) return;
    }
    throw new ErroIA('A chave de IA da plataforma foi recusada pelo provedor. Os administradores já foram avisados; tente de novo depois da troca da chave.', 503);
  };
  P.mestra = () => (P._mestra ??= op.chaveMestra ?? chaveMestra({ pasta: op.banco && op.banco !== ':memory:' ? dirname(op.banco) : join(tmpdirSeguro(), 'greenia') }));
  // SMTP da plataforma: o das variáveis (SMTP_URL ou SMTP_SERVIDOR/...); sem elas, o configurado no console.
  P.avisarSemEmail = !!op.avisarSemEmail;
  P.smtpPadrao = { url: op.smtpPadrao?.url || '', remetente: op.smtpPadrao?.remetente || '' };
  // As variáveis do servidor, quando definidas, mandam: são a configuração explícita de quem opera.
  P.lerSmtp = () => { if (P.smtpPadrao.url) return P.smtpPadrao; return lerAjuste(db, 'smtp', { url: '', remetente: '' }); };
  const base = op.email ?? criarEmail({ lerSmtp: P.lerSmtp, log: P.log });
  // Email da plataforma com registro: sucesso limpa o aviso; falha é registrada (sem segredos) e repassada.
  P.email = { enviados: base.enviados,
    async enviar(...a) { try { const r = await base.enviar(...a); registrarEnvioOk(P); return r; } catch (e) { registrarFalhaEmail(P, { escopo: 'plataforma', origem: 'email da plataforma', erro: e }); throw e; } } };

  semearRbac(db, P.agora().toISOString());
  P.aplicarAoTenant = id => aplicarAoTenant(P, id);
  P.abrirTenant = id => abrirTenant(P, id);
  P.tenant = id => P.tenants.get(id) || abrirTenant(P, id);
  P.sincronizarPessoa = (companyId, userId, op) => sincronizarPessoa(P, companyId, userId, op);
  P.emailDa = companyId => P.tenant(companyId).email;
  P.encontrar = criarEncontrar(P);
  P.adminsPlataforma = () => todos(db, "select u.email from platform_members m join users u on u.id = m.user_id where u.status = 'ativo'").map(x => x.email);
  // Domínio trocado: atualiza o provedor de hospedagem e confere o DNS em segundo plano.
  P.aoMudarDominio = (id, antigo, novo) => { P.pendenteDominio = sincronizarProvedor(P, id, antigo, novo).then(() => novo && verificarDominio(P, id)).catch(e => P.log('dominio', e.message)); };
  P.aoMudarAdmins = () => { const lista = P.adminsPlataforma(); for (const t of P.tenants.values()) t.operadores = lista; };
  E.semearPlanos(P);

  // Admins da plataforma vindos da variável (PLATAFORMA_ADMINS): sempre ativos.
  for (const email of (op.admins || []).map(e => e.trim().toLowerCase()).filter(Boolean)) {
    const u = E.garantirUsuario(P, email);
    exec(db, "update users set status = 'ativo' where id = ?", u.id);
    exec(db, "insert into platform_members (user_id, role) values (?, 'platform_admin') on conflict (user_id) do nothing", u.id);
  }
  if (op.legado) { importarInstalacao(P, op.legado); copiarSmtpLegado(P, op.legado.banco); }
  migrarCanceladas(P);
  migrarContatosAntigos(P);
  E.preencherTextosMarca(P);
  E.neutralizarAvisosAntigos(P);
  const salva = lerChaveOpenRouter(P);
  if (salva?.chave) P.ia.trocar(P.criarIA(salva.chave));
  else if (salva && !salva.chave) P.log('ATENÇÃO: a chave do OpenRouter salva no console não pôde ser lida (chave-mestra diferente). Informe a chave de novo em Uso.');
  E.liberarDominioParaTodos(P);
  for (const c of todos(db, 'select id from companies')) abrirTenant(P, c.id);

  const rPlat = criarRoteador(), rEmp = criarRoteador();
  rotasPlataforma(P, rPlat);
  rotasAuthEmpresa(P, rEmp);
  rotasPublicoEmpresa(P, rEmp);
  rotasEncerramentoEmpresa(P, rEmp);
  rotasEmpresa(P, rEmp);
  P.servidor = createServer((req, res) => tratar(P, rPlat, rEmp, req, res));
  return P;
}

// ---------------------------------------------------------------- Ambientes das empresas
function abrirTenant(P, id) {
  const c = um(P.db, 'select * from companies where id = ?', id);
  if (!c) return null;
  let t;
  const smtpProprio = criarEmail({ lerSmtp: () => lerConfig(t.db).smtp, log: P.log });
  // Email da empresa: o próprio (se configurado) e, se ele falhar, o da plataforma. A falha fica registrada.
  // White label: o email que sai do ambiente da empresa não traz o nome da plataforma.
  const email = {
    async enviar(para, assunto, texto, ...resto) {
      const a = [para, semMarcaDaPlataforma(assunto), semMarcaDaPlataforma(texto), ...resto];
      if (lerConfig(t.db).smtp.url) {
        try { const r = await smtpProprio.enviar(...a); registrarEmailEmpresa(t, true); return r; } catch (e) {
          registrarFalhaEmail(P, { escopo: `empresa ${id}`, origem: 'email próprio da empresa (tentando o da plataforma)', erro: e });
          registrarEmailEmpresa(t, false, explicarFalhaEmail(e, lerConfig(t.db).smtp), true);   // o admin da empresa também vê
        }
      }
      return P.email.enviar(...a);
    },
    get enviados() { return P.email.enviados; },
  };
  t = criarApp({ banco: c.banco, ia: P.ia, email, agora: P.agora, log: P.log, cookieSeguro: P.cookieSeguro, tenant: { companyId: id } });
  t.emailProprio = smtpProprio;   // o teste do admin da empresa usa só o email dela, sem cair no da plataforma
  t.extraEu = sessao => ({
    permissoes: sessao.pessoa.permissoes || [],
    plataforma: { empresa: publicaEmpresa(P, id), adminPlataforma: !!sessao.pessoa.adminPlataforma, acessoOperador: sessao.pessoa.acessoOperador || null, podeEditar: E.podeEditar(P, id), recursos: E.lerPlanoPorId(P, E.lerEmpresa(P, id).plan_id)?.features || {} },
  });
  t.checarRecurso = (metodo, caminho) => checarRecurso(P, id, t, metodo, caminho);
  P.tenants.set(id, t);
  aplicarAoTenant(P, id);
  return t;
}

// Plano, marca e admins da plataforma valem na hora no ambiente da empresa.
function aplicarAoTenant(P, id) {
  const t = P.tenants.get(id);
  const c = E.lerEmpresa(P, id);
  if (!t || !c) return;
  const plano = E.lerPlanoPorId(P, c.plan_id);
  // Plano com 0 créditos é ilimitado: não bloqueia nem avisa, mas continua sendo um plano (o cliente vê créditos, nunca dólar).
  t.plano = !plano ? null : plano.credits > 0 ? { creditos: plano.credits, reserva: plano.reserve, precoUsd: plano.price_usd } : { ilimitado: true, creditos: 0, reserva: 0, precoUsd: plano.price_usd };
  const mpm = plano?.limits?.messages_per_minute;
  t.rajada = plano ? (mpm > 0 ? mpm : Infinity) : undefined;
  t.operadores = P.adminsPlataforma();
  // Requisitos mínimos da plataforma para informação sigilosa (a empresa não os remove) e as autorizações/vetos.
  salvarConfig(t.db, { requisitosSigilo: REQUISITOS_PLATAFORMA });
  aplicarHomologacoesPlataforma(t.db, lerAjuste(P.db, 'homologacoes_plataforma', []) || [], P.agora(), lerAjuste(P.db, 'vetos_sigilo_plataforma', []) || []);   // autorizações e vetos da operadora para dados sigilosos
  t.linkApp = () => `${E.urlDaEmpresa(P, E.lerEmpresa(P, id) || c)}/app`;   // links nos emails da empresa
  const b = E.lerMarca(P, id);
  const parcial = { empresa: b?.display_name || c.name, logo: b?.logo || '', corMarca: b?.primary_color || '' };
  if (b?.privacy_note) parcial.privacyNote = b.privacy_note;
  salvarConfig(t.db, parcial);
}

function checarRecurso(P, id, t, metodo, caminho) {
  if (metodo === 'GET') return;
  const plano = E.lerPlanoPorId(P, E.lerEmpresa(P, id).plan_id);
  const f = plano?.features || {};
  if (caminho === '/api/quick-wins' && metodo === 'POST') {
    if (plano && !f.quick_wins) throw new ErroHttp(403, 'recurso_do_plano', 'Quick wins não fazem parte do plano desta empresa.');
    const max = plano?.limits?.max_quick_wins || 0;
    if (max && um(t.db, 'select count(*) as n from quick_wins').n >= max) throw new ErroHttp(409, 'limite_quick_wins', `O plano desta empresa permite até ${max} quick wins.`);
  }
  if (caminho.startsWith('/api/bases') && plano && !f.knowledge) throw new ErroHttp(403, 'recurso_do_plano', 'A base de conhecimento não faz parte do plano desta empresa.');
}

// Vínculo na plataforma → pessoa no banco da empresa (a identidade global fica em users).
function sincronizarPessoa(P, companyId, userId, { operador = false } = {}) {
  const t = P.tenant(companyId);
  const u = um(P.db, 'select * from users where id = ?', userId);
  if (!u) return null;
  const v = um(P.db, 'select role_id, status from company_users where company_id = ? and user_id = ?', companyId, userId);
  const op = operador && ehAdminPlataforma(P.db, userId);
  const admin = op || (v && permissoesNaEmpresa(P.db, userId, companyId).has('company.manage'));
  const ativo = (v && v.status !== 'inativo' && u.status === 'ativo') || op ? 1 : 0;
  const existente = um(t.db, 'select id from pessoas where user_id = ?', userId) || um(t.db, 'select id from pessoas where email = ?', u.email);
  if (existente) exec(t.db, 'update pessoas set user_id = ?, email = ?, nome = ?, papel = ?, ativo = ? where id = ?', userId, u.email, u.name || u.email.split('@')[0], admin ? 'admin' : 'usuario', ativo, existente.id);
  else if (v || admin) exec(t.db, 'insert into pessoas (email, nome, papel, ativo, user_id) values (?, ?, ?, ?, ?)', u.email, u.name || u.email.split('@')[0], admin ? 'admin' : 'usuario', ativo, userId);
  return um(t.db, 'select id from pessoas where user_id = ?', userId)?.id ?? null;
}

export function publicaEmpresa(P, id) {
  const c = E.lerEmpresa(P, id);
  return c && { id: c.id, name: c.name, slug: c.slug, status: c.status, statusNome: E.STATUS_EMPRESA[c.status], url: E.urlDaEmpresa(P, c), custom_domain: c.custom_domain };
}

// Sessão da empresa: vale só no tenant resolvido, com vínculo ativo (ou admin da plataforma).
// Sessão de operador (acesso da equipe GreenIA): só vale com o acesso aberto, no prazo, da mesma empresa e de quem
// ainda é admin da plataforma. Acesso vencido ou encerrado derruba a sessão na hora (e fecha o registro).
export function sessaoDaEmpresa(P, cookies, companyId) {
  const s = lerSessaoBruta(P, cookies, companyId);
  if (!s) return null;
  let acesso = null;
  if (s.access_id) {
    acesso = acessoValido(P, s.access_id);
    if (!acesso || acesso.company_id !== companyId || acesso.user_id !== s.user_id || !ehAdminPlataforma(P.db, s.user_id)) {
      if (acesso) encerrarAcesso(P, acesso.id, 'sessao_invalida');
      return null;
    }
  }
  const operador = !!acesso;
  const perms = permissoesNaEmpresa(P.db, s.user_id, companyId, { operador });
  if (!perms.size) return null;
  const pessoaId = sincronizarPessoa(P, companyId, s.user_id, { operador });
  const pessoa = pessoaId && carregarPessoa(P.tenant(companyId).db, pessoaId);
  if (!pessoa) return null;
  const acessoOperador = acesso && { id: acesso.id, tipo: acesso.tipo, inicio: acesso.inicio, expira: acesso.expira };
  return { userId: s.user_id, csrf: s.csrf, perms, adminPlataforma: operador, acessoOperador,
    pessoa: { ...pessoa, admin: perms.has('company.manage'), permissoes: [...perms], adminPlataforma: operador, acessoOperador, userId: s.user_id } };
}

// Empresas suspensas, canceladas ou em implantação: quem pode usar o ambiente.
export function statusPermite(c, sessao) {
  if (c.status === 'cancelada') return false;   // cancelado: ninguém usa, nem a equipe de operação
  if (sessao?.adminPlataforma) return true;
  if (c.status === 'ativa') return true;
  if (c.status === 'em_implantacao') return !!sessao?.perms?.has('company.manage');
  return false;
}

// ---------------------------------------------------------------- Resolução do tenant
function hostDe(req) { return String(req.headers.host || '').toLowerCase().replace(/:\d+$/, ''); }

function resolverPorHost(P, host) {
  const porDominio = um(P.db, 'select id from companies where custom_domain = ?', host);
  if (porDominio) return { id: porDominio.id, fixo: true };
  const sub = lerAjuste(P.db, 'subdominio_base', P.subdominioBase);
  if (sub && host.endsWith(`.${sub}`)) {
    const slug = host.slice(0, -sub.length - 1);
    const c = um(P.db, 'select id from companies where slug = ?', slug);
    if (c) return { id: c.id, fixo: true };
    const antigo = um(P.db, 'select c.slug from company_slugs s join companies c on c.id = s.company_id where s.slug = ?', slug);
    if (antigo) return { redirecionar: `${P.cookieSeguro ? 'https' : 'http'}://${antigo.slug}.${sub}` };
    return { inexistente: true };
  }
  return null;   // host da plataforma
}

const ehArquivoPublico = caminho => /\.[a-z0-9]+$/i.test(caminho) || caminho.startsWith('/assets/');

async function tratar(P, rPlat, rEmp, req, res) {
  cabecalhosSeguranca(res);
  const url = new URL(req.url, 'http://local');
  const caminho = url.pathname;
  try {
    const cookies = lerCookies(req);
    const porHost = resolverPorHost(P, hostDe(req));
    if (porHost?.redirecionar) { res.writeHead(301, { location: porHost.redirecionar + caminho }); return res.end(); }
    if (porHost?.inexistente) return paginaAmbienteNaoEncontrado(res);

    // Documentos legais da GreenIA: um endereço canônico, no host da plataforma. No endereço próprio de uma empresa
    // (domínio ou subdomínio) levam à plataforma, para não parecerem termos da empresa (white label).
    const doc = DOCUMENTOS_LEGAIS[caminho];
    if (doc && req.method === 'GET') {
      if (porHost) {
        if (!P.urlBase) return pagina404(res, 'Página não encontrada.');
        res.writeHead(301, { location: P.urlBase.replace(/\/$/, '') + doc }); return res.end();
      }
      if (caminho !== doc) { res.writeHead(301, { location: doc }); return res.end(); }
    }
    // Páginas da plataforma (vendas, console, operador, encontrar) não abrem pelo arquivo no endereço de uma empresa.
    if (porHost && /\.html$/i.test(caminho) && !PAGINAS_EMPRESA_ARQUIVOS.has(caminho.slice(1))) return pagina404(res, 'Página não encontrada.');

    // Arquivos estáticos (css, js, imagens) valem para todos.
    if (req.method === 'GET' && ehArquivoPublico(caminho) && await servirEstatico(res, PUBLICO, caminho.slice(1), req)) return;

    let companyId = porHost?.id || null;
    if (!porHost) {
      // Host da plataforma: console, APIs da plataforma, página inicial e caminhos /<slug>.
      if (caminho === '/plataforma' || caminho === '/plataforma/') return await servirPagina(res, 'plataforma.html');
      if (caminho.startsWith('/api/plataforma/')) return await despachar(P, rPlat, req, res, url, cookies, null);
      if (caminho === '/api/saude') return enviarJson(res, 200, { ok: true, ia: P.ia.configurada !== false, versao: VERSAO });
      if (caminho === '/' ) {
        if (P.paginaInicial === 'vendas') return await servirPagina(res, 'vendas.html');
        res.writeHead(302, { location: '/plataforma' }); return res.end();
      }
      if (caminho === '/api/contato' && P.paginaInicial === 'vendas') return await contatoVendas(P, req, res);
      // Quem não sabe o endereço da empresa recebe o link de entrada por email.
      if (caminho === '/encontrar' || caminho === '/encontrar/') return await servirPagina(res, 'encontrar.html');
      // Documentos legais da GreenIA (gerados de docs/legal por scripts/gerar-legais.js).
      if (caminho === '/termos' || caminho === '/privacidade') return await servirPagina(res, `${caminho.slice(1)}.html`);
      if (caminho === '/api/encontrar' && req.method === 'POST') return await P.encontrar(req, res);
      // Link de devolução dos dados (uso único): GET mostra a página, POST entrega e consome o link.
      const dv = /^\/devolucao\/([A-Za-z0-9_-]{20,})$/.exec(caminho);
      if (dv) {
        if (req.method === 'POST') {
          let a;
          try { a = entregarDevolucao(P, dv[1], { agente: req.headers['user-agent'], origem: { painel: 'devolucao', agente: String(req.headers['user-agent'] || '').slice(0, 160) } }); }
          catch (e) { if (!(e instanceof ErroHttp)) throw e; const pg = paginaDevolucao(P, dv[1]); res.writeHead(410, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(pg.html); }
          res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${a.nome}"`, 'content-length': a.dados.length, 'cache-control': 'no-store' });
          return res.end(a.dados);
        }
        const pg = paginaDevolucao(P, dv[1]);
        res.writeHead(pg.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
        return res.end(pg.html);
      }
      const m = /^\/([a-z0-9-]{3,40})(\/entrar|\/app|\/encerramento)?\/?$/.exec(caminho);
      if (m && !PAGINAS_EMPRESA[`/${m[1]}`] && !SLUGS_RESERVADOS.has(m[1])) {
        const c = um(P.db, 'select id, slug from companies where slug = ?', m[1]) || um(P.db, 'select c.id, c.slug, 1 as antigo from company_slugs s join companies c on c.id = s.company_id where s.slug = ?', m[1]);
        if (!c) {
          // Endereço digitado sem (ou com) hífen: se só uma empresa corresponde, leva para o endereço certo.
          const parecidos = todos(P.db, "select slug from companies where replace(slug, '-', '') = ?", m[1].replace(/-/g, ''));
          if (parecidos.length === 1) { res.writeHead(301, { location: `/${parecidos[0].slug}${m[2] || ''}` }); return res.end(); }
          return paginaAmbienteNaoEncontrado(res);
        }
        if (c.antigo) { res.writeHead(301, { location: `/${c.slug}${m[2] || ''}` }); return res.end(); }
        (await import('./sessao.js')).definirContexto(P, res, c.id);
        if (m[2]) { res.writeHead(302, { location: m[2] }); return res.end(); }
        return await servirPagina(res, 'index.html');
      }
      companyId = cookies[COOKIE_CONTEXTO] ? decodeURIComponent(cookies[COOKIE_CONTEXTO]) : null;
      if (companyId && !E.lerEmpresa(P, companyId)) companyId = null;
      if (!companyId) {
        if (caminho.startsWith('/api/')) throw new ErroHttp(404, 'ambiente', 'Abra o endereço da sua empresa para entrar.');
        if (PAGINAS_EMPRESA[caminho]) { res.writeHead(302, { location: caminho === '/entrar' ? '/encontrar' : '/' }); return res.end(); }
        return pagina404(res, 'Página não encontrada.');
      }
    } else if (caminho.startsWith('/plataforma') || caminho.startsWith('/api/plataforma/')) {
      return pagina404(res, 'Página não encontrada.');   // o console só existe no endereço da plataforma
    }

    // Daqui em diante, tudo acontece dentro da empresa companyId.
    if (caminho === '/icone') return servirIcone(P, res, companyId);
    if (!caminho.startsWith('/api/')) {
      if (caminho === '/admin') { res.writeHead(302, { location: '/app#/visao-geral' }); return res.end(); }
      if (req.method === 'GET' && PAGINAS_EMPRESA[caminho]) return await servirPagina(res, PAGINAS_EMPRESA[caminho]);
      return pagina404(res, 'Página não encontrada.');
    }
    if (rEmp.achar(req.method, caminho)) return await despachar(P, rEmp, req, res, url, cookies, companyId);

    // Rotas do produto: o ambiente da empresa atende, com a sessão e as permissões da plataforma.
    const c = E.lerEmpresa(P, companyId);
    const t = P.tenant(companyId);
    const sessao = sessaoDaEmpresa(P, cookies, companyId);
    if (sessao && !statusPermite(c, sessao)) throw new ErroHttp(423, 'empresa_indisponivel', c.status === 'em_implantacao' ? 'O ambiente está em implantação.' : 'O ambiente desta empresa está indisponível. Fale com o administrador.');
    // Respostas simultâneas por empresa: uma empresa não ocupa a instalação inteira.
    if (req.method === 'POST' && /^\/api\/conversas\/\d+\/mensagens$/.test(caminho) && sessao) {
      const limite = E.lerPlanoPorId(P, c.plan_id)?.limits?.max_concurrent ?? E.LIMITES_PADRAO.max_concurrent;
      const agora = P.emAndamento.get(companyId) || 0;
      if (limite && agora >= limite) throw new ErroHttp(429, 'ocupado', 'Muitas respostas em andamento na sua empresa agora. Tente de novo em alguns segundos.');
      P.emAndamento.set(companyId, agora + 1);
      let liberado = false;
      const liberar = () => { if (liberado) return; liberado = true; P.emAndamento.set(companyId, Math.max(0, (P.emAndamento.get(companyId) || 1) - 1)); };
      res.on('close', liberar); res.on('finish', liberar);
    }
    return await t.tratar(req, res, { sessao: sessao && { pessoa: sessao.pessoa, csrf: sessao.csrf } });
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof ErroHttp) return enviarJson(res, e.status, { erro: e.codigo, mensagem: e.message, ...e.extra });
    P.log('erro', erroParaLog(e));   // sem a mensagem: uma exceção pode repetir o conteúdo do pedido
    enviarJson(res, 500, { erro: 'interno', mensagem: 'Algo deu errado. Tente de novo.' });
  }
}

// Rotas da plataforma e da empresa: sessão do escopo certo, CSRF em toda escrita, corpo limitado.
async function despachar(P, r, req, res, url, cookies, companyId) {
  const rota = r.achar(req.method, url.pathname);
  if (!rota) throw new ErroHttp(404, 'nao_encontrado', 'Não encontrado.');
  if (req.method !== 'GET') { const o = req.headers.origin; if (o && new URL(o).host !== req.headers.host) throw new ErroHttp(403, 'origem', 'Origem não permitida.'); }
  let sessao = null;
  if (companyId) sessao = sessaoDaEmpresa(P, cookies, companyId);
  else { const s = lerSessaoBruta(P, cookies, null); sessao = s && ehAdminPlataforma(P.db, s.user_id) ? { userId: s.user_id, csrf: s.csrf, email: s.email, name: s.name } : null; }
  if (!rota.op.publica) {
    if (!sessao) throw new ErroHttp(401, 'sem_sessao', 'Entre de novo.');
    if (req.method !== 'GET') checarCsrf(sessao, req);
  }
  const corpo = req.method === 'GET' ? {} : await lerCorpo(req, rota.op.limiteMb ?? 1);
  const empresa = companyId ? E.lerEmpresa(P, companyId) : null;
  if (companyId && sessao && !rota.op.publica && !statusPermite(empresa, sessao)) throw new ErroHttp(423, 'empresa_indisponivel', 'O ambiente desta empresa está indisponível.');
  const origem = { painel: companyId ? 'empresa' : 'plataforma', ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '', agente: String(req.headers['user-agent'] || '').slice(0, 160) };
  const out = await rota.h({ P, req, res, url, cookies, sessao, corpo, params: rota.params, query: Object.fromEntries(url.searchParams), companyId, empresa, origem });
  if (!res.headersSent && !res.writableEnded) enviarJson(res, 200, out ?? { ok: true });
}

async function servirPagina(res, arquivo) {
  if (!(await servirEstatico(res, PUBLICO, arquivo))) pagina404(res, 'Página não encontrada.');
}
// Endereço de empresa inexistente: página da marca, sem revelar quais empresas existem, com o caminho para
// encontrar o endereço certo pelo email.
function paginaAmbienteNaoEncontrado(res) {
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Endereço não encontrado · GreenIA</title><link rel="stylesheet" href="/estilo.css"><link rel="icon" href="/assets/greenia-marca.svg"></head>
<body><main style="min-height:100vh;display:grid;place-items:center;padding:24px"><div style="max-width:440px;text-align:center">
<img src="/assets/greenia-marca.svg" width="40" height="40" alt="GreenIA" style="margin-bottom:18px">
<h1 style="font:600 22px/1.3 var(--sans);margin:0 0 10px;color:var(--ink)">Não encontramos este endereço</h1>
<p style="font:400 15px/1.6 var(--sans);color:var(--muted);margin:0 0 24px">Confira se o endereço da sua empresa foi digitado como recebido no convite. Se não souber o endereço, informe seu email e enviamos o link de entrada.</p>
<a class="btn btn-verde btn-grande" href="/encontrar">Encontrar minha empresa</a>
</div></main></body></html>`);
}
function pagina404(res, msg) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(msg);
}
function servirIcone(P, res, companyId) {
  const fav = E.lerMarca(P, companyId)?.favicon || E.lerMarca(P, companyId)?.logo;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/.exec(fav || '');
  if (!m) { res.writeHead(302, { location: ICONE_PADRAO }); return res.end(); }
  res.writeHead(200, { 'content-type': m[1], 'cache-control': 'no-cache', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });   // troca de ícone aparece na hora
  res.end(Buffer.from(m[2], 'base64'));
}

// Página de vendas na raiz da plataforma: o formulário de contato grava no banco da plataforma.
async function contatoVendas(P, req, res) {
  const corpo = await lerCorpo(req, 0.05);
  const { validarEmail, texto } = await import('./validar.js');
  if (corpo.site) return enviarJson(res, 200, { ok: true });
  try {
    const lead = { nome: texto(corpo.nome, 120, 'nome', { obrigatorio: true }), email: validarEmail(corpo.email), empresa: texto(corpo.empresa, 160, 'empresa', { obrigatorio: true }), cargo: texto(corpo.cargo, 120, 'cargo'), pessoas: texto(corpo.pessoas, 40, 'pessoas'), mensagem: texto(corpo.mensagem, 2000, 'mensagem') };
    const { id } = registrarFormulario(P, lead);
    // O email aos admins só avisa: o contato (dados pessoais) fica no console, sob a retenção de 24 meses, sem cópia na caixa postal.
    const link = `${(P.urlBase || '').replace(/\/$/, '')}/plataforma#/configuracoes`;
    for (const para of P.adminsPlataforma()) P.email.enviar(para, 'Novo contato recebido', `Um novo contato chegou pela página de vendas.\n\nConsulte no console (é preciso entrar): ${link}\nReferência: ${id}`).catch(() => {});
    enviarJson(res, 200, { ok: true });
  } catch (e) { enviarJson(res, e.status || 400, { erro: e.codigo || 'contato', mensagem: e.message }); }
}

// ---------------------------------------------------------------- Importação da instalação única
// O SMTP que a instalação única usava passa a ser o da plataforma, uma vez, se o console ainda não
// tiver um: sem isso, nenhum código de acesso ao console chega por email. Mudanças posteriores no
// SMTP da empresa não afetam a plataforma.
function copiarSmtpLegado(P, banco) {
  if (lerAjuste(P.db, 'smtp', { url: '' }).url || lerAjuste(P.db, 'smtp_legado_copiado', false)) return;
  const c = um(P.db, 'select id from companies where banco = ?', banco);
  if (!c) return;
  const smtp = lerConfig(P.tenant(c.id).db).smtp || {};
  salvarAjuste(P.db, 'smtp_legado_copiado', true);
  if (!smtp.url) return;
  salvarAjuste(P.db, 'smtp', { url: smtp.url, remetente: smtp.remetente || '' });
  P.log('SMTP da instalação anterior copiado para a plataforma (códigos de acesso ao console).');
}

// A instalação que já existia vira a primeira empresa: mesmo banco, pessoas viram usuários com vínculo.
function importarInstalacao(P, { banco, slug, plano }) {
  if (!banco || um(P.db, 'select 1 from companies') || (banco !== ':memory:' && !existsSync(banco))) return;
  const cfgTemp = criarApp({ banco, ia: P.ia, log: () => {}, tenant: { companyId: 'importacao' } });
  const cfg = lerConfig(cfgTemp.db);
  const pessoas = todos(cfgTemp.db, 'select id, email, nome, papel, ativo from pessoas');
  cfgTemp.db.close();
  let s = slugDe(slug || cfg.empresa) || 'empresa-principal';
  if (s.length < 3 || SLUGS_RESERVADOS.has(s)) s = `${s}-ia`.replace(/^-/, '');
  const planoId = plano ? todos(P.db, 'select id, credits from plans').find(p => p.credits === plano.creditos)?.id : null;
  const c = E.criarEmpresa(P, { name: cfg.empresa || 'Empresa principal', slug: s, plan_id: planoId || null, banco, status: 'ativa' }, null, { painel: 'importacao' });
  exec(P.db, "update branding set logo = ?, primary_color = ?, privacy_note = coalesce(nullif(?, ''), privacy_note) where company_id = ?", cfg.logo || '', cfg.corMarca ? cfg.corMarca.toUpperCase() : '', cfg.privacyNote || '', c.id);
  const admin = roleDeSistema(P.db, 'company_admin'), membro = roleDeSistema(P.db, 'member');
  const t = P.tenant(c.id);
  for (const p of pessoas) {
    const u = E.garantirUsuario(P, p.email, p.nome);
    exec(P.db, 'insert into company_users (company_id, user_id, role_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?) on conflict do nothing',
      c.id, u.id, p.papel === 'admin' ? admin.id : membro.id, p.ativo ? 'ativo' : 'inativo', P.agora().toISOString(), P.agora().toISOString());
    exec(t.db, 'update pessoas set user_id = ? where id = ?', u.id, p.id);
  }
  aplicarAoTenant(P, c.id);
  P.log(`Instalação importada como a empresa "${c.name}" (/${c.slug}), com ${pessoas.length} pessoas.`);
}

export { dominioPermitido, json };

// ---------------------------------------------------------------- IA trocável e chave do OpenRouter
// As empresas recebem este mesmo objeto; trocar a chave vale na hora para todas, sem reiniciar.
export function iaTrocavel(inicial, { aoRecusar = null, bloqueio = null } = {}) {
  let atual = inicial;
  const ia = {
    get configurada() { return atual.configurada; }, get simulada() { return atual.simulada; },
    listarModelos: (...a) => atual.listarModelos(...a),
    conta: (...a) => (atual.conta ? atual.conta(...a) : Promise.resolve(null)),
    // Envio: se a chave em uso já foi recusada pelo OpenRouter, não insiste (revalida no máximo a cada
    // 10 minutos); se um envio receber 401, registra a recusa na hora (alerta e bloqueio imediatos).
    async *enviar(...a) {
      if (bloqueio) await bloqueio();
      try { yield* atual.enviar(...a); }
      catch (e) { if (e?.status === 401) aoRecusar?.(); throw e; }
    },
    trocar(nova) { atual = nova; },
  };
  return ia;
}
function tmpdirSeguro() { return process.env.TMPDIR || '/tmp'; }

export function lerChaveOpenRouter(P) {
  const s = lerAjuste(P.db, 'openrouter_chave', null);
  if (!s) return null;
  return { chave: decifrar(P.mestra(), s.cifrado), mascara: s.mascara, nome: s.nome || '', em: s.em, por: s.por };
}
export function salvarChaveOpenRouter(P, chave, { nome, por }) {
  // A cifra nova sobrescreve a anterior: a chave antiga não fica guardada em lugar nenhum.
  salvarAjuste(P.db, 'openrouter_chave', { cifrado: cifrar(P.mestra(), chave), id: impressaoChave(P.mestra(), chave), mascara: mascarar(chave), nome, em: P.agora().toISOString(), por });
  P.ia.trocar(P.criarIA(chave));
  P._contaOR = null;
}
export function removerChaveOpenRouter(P) {
  exec(P.db, "delete from platform_settings where key = 'openrouter_chave'");
  P.ia.trocar(P.iaPadrao);
  P._contaOR = null;
}
// O que a tela mostra sobre a chave: de onde vem e a máscara. Nunca a chave.
export function origemChaveOpenRouter(P) {
  const s = lerAjuste(P.db, 'openrouter_chave', null);
  if (s) {
    // Registro salvo antes da impressão digital: calcula uma vez a partir da chave cifrada.
    if (!s.id) { const k = decifrar(P.mestra(), s.cifrado); if (k) { s.id = impressaoChave(P.mestra(), k); salvarAjuste(P.db, 'openrouter_chave', s); } }
    return { origem: 'console', id: s.id || null, mascara: s.mascara, nome: s.nome || '', em: s.em, por: s.por, variavelTambem: !!P.chaveVariavel };
  }
  if (P.chaveVariavel) return { origem: 'variavel', id: P.chaveVariavelId || null, mascara: P.chaveVariavel };
  return { origem: null };
}
