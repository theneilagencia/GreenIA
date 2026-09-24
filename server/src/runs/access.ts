// Quem vê e quem revisa uma execução.
import type { AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import type { AssistantDefinition } from '../assistants/schema.ts';

// Quem executou, revisores e key users da área, admin.
export const canSeeRun = (a: AuthContext, run: { user_id: string; area_id: string | null }) =>
  run.user_id === a.userId || can(a, 'outputs.review', run.area_id) || can(a, 'audit.read', run.area_id);

// Papel de revisão previsto no assistente, na área dele ou no tenant todo.
export function canReviewAs(a: AuthContext, areaId: string | null, reviewers: AssistantDefinition['review']['reviewers']) {
  if (a.roles.includes('admin_theneil')) return true;
  return reviewers.some(role => a.roles.includes(role) || (!!areaId && a.areaRoles.some(r => r.areaId === areaId && r.role === role)));
}

// Com revisão obrigatória, quem executou não revisa a própria saída.
export function canReviewRun(a: AuthContext, run: { user_id: string; area_id: string | null }, review: AssistantDefinition['review']) {
  const own = run.user_id === a.userId;
  return own ? !review.required : canReviewAs(a, run.area_id, review.reviewers);
}
