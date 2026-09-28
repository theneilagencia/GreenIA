// APIs do admin da empresa (/api/empresa/*): tudo preso ao tenant resolvido pelo servidor e à sessão
// daquela empresa. O admin da empresa nunca vê outra empresa, planos comerciais ou configurações globais.
import { erro } from '../http.js';
import { um } from '../db.js';
import { exigir, rolesDaEmpresa, salvarRole, PERMISSOES, PERMISSOES_EMPRESA } from './rbac.js';
import * as E from './empresas.js';
import { auditar, listarAuditoria } from './auditoria.js';
import { exec } from '../db.js';
import { verificarDominio, orientacaoDns } from './dominio.js';

const SEM_PERMISSAO = o => `A sua role não tem a permissão de ${o}. Um admin da empresa pode dar a permissão em Roles e permissões.`;

export function rotasEmpresa(P, r) {
  const precisa = (s, chave) => exigir(s.perms, chave);
  // O que a empresa vê do próprio plano: nome, créditos e recursos. Nunca preço nem custo.
  const planoPublico = c => { const p = E.lerPlanoPorId(P, c.plan_id); return p && { name: p.name, credits: p.credits, reserve: p.reserve, features: p.features, limits: p.limits }; };

  r.get('/api/empresa/resumo', ({ sessao, companyId, empresa }) => {
    precisa(sessao, 'company.read');
    const uso = E.usoDaEmpresa(P, companyId);
    return {
      empresa: { id: empresa.id, name: empresa.name, slug: empresa.slug, status: empresa.status, statusNome: E.STATUS_EMPRESA[empresa.status], url: E.urlDaEmpresa(P, empresa), custom_domain: empresa.custom_domain },
      plano: planoPublico(empresa), podeEditar: E.podeEditar(P, companyId), bloqueados: E.marcaBloqueada(P, companyId),
      usuarios: um(P.db, "select count(*) as n from company_users where company_id = ? and status != 'inativo'", companyId).n,
      convites: um(P.db, "select count(*) as n from company_users where company_id = ? and status = 'convidado'", companyId).n,
      creditos: uso.plano ? { usados: Math.round(uso.plano.usados), total: uso.plano.creditos, percentual: uso.plano.percentual, fase: uso.plano.fase, renova: uso.plano.renova } : null,
      pessoasAtivas: uso.pessoasAtivas, conversas: uso.conversas, quickWins: uso.quickWins, documentos: uso.documentos,
      landing: E.lerLanding(P, companyId).status,
    };
  });

  // ------------------------------------------------ Usuários e convites
  r.get('/api/empresa/usuarios', ({ sessao, companyId }) => { precisa(sessao, 'user.read'); return { usuarios: E.listarMembros(P, companyId), roles: rolesDaEmpresa(P.db, companyId).map(({ id, name, key, system }) => ({ id, name, key, system })) }; });
  r.post('/api/empresa/usuarios', ({ sessao, companyId, corpo, origem }) => {
    precisa(sessao, 'user.create');
    // Só quem gerencia roles pode dar uma role com administração completa.
    if (corpo.role_id && !sessao.perms.has('role.manage') && um(P.db, "select 1 from role_permissions where role_id = ? and permission_key = 'company.manage'", corpo.role_id)) throw erro(403, 'sem_permissao', 'Você não pode criar administradores.');
    return E.criarMembro(P, companyId, { email: corpo.email, name: corpo.name, role_id: corpo.role_id }, sessao.userId, origem, { convidar: corpo.convidar !== false });
  });
  r.put('/api/empresa/usuarios/:uid', ({ sessao, companyId, params, corpo, origem }) => {
    precisa(sessao, 'user.update');
    if (corpo.role_id && !sessao.perms.has('role.manage')) throw erro(403, 'sem_permissao', 'Você não pode alterar roles.');
    if (params.uid === sessao.userId && (corpo.status === 'inativo' || corpo.role_id)) throw erro(409, 'proprio', 'Peça a outro administrador para alterar a sua role ou o seu status.');
    return E.atualizarMembro(P, companyId, params.uid, corpo, sessao.userId, origem);
  });
  r.del('/api/empresa/usuarios/:uid', ({ sessao, companyId, params, origem }) => {
    precisa(sessao, 'user.delete');
    if (params.uid === sessao.userId) throw erro(409, 'proprio', 'Você não pode remover o próprio acesso.');
    return E.removerMembro(P, companyId, params.uid, sessao.userId, origem);
  });
  r.post('/api/empresa/usuarios/:uid/reenviar', ({ sessao, companyId, params, origem }) => {
    precisa(sessao, 'user.create');
    const m = E.listarMembros(P, companyId).find(x => x.id === params.uid);
    if (!m) throw erro(404, 'usuario', 'Usuário não encontrado nesta empresa.');
    const c = E.lerEmpresa(P, companyId);
    P.emailDa(companyId).enviar(m.email, `Convite para a GreenIA da ${E.lerMarca(P, companyId).display_name || c.name}`, `Para entrar, acesse ${E.urlDaEmpresa(P, c)} e use este email (${m.email}). Um código de acesso chega na hora.`).catch(() => {});
    auditar(P, { usuario: sessao.userId, empresa: companyId, acao: 'user.invite_resent', entidade: 'company_user', id: m.id, origem });
    return { ok: true };
  });

  // ------------------------------------------------ Roles e permissões
  r.get('/api/empresa/roles', ({ sessao, companyId }) => {
    precisa(sessao, 'user.read');
    return { roles: rolesDaEmpresa(P.db, companyId), permissoes: PERMISSOES_EMPRESA.map(k => ({ key: k, description: PERMISSOES[k][0] })), podeCriar: E.podeEditar(P, companyId).roles && sessao.perms.has('role.manage') };
  });
  const exigirRoles = (s, companyId) => { precisa(s, 'role.manage'); if (!E.podeEditar(P, companyId).roles) throw erro(403, 'nao_concedido', 'Roles personalizadas não estão liberadas para esta empresa.'); };
  r.post('/api/empresa/roles', ({ sessao, companyId, corpo, origem }) => {
    exigirRoles(sessao, companyId);
    const id = salvarRole(P.db, companyId, corpo, P.agora().toISOString());
    auditar(P, { usuario: sessao.userId, empresa: companyId, acao: 'role.created', entidade: 'role', id, depois: { name: corpo.name, permissoes: corpo.permissoes }, origem });
    return rolesDaEmpresa(P.db, companyId).find(x => x.id === id);
  });
  r.put('/api/empresa/roles/:id', ({ sessao, companyId, params, corpo, origem }) => {
    exigirRoles(sessao, companyId);
    const antes = rolesDaEmpresa(P.db, companyId).find(x => x.id === params.id);
    salvarRole(P.db, companyId, { ...corpo, id: params.id }, P.agora().toISOString());
    for (const m of E.listarMembros(P, companyId).filter(m => m.role_id === params.id)) P.sincronizarPessoa(companyId, m.id);
    auditar(P, { usuario: sessao.userId, empresa: companyId, acao: 'role.updated', entidade: 'role', id: params.id, antes: antes && { name: antes.name, permissoes: antes.permissoes }, depois: { name: corpo.name, permissoes: corpo.permissoes }, origem });
    return rolesDaEmpresa(P.db, companyId).find(x => x.id === params.id);
  });
  r.del('/api/empresa/roles/:id', ({ sessao, companyId, params, origem }) => {
    exigirRoles(sessao, companyId);
    const role = um(P.db, 'select * from roles where id = ? and company_id = ?', params.id, companyId);
    if (!role) throw erro(404, 'role', 'Role não encontrada (roles de sistema não podem ser removidas).');
    if (um(P.db, 'select 1 from company_users where role_id = ?', role.id)) throw erro(409, 'em_uso', 'Há usuários com esta role. Mude a role deles antes de remover.');
    exec(P.db, 'delete from roles where id = ?', role.id);
    auditar(P, { usuario: sessao.userId, empresa: companyId, acao: 'role.deleted', entidade: 'role', id: role.id, antes: { name: role.name }, origem });
    return { ok: true };
  });

  // ------------------------------------------------ Marca, landing page e URL (dentro do que o operador da plataforma liberou)
  r.get('/api/empresa/marca', ({ sessao, companyId }) => { precisa(sessao, 'company.read'); const motivo = E.motivosBloqueio(P, companyId).branding || (sessao.perms.has('branding.manage') ? null : SEM_PERMISSAO('editar a identidade visual')); return { marca: E.lerMarca(P, companyId), pode: !motivo, motivo, campos: E.CAMPOS_MARCA }; });
  r.put('/api/empresa/marca', ({ sessao, companyId, corpo, origem }) => { precisa(sessao, 'branding.manage'); return E.salvarMarca(P, companyId, corpo, sessao.userId, origem, { escopo: 'empresa' }); }, { limiteMb: 2 });
  r.get('/api/empresa/landing', ({ sessao, companyId }) => { precisa(sessao, 'company.read'); const motivo = E.motivosBloqueio(P, companyId).landing_page || (sessao.perms.has('landing_page.manage') ? null : SEM_PERMISSAO('editar a landing page')); return { landing: E.lerLanding(P, companyId), pode: !motivo, motivo }; });
  r.put('/api/empresa/landing', ({ sessao, companyId, corpo, origem }) => { precisa(sessao, 'landing_page.manage'); return E.salvarLanding(P, companyId, corpo, sessao.userId, origem, { escopo: 'empresa' }); }, { limiteMb: 3 });
  r.get('/api/empresa/url', ({ sessao, companyId, empresa }) => {
    precisa(sessao, 'company.read');
    const pode = E.podeEditar(P, companyId);
    return { slug: empresa.slug, custom_domain: empresa.custom_domain, url: E.urlDaEmpresa(P, empresa), dominio: { status: empresa.domain_status, mensagem: empresa.domain_message, verificadoEm: empresa.domain_checked_at }, pode: { url: pode.url && sessao.perms.has('url.manage'), domain: pode.domain && sessao.perms.has('url.manage') }, host: P.hostPlataforma, dns: orientacaoDns(P) };
  });
  r.put('/api/empresa/url', ({ sessao, companyId, corpo, origem }) => {
    precisa(sessao, 'url.manage');
    const c = E.mudarUrl(P, companyId, { slug: corpo.slug, custom_domain: corpo.custom_domain }, sessao.userId, origem, { escopo: 'empresa' });
    return { slug: c.slug, custom_domain: c.custom_domain, url: E.urlDaEmpresa(P, c) };
  });

  r.post('/api/empresa/dominio/verificar', async ({ sessao, companyId, origem }) => { precisa(sessao, 'url.manage'); return verificarDominio(P, companyId, { ator: sessao.userId, origem }); });

  // ------------------------------------------------ Auditoria da própria empresa
  r.get('/api/empresa/auditoria', ({ sessao, companyId, query }) => { precisa(sessao, 'audit.read'); return listarAuditoria(P, { empresa: companyId, pagina: Math.max(0, Number(query.pagina) || 0) }); });
}
