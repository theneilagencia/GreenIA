// Serviços da plataforma: empresas (tenants), planos, usuários e vínculos, marca, landing page,
// URL e concessões. Usados pelo console do operador da plataforma e pelo admin da empresa; toda regra fica aqui,
// no servidor, e toda mudança relevante é auditada.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { erro } from '../http.js';
import { exec, todos, um, json, transacao } from '../db.js';
import { lerConfig } from '../config.js';
import { situacaoPlano, liberarPacote, avisarPacote } from '../plano.js';
import { auditar } from './auditoria.js';
import { lerAjuste } from './db.js';
import { roleDeSistema, acharRoleDaEmpresa, permissoesDaRole, ehAdminPlataforma } from './rbac.js';
import { validarSlug, validarDominio, validarCor, validarCorPrincipal, validarImagem, texto, validarLink, validarEmail } from './validar.js';

export const STATUS_EMPRESA = { em_implantacao: 'Em implantação', ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' };

// Recursos e limites controlados por plano (configuração, não código).
export const RECURSOS = {
  quick_wins: 'Quick wins', knowledge: 'Base de conhecimento', confidential: 'Conversas sigilosas',
  custom_branding: 'Marca própria', landing_page: 'Landing page própria', custom_url: 'URL personalizada',
  custom_domain: 'Domínio próprio', custom_roles: 'Roles personalizadas',
};
export const LIMITES = { max_users: 'Usuários (0 = sem limite)', messages_per_minute: 'Mensagens por minuto por pessoa', max_quick_wins: 'Quick wins (0 = sem limite)' };
// O que o operador da plataforma pode liberar ou não para o admin da empresa editar.
export const CONCESSOES = { branding: 'Identidade visual', landing_page: 'Landing page', url: 'URL', domain: 'Domínio próprio', roles: 'Roles e permissões' };
export const CAMPOS_MARCA = ['display_name', 'logo', 'favicon', 'primary_color', 'secondary_color', 'login_title', 'login_text', 'privacy_note'];

const agoraIso = P => P.agora().toISOString();
const novoId = prefixo => `${prefixo}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

// ---------------------------------------------------------------- Planos
export function semearPlanos(P) {
  if (um(P.db, 'select 1 from plans')) return;
  const base = { features: Object.fromEntries(Object.keys(RECURSOS).map(k => [k, k !== 'custom_domain'])), rules: { reserve_fast_only: true, pack_credits: 10000, pack_price_usd: 250 } };
  salvarPlano(P, { name: 'GreenIA Team', description: 'Para começar com uma área ou um time', price_usd: 290, credits: 10000, reserve: 2000, limits: { max_users: 0, messages_per_minute: 12, max_quick_wins: 0 }, ...base }, null, {});
  salvarPlano(P, { name: 'GreenIA Company', description: 'Para levar a IA a todas as áreas', price_usd: 750, credits: 25000, reserve: 5000, limits: { max_users: 0, messages_per_minute: 12, max_quick_wins: 0 }, ...base, features: { ...base.features, custom_domain: true } }, null, {});
}

const dePlano = p => p && ({ ...p, limits: json(p.limits, {}), features: json(p.features, {}), rules: json(p.rules, {}), settings: json(p.settings, {}) });
export const lerPlanoPorId = (P, id) => dePlano(um(P.db, 'select * from plans where id = ?', id));
export const listarPlanos = P => todos(P.db, 'select * from plans order by status, credits').map(dePlano)
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
  const limits = Object.fromEntries(Object.keys(LIMITES).map(k => { const v = Math.floor(Number((d.limits || {})[k] || 0)); if (!(v >= 0 && v <= 1_000_000)) throw erro(400, k, `Limite inválido: ${LIMITES[k]}.`); return [k, v]; }));
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

export function concessoes(P, companyId) {
  const s = um(P.db, 'select grants from company_settings where company_id = ?', companyId);
  return { branding: true, landing_page: true, url: true, domain: false, roles: true, ...json(s?.grants, {}) };
}
export const marcaBloqueada = (P, companyId) => json(um(P.db, 'select locked from branding where company_id = ?', companyId)?.locked, []);

// O que o admin da empresa pode personalizar: recurso do plano, concessão do operador da plataforma (a permissão da pessoa é conferida na rota).
export function podeEditar(P, companyId) {
  const c = lerEmpresa(P, companyId);
  const f = lerPlanoPorId(P, c.plan_id)?.features || {};
  const g = concessoes(P, companyId);
  return { branding: !!f.custom_branding && g.branding, landing_page: !!f.landing_page && g.landing_page, url: !!f.custom_url && g.url, domain: !!f.custom_domain && g.domain, roles: !!f.custom_roles && g.roles };
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
    exec(P.db, 'insert into branding (company_id, display_name, updated_at) values (?, ?, ?)', id, name, t);
    exec(P.db, 'insert into landing_pages (company_id, content, seo, updated_at) values (?, ?, ?, ?)', id, JSON.stringify(landingPadrao(name)), JSON.stringify({ title: `${name} · GreenIA`, description: '' }), t);
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
  if (status === 'suspensa' || status === 'cancelada') exec(P.db, 'delete from sessions where company_id = ?', id);
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
  });
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
export const lerMarca = (P, id) => { const b = um(P.db, 'select * from branding where company_id = ?', id); return b && { ...b, locked: json(b.locked, []) }; };

export function salvarMarca(P, id, dados, ator, origem, { escopo = 'plataforma' } = {}) {
  const antes = lerMarca(P, id);
  if (!antes) throw erro(404, 'empresa', 'Empresa não encontrada.');
  if (escopo === 'empresa') {
    if (!podeEditar(P, id).branding) throw erro(403, 'nao_concedido', 'A identidade visual desta empresa é gerenciada pelo operador da plataforma.');
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
export function landingPadrao(nome) {
  return {
    rotulo: `A IA da ${nome}`,
    titulo: 'IA para o trabalho, com as regras da casa',
    subtitulo: `Resuma, confira, rascunhe e consulte os documentos da sua área num lugar só. As regras de dados da ${nome} são aplicadas antes de cada envio.`,
    descricao: '',
    imagem: '',
    botoes: [{ texto: 'Entrar com o email da empresa', link: '/entrar', estilo: 'primario' }, { texto: 'Como usar', link: '#como-usar', estilo: 'secundario' }],
    destaques: ['Código de acesso no email', 'Sem senha para decorar', 'Conversas salvas só para você'],
    chamadas: [
      { titulo: 'Conversas', texto: 'Para qualquer tarefa do dia: resumir, conferir, reescrever, organizar. A conversa fica salva e dá para continuar depois.' },
      { titulo: 'Quick wins', texto: 'Usos prontos para tarefas que se repetem na sua área, com instruções e arquivos já definidos.' },
      { titulo: 'Conhecimento', texto: 'Procedimentos e documentos das áreas. A resposta mostra de qual documento veio a informação.' },
      { titulo: 'Classes de modelo', texto: 'Você escolhe o tipo de trabalho, não o modelo técnico: Rápido, Equilibrado ou Avançado.' },
    ],
    secoes: { como_usar: true, regras: true, tarefas: true },
    institucional: { titulo: '', texto: '', links: [] },
  };
}

export function lerLanding(P, id) {
  const l = um(P.db, 'select * from landing_pages where company_id = ?', id);
  return l && { status: l.status, content: { ...landingPadrao(lerEmpresa(P, id)?.name || ''), ...json(l.content, {}) }, seo: json(l.seo, {}), updated_at: l.updated_at };
}

function validarConteudoLanding(c) {
  const botoes = (Array.isArray(c.botoes) ? c.botoes : []).slice(0, 3).map(b => ({ texto: texto(b.texto, 40, 'botao'), link: validarLink(b.link), estilo: b.estilo === 'secundario' ? 'secundario' : 'primario' })).filter(b => b.texto && b.link);
  return {
    rotulo: texto(c.rotulo, 80, 'rotulo'),
    titulo: texto(c.titulo, 120, 'titulo', { obrigatorio: true }),
    subtitulo: texto(c.subtitulo, 300, 'subtitulo'),
    descricao: texto(c.descricao, 1200, 'descricao'),
    imagem: validarImagem(c.imagem, 'imagem'),
    botoes,
    destaques: (Array.isArray(c.destaques) ? c.destaques : []).slice(0, 4).map(d => texto(d, 60, 'destaque')).filter(Boolean),
    chamadas: (Array.isArray(c.chamadas) ? c.chamadas : []).slice(0, 6).map(x => ({ titulo: texto(x.titulo, 60, 'chamada'), texto: texto(x.texto, 300, 'chamada') })).filter(x => x.titulo),
    secoes: { como_usar: c.secoes?.como_usar !== false, regras: c.secoes?.regras !== false, tarefas: c.secoes?.tarefas !== false },
    institucional: {
      titulo: texto(c.institucional?.titulo, 80, 'institucional'), texto: texto(c.institucional?.texto, 1200, 'institucional'),
      links: (Array.isArray(c.institucional?.links) ? c.institucional.links : []).slice(0, 6).map(l => ({ texto: texto(l.texto, 40, 'link'), link: validarLink(l.link) })).filter(l => l.texto && l.link),
    },
  };
}

export function salvarLanding(P, id, dados, ator, origem, { escopo = 'plataforma' } = {}) {
  const antes = lerLanding(P, id);
  if (!antes) throw erro(404, 'empresa', 'Empresa não encontrada.');
  if (escopo === 'empresa' && !podeEditar(P, id).landing_page) throw erro(403, 'nao_concedido', 'A landing page desta empresa é gerenciada pelo operador da plataforma.');
  const content = dados.content ? validarConteudoLanding({ ...antes.content, ...dados.content }) : antes.content;
  const seo = dados.seo ? { title: texto(dados.seo.title, 70, 'seo'), description: texto(dados.seo.description, 160, 'seo') } : antes.seo;
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
      `Você foi convidado para usar a GreenIA da ${nomeEmpresa}.\n\nPara entrar, acesse ${url} e use este email (${e}). Um código de acesso chega na hora.`).catch(err => P.log('convite', err.message));
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
  if (st === 'inativo') exec(P.db, 'delete from sessions where user_id = ? and company_id = ?', userId, companyId);
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
