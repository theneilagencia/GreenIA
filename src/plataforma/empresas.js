// Serviços da plataforma: empresas (tenants), planos, usuários e vínculos, marca, landing page,
// URL e concessões. Usados pelo console do operador da plataforma e pelo admin da empresa; toda regra fica aqui,
// no servidor, e toda mudança relevante é auditada.
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { statSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { erro } from '../http.js';
import { exec, todos, um, json, transacao } from '../db.js';
import { lerConfig } from '../config.js';
import { situacaoPlano, liberarPacote, avisarPacote } from '../plano.js';
import { auditar } from './auditoria.js';
import { lerAjuste, salvarAjuste } from './db.js';
import { roleDeSistema, acharRoleDaEmpresa, permissoesDaRole, ehAdminPlataforma } from './rbac.js';
import { encerrarAcessosAbertos } from './acessos.js';
import { validarSlug, validarDominio, validarCor, validarCorPrincipal, validarImagem, texto, validarLink, validarEmail } from './validar.js';

export const STATUS_EMPRESA = { em_implantacao: 'Em implantação', ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' };

// Recursos e limites controlados por plano (configuração, não código).
export const RECURSOS = {
  quick_wins: 'Quick wins', knowledge: 'Base de conhecimento', confidential: 'Conversas sigilosas',
  custom_branding: 'Marca própria', landing_page: 'Landing page própria', custom_url: 'URL personalizada',
  custom_roles: 'Roles personalizadas',
  // Domínio próprio não é recurso de plano: vale em todos (o operador ainda pode travar por empresa).
};
export const LIMITES = { max_users: 'Usuários (0 = sem limite)', messages_per_minute: 'Mensagens por minuto por pessoa', max_quick_wins: 'Quick wins (0 = sem limite)', max_concurrent: 'Respostas simultâneas da empresa (0 = sem limite)' };
// Valor de cada limite quando o plano ainda não o define. As respostas simultâneas protegem as outras empresas da mesma instalação.
export const LIMITES_PADRAO = { max_users: 0, messages_per_minute: 12, max_quick_wins: 0, max_concurrent: 10 };
// O que o operador da plataforma pode liberar ou não para o admin da empresa editar.
export const CONCESSOES = { branding: 'Identidade visual', landing_page: 'Landing page', url: 'URL', domain: 'Domínio próprio', roles: 'Roles e permissões' };
export const CAMPOS_MARCA = ['display_name', 'logo', 'favicon', 'primary_color', 'secondary_color', 'login_title', 'login_text', 'privacy_note'];

const agoraIso = P => P.agora().toISOString();
const novoId = prefixo => `${prefixo}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

// ---------------------------------------------------------------- Planos
// Plano sem amarras: créditos ilimitados (0), todos os recursos e nenhum limite. Criado também em
// plataformas que já existiam, uma vez (se foi apagado ou renomeado, não volta).
const LIBERADO = { name: 'GreenIA Liberado', description: 'Sem limites: créditos ilimitados, todos os recursos e nenhum teto de uso', price_usd: null, credits: 0, reserve: 0,
  limits: { max_users: 0, messages_per_minute: 0, max_quick_wins: 0, max_concurrent: 0 }, rules: { reserve_fast_only: false, pack_credits: 0, pack_price_usd: 0 } };
function semearLiberado(P) {
  if (lerAjuste(P.db, 'plano_liberado_criado', false)) return;
  salvarPlano(P, { ...LIBERADO, features: Object.fromEntries(Object.keys(RECURSOS).map(k => [k, true])) }, null, {});
  salvarAjuste(P.db, 'plano_liberado_criado', true);
}

export function semearPlanos(P) {
  if (um(P.db, 'select 1 from plans')) return semearLiberado(P);
  const base = { features: Object.fromEntries(Object.keys(RECURSOS).map(k => [k, true])), rules: { reserve_fast_only: true, pack_credits: 10000, pack_price_usd: 250 } };
  salvarPlano(P, { name: 'GreenIA Team', description: 'Para começar com uma área ou um time', price_usd: 290, credits: 10000, reserve: 2000, limits: LIMITES_PADRAO, ...base }, null, {});
  salvarPlano(P, { name: 'GreenIA Company', description: 'Para levar a IA a todas as áreas', price_usd: 750, credits: 25000, reserve: 5000, limits: { ...LIMITES_PADRAO, max_concurrent: 20 }, ...base, features: { ...base.features, custom_domain: true } }, null, {});
  semearLiberado(P);
}

const dePlano = p => p && ({ ...p, limits: { ...LIMITES_PADRAO, ...json(p.limits, {}) }, features: json(p.features, {}), rules: json(p.rules, {}), settings: json(p.settings, {}) });
export const lerPlanoPorId = (P, id) => dePlano(um(P.db, 'select * from plans where id = ?', id));
export const listarPlanos = P => todos(P.db, 'select * from plans order by status, credits = 0, credits').map(dePlano)
  .map(p => ({ ...p, empresas: um(P.db, 'select count(*) as n from companies where plan_id = ?', p.id).n }));

export function salvarPlano(P, dados, ator, origem, id = null) {
  const antes = id ? lerPlanoPorId(P, id) : null;
  if (id && !antes) throw erro(404, 'plano', 'Plano não encontrado.');
  const d = { ...antes, ...dados };
  const name = texto(d.name, 60, 'name', { obrigatorio: true });
  const credits = Math.floor(Number(d.credits));
  if (!(credits >= 0 && credits <= 10_000_000)) throw erro(400, 'credits', 'Créditos inválidos.');
  const reserve = d.reserve === undefined || d.reserve === '' ? Math.round(credits * 0.2) : Math.floor(Number(d.reserve));
  if (!(reserve >= 0 && reserve <= credits)) throw erro(400, 'reserve', 'A reserva precisa ficar entre zero e os créditos do plano.');
  const price = d.price_usd === '' || d.price_usd == null ? null : Number(d.price_usd);
  if (price !== null && !(price >= 0)) throw erro(400, 'price_usd', 'Preço inválido.');
  const features = Object.fromEntries(Object.keys(RECURSOS).map(k => [k, !!(d.features || {})[k]]));
  const limits = Object.fromEntries(Object.keys(LIMITES).map(k => { const bruto = (d.limits || {})[k]; const v = Math.floor(Number(bruto === undefined ? LIMITES_PADRAO[k] : bruto || 0)); if (!(v >= 0 && v <= 1_000_000)) throw erro(400, k, `Limite inválido: ${LIMITES[k]}.`); return [k, v]; }));
  const rules = { reserve_fast_only: (d.rules || {}).reserve_fast_only !== false, pack_credits: Math.max(0, Math.floor(Number((d.rules || {}).pack_credits) || 0)), pack_price_usd: Math.max(0, Number((d.rules || {}).pack_price_usd) || 0) };
  const settings = typeof d.settings === 'object' && d.settings ? d.settings : {};
  if (JSON.stringify(settings).length > 5000) throw erro(400, 'settings', 'Configurações específicas grandes demais.');
  const status = d.status === 'inativo' ? 'inativo' : 'ativo';
  const planoId = id || novoId('plan');
  const valores = [name, texto(d.description, 300, 'description'), status, price, credits, reserve, JSON.stringify(limits), JSON.stringify(features), JSON.stringify(rules), JSON.stringify(settings), agoraIso(P)];
  if (id) exec(P.db, 'update plans set name = ?, description = ?, status = ?, price_usd = ?, credits = ?, reserve = ?, limits = ?, features = ?, rules = ?, settings = ?, updated_at = ? where id = ?', ...valores, id);
  else exec(P.db, 'insert into plans (name, description, status, price_usd, credits, reserve, limits, features, rules, settings, updated_at, id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...valores, planoId, agoraIso(P));
  const depois = lerPlanoPorId(P, planoId);
  if (ator !== null) auditar(P, { usuario: ator, acao: id ? 'plan.updated' : 'plan.created', entidade: 'plan', id: planoId, antes, depois, origem });
  if (id) for (const c of todos(P.db, 'select id from companies where plan_id = ?', id)) P.aplicarAoTenant(c.id);
  return depois;
}

// ---------------------------------------------------------------- Empresas
const deEmpresa = c => c && { ...c };
export const lerEmpresa = (P, id) => deEmpresa(um(P.db, 'select * from companies where id = ?', id));
export function exigirEmpresa(P, id) { const c = lerEmpresa(P, id); if (!c) throw erro(404, 'empresa', 'Empresa não encontrada.'); return c; }

export function urlDaEmpresa(P, c) {
  if (c.custom_domain) return `https://${c.custom_domain}`;
  const sub = lerAjuste(P.db, 'subdominio_base', P.subdominioBase || '');
  if (sub) return `https://${c.slug}.${sub}`;
  return `${P.urlBase || ''}/${c.slug}`;
}

// Uma vez: o domínio próprio era desligado por padrão e dependia do plano; agora vale para todos.
export function liberarDominioParaTodos(P) {
  if (lerAjuste(P.db, 'dominio_para_todos', false)) return;
  for (const c of todos(P.db, 'select company_id, grants from company_settings')) {
    const g = json(c.grants, {});
    if (g.domain === false) exec(P.db, 'update company_settings set grants = ? where company_id = ?', JSON.stringify({ ...g, domain: true }), c.company_id);
  }
  salvarAjuste(P.db, 'dominio_para_todos', true);
}
export function concessoes(P, companyId) {
  const s = um(P.db, 'select grants from company_settings where company_id = ?', companyId);
  return { branding: true, landing_page: true, url: true, domain: true, roles: true, ...json(s?.grants, {}) };
}
export const marcaBloqueada = (P, companyId) => json(um(P.db, 'select locked from branding where company_id = ?', companyId)?.locked, []);

// O que o admin da empresa pode personalizar: recurso do plano, concessão do operador da plataforma (a permissão da pessoa é conferida na rota).
// Sem plano definido (empresa ainda em configuração), a personalização fica liberada: ela não consome
// nada, e os limites de uso já dependem do plano.
const RECURSO_DA_CONCESSAO = { branding: 'custom_branding', landing_page: 'landing_page', url: 'custom_url', domain: null, roles: 'custom_roles' };
export function podeEditar(P, companyId) {
  const m = motivosBloqueio(P, companyId);
  return Object.fromEntries(Object.keys(RECURSO_DA_CONCESSAO).map(k => [k, !m[k]]));
}
// Por que cada item está travado para a empresa (ou null): o plano não inclui, ou o operador não concedeu.
export function motivosBloqueio(P, companyId) {
  const c = lerEmpresa(P, companyId);
  const plano = c?.plan_id ? lerPlanoPorId(P, c.plan_id) : null;
  const g = concessoes(P, companyId);
  return Object.fromEntries(Object.entries(RECURSO_DA_CONCESSAO).map(([k, recurso]) => [k,
    recurso && plano && !plano.features?.[recurso] ? `O plano ${plano.name} não inclui ${RECURSOS[recurso].toLowerCase()}. Para liberar, o operador da plataforma precisa mudar o plano da empresa.`
      : !g[k] ? `O operador da plataforma não liberou a edição de ${CONCESSOES[k].toLowerCase()} para a empresa. Para liberar, ele marca o item em Permissões concedidas.`
        : null]));
}

export function criarEmpresa(P, dados, ator, origem) {
  const name = texto(dados.name, 80, 'name', { obrigatorio: true });
  const slug = validarSlug(dados.slug, lerAjuste(P.db, 'slugs_reservados', []));
  if (um(P.db, 'select 1 from companies where slug = ?', slug) || um(P.db, 'select 1 from company_slugs where slug = ?', slug)) throw erro(409, 'slug', 'Este identificador já está em uso.');
  const planoId = dados.plan_id === undefined ? lerAjuste(P.db, 'plano_padrao', null) : dados.plan_id;
  const plano = planoId ? lerPlanoPorId(P, planoId) : null;
  if (planoId && !plano) throw erro(400, 'plan_id', 'Plano inválido.');
  if (plano && plano.status !== 'ativo') throw erro(400, 'plan_id', 'Este plano está inativo.');
  const id = dados.id || novoId('emp');
  const banco = dados.banco || join(P.pastaEmpresas, `${id}.sqlite`);
  const t = agoraIso(P);
  transacao(P.db, () => {
    exec(P.db, 'insert into companies (id, name, slug, status, plan_id, banco, legal_name, document, contact_email, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, name, slug, dados.status && STATUS_EMPRESA[dados.status] ? dados.status : 'em_implantacao', plano?.id ?? null, banco,
      texto(dados.legal_name, 160, 'legal_name'), texto(dados.document, 40, 'document'), dados.contact_email ? validarEmail(dados.contact_email) : '', texto(dados.notes, 1000, 'notes'), t, t);
    const textos = marcaPadrao(name);
    exec(P.db, 'insert into branding (company_id, display_name, login_title, login_text, privacy_note, updated_at) values (?, ?, ?, ?, ?, ?)', id, name, textos.login_title, textos.login_text, textos.privacy_note, t);
    exec(P.db, "insert into landing_pages (company_id, content, seo, status, updated_at) values (?, ?, ?, 'publicada', ?)", id, JSON.stringify(landingPadrao(name)), JSON.stringify(seoPadrao(name)), t);
    exec(P.db, 'insert into company_settings (company_id, settings, grants, updated_at) values (?, ?, ?, ?)', id, '{}', '{}', t);
  });
  auditar(P, { usuario: ator, empresa: id, acao: 'company.created', entidade: 'company', id, depois: lerEmpresa(P, id), origem });
  P.abrirTenant(id);
  return lerEmpresa(P, id);
}

export function atualizarEmpresa(P, id, dados, ator, origem) {
  const antes = exigirEmpresa(P, id);
  const campos = {
    name: dados.name !== undefined ? texto(dados.name, 80, 'name', { obrigatorio: true }) : antes.name,
    legal_name: dados.legal_name !== undefined ? texto(dados.legal_name, 160, 'legal_name') : antes.legal_name,
    document: dados.document !== undefined ? texto(dados.document, 40, 'document') : antes.document,
    contact_email: dados.contact_email !== undefined ? (dados.contact_email ? validarEmail(dados.contact_email) : '') : antes.contact_email,
    notes: dados.notes !== undefined ? texto(dados.notes, 1000, 'notes') : antes.notes,
  };
  exec(P.db, 'update companies set name = ?, legal_name = ?, document = ?, contact_email = ?, notes = ?, updated_at = ? where id = ?', campos.name, campos.legal_name, campos.document, campos.contact_email, campos.notes, agoraIso(P), id);
  auditar(P, { usuario: ator, empresa: id, acao: 'company.updated', entidade: 'company', id, antes, depois: lerEmpresa(P, id), origem });
  P.aplicarAoTenant(id);
  return lerEmpresa(P, id);
}

export function mudarStatus(P, id, status, ator, origem) {
  const antes = exigirEmpresa(P, id);
  if (!STATUS_EMPRESA[status]) throw erro(400, 'status', 'Status inválido.');
  if (antes.status === status) return antes;
  exec(P.db, 'update companies set status = ?, updated_at = ? where id = ?', status, agoraIso(P), id);
  // Suspensa ou cancelada: as sessões das pessoas da empresa caem na hora.
  if (status === 'suspensa' || status === 'cancelada') { encerrarAcessosAbertos(P, { companyId: id }, `empresa_${status}`, origem); exec(P.db, 'delete from sessions where company_id = ?', id); }
  const acao = { ativa: 'company.published', suspensa: 'company.suspended', cancelada: 'company.cancelled', em_implantacao: 'company.status_changed' }[status];
  auditar(P, { usuario: ator, empresa: id, acao, entidade: 'company', id, antes: { status: antes.status }, depois: { status }, origem });
  return lerEmpresa(P, id);
}

export function mudarPlano(P, id, planId, ator, origem) {
  const antes = exigirEmpresa(P, id);
  const plano = planId ? lerPlanoPorId(P, planId) : null;
  if (planId && !plano) throw erro(400, 'plan_id', 'Plano inválido.');
  if (plano && plano.status !== 'ativo' && antes.plan_id !== planId) throw erro(400, 'plan_id', 'Este plano está inativo.');
  exec(P.db, 'update companies set plan_id = ?, updated_at = ? where id = ?', plano?.id ?? null, agoraIso(P), id);
  auditar(P, { usuario: ator, empresa: id, acao: 'company.plan_changed', entidade: 'company', id, antes: { plan_id: antes.plan_id }, depois: { plan_id: plano?.id ?? null, plano: plano?.name }, origem });
  P.aplicarAoTenant(id);
  return lerEmpresa(P, id);
}

// URL: slug e domínio próprio. O ID interno não muda; o slug antigo continua levando à empresa.
export function mudarUrl(P, id, { slug, custom_domain }, ator, origem, { escopo = 'plataforma' } = {}) {
  const antes = exigirEmpresa(P, id);
  const pode = escopo === 'plataforma' ? { url: true, domain: true } : podeEditar(P, id);
  let novoSlug = antes.slug, novoDominio = antes.custom_domain;
  if (slug !== undefined && slug !== antes.slug) {
    if (!pode.url) throw erro(403, 'nao_concedido', 'A alteração de URL não está liberada para esta empresa.');
    novoSlug = validarSlug(slug, lerAjuste(P.db, 'slugs_reservados', []));
    const dono = um(P.db, 'select id from companies where slug = ?', novoSlug) || um(P.db, 'select company_id as id from company_slugs where slug = ?', novoSlug);
    if (dono && dono.id !== id) throw erro(409, 'slug', 'Este identificador já está em uso.');
  }
  if (custom_domain !== undefined && (custom_domain || null) !== (antes.custom_domain || null)) {
    if (!pode.domain) throw erro(403, 'nao_concedido', 'Domínio próprio não está liberado para esta empresa.');
    novoDominio = validarDominio(custom_domain);
    if (novoDominio) {
      const base = [P.hostPlataforma, lerAjuste(P.db, 'subdominio_base', P.subdominioBase || '')].filter(Boolean);
      if (base.some(b => novoDominio === b || novoDominio.endsWith(`.${b}`))) throw erro(400, 'dominio', 'Use um domínio da empresa, não o da plataforma.');
      const dono = um(P.db, 'select id from companies where custom_domain = ?', novoDominio);
      if (dono && dono.id !== id) throw erro(409, 'dominio', 'Este domínio já está em uso por outra empresa.');
    }
  }
  transacao(P.db, () => {
    if (novoSlug !== antes.slug) {
      exec(P.db, 'delete from company_slugs where slug = ?', novoSlug);
      exec(P.db, 'insert into company_slugs (slug, company_id, until) values (?, ?, ?) on conflict (slug) do update set company_id = excluded.company_id, until = excluded.until', antes.slug, id, agoraIso(P));
    }
    exec(P.db, 'update companies set slug = ?, custom_domain = ?, updated_at = ? where id = ?', novoSlug, novoDominio || null, agoraIso(P), id);
    if ((novoDominio || null) !== (antes.custom_domain || null)) exec(P.db, "update companies set domain_status = ?, domain_checked_at = null, domain_message = '' where id = ?", novoDominio ? 'pendente' : '', id);
  });
  if ((novoDominio || null) !== (antes.custom_domain || null)) P.aoMudarDominio?.(id, antes.custom_domain || null, novoDominio || null);
  auditar(P, { usuario: ator, empresa: id, acao: 'company.url_changed', entidade: 'company', id, antes: { slug: antes.slug, custom_domain: antes.custom_domain }, depois: { slug: novoSlug, custom_domain: novoDominio || null }, origem });
  return lerEmpresa(P, id);
}

export function salvarConcessoes(P, id, { grants, locked }, ator, origem) {
  exigirEmpresa(P, id);
  const antes = { grants: concessoes(P, id), locked: marcaBloqueada(P, id) };
  const g = grants ? Object.fromEntries(Object.keys(CONCESSOES).map(k => [k, !!grants[k]])) : antes.grants;
  const l = locked ? [...new Set(locked.filter(k => CAMPOS_MARCA.includes(k)))] : antes.locked;
  exec(P.db, 'update company_settings set grants = ?, updated_at = ? where company_id = ?', JSON.stringify(g), agoraIso(P), id);
  exec(P.db, 'update branding set locked = ?, updated_at = ? where company_id = ?', JSON.stringify(l), agoraIso(P), id);
  auditar(P, { usuario: ator, empresa: id, acao: 'company.grants_changed', entidade: 'company_settings', id, antes, depois: { grants: g, locked: l }, origem });
  return { grants: g, locked: l };
}

// ---------------------------------------------------------------- Marca
// Textos da tela de login e aviso de privacidade: toda empresa já nasce com um exemplo pronto,
// que o cliente pode editar. O modelo também vai para o editor ("Usar o texto de exemplo").
export const marcaPadrao = nome => ({
  login_title: 'Entre com o seu email de trabalho',
  login_text: `Esta é a IA de uso interno de ${nome || 'sua empresa'}. Você recebe um código de acesso de 6 dígitos no email, sem senha para decorar.`,
  privacy_note: 'Nenhuma tela da GreenIA mostra o conteúdo das suas conversas a colegas ou ao admin; ele fica no banco da empresa, e você pode apagar as conversas quando quiser. As regras de dados da empresa são aplicadas a cada mensagem e anexo antes do envio à IA.',
});
export const TEXTOS_MARCA = Object.keys(marcaPadrao(''));
// Preenche os textos vazios das empresas que já existiam, uma vez só: se depois o cliente apagar
// um texto de propósito, ele continua vazio.
export function preencherTextosMarca(P) {
  if (lerAjuste(P.db, 'marca_textos_preenchidos', false)) return;
  for (const b of todos(P.db, 'select b.company_id, b.display_name, c.name from branding b join companies c on c.id = b.company_id')) {
    const m = marcaPadrao(b.display_name || b.name);
    for (const k of TEXTOS_MARCA) exec(P.db, `update branding set ${k} = ? where company_id = ? and ${k} = ''`, m[k], b.company_id);
  }
  salvarAjuste(P.db, 'marca_textos_preenchidos', true);
}
export const lerMarca = (P, id) => { const b = um(P.db, 'select b.*, c.name as nome_empresa from branding b join companies c on c.id = b.company_id where b.company_id = ?', id); if (!b) return b; const { nome_empresa, ...r } = b; return { ...r, locked: json(b.locked, []), modelo: marcaPadrao(b.display_name || nome_empresa) }; };

export function salvarMarca(P, id, dados, ator, origem, { escopo = 'plataforma' } = {}) {
  const antes = lerMarca(P, id);
  if (!antes) throw erro(404, 'empresa', 'Empresa não encontrada.');
  if (escopo === 'empresa') {
    if (!podeEditar(P, id).branding) throw erro(403, 'nao_concedido', motivosBloqueio(P, id).branding);
    const bloqueados = CAMPOS_MARCA.filter(k => dados[k] !== undefined && antes.locked.includes(k) && dados[k] !== antes[k]);
    if (bloqueados.length) throw erro(403, 'campo_bloqueado', `Estes itens foram bloqueados pelo operador da plataforma: ${bloqueados.join(', ')}.`);
  }
  const v = {
    display_name: dados.display_name !== undefined ? texto(dados.display_name, 80, 'display_name', { obrigatorio: true }) : antes.display_name,
    logo: dados.logo !== undefined ? validarImagem(dados.logo, 'logo') : antes.logo,
    favicon: dados.favicon !== undefined ? validarImagem(dados.favicon, 'favicon') : antes.favicon,
    primary_color: dados.primary_color !== undefined ? validarCorPrincipal(dados.primary_color) : antes.primary_color,
    secondary_color: dados.secondary_color !== undefined ? validarCor(dados.secondary_color, 'secondary_color') : antes.secondary_color,
    login_title: dados.login_title !== undefined ? texto(dados.login_title, 120, 'login_title') : antes.login_title,
    login_text: dados.login_text !== undefined ? texto(dados.login_text, 400, 'login_text') : antes.login_text,
    privacy_note: dados.privacy_note !== undefined ? texto(dados.privacy_note, 400, 'privacy_note') : antes.privacy_note,
  };
  exec(P.db, `update branding set ${CAMPOS_MARCA.map(k => `${k} = ?`).join(', ')}, updated_at = ? where company_id = ?`, ...CAMPOS_MARCA.map(k => v[k]), agoraIso(P), id);
  const mudou = Object.fromEntries(CAMPOS_MARCA.filter(k => v[k] !== antes[k]).map(k => [k, v[k]]));
  if (Object.keys(mudou).length) auditar(P, { usuario: ator, empresa: id, acao: 'branding.updated', entidade: 'branding', id, antes: Object.fromEntries(Object.keys(mudou).map(k => [k, antes[k]])), depois: mudou, origem });
  P.aplicarAoTenant(id);
  return lerMarca(P, id);
}

// ---------------------------------------------------------------- Landing page
// Limites de gravação dos campos do modelo que levam o nome da empresa (os mesmos que validarConteudoLanding e
// salvarLanding aplicam). O modelo usa o texto com o nome quando ele cabe inteiro; se não cabe, usa a forma genérica
// inteira: nunca um texto cortado pela gravação.
export const LIMITES_LANDING = { rotulo: 80, institucional_titulo: 80, seo_title: 70, seo_description: 160 };
const inteiro = (comNome, limite, generico) => (comNome.length <= limite ? comNome : generico);

// Modelo completo da landing page de uma empresa: toda a página já vem escrita, com o nome da
// empresa, e cada texto pode ser trocado no editor. Nenhuma seção fica vazia.
export function landingPadrao(nome) {
  const n = nome || 'sua empresa';
  return {
    rotulo: inteiro(`A IA da ${n}`, LIMITES_LANDING.rotulo, 'A IA da empresa'),
    titulo: 'IA para o trabalho, com as regras da casa',
    subtitulo: `Resuma, confira, rascunhe e consulte os documentos da sua área num lugar só. As regras de dados da ${n} são aplicadas a cada mensagem e anexo antes do envio.`,
    descricao: '',
    imagem: '',
    botoes: [{ texto: 'Entrar com o email da empresa', link: '/entrar', estilo: 'primario' }, { texto: 'Como usar', link: '#como-usar', estilo: 'secundario' }],
    destaques: ['Código de acesso no email', 'Sem senha para decorar', 'Suas conversas não aparecem nas telas de colegas e do admin'],
    textos: {
      como_usar_rotulo: 'Como usar', como_usar_titulo: 'Três passos para começar',
      chamadas_rotulo: 'Ao entrar', chamadas_titulo: 'O que você encontra',
      regras_rotulo: 'Antes de enviar', regras_titulo: 'O que pode, o que pede cuidado e o que é bloqueado',
      regras_sub: `A GreenIA confere cada mensagem e cada anexo antes do envio, pelas regras que a ${n} definiu para os tipos de dado reconhecidos.`,
      tarefas_rotulo: 'Boas tarefas', tarefas_titulo: 'Por onde começar', tarefas_sub: 'Exemplos de pedidos para começar.',
      fim_titulo: 'Pronto para começar', fim_texto: 'Revise sempre antes de usar. A IA ajuda, a decisão é sua.', fim_botao: 'Entrar',
    },
    passos: [
      { titulo: 'Entre com o seu email', texto: `Use o email da ${n}. Um código de 6 dígitos, de uso único, chega por email.` },
      { titulo: 'Peça em palavras simples', texto: 'Cole um texto, anexe PDF, Word, Excel, PowerPoint, CSV ou imagem e diga o que precisa. Imagens e PDFs escaneados viram texto no servidor da GreenIA, e esse texto segue para a IA.' },
      { titulo: 'Revise e ajuste', texto: 'Peça mais curto, em tabela ou em outro tom. A decisão final é sempre sua.' },
    ],
    chamadas: [
      { titulo: 'Conversas', texto: 'Para qualquer tarefa do dia: resumir, conferir, reescrever, organizar. A conversa fica salva e dá para continuar depois, dentro do prazo de retenção da empresa.' },
      { titulo: 'Quick wins', texto: 'Usos prontos para tarefas que se repetem na sua área, com instruções já definidas. Você traz só o caso do dia. Nos quick wins criados pela jornada guiada, o resultado é conferido contra as regras antes de aparecer.' },
      { titulo: 'Conhecimento', texto: 'Procedimentos e documentos das áreas. Quando a busca encontra documentos da área, a resposta lista os documentos consultados.' },
      { titulo: 'Classes de modelo', texto: 'A GreenIA escolhe o nível de cada pedido entre Rápido, Equilibrado e Avançado, dentro do que a empresa libera. Nas conversas, cada resposta explica por que aquele nível foi usado. Se preferir, você escolhe.' },
    ],
    regras: {
      pode: ['Textos e documentos de trabalho', 'Procedimentos, modelos e rascunhos', 'Planilhas sem dados pessoais'],
      sigilo: ['Dados de clientes, fornecedores e pessoas', 'Informações financeiras ou estratégicas', 'Com a opção de sigilo ligada pela empresa, a conversa só usa recursos autorizados; se não houver, nada é enviado'],
      nunca: ['Senhas, tokens e chaves de acesso reconhecidos', 'Inclusive em documentos da base e no histórico', 'Nenhuma regra da empresa libera'],
    },
    tarefas: [
      { tipo: 'Resumir', texto: 'Resuma este relatório em cinco pontos para a diretoria' },
      { tipo: 'Conferir', texto: 'Compare estes dois contratos e liste o que mudou' },
      { tipo: 'Consultar', texto: 'Qual é o prazo do procedimento de recebimento?' },
      { tipo: 'Organizar', texto: 'Monte uma tabela com estas três cotações' },
      { tipo: 'Rascunhar', texto: 'Escreva um email ao fornecedor sobre a divergência' },
      { tipo: 'Revisar', texto: 'Deixe este texto mais claro e mais curto' },
    ],
    secoes: { como_usar: true, chamadas: true, regras: true, tarefas: true, institucional: true },
    institucional: {
      titulo: inteiro(`A IA na ${n}`, LIMITES_LANDING.institucional_titulo, 'A IA na empresa'),
      texto: `A ${n} oferece a GreenIA para apoiar o trabalho do dia a dia, com as regras de dados da empresa e a Política de Uso de IA. As conversas ficam guardadas no banco da empresa; para responder, o conteúdo segue para o recurso de IA. Em caso de dúvida, fale com a equipe responsável pela IA na ${n}.`,
      links: [{ texto: 'Política de uso de IA', link: '/politica' }],
    },
  };
}
export const seoPadrao = nome => ({
  title: inteiro(`${nome || 'Sua empresa'} · IA para o trabalho`, LIMITES_LANDING.seo_title, 'IA para o trabalho'),
  description: inteiro(`Ambiente de IA da ${nome || 'empresa'}: conversas, quick wins e conhecimento das áreas, com as regras de dados da empresa.`, LIMITES_LANDING.seo_description,
    'Ambiente de IA da empresa: conversas, quick wins e conhecimento das áreas, com as regras de dados da empresa.'),
});

// Seções que a empresa pode esconder na página (o topo e o fechamento ficam sempre).
export const SECOES_LANDING = ['como_usar', 'chamadas', 'regras', 'tarefas', 'institucional'];

export function lerLanding(P, id) {
  const l = um(P.db, 'select * from landing_pages where company_id = ?', id);
  const nome = lerMarca(P, id)?.display_name || lerEmpresa(P, id)?.name || '';
  const modelo = landingPadrao(nome), salvo = json(l?.content, {});
  // Textos novos do modelo entram sozinhos em landings antigas; o que a empresa já escreveu prevalece.
  return l && { status: l.status, empresaStatus: lerEmpresa(P, id)?.status, content: { ...modelo, ...salvo, textos: { ...modelo.textos, ...(salvo.textos || {}) }, secoes: { ...modelo.secoes, ...(salvo.secoes || {}) } }, seo: { ...seoPadrao(nome), ...Object.fromEntries(Object.entries(json(l.seo, {})).filter(([, v]) => v)) }, modelo, modeloSeo: seoPadrao(nome), updated_at: l.updated_at };
}

function validarConteudoLanding(c) {
  const botoes = (Array.isArray(c.botoes) ? c.botoes : []).slice(0, 3).map(b => ({ texto: texto(b.texto, 40, 'botao'), link: validarLink(b.link), estilo: b.estilo === 'secundario' ? 'secundario' : 'primario' })).filter(b => b.texto && b.link);
  return {
    rotulo: texto(c.rotulo, LIMITES_LANDING.rotulo, 'rotulo'),
    titulo: texto(c.titulo, 120, 'titulo', { obrigatorio: true }),
    subtitulo: texto(c.subtitulo, 300, 'subtitulo'),
    descricao: texto(c.descricao, 1200, 'descricao'),
    imagem: validarImagem(c.imagem, 'imagem'),
    botoes,
    destaques: (Array.isArray(c.destaques) ? c.destaques : []).slice(0, 4).map(d => texto(d, 60, 'destaque')).filter(Boolean),
    chamadas: (Array.isArray(c.chamadas) ? c.chamadas : []).slice(0, 6).map(x => ({ titulo: texto(x.titulo, 60, 'chamada'), texto: texto(x.texto, 300, 'chamada') })).filter(x => x.titulo),
    secoes: Object.fromEntries(SECOES_LANDING.map(k => [k, c.secoes?.[k] !== false])),
    textos: Object.fromEntries(Object.keys(landingPadrao('').textos).map(k => [k, texto(c.textos?.[k], k.endsWith('_sub') || k === 'fim_texto' ? 240 : 120, k)])),
    passos: (Array.isArray(c.passos) ? c.passos : []).slice(0, 4).map(x => ({ titulo: texto(x.titulo, 60, 'passo'), texto: texto(x.texto, 200, 'passo') })).filter(x => x.titulo),
    regras: Object.fromEntries(['pode', 'sigilo', 'nunca'].map(k => [k, (Array.isArray(c.regras?.[k]) ? c.regras[k] : []).slice(0, 5).map(t => texto(t, 120, 'regra')).filter(Boolean)])),
    tarefas: (Array.isArray(c.tarefas) ? c.tarefas : []).slice(0, 8).map(x => ({ tipo: texto(x.tipo, 30, 'tarefa'), texto: texto(x.texto, 140, 'tarefa') })).filter(x => x.texto),
    institucional: {
      titulo: texto(c.institucional?.titulo, LIMITES_LANDING.institucional_titulo, 'institucional'), texto: texto(c.institucional?.texto, 1200, 'institucional'),
      links: (Array.isArray(c.institucional?.links) ? c.institucional.links : []).slice(0, 6).map(l => ({ texto: texto(l.texto, 40, 'link'), link: validarLink(l.link) })).filter(l => l.texto && l.link),
    },
  };
}

export function salvarLanding(P, id, dados, ator, origem, { escopo = 'plataforma' } = {}) {
  const antes = lerLanding(P, id);
  if (!antes) throw erro(404, 'empresa', 'Empresa não encontrada.');
  if (escopo === 'empresa' && !podeEditar(P, id).landing_page) throw erro(403, 'nao_concedido', motivosBloqueio(P, id).landing_page);
  const content = dados.content ? validarConteudoLanding({ ...antes.content, ...dados.content, textos: { ...antes.content.textos, ...(dados.content.textos || {}) }, regras: { ...antes.content.regras, ...(dados.content.regras || {}) } }) : antes.content;
  const seo = dados.seo ? { title: texto(dados.seo.title, LIMITES_LANDING.seo_title, 'seo'), description: texto(dados.seo.description, LIMITES_LANDING.seo_description, 'seo') } : antes.seo;
  const status = dados.status === 'publicada' || dados.status === 'rascunho' ? dados.status : antes.status;
  exec(P.db, 'update landing_pages set content = ?, seo = ?, status = ?, updated_at = ? where company_id = ?', JSON.stringify(content), JSON.stringify(seo), status, agoraIso(P), id);
  auditar(P, { usuario: ator, empresa: id, acao: status !== antes.status ? `landing_page.${status === 'publicada' ? 'published' : 'unpublished'}` : 'landing_page.updated', entidade: 'landing_page', id, antes: { status: antes.status, content: antes.content, seo: antes.seo }, depois: { status, content, seo }, origem });
  return lerLanding(P, id);
}

// ---------------------------------------------------------------- Usuários e vínculos
export const acharUsuario = (P, email) => um(P.db, 'select * from users where email = ?', email);
export function garantirUsuario(P, email, nome) {
  let u = acharUsuario(P, email);
  if (!u) {
    u = { id: novoId('usr'), email, name: nome || email.split('@')[0] };
    exec(P.db, 'insert into users (id, email, name, status, created_at) values (?, ?, ?, ?, ?)', u.id, email, u.name, 'ativo', agoraIso(P));
    u = acharUsuario(P, email);
  }
  return u;
}

export function listarMembros(P, companyId) {
  return todos(P.db, `select u.id, u.email, u.name, u.status as status_usuario, cu.status, cu.role_id, r.name as role, r.key as role_key, cu.created_at, cu.updated_at
    from company_users cu join users u on u.id = cu.user_id join roles r on r.id = cu.role_id where cu.company_id = ? order by u.name, u.email`, companyId);
}

const ehRoleAdmin = (P, roleId) => permissoesDaRole(P.db, roleId).includes('company.manage');
function adminsAtivos(P, companyId, excetoUserId) {
  return todos(P.db, "select role_id from company_users where company_id = ? and status = 'ativo' and user_id != ?", companyId, excetoUserId).filter(v => ehRoleAdmin(P, v.role_id)).length;
}

export function criarMembro(P, companyId, { email, name, role_id, role_key, status }, ator, origem, { convidar = true } = {}) {
  const c = exigirEmpresa(P, companyId);
  const e = validarEmail(email);
  const role = role_id ? acharRoleDaEmpresa(P.db, companyId, role_id) : roleDeSistema(P.db, role_key || 'member');
  const limite = lerPlanoPorId(P, c.plan_id)?.limits?.max_users || 0;
  if (limite && um(P.db, "select count(*) as n from company_users where company_id = ? and status != 'inativo'", companyId).n >= limite) throw erro(409, 'limite_usuarios', `O plano desta empresa permite até ${limite} usuários. Fale com o operador da plataforma para ampliar.`);
  const u = garantirUsuario(P, e, texto(name, 120, 'name'));
  if (um(P.db, 'select 1 from company_users where company_id = ? and user_id = ?', companyId, u.id)) throw erro(409, 'email', 'Esta pessoa já faz parte da empresa.');
  const st = status === 'ativo' ? 'ativo' : 'convidado';
  exec(P.db, 'insert into company_users (company_id, user_id, role_id, status, invited_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)', companyId, u.id, role.id, st, ator, agoraIso(P), agoraIso(P));
  if (name && !u.name) exec(P.db, 'update users set name = ? where id = ?', texto(name, 120, 'name'), u.id);
  P.sincronizarPessoa(companyId, u.id);
  auditar(P, { usuario: ator, empresa: companyId, acao: 'user.created', entidade: 'company_user', id: u.id, depois: { email: e, role: role.key, status: st }, origem });
  if (convidar) {
    const url = urlDaEmpresa(P, c);
    const nomeEmpresa = lerMarca(P, companyId)?.display_name || c.name;
    P.emailDa(companyId).enviar(e, `Convite para a GreenIA da ${nomeEmpresa}`,
      `Você foi convidado para usar a GreenIA da ${nomeEmpresa}.\n\nPara entrar, acesse ${url} e use este email (${e}). Um código de acesso é enviado para este email.`).catch(err => P.log('convite', err.message));
  }
  return listarMembros(P, companyId).find(m => m.id === u.id);
}

export function atualizarMembro(P, companyId, userId, { role_id, status, name }, ator, origem) {
  const v = um(P.db, 'select * from company_users where company_id = ? and user_id = ?', companyId, userId);
  if (!v) throw erro(404, 'usuario', 'Usuário não encontrado nesta empresa.');
  const role = role_id ? acharRoleDaEmpresa(P.db, companyId, role_id) : { id: v.role_id };
  const st = status === undefined ? v.status : ['ativo', 'inativo', 'convidado'].includes(status) ? status : v.status;
  const perdeAdmin = ehRoleAdmin(P, v.role_id) && v.status === 'ativo' && (!ehRoleAdmin(P, role.id) || st !== 'ativo');
  if (perdeAdmin && !adminsAtivos(P, companyId, userId)) throw erro(409, 'ultimo_admin', 'A empresa precisa de pelo menos um administrador ativo.');
  exec(P.db, 'update company_users set role_id = ?, status = ?, updated_at = ? where company_id = ? and user_id = ?', role.id, st, agoraIso(P), companyId, userId);
  if (name !== undefined) exec(P.db, 'update users set name = ? where id = ?', texto(name, 120, 'name', { obrigatorio: true }), userId);
  if (st === 'inativo') { encerrarAcessosAbertos(P, { companyId, userId }, 'pessoa_desativada'); exec(P.db, 'delete from sessions where user_id = ? and company_id = ?', userId, companyId); }
  P.sincronizarPessoa(companyId, userId);
  const acao = role.id !== v.role_id ? 'user.role_changed' : st !== v.status ? (st === 'inativo' ? 'user.deactivated' : 'user.activated') : 'user.updated';
  auditar(P, { usuario: ator, empresa: companyId, acao, entidade: 'company_user', id: userId, antes: { role_id: v.role_id, status: v.status }, depois: { role_id: role.id, status: st, name }, origem });
  return listarMembros(P, companyId).find(m => m.id === userId);
}

export function removerMembro(P, companyId, userId, ator, origem) {
  const v = um(P.db, 'select * from company_users where company_id = ? and user_id = ?', companyId, userId);
  if (!v) throw erro(404, 'usuario', 'Usuário não encontrado nesta empresa.');
  if (ehRoleAdmin(P, v.role_id) && v.status === 'ativo' && !adminsAtivos(P, companyId, userId)) throw erro(409, 'ultimo_admin', 'A empresa precisa de pelo menos um administrador ativo.');
  exec(P.db, 'delete from company_users where company_id = ? and user_id = ?', companyId, userId);
  encerrarAcessosAbertos(P, { companyId, userId }, 'pessoa_removida');
  exec(P.db, 'delete from sessions where user_id = ? and company_id = ?', userId, companyId);
  P.sincronizarPessoa(companyId, userId);   // a pessoa fica inativa no banco da empresa (o histórico continua)
  auditar(P, { usuario: ator, empresa: companyId, acao: 'user.deleted', entidade: 'company_user', id: userId, antes: { role_id: v.role_id, status: v.status }, origem });
  return { ok: true };
}

// ---------------------------------------------------------------- Uso e ambiente (lidos do banco da empresa)
export function usoDaEmpresa(P, companyId) {
  const t = P.tenant(companyId);
  const mes = P.agora().toISOString().slice(0, 7);
  const custo = um(t.db, 'select coalesce(sum(custo), 0) as c, count(*) as n, count(distinct pessoa_id) as p, count(distinct conversa_id) as conv from uso where substr(em, 1, 7) = ?', mes);
  return {
    mes, plano: situacaoPlano(t), custoUsd: custo.c, respostas: custo.n, pessoasAtivas: custo.p, conversas: custo.conv,
    ultimoUso: um(t.db, 'select max(em) as em from uso').em, pessoas: um(t.db, 'select count(*) as n from pessoas where ativo = 1').n,
    quickWins: um(t.db, 'select count(*) as n from quick_wins').n, documentos: um(t.db, 'select count(*) as n from documentos').n,
  };
}
export function ambienteDaEmpresa(P, c) {
  let tamanho = 0;
  try { tamanho = statSync(c.banco).size; } catch { /* banco em memória nos testes */ }
  const t = P.tenant(c.id);
  return { url: urlDaEmpresa(P, c), banco: c.banco.split('/').slice(-2).join('/'), tamanhoMb: Math.round(tamanho / 1048576 * 10) / 10, ia: t.ia.configurada !== false, smtp: !!lerConfig(t.db).smtp.url };
}
export function liberarPacoteNaEmpresa(P, companyId, dados, ator, origem, email) {
  const t = P.tenant(companyId);
  if (!t.plano) throw erro(400, 'sem_plano', 'Vincule um plano à empresa antes de liberar pacotes.');
  const s = liberarPacote(t, null, dados.creditos, { observacao: dados.observacao, validade: dados.validade || null, origem: 'console', operador: email });
  avisarPacote(t, Math.floor(Number(dados.creditos))).catch(() => {});
  auditar(P, { usuario: ator, empresa: companyId, acao: 'creditpack.added', entidade: 'pacote', depois: { creditos: Number(dados.creditos), validade: dados.validade || null, observacao: dados.observacao || '' }, origem });
  return s;
}

export { ehAdminPlataforma };

// ---------------------------------------------------------------- Exportação e exclusão definitiva
// Cópia íntegra do banco da empresa (SQLite compactado): o que a empresa leva ao sair.
export function exportarEmpresa(P, companyId) {
  const c = exigirEmpresa(P, companyId);
  const temp = join(tmpdir(), `greenia-exportacao-${randomUUID()}.sqlite`);
  try {
    P.tenant(companyId).db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`);
    return { nome: `greenia-${c.slug}-${P.agora().toISOString().slice(0, 10)}.sqlite.gz`, dados: gzipSync(readFileSync(temp), { level: 9 }) };
  } finally { rmSync(temp, { force: true }); }
}

// Exclusão definitiva: só de empresa cancelada, com o slug digitado como confirmação.
// Antes de apagar, guarda uma cópia em dados/excluidas (a menos que a plataforma rode em memória).
export function excluirEmpresa(P, companyId, confirmacao, ator, origem) {
  const c = exigirEmpresa(P, companyId);
  if (c.status !== 'cancelada') throw erro(409, 'status', 'Cancele a empresa antes de excluir. A exclusão só vale para ambientes cancelados.');
  if (String(confirmacao || '').trim().toLowerCase() !== c.slug) throw erro(400, 'confirmacao', `Para confirmar, digite o identificador da empresa: ${c.slug}`);
  const resumo = { name: c.name, slug: c.slug, usuarios: um(P.db, 'select count(*) as n from company_users where company_id = ?', companyId).n, ...usoDaEmpresa(P, companyId) };
  let copia = null;
  if (P.pastaEmpresas !== ':memory:') {
    const pasta = join(dirname(P.pastaEmpresas), 'excluidas');
    mkdirSync(pasta, { recursive: true });
    const { nome, dados } = exportarEmpresa(P, companyId);
    copia = join(pasta, `${companyId}-${nome}`);
    writeFileSync(copia, dados);
  }
  const t = P.tenants.get(companyId);
  if (t) { try { t.db.close(); } catch { /* já fechado */ } P.tenants.delete(companyId); }
  transacao(P.db, () => {
    exec(P.db, 'delete from company_slugs where company_id = ?', companyId);
    encerrarAcessosAbertos(P, { companyId }, 'empresa_excluida', origem);
    exec(P.db, 'delete from sessions where company_id = ?', companyId);
    exec(P.db, 'delete from login_codes where scope = ?', companyId);
    exec(P.db, 'delete from companies where id = ?', companyId);   // em cascata: marca, landing, configurações, vínculos e roles da empresa
  });
  if (c.banco !== ':memory:') for (const s of ['', '-wal', '-shm']) rmSync(c.banco + s, { force: true });
  auditar(P, { usuario: ator, empresa: companyId, acao: 'company.deleted', entidade: 'company', id: companyId, antes: resumo, depois: { copia }, origem });
  return { ok: true, copia };
}
