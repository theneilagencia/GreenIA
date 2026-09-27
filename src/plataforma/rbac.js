// RBAC: permissões por chave, roles de sistema e roles criadas por cada empresa.
// Nada de "isAdmin": toda verificação pergunta por uma permissão.
import { randomUUID } from 'node:crypto';
import { erro } from '../http.js';
import { exec, todos, um, transacao } from '../db.js';

export const PERMISSOES = {
  // Plataforma (só a operador da plataforma)
  'platform.companies.manage': ['Criar, editar, suspender e configurar empresas', 'platform'],
  'platform.plans.manage': ['Criar e editar planos', 'platform'],
  'platform.users.manage': ['Gerenciar qualquer usuário e os administradores da plataforma', 'platform'],
  'platform.settings.manage': ['Alterar configurações gerais da plataforma', 'platform'],
  'platform.audit.read': ['Ver a auditoria de todas as empresas', 'platform'],
  // Empresa
  'company.read': ['Ver os dados da empresa', 'company'],
  'company.manage': ['Administração completa da empresa', 'company'],
  'company.update': ['Editar os dados da empresa', 'company'],
  'user.read': ['Ver usuários', 'company'],
  'user.create': ['Convidar e criar usuários', 'company'],
  'user.update': ['Editar usuários, roles e status', 'company'],
  'user.delete': ['Remover usuários da empresa', 'company'],
  'role.manage': ['Criar e editar roles e permissões', 'company'],
  'branding.manage': ['Alterar identidade visual', 'company'],
  'landing_page.manage': ['Editar a landing page', 'company'],
  'url.manage': ['Alterar URL e domínio', 'company'],
  'settings.manage': ['Alterar configurações do ambiente', 'company'],
  'usage.read': ['Ver uso e créditos', 'company'],
  'audit.read': ['Ver a atividade e a auditoria da empresa', 'company'],
  'models.manage': ['Configurar modelos e classes', 'company'],
  'policy.manage': ['Editar a política de IA', 'company'],
  'knowledge.manage': ['Gerenciar a base de conhecimento', 'company'],
  'quickwin.manage': ['Gerenciar quick wins de toda a empresa', 'company'],
  'chat.use': ['Usar conversas e quick wins', 'company'],
};
export const PERMISSOES_EMPRESA = Object.keys(PERMISSOES).filter(k => PERMISSOES[k][1] === 'company');
export const PERMISSOES_PLATAFORMA = Object.keys(PERMISSOES).filter(k => PERMISSOES[k][1] === 'platform');

export const ROLES_SISTEMA = {
  company_admin: ['Admin da empresa', 'Administração completa do ambiente da empresa', PERMISSOES_EMPRESA],
  manager: ['Gestor', 'Acompanha uso, gerencia quick wins e conhecimento, vê usuários', ['company.read', 'user.read', 'usage.read', 'quickwin.manage', 'knowledge.manage', 'chat.use']],
  member: ['Membro', 'Usa conversas, quick wins e conhecimento', ['company.read', 'chat.use']],
  viewer: ['Leitor', 'Consulta a empresa, sem usar a IA', ['company.read']],
};

export function semearRbac(db, agora) {
  transacao(db, () => {
    for (const [k, [d, s]] of Object.entries(PERMISSOES)) exec(db, 'insert into permissions (key, description, scope) values (?, ?, ?) on conflict (key) do update set description = excluded.description, scope = excluded.scope', k, d, s);
    for (const [key, [name, description, perms]] of Object.entries(ROLES_SISTEMA)) {
      let r = um(db, 'select id from roles where company_id is null and key = ?', key);
      if (!r) { r = { id: `role_${key}` }; exec(db, 'insert into roles (id, company_id, key, name, description, system, created_at) values (?, null, ?, ?, ?, 1, ?)', r.id, key, name, description, agora); }
      exec(db, 'delete from role_permissions where role_id = ?', r.id);
      for (const p of perms) exec(db, 'insert into role_permissions (role_id, permission_key) values (?, ?)', r.id, p);
    }
  });
}

export const roleDeSistema = (db, key) => um(db, 'select * from roles where company_id is null and key = ?', key);
export const ehAdminPlataforma = (db, userId) => !!userId && !!um(db, "select 1 from platform_members m join users u on u.id = m.user_id where m.user_id = ? and u.status = 'ativo'", userId);
export const permissoesDaRole = (db, roleId) => todos(db, 'select permission_key as k from role_permissions where role_id = ?', roleId).map(r => r.k);

// Permissões de um usuário numa empresa. Admin da plataforma tem todas (acesso a todos os tenants).
export function permissoesNaEmpresa(db, userId, companyId) {
  if (ehAdminPlataforma(db, userId)) return new Set(PERMISSOES_EMPRESA);
  const v = um(db, "select role_id from company_users where company_id = ? and user_id = ? and status = 'ativo'", companyId, userId);
  return new Set(v ? permissoesDaRole(db, v.role_id) : []);
}
export const permissoesNaPlataforma = (db, userId) => new Set(ehAdminPlataforma(db, userId) ? PERMISSOES_PLATAFORMA : []);

export function exigir(perms, chave) {
  if (!perms.has(chave)) throw erro(403, 'sem_permissao', 'Você não tem permissão para isso.');
}

// Roles visíveis para uma empresa: as de sistema e as dela, nunca as de outra.
export const rolesDaEmpresa = (db, companyId) => todos(db, 'select id, company_id, key, name, description, system from roles where company_id is null or company_id = ? order by system desc, name', companyId)
  .map(r => ({ ...r, system: !!r.system, permissoes: permissoesDaRole(db, r.id), usuarios: um(db, 'select count(*) as n from company_users where company_id = ? and role_id = ?', companyId, r.id).n }));

export function acharRoleDaEmpresa(db, companyId, roleId) {
  const r = um(db, 'select * from roles where id = ? and (company_id is null or company_id = ?)', roleId, companyId);
  if (!r) throw erro(400, 'role', 'Role inválida para esta empresa.');
  return r;
}

export function salvarRole(db, companyId, { id, name, description, permissoes }, agora) {
  const nome = String(name || '').trim().slice(0, 60);
  if (nome.length < 2) throw erro(400, 'nome', 'Dê um nome à role.');
  const lista = [...new Set((permissoes || []).map(String))];
  const invalidas = lista.filter(p => !PERMISSOES_EMPRESA.includes(p));
  if (invalidas.length) throw erro(400, 'permissoes', `Permissões inválidas: ${invalidas.join(', ')}`);
  return transacao(db, () => {
    let roleId = id;
    if (id) {
      const r = um(db, 'select * from roles where id = ? and company_id = ?', id, companyId);
      if (!r) {
        if (um(db, 'select 1 from roles where id = ? and company_id is null', id)) throw erro(409, 'role_sistema', 'Roles de sistema não podem ser alteradas. Crie uma role própria.');
        throw erro(404, 'role', 'Role não encontrada.');
      }
      exec(db, 'update roles set name = ?, description = ? where id = ?', nome, String(description || '').slice(0, 200), id);
    } else {
      roleId = `role_${randomUUID()}`;
      const key = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'role';
      if (um(db, 'select 1 from roles where company_id = ? and key = ?', companyId, key)) throw erro(409, 'nome', 'Já existe uma role com esse nome.');
      exec(db, 'insert into roles (id, company_id, key, name, description, system, created_at) values (?, ?, ?, ?, ?, 0, ?)', roleId, companyId, key, nome, String(description || '').slice(0, 200), agora);
    }
    exec(db, 'delete from role_permissions where role_id = ?', roleId);
    for (const p of lista) exec(db, 'insert into role_permissions (role_id, permission_key) values (?, ?)', roleId, p);
    return roleId;
  });
}
