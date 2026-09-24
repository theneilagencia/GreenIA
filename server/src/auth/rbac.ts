// Papéis e permissões. A regra vive aqui e é conferida nas rotas; a visibilidade
// por área também é garantida no banco (app_can_see_area nas políticas de RLS).
//
// usuario        usa o chat e consulta a base das suas áreas.
// revisor        + aprova saídas de assistentes da área (Fase 3).
// key_user       + administra a área: base de conhecimento e pessoas (usuario, revisor); propõe oportunidades;
//                  cria e testa mapeamentos de importação (configuração do tenant).
// patrocinador   seleciona oportunidades como quick win e registra a decisão final (no tenant ou numa área).
// admin_cliente  + administra o tenant: áreas, pessoas, papéis, configuração, auditoria.
// admin_theneil  + operações de plataforma (criar tenant), só no tenant interno da TheNeil.
import type { AuthContext, Role } from './session.ts';

export type Permission =
  | 'chat.use'
  | 'kb.read'
  | 'kb.manage'
  | 'outputs.review'
  | 'people.manage'
  | 'areas.manage'
  | 'tenant.configure'
  | 'audit.read'
  | 'platform.tenants'
  | 'qw.decide'
  | 'imports.manage';

const TENANT_WIDE: Record<Role, Permission[]> = {
  usuario: ['chat.use', 'kb.read'],
  revisor: ['chat.use', 'kb.read', 'outputs.review'],
  key_user: ['chat.use', 'kb.read', 'kb.manage', 'people.manage', 'outputs.review', 'audit.read', 'imports.manage'],
  patrocinador: ['chat.use', 'kb.read', 'qw.decide'],
  admin_cliente: ['chat.use', 'kb.read', 'kb.manage', 'outputs.review', 'people.manage', 'areas.manage', 'tenant.configure', 'audit.read', 'qw.decide', 'imports.manage'],
  admin_theneil: ['chat.use', 'kb.read', 'kb.manage', 'outputs.review', 'people.manage', 'areas.manage', 'tenant.configure', 'audit.read', 'platform.tenants', 'qw.decide', 'imports.manage'],
};

// Permissões que um papel dá dentro de uma área específica.
const IN_AREA: Record<Role, Permission[]> = {
  usuario: ['chat.use', 'kb.read'],
  revisor: ['chat.use', 'kb.read', 'outputs.review'],
  key_user: ['chat.use', 'kb.read', 'kb.manage', 'people.manage', 'outputs.review', 'audit.read', 'imports.manage'],
  patrocinador: ['chat.use', 'kb.read', 'qw.decide'],
  admin_cliente: [],
  admin_theneil: [],
};

// Pode, no tenant todo (areaId omitido) ou naquela área?
export function can(auth: AuthContext, perm: Permission, areaId?: string | null): boolean {
  if (auth.roles.some(r => TENANT_WIDE[r].includes(perm))) return true;
  if (areaId) return auth.areaRoles.some(a => a.areaId === areaId && IN_AREA[a.role].includes(perm));
  // Sem área definida: basta ter a permissão em alguma área (a rota filtra depois).
  return perm === 'chat.use' || perm === 'kb.read'
    ? auth.roles.length > 0 || auth.areaRoles.length > 0
    : false;
}

// Papéis que cada um pode atribuir a outras pessoas.
export function assignableRoles(auth: AuthContext, areaId: string | null): Role[] {
  if (auth.roles.includes('admin_theneil') || auth.roles.includes('admin_cliente')) {
    return areaId ? ['usuario', 'revisor', 'key_user', 'patrocinador'] : ['usuario', 'patrocinador', 'admin_cliente'];
  }
  if (areaId && auth.areaRoles.some(a => a.areaId === areaId && a.role === 'key_user')) return ['usuario', 'revisor'];
  return [];
}
