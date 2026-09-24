// Etapas do chat: assistente e política de dados. As etapas de base de
// conhecimento, limites e consumo ficam nos seus próprios módulos.
import type { SensitiveType } from '../../../lib/greenia-core.js';
import { withTenant } from '../db/pool.ts';
import { tenantCtx } from '../auth/session.ts';
import { audit } from '../audit.ts';
import { assistantDefinitionSchema, type AssistantDefinition } from '../assistants/schema.ts';
import { effectivePolicy, inspect, maskText } from '../policy/data-policy.ts';
import { applyFloor, policyState, restrictedHits, type UsageRules } from '../policy/usage-policy.ts';
import type { ChatStep } from './hooks.ts';

// Carrega o assistente pedido (versão atual), respeitando tenant, área e status.
export const assistantStep: ChatStep = {
  name: 'assistente',
  async prepare({ app, auth, body }, state) {
    if (!body.assistant) return;
    const row = await withTenant(app.deps.db, tenantCtx(auth), tx => tx.query(
      `select a.id, a.slug, a.area_id, a.status, v.version, v.definition
       from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
       where a.slug = $1`, [body.assistant]).then(r => r.rows[0]));
    if (!row || !['piloto', 'ativo'].includes(row.status)) {
      return { status: 404, body: { error: 'assistente_nao_encontrado' } };
    }
    const definition = assistantDefinitionSchema.parse(row.definition);
    // Assistente com pipeline de blocos roda por execução (/api/runs), com revisão.
    if (definition.pipeline.length) return { status: 409, body: { error: 'assistente_de_execucao' } };
    state.assistant = { id: row.id, slug: row.slug, version: row.version, areaId: row.area_id, definition };
    if (definition.instructions) state.systemExtra = definition.instructions;
  },
};

// Política de Uso de IA: a pessoa precisa ter registrado ciência da versão
// vigente; as regras da política seguem para a etapa de política de dados.
export const usagePolicyStep: ChatStep = {
  name: 'politica-de-uso',
  async prepare({ app, auth }, state) {
    const { policy, acked } = await withTenant(app.deps.db, tenantCtx(auth), tx => policyState(tx, auth.userId));
    if (!acked) return { status: 428, body: { error: 'ciencia_da_politica_pendente', version: policy!.version } };
    state.usageRules = policy?.rules;
  },
};

// Decide, no servidor, o que fazer com dado sensível antes de qualquer chamada
// ao modelo. Auditoria registra tipos e decisão, nunca os valores.
export const dataPolicyStep: ChatStep = {
  name: 'politica-de-dados',
  async prepare({ app, auth, config, body }, state) {
    const def = state.assistant?.definition as AssistantDefinition | undefined;
    const rules = state.usageRules as UsageRules | undefined;
    const policy = applyFloor(effectivePolicy(config.dataPolicy, def?.dataPolicy), rules?.dataPolicy);
    const texts = state.messages.map(m => m.content);
    const ctx = tenantCtx(auth);
    const base = { tenantId: auth.tenantId, actorUserId: auth.userId, target: state.assistant ? `assistente:${state.assistant.slug}@${state.assistant.version}` : 'chat' };
    // Informação restrita pela Política de Uso de IA: não vai ao modelo.
    const restricted = restrictedHits(texts, rules?.restrictedTerms ?? []);
    if (restricted.length) {
      await withTenant(app.deps.db, ctx, tx => audit(tx, { ...base, action: 'envio_bloqueado', details: { tipos: ['restrito'], termos: restricted.length } }));
      return { status: 422, body: { error: 'dado_bloqueado', types: ['restrito'] } };
    }
    const { decision, types } = inspect(texts, policy);
    if (!types.length) return;

    if (decision.action === 'bloquear') {
      await withTenant(app.deps.db, ctx, tx => audit(tx, { ...base, action: 'envio_bloqueado', details: { tipos: decision.block } }));
      return { status: 422, body: { error: 'dado_bloqueado', types: decision.block } };
    }
    if (decision.warn.length) {
      const confirmed = new Set(body.confirmedWarnings);
      const missing = decision.warn.filter(t => !confirmed.has(t));
      if (missing.length) return { status: 409, body: { error: 'confirmacao_necessaria', types: missing } };
      await withTenant(app.deps.db, ctx, tx => audit(tx, { ...base, action: 'aviso_confirmado', details: { tipos: decision.warn } }));
    }
    if (decision.mask.length) {
      state.messages = state.messages.map(m => ({ ...m, content: maskText(m.content, decision.mask as SensitiveType[]) }));
      await withTenant(app.deps.db, ctx, tx => audit(tx, { ...base, action: 'dado_mascarado', details: { tipos: decision.mask } }));
    }
    if (decision.log.length) {
      await withTenant(app.deps.db, ctx, tx => audit(tx, { ...base, action: 'dado_enviado_com_registro', details: { tipos: decision.log } }));
    }
  },
};
