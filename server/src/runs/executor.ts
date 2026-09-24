// Executor de assistentes: roda o pipeline de blocos de uma execução, na fila.
// Age em nome de quem pediu (mesmas áreas e permissões) e passa toda chamada ao
// modelo pela política de dados do tenant e do assistente:
//   bloquear ........... o trecho não é enviado; o bloco recebe "blocked"
//   avisar ............. só segue se a pessoa confirmou o tipo ao enviar
//   mascarar ........... enviado com o dado mascarado
//   permitir c/ registro enviado e registrado na auditoria
// Imagem e PDF escaneado vão para a visão do modelo antes que o filtro possa
// ler o texto (limite registrado no relatório); o envio fica na auditoria.
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SensitiveType } from '../../../lib/greenia-core.js';
import { withTenant, type TenantContext } from '../db/pool.ts';
import { loadMembership } from '../auth/session.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { effectivePolicy, inspect, maskText } from '../policy/data-policy.ts';
import { applyFloor, currentPolicy, restrictedHits } from '../policy/usage-policy.ts';
import { runBlock } from '../blocks/index.ts';
import type { BlockEnv, InputFile, RunContext, Section } from '../blocks/types.ts';
import type { ContentPart, LlmUsage } from '../llm/provider.ts';
import type { KnowledgeHit } from '../kb/knowledge.ts';
import { recordUsage } from '../usage/record.ts';

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');

export function makeRunExecutor(app: FastifyInstance) {
  return async (data: Record<string, unknown>) => {
    try {
      await execute(app, String(data.runId), String(data.tenantId));
    } catch (e) {
      // Falha fora das etapas (armazenamento, banco): a execução não fica presa em "processando".
      app.log.error({ runId: data.runId, err: (e as Error).message }, 'falha ao executar assistente');
      await withTenant(app.deps.db, { tenantId: String(data.tenantId), allAreas: true }, async tx => {
        const r = await tx.query(`update runs set status = 'erro', error = $2, finished_at = now() where id = $1 and status = 'processando' returning user_id`,
          [data.runId, 'falha interna ao processar; tente de novo']);
        if (r.rowCount) await audit(tx, { tenantId: String(data.tenantId), actorUserId: r.rows[0].user_id, action: 'execucao_com_erro', target: `execucao:${data.runId}`, details: { erro: 'falha interna' } });
      }).catch(() => {});
    }
  };
}

async function execute(app: FastifyInstance, runId: string, tenantId: string) {
  const { db, objects } = app.deps;

  // Dados da execução (contexto amplo só para ler quem pediu).
  const run = await withTenant(db, { tenantId, allAreas: true }, async tx => (await tx.query(
    `select r.*, a.slug as assistant_slug from runs r join assistants a on a.id = r.assistant_id where r.id = $1`, [runId])).rows[0]);
  if (!run || run.status !== 'processando') return;                 // já processada (tarefa repetida)

  const member = await withTenant(db, { tenantId, userId: run.user_id }, tx => loadMembership(tx, run.user_id));
  const ctxDb: TenantContext = { tenantId, userId: run.user_id, areaIds: member.areaIds, allAreas: member.allAreas };
  const loaded = await withTenant(db, ctxDb, async tx => {
    const t = (await tx.query(`select config from tenants where id = $1`, [tenantId])).rows[0];
    const v = (await tx.query(`select definition from assistant_versions where assistant_id = $1 and version = $2`, [run.assistant_id, run.assistant_version])).rows[0];
    const files = (await tx.query(`select * from run_files where run_id = $1 order by name`, [runId])).rows;
    await tx.query(`update runs set started_at = now() where id = $1`, [runId]);
    return { config: parseTenantConfig(t?.config).config, def: assistantDefinitionSchema.parse(v.definition), files, usage: await currentPolicy(tx) };
  });
  const { config, def } = loaded;
  const rules = loaded.usage?.rules;
  const started = Date.now();

  const files: InputFile[] = [];
  for (const f of loaded.files) files.push({ id: f.id, name: f.name, mime: f.mime, sha256: f.sha256, bytes: await objects.get(f.object_key) });

  const provider = app.deps.llm(config.llm.provider);
  const policy = applyFloor(effectivePolicy(config.dataPolicy, def.dataPolicy), rules?.dataPolicy);
  const confirmed = new Set<string>(run.confirmed_warnings || []);
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let model = config.llm.model;
  const sources = new Map<string, { id: string; version: number; title: string }>();
  const target = `execucao:${runId}`;
  const log = (action: string, details: Record<string, unknown>) =>
    withTenant(db, ctxDb, tx => audit(tx, { tenantId, actorUserId: run.user_id, action, target, details }));

  const env: BlockEnv = {
    keyUserContact: config.keyUserContact,
    now: () => new Date(),
    async complete(req) {
      const texts = req.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text);
      if (restrictedHits(texts, rules?.restrictedTerms ?? []).length) {
        await log('envio_bloqueado', { tipos: ['restrito'], etapa: req.purpose, motivo: 'informação restrita pela Política de Uso de IA' });
        return { text: '', blocked: ['restrito'], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: null, model };
      }
      const { decision } = inspect([req.system, ...texts], policy);
      const unconfirmed = decision.warn.filter(t => !confirmed.has(t));
      if (decision.action === 'bloquear' || unconfirmed.length) {
        const blocked = decision.action === 'bloquear' ? decision.block : unconfirmed;
        await log('envio_bloqueado', { tipos: blocked, etapa: req.purpose, motivo: decision.action === 'bloquear' ? 'política' : 'aviso não confirmado' });
        return { text: '', blocked: blocked as string[], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: null, model };
      }
      let content: ContentPart[] = req.content;
      if (decision.mask.length) {
        content = content.map(c => c.type === 'text' ? { ...c, text: maskText(c.text, decision.mask as SensitiveType[]) } : c);
        await log('dado_mascarado', { tipos: decision.mask, etapa: req.purpose });
      }
      if (decision.log.length || decision.warn.length) await log('dado_enviado_com_registro', { tipos: [...decision.log, ...decision.warn], etapa: req.purpose });
      const visual = content.filter(c => c.type !== 'text').length;
      if (visual) await log('conteudo_visual_enviado', { etapa: req.purpose, partes: visual });
      const r = await provider.complete({
        model: config.llm.model, system: req.system, content, jsonSchema: req.jsonSchema,
        maxOutputTokens: Math.min(16000, req.maxOutputTokens ?? config.llm.maxOutputTokens),
      });
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
      model = r.model;
      return r;
    },
    async searchKnowledge(query, opts) {
      return withTenant(db, ctxDb, async tx => {
        const areaIds = opts.areas?.length
          ? (await tx.query(`select id from areas where slug = any($1)`, [opts.areas])).rows.map(r => r.id as string)
          : [null];
        const hits: KnowledgeHit[] = [];
        for (const areaId of areaIds.length ? areaIds : [null]) {
          for (const h of await app.deps.knowledge.search(tx, query, { areaId: areaId ?? run.area_id ?? null, limit: opts.limit })) {
            if (!hits.some(x => x.documentId === h.documentId)) hits.push(h);
          }
        }
        for (const h of hits.slice(0, opts.limit)) sources.set(h.documentId, { id: h.documentId, version: h.version, title: h.title });
        return hits.slice(0, opts.limit);
      });
    },
  };

  const ctx: RunContext = { def, text: run.input_text, files, docs: [], sections: [], env };
  let error: string | null = null;
  for (const step of def.pipeline) {
    try {
      ctx.sections.push(await runBlock(ctx, step));
    } catch (e) {
      error = `etapa ${step.titulo || step.id}: ${(e as Error).message}`;
      app.log.warn({ runId, etapa: step.id, err: (e as Error).message }, 'falha em etapa de assistente');
      break;
    }
  }

  const sections: Section[] = ctx.sections;
  const result = { sections };
  const outputSha = sha(JSON.stringify(result));
  const pages = ctx.docs.reduce((n, d) => n + d.pageCount, 0);
  const count = (k: 'divergencias' | 'pendencias') => sections.reduce((n, s) => n + (s.counts?.[k] ?? 0), 0);
  const flags = sections.reduce((n, s) => n + s.flags.length, 0);
  const cost = usage.inputTokens || usage.outputTokens || pages
    ? await recordUsage(app, config, { tenantId, userId: run.user_id, assistantId: run.assistant_id, runId, provider: provider.id, model, usage, pages })
    : 0;
  const src = [...sources.values()];
  await withTenant(db, ctxDb, async tx => {
    await tx.query(
      `update runs set status = $2, result = $3, flags = $4, divergences = $5, pendings = $6, sources = $7, provider = $8, model = $9,
         input_tokens = $10, output_tokens = $11, pages = $12, cost_brl = $13, output_sha256 = $14, error = $15,
         finished_at = now(), processing_ms = $16 where id = $1`,
      [runId, error ? 'erro' : 'rascunho', result, flags, count('divergencias'), count('pendencias'), JSON.stringify(src), provider.id, model,
        usage.inputTokens, usage.outputTokens, pages, cost, outputSha, error, Date.now() - started]);
    for (const d of ctx.docs) await tx.query(`update run_files set kind = $2, pages = $3 where id = $1`, [d.fileId, d.kind, d.pageCount]);
    await audit(tx, { tenantId, actorUserId: run.user_id, action: error ? 'execucao_com_erro' : 'execucao_concluida', target, details: {
      assistente: run.assistant_slug, versao: run.assistant_version, entradas: files.map(f => f.sha256), textoSha256: run.input_text ? sha(run.input_text) : null,
      documentos: src.map(s => ({ id: s.id, version: s.version })), provedor: provider.id, modelo: model, saida: outputSha,
      sinais: flags, paginas: pages, ...(error ? { erro: error } : {}),
    } });
  });
}
