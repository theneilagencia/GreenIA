// Conectores e capabilities por empresa: ciclo de vida, versões, catálogo e mapeamentos. Toda consulta filtra por
// tenant_id (além do banco ser da empresa). Conector gerado nunca é confiável por padrão: passa por teste,
// política e aprovação; nenhum vai de DRAFT para ACTIVE.
import { randomUUID, createHash } from 'node:crypto';
import { exec, um, todos, json, transacao } from '../db.js';
import { registrar } from '../eventos.js';
import { CATEGORIAS, TIPOS_CONECTOR, classificarRisco, efeitosPadrao, limparEfeitos, fraseDaCapability } from './riscos.js';
import { normalizarHost } from './rede.js';
import { validarRegras } from './mapeamento.js';
import { descreverSegredo } from './segredos.js';
import { lerConfig } from '../config.js';
const lerConfigEmpresa = app => lerConfig(app.db).integracoes || {};

export const STATUS = ['DRAFT', 'DISCOVERED', 'CONFIGURED', 'TESTING', 'REVIEW_REQUIRED', 'APPROVED', 'ACTIVE', 'PAUSED', 'FAILED', 'REVOKED'];
export const TRANSICOES = {
  DRAFT: ['DISCOVERED', 'CONFIGURED', 'REVOKED'], DISCOVERED: ['CONFIGURED', 'REVOKED'], CONFIGURED: ['TESTING', 'REVOKED'],
  TESTING: ['REVIEW_REQUIRED', 'FAILED', 'CONFIGURED'], REVIEW_REQUIRED: ['APPROVED', 'CONFIGURED', 'REVOKED'], APPROVED: ['ACTIVE', 'CONFIGURED', 'REVOKED'],
  ACTIVE: ['PAUSED', 'FAILED', 'CONFIGURED', 'REVOKED'], PAUSED: ['ACTIVE', 'CONFIGURED', 'REVOKED'], FAILED: ['CONFIGURED', 'TESTING', 'REVOKED'], REVOKED: [],
};
export const ORIGENS = ['builtin', 'generated', 'configured', 'imported', 'admin'];
export const AUTH = ['none', 'api_key', 'bearer', 'basic', 'oauth2_client_credentials', 'oauth2_authorization_code', 'custom_header'];
// Preparados no modelo, sem runtime nesta versão.
export const AUTH_FUTUROS = ['mtls', 'signed_request', 'service_account'];

export class ErroIntegracao extends Error { constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo; } }
const novoId = p => `${p}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
const agora = app => app.agora().toISOString();
const corta = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// ---- Leitura ---------------------------------------------------------------------------------------------------
export function lerConector(app, id) {
  const c = um(app.db, 'select * from connectors where id = ? and tenant_id = ?', String(id), app.tenantId);
  if (!c) return null;
  return { ...c, allowed_hosts: json(c.allowed_hosts, []), spec: json(c.spec, {}), config: json(c.config, {}), secret_ref: json(c.secret_ref, null) };
}
export function conectorOu404(app, id) { const c = lerConector(app, id); if (!c) throw new ErroIntegracao(404, 'nao_encontrado', 'Integração não encontrada.'); return c; }
export function lerCapability(app, id) {
  const c = um(app.db, 'select * from capabilities where id = ? and tenant_id = ?', String(id), app.tenantId);
  return c ? { ...c, efeitos: json(c.efeitos, {}), inputs: json(c.inputs, null), outputs: json(c.outputs, null), requer_aprovacao: !!c.requer_aprovacao } : null;
}
export const capabilitiesDe = (app, conectorId) => todos(app.db, 'select id from capabilities where connector_id = ? and tenant_id = ? order by nome', conectorId, app.tenantId).map(r => lerCapability(app, r.id));
export function mapeamento(app, capabilityId, direcao) {
  const r = um(app.db, 'select regras from capability_mappings where capability_id = ? and tenant_id = ? and direcao = ? order by versao desc limit 1', capabilityId, app.tenantId, direcao);
  return r ? json(r.regras, []) : null;
}

// ---- Versão --------------------------------------------------------------------------------------------------
// O que muda o comportamento (e invalida aprovação): endpoint, hosts, autenticação, operações (esquema), escopos,
// mapeamentos e permissões das capabilities. Trocar o VALOR do segredo (rotação) não muda a versão.
function retrato(app, c) {
  const caps = capabilitiesDe(app, c.id).map(x => ({ id: x.id, operation_id: x.operation_id, modo: x.modo, classe: x.classe, efeitos: x.efeitos, requer_aprovacao: x.requer_aprovacao,
    entrada: mapeamento(app, x.id, 'entrada'), saida: mapeamento(app, x.id, 'saida') }));
  return { tipo: c.tipo, auth_type: c.auth_type, base_url: c.base_url, allowed_hosts: c.allowed_hosts, spec: c.spec, config: { ...c.config, segredo_rotacao: undefined }, capabilities: caps };
}
const hashDe = r => createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 32);
function gravarVersao(app, c, pessoaId, motivo) {
  const r = retrato(app, c), h = hashDe(r);
  const ult = um(app.db, 'select versao, hash from connector_versions where connector_id = ? and tenant_id = ? order by versao desc limit 1', c.id, app.tenantId);
  if (ult?.hash === h) return { versao: ult.versao, nova: false };
  const versao = ult ? ult.versao + 1 : 1;
  exec(app.db, 'insert into connector_versions (tenant_id, connector_id, versao, hash, snapshot, motivo, criado_por, criado_em) values (?, ?, ?, ?, ?, ?, ?, ?)',
    app.tenantId, c.id, versao, h, JSON.stringify(r), corta(motivo, 120), pessoaId ?? null, agora(app));
  exec(app.db, 'update connectors set versao = ?, atualizado_em = ? where id = ? and tenant_id = ?', versao, agora(app), c.id, app.tenantId);
  if (ult) {
    // Mudança relevante: a aprovação anterior não vale para a versão nova; o conector volta a ser configurado e
    // testado (o que estava ativo deixa de executar até nova aprovação).
    exec(app.db, "update integration_approvals set status = 'invalidada', motivo = 'nova versão do conector', decidido_em = ? where connector_id = ? and tenant_id = ? and status in ('pendente', 'aprovada') and connector_versao < ?", agora(app), c.id, app.tenantId, versao);
    const atual = um(app.db, 'select status from connectors where id = ? and tenant_id = ?', c.id, app.tenantId).status;
    if (!['DRAFT', 'DISCOVERED', 'CONFIGURED', 'REVOKED'].includes(atual)) exec(app.db, "update connectors set status = 'CONFIGURED' where id = ? and tenant_id = ?", c.id, app.tenantId);
    exec(app.db, "update capabilities set status = 'pendente', versao = ? where connector_id = ? and tenant_id = ? and status != 'revogada'", versao, c.id, app.tenantId);
  }
  return { versao, nova: !!ult };
}

export function mudarStatus(app, c, para, pessoaId, extra = {}) {
  if (!TRANSICOES[c.status]?.includes(para)) throw new ErroIntegracao(409, 'transicao_invalida', `A integração não pode passar de ${c.status} para ${para}.`);
  exec(app.db, 'update connectors set status = ?, atualizado_em = ? where id = ? and tenant_id = ?', para, agora(app), c.id, app.tenantId);
  const evento = { REVOKED: 'CONNECTOR_REVOKED', PAUSED: 'CONNECTOR_PAUSED', FAILED: 'CONNECTOR_FAILED', ACTIVE: 'CONNECTOR_PUBLISHED' }[para];
  if (evento) registrar(app, evento, pessoaId, { connector: c.id, versao: c.versao, de: c.status, ...extra });
  return { ...c, status: para };
}

// ---- Criação e configuração ----------------------------------------------------------------------------------
function limparConfig(cfg = {}, atual = {}) {
  const n = (v, min, max, pad) => (Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.round(+v))) : pad);
  return {
    timeout_ms: n(cfg.timeout_ms ?? atual.timeout_ms, 500, 60000, 10000),
    max_tentativas: n(cfg.max_tentativas ?? atual.max_tentativas, 0, 5, 2),
    backoff_ms: n(cfg.backoff_ms ?? atual.backoff_ms, 0, 10000, 300),
    status_repetiveis: Array.isArray(cfg.status_repetiveis ?? atual.status_repetiveis) ? (cfg.status_repetiveis ?? atual.status_repetiveis).map(Number).filter(x => x >= 400 && x < 600).slice(0, 10) : [429, 502, 503, 504],
    limite_minuto: n(cfg.limite_minuto ?? atual.limite_minuto, 1, 600, 60),
    rede_privada: (cfg.rede_privada ?? atual.rede_privada) === true,
    cabecalho_auth: corta(cfg.cabecalho_auth ?? atual.cabecalho_auth ?? '', 64) || null,
    cabecalho_idempotencia: corta(cfg.cabecalho_idempotencia ?? atual.cabecalho_idempotencia ?? 'Idempotency-Key', 64),
    escopos: Array.isArray(cfg.escopos ?? atual.escopos) ? (cfg.escopos ?? atual.escopos).map(s => corta(s, 120)).slice(0, 50) : [],
    token_url: corta(cfg.token_url ?? atual.token_url ?? '', 300) || null,
    auth_url: corta(cfg.auth_url ?? atual.auth_url ?? '', 300) || null,
    redirect_uri: corta(cfg.redirect_uri ?? atual.redirect_uri ?? '', 300) || null,
    teste_escrita: (cfg.teste_escrita ?? atual.teste_escrita) === true,
    sistema_sensivel: (cfg.sistema_sensivel ?? atual.sistema_sensivel) === true,
  };
}
function limparHosts(hosts, baseUrl) {
  const lista = (Array.isArray(hosts) ? hosts : []).map(normalizarHost).filter(h => /^[a-z0-9.:-]{1,253}$/.test(h)).slice(0, 10);
  if (!lista.length && baseUrl) { try { lista.push(new URL(baseUrl).hostname.toLowerCase()); } catch { /* base inválida: conferida abaixo */ } }
  return [...new Set(lista)];
}
function limparBase(u) {
  if (!u) return null;
  let x; try { x = new URL(String(u)); } catch { throw new ErroIntegracao(400, 'base_url', 'Endereço base inválido.'); }
  if (!['https:', 'http:'].includes(x.protocol) || x.username || x.password || x.search || x.hash) throw new ErroIntegracao(400, 'base_url', 'Endereço base precisa ser https, sem credencial, parâmetros ou âncora.');
  return x.toString().replace(/\/$/, '');
}
// Operações do candidato: só os campos declarativos conhecidos.
function limparOperacoes(ops = []) {
  return (Array.isArray(ops) ? ops : []).slice(0, 300).map(o => ({
    operation_id: corta(o.operation_id, 80).replace(/[^\w.-]+/g, '_'), metodo: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(o.metodo).toUpperCase()) ? String(o.metodo).toUpperCase() : 'GET',
    caminho: corta(o.caminho, 300), resumo: corta(o.resumo, 200), parametros: Array.isArray(o.parametros) ? o.parametros.slice(0, 60).map(p => ({ nome: corta(p.nome, 80), em: ['path', 'query', 'header', 'variavel'].includes(p.em) ? p.em : 'query', obrigatorio: !!p.obrigatorio, esquema: p.esquema || null })) : [],
    request_schema: o.request_schema || null, response_schema: o.response_schema || null, paginacao: o.paginacao || null, graphql: o.graphql || null,
    classe: ['SAFE_READ', 'SIDE_EFFECT', 'DESTRUCTIVE'].includes(o.classe) ? o.classe : 'SIDE_EFFECT', categoria: CATEGORIAS.includes(o.categoria) ? o.categoria : 'custom',
    efeitos: limparEfeitos(o.efeitos), idempotente: !!o.idempotente, rollback: o.rollback ? corta(o.rollback, 80) : null,
  })).filter(o => o.operation_id);
}

export function criarConector(app, pessoa, d) {
  const tipo = TIPOS_CONECTOR.includes(d.tipo) ? d.tipo : 'REST';
  const origem = ORIGENS.includes(d.origem) ? d.origem : 'configured';
  const auth = AUTH.includes(d.auth_type) ? d.auth_type : 'none';
  const base = limparBase(d.base_url);
  const hosts = limparHosts(d.allowed_hosts, base);
  if (base && !hosts.includes(new URL(base).hostname.toLowerCase())) throw new ErroIntegracao(400, 'hosts', 'O host do endereço base precisa estar na lista de hosts autorizados.');
  const id = novoId('con'), t = agora(app);
  const ops = limparOperacoes(d.operacoes);
  exec(app.db, `insert into connectors (id, tenant_id, nome, sistema, tipo, auth_type, base_url, allowed_hosts, spec, config, status, origem, versao, criado_por, criado_em, atualizado_em)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`, id, app.tenantId, corta(d.nome || d.sistema || 'Integração', 80), corta(d.sistema || d.nome || 'Sistema externo', 80), tipo, auth, base,
  JSON.stringify(hosts), JSON.stringify({ operacoes: ops, formato: corta(d.formato || 'manual', 20) }), JSON.stringify(limparConfig(d.config)), ops.length ? 'DISCOVERED' : 'DRAFT', origem, pessoa?.id ?? null, t, t);
  const c = lerConector(app, id);
  gravarVersao(app, c, pessoa?.id, 'criação');
  registrar(app, ops.length ? 'CONNECTOR_DISCOVERED' : 'CONNECTOR_CREATED', pessoa?.id, { connector: id, tipo, origem, operacoes: ops.length, hosts: hosts.length });
  if (ops.length) registrar(app, 'CONNECTOR_CREATED', pessoa?.id, { connector: id, tipo, origem });
  return lerConector(app, id);
}

// Mudança de configuração: endpoint, hosts, auth, operações ou parâmetros de execução. Vira versão nova se o
// comportamento mudou (e a aprovação anterior deixa de valer).
export function atualizarConector(app, pessoa, id, d) {
  const c = conectorOu404(app, id);
  if (c.status === 'REVOKED') throw new ErroIntegracao(409, 'revogado', 'Integração revogada não muda: crie outra.');
  const base = d.base_url !== undefined ? limparBase(d.base_url) : c.base_url;
  const hosts = d.allowed_hosts !== undefined ? limparHosts(d.allowed_hosts, base) : c.allowed_hosts;
  if (base && !hosts.includes(new URL(base).hostname.toLowerCase())) throw new ErroIntegracao(400, 'hosts', 'O host do endereço base precisa estar na lista de hosts autorizados.');
  const auth = d.auth_type !== undefined ? (AUTH.includes(d.auth_type) ? d.auth_type : c.auth_type) : c.auth_type;
  const spec = d.operacoes !== undefined ? { ...c.spec, operacoes: limparOperacoes(d.operacoes) } : c.spec;
  exec(app.db, 'update connectors set nome = ?, base_url = ?, allowed_hosts = ?, auth_type = ?, spec = ?, config = ?, atualizado_em = ? where id = ? and tenant_id = ?',
    corta(d.nome ?? c.nome, 80), base, JSON.stringify(hosts), auth, JSON.stringify(spec), JSON.stringify(limparConfig(d.config || {}, c.config)), agora(app), c.id, app.tenantId);
  const novo = lerConector(app, c.id);
  if (['DRAFT', 'DISCOVERED'].includes(novo.status) && (novo.spec.operacoes || []).length) mudarStatus(app, novo, 'CONFIGURED', pessoa?.id);
  const v = gravarVersao(app, lerConector(app, c.id), pessoa?.id, d.motivo || 'configuração');
  return { conector: lerConector(app, c.id), versaoNova: v.nova };
}

// Capabilities escolhidas pelo admin a partir das operações do conector (nome e efeitos podem ser ajustados; a
// classe só fica mais restrita, nunca mais permissiva que a do método).
export function definirCapabilities(app, pessoa, id, escolhas) {
  const c = conectorOu404(app, id);
  if (c.status === 'REVOKED') throw new ErroIntegracao(409, 'revogado', 'Integração revogada.');
  const ops = new Map((c.spec.operacoes || []).map(o => [o.operation_id, o]));
  const ordem = { SAFE_READ: 0, SIDE_EFFECT: 1, DESTRUCTIVE: 2 };
  transacao(app.db, () => {
    exec(app.db, "update capabilities set status = 'revogada' where connector_id = ? and tenant_id = ?", c.id, app.tenantId);
    for (const e of (Array.isArray(escolhas) ? escolhas : []).slice(0, 100)) {
      const o = ops.get(String(e.operation_id));
      if (!o) throw new ErroIntegracao(400, 'operacao', `Operação desconhecida: ${corta(e.operation_id, 60)}.`);
      const classe = ordem[e.classe] > ordem[o.classe] ? e.classe : o.classe;
      const categoria = CATEGORIAS.includes(e.categoria) ? e.categoria : o.categoria;
      const efeitos = efeitosPadrao({ classe, categoria, declarados: { ...o.efeitos, ...limparEfeitosParciais(e.efeitos) } });
      const risco = classificarRisco({ efeitos, classe, tipoConector: c.tipo, sistemaSensivel: c.config.sistema_sensivel });
      const modo = classe === 'SAFE_READ' && !efeitos.write ? 'read' : 'write';
      const existente = um(app.db, 'select id from capabilities where connector_id = ? and tenant_id = ? and operation_id = ?', c.id, app.tenantId, o.operation_id);
      const capId = existente?.id || novoId('cap'), t = agora(app);
      const nome = corta(e.nome || o.resumo || o.operation_id, 100), descricao = corta(e.descricao || o.resumo || '', 300);
      if (existente) exec(app.db, `update capabilities set nome = ?, descricao = ?, categoria = ?, modo = ?, classe = ?, efeitos = ?, risco = ?, requer_aprovacao = ?, inputs = ?, outputs = ?, status = 'pendente', versao = ?, atualizado_em = ? where id = ? and tenant_id = ?`,
        nome, descricao, categoria, modo, classe, JSON.stringify(efeitos), risco, modo === 'write' ? 1 : 0, JSON.stringify(o.request_schema), JSON.stringify(o.response_schema), c.versao, t, capId, app.tenantId);
      else exec(app.db, `insert into capabilities (id, tenant_id, connector_id, nome, descricao, categoria, operation_id, modo, classe, efeitos, risco, requer_aprovacao, inputs, outputs, status, versao, criado_em, atualizado_em)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`, capId, app.tenantId, c.id, nome, descricao, categoria, o.operation_id, modo, classe, JSON.stringify(efeitos), risco, modo === 'write' ? 1 : 0,
      JSON.stringify(o.request_schema), JSON.stringify(o.response_schema), c.versao, t, t);
      for (const direcao of ['entrada', 'saida']) {
        const regras = e.mapeamento?.[direcao];
        if (regras) exec(app.db, 'insert into capability_mappings (tenant_id, capability_id, direcao, regras, versao, criado_em) values (?, ?, ?, ?, ?, ?)', app.tenantId, capId, direcao, JSON.stringify(validarRegras(regras)), c.versao, t);
      }
    }
  });
  const atual = lerConector(app, c.id);
  if (['DRAFT', 'DISCOVERED'].includes(atual.status)) mudarStatus(app, atual, 'CONFIGURED', pessoa?.id);
  gravarVersao(app, lerConector(app, c.id), pessoa?.id, 'capabilities');
  return capabilitiesDe(app, c.id).filter(x => x.status !== 'revogada');
}
const limparEfeitosParciais = e => Object.fromEntries(Object.entries(e && typeof e === 'object' ? e : {}).filter(([, v]) => typeof v === 'boolean'));

// ---- Catálogo ------------------------------------------------------------------------------------------------
export function catalogo(app) {
  return todos(app.db, "select c.*, k.nome as conector_nome, k.sistema, k.status as conector_status, k.ultima_validacao, k.versao as conector_versao from capabilities c join connectors k on k.id = c.connector_id where c.tenant_id = ? and k.tenant_id = ? and c.status != 'revogada' order by k.sistema, c.nome", app.tenantId, app.tenantId)
    .map(c => ({ id: c.id, nome: c.nome, sistema: c.sistema, categoria: c.categoria, modo: c.modo, leitura: c.modo === 'read', escrita: c.modo === 'write', risco: c.risco, status: c.status,
      conector: { id: c.connector_id, nome: c.conector_nome, status: c.conector_status, versao: c.conector_versao }, versao: c.versao, ultima_validacao: c.ultima_validacao, frase: fraseDaCapability(c) }));
}

// O que a tela mostra de um conector (sem segredo: só se há credencial e a máscara).
export function resumoConector(app, c, { detalhes = false } = {}) {
  const caps = capabilitiesDe(app, c.id).filter(x => x.status !== 'revogada');
  return {
    id: c.id, nome: c.nome, sistema: c.sistema, tipo: c.tipo, auth_type: c.auth_type, status: c.status, origem: c.origem, versao: c.versao, aprovado_versao: c.aprovado_versao,
    hosts: c.allowed_hosts, base_url: c.base_url, credencial: c.secret_ref ? descreverSegredo(app, c.secret_ref) : null, ultima_validacao: c.ultima_validacao,
    capabilities: caps.map(x => ({ id: x.id, nome: x.nome, categoria: x.categoria, modo: x.modo, classe: x.classe, risco: x.risco, status: x.status, frase: fraseDaCapability(x) })),
    operacoes: (c.spec.operacoes || []).map(o => ({ operation_id: o.operation_id, metodo: o.metodo, caminho: o.caminho, resumo: o.resumo, classe: o.classe, categoria: o.categoria, risco: classificarRisco({ efeitos: o.efeitos, classe: o.classe }), efeitos: o.efeitos,
      ...(detalhes ? { parametros: o.parametros, request_schema: o.request_schema, response_schema: o.response_schema, paginacao: o.paginacao } : {}) })),
    ...(detalhes ? { config: { ...c.config }, versoes: todos(app.db, 'select versao, hash, motivo, criado_em from connector_versions where connector_id = ? and tenant_id = ? order by versao desc', c.id, app.tenantId) } : {}),
    criado_em: c.criado_em, atualizado_em: c.atualizado_em,
  };
}
export const listarConectores = app => todos(app.db, 'select id from connectors where tenant_id = ? order by atualizado_em desc', app.tenantId).map(r => lerConector(app, r.id));
export { novoId };
// Rede privada (http e endereços internos) só com as DUAS chaves: o conector pede e a empresa autoriza.
export const redePrivadaDe = (app, c) => c.config.rede_privada === true && lerConfigEmpresa(app).rede_privada_autorizada === true;

