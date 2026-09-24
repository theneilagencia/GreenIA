// Execuções de assistentes: enviar (texto e arquivos), acompanhar e consultar.
// O envio confere entradas, limites e a política de dados antes de aceitar;
// o pipeline roda na fila e a saída nasce como rascunho para revisão.
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { assistantDefinitionSchema, type AssistantDefinition } from '../assistants/schema.ts';
import { effectivePolicy, inspect } from '../policy/data-policy.ts';
import { applyFloor, policyState, restrictedHits } from '../policy/usage-policy.ts';
import { detectKind, readFile } from '../blocks/ler.ts';
import type { BlockEnv, InputFile } from '../blocks/types.ts';
import { checkLimits } from '../usage/record.ts';
import { tenantPrefix } from '../storage/object-store.ts';
import { canReviewRun, canSeeRun } from './access.ts';

const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

const createSchema = z.object({
  assistant: z.string().min(1).max(80),
  text: z.string().max(200000).default(''),
  files: z.array(z.object({
    name: z.string().trim().min(1).max(200).refine(n => !/[\\/]/.test(n), 'nome sem barras'),
    contentBase64: z.string().min(1),
    mime: z.string().max(120).default('application/octet-stream'),
  })).max(500).default([]),
  confirmedWarnings: z.array(z.string()).max(20).default([]),
});

const listSchema = z.object({
  assistant: z.string().optional(),
  status: z.enum(['processando', 'rascunho', 'erro', 'aprovado', 'aprovado_com_edicao', 'rejeitado']).optional(),
  escopo: z.enum(['minhas', 'revisar', 'todas']).default('minhas'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Blocos que mandam o texto enviado ou o conteúdo dos arquivos ao modelo.
function modelInputs(def: AssistantDefinition) {
  const uses = (b: string, pred: (p: Record<string, unknown>) => boolean = () => true) => def.pipeline.some(s => s.bloco === b && pred(s.params));
  const docs = uses('extrair') || uses('resumir') || uses('checklist', p => p.metodo === 'modelo') || uses('classificar', p => p.metodo === 'modelo');
  const text = docs || uses('consultar') || uses('resumir');
  return { text, docs };
}

const noModelEnv: BlockEnv = {
  async complete() { throw new Error('sem modelo na checagem prévia'); },
  async searchKnowledge() { return []; },
  keyUserContact: '',
  now: () => new Date(),
};

export async function runRoutes(app: FastifyInstance) {
  const bodyLimit = app.deps.config.KB_UPLOAD_BODY_LIMIT_MB * 1024 * 1024;

  app.post('/api/runs', { bodyLimit }, async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = createSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const body = p.data;

    const loaded = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const usage = await policyState(tx, a.userId);
      const t = (await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0];
      const row = (await tx.query(
        `select a.id, a.slug, a.name, a.status, a.area_id, a.current_version, v.definition from assistants a
         join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version where a.slug = $1`, [body.assistant])).rows[0];
      return { config: parseTenantConfig(t?.config).config, row, usage };
    });
    const { config, row, usage } = loaded;
    if (!usage.acked) return reply.code(428).send({ error: 'ciencia_da_politica_pendente', version: usage.policy!.version });
    if (!row || !['piloto', 'ativo'].includes(row.status)) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
    const def = assistantDefinitionSchema.parse(row.definition);
    if (!def.pipeline.length) return reply.code(409).send({ error: 'assistente_de_conversa', detalhe: 'use o chat para este assistente' });

    // Entradas conforme a definição.
    const text = body.text.trim();
    if (text && !def.inputs.text.enabled) return reply.code(400).send({ error: 'texto_nao_aceito' });
    if (!text && def.inputs.text.enabled && def.inputs.text.required) return reply.code(400).send({ error: 'texto_obrigatorio' });
    if (text.length > config.limits.maxMessageChars) return reply.code(413).send({ error: 'mensagem_grande_demais', limite: config.limits.maxMessageChars });
    if (body.files.length && !def.inputs.files.enabled) return reply.code(400).send({ error: 'arquivos_nao_aceitos' });
    if (!body.files.length && def.inputs.files.enabled && def.inputs.files.required) return reply.code(400).send({ error: 'arquivo_obrigatorio' });
    if (body.files.length > def.inputs.files.maxFiles) return reply.code(413).send({ error: 'arquivos_demais', limite: def.inputs.files.maxFiles });
    const maxMb = Math.min(def.inputs.files.maxFileMb, config.limits.maxFileMb);
    const files: InputFile[] = [];
    for (const f of body.files) {
      const bytes = new Uint8Array(Buffer.from(f.contentBase64, 'base64'));
      if (bytes.length > maxMb * 1024 * 1024) return reply.code(413).send({ error: 'arquivo_grande_demais', arquivo: f.name, limiteMb: maxMb });
      const file: InputFile = { id: randomUUID(), name: f.name, mime: f.mime, bytes, sha256: sha(bytes) };
      const kind = detectKind(file);
      if (!kind || !def.inputs.files.accept.includes(kind)) return reply.code(415).send({ error: 'tipo_nao_aceito', arquivo: f.name, aceitos: def.inputs.files.accept });
      files.push(file);
    }
    if (new Set(files.map(f => f.name)).size !== files.length) return reply.code(400).send({ error: 'nomes_repetidos' });

    const limited = await checkLimits(app, a, config);
    if (limited) return reply.code(limited.status).send(limited.body);

    // Política de dados antes de aceitar: só sobre o que vai ao modelo.
    const target = `assistente:${row.slug}@${row.current_version}`;
    const need = modelInputs(def);
    const texts: string[] = [];
    if (need.text && text) texts.push(text);
    if (need.docs) for (const f of files) texts.push((await readFile(f, { visao: 'nunca', paginasMax: 500 }, noModelEnv)).text);
    if (texts.length) {
      const rules = usage.policy?.rules;
      if (restrictedHits(texts, rules?.restrictedTerms ?? []).length) {
        await withTenant(app.deps.db, tenantCtx(a), tx => audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'envio_bloqueado', target, details: { tipos: ['restrito'] } }));
        return reply.code(422).send({ error: 'dado_bloqueado', types: ['restrito'] });
      }
      const { decision } = inspect(texts, applyFloor(effectivePolicy(config.dataPolicy, def.dataPolicy), rules?.dataPolicy));
      if (decision.action === 'bloquear') {
        await withTenant(app.deps.db, tenantCtx(a), tx => audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'envio_bloqueado', target, details: { tipos: decision.block } }));
        return reply.code(422).send({ error: 'dado_bloqueado', types: decision.block });
      }
      const missing = decision.warn.filter(t => !body.confirmedWarnings.includes(t));
      if (missing.length) return reply.code(409).send({ error: 'confirmacao_necessaria', types: missing });
      if (decision.warn.length) {
        await withTenant(app.deps.db, tenantCtx(a), tx => audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'aviso_confirmado', target, details: { tipos: decision.warn } }));
      }
    }

    // Arquivos no armazenamento (prefixo do tenant), execução na fila.
    const runId = randomUUID();
    const days = def.retention.days ?? config.retention.defaultOutputDays;
    const keys: string[] = [];
    for (const f of files) {
      const key = `${tenantPrefix(a.tenantId)}runs/${runId}/${f.id}`;
      await app.deps.objects.put(key, f.bytes, f.mime);
      keys.push(key);
    }
    const inputSha = sha(JSON.stringify({ text: sha(text), files: files.map(f => f.sha256) }));
    try {
      await withTenant(app.deps.db, tenantCtx(a), async tx => {
        await tx.query(
          `insert into runs (id, tenant_id, assistant_id, assistant_version, area_id, user_id, input_text, input_sha256, confirmed_warnings, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(days => $10))`,
          [runId, a.tenantId, row.id, row.current_version, row.area_id, a.userId, text, inputSha, body.confirmedWarnings, days]);
        for (const [i, f] of files.entries()) {
          await tx.query(`insert into run_files (id, tenant_id, run_id, name, mime, bytes, sha256, object_key) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [f.id, a.tenantId, runId, f.name, f.mime, f.bytes.length, f.sha256, keys[i]]);
        }
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'execucao_iniciada', target: `execucao:${runId}`,
          details: { assistente: row.slug, versao: row.current_version, entradas: files.map(f => ({ nome: f.name, sha256: f.sha256 })) } });
      });
    } catch (e) {
      await app.deps.objects.deletePrefix(`${tenantPrefix(a.tenantId)}runs/${runId}/`).catch(() => {}); // sem arquivo órfão
      throw e;
    }
    await app.deps.queue.enqueue('run:execute', { runId, tenantId: a.tenantId });
    return reply.code(202).send({ runId, status: 'processando' });
  });

  app.get('/api/runs', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = listSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = await withTenant(app.deps.db, tenantCtx(a), async tx => (await tx.query(
      `select r.id, r.status, r.created_at, r.finished_at, r.flags, r.divergences, r.pendings, r.area_id, r.user_id, u.email as user_email,
              a.slug as assistant, a.name as assistant_name, r.assistant_version as version
       from runs r join assistants a on a.id = r.assistant_id join users u on u.id = r.user_id
       where ($1::text is null or a.slug = $1) and ($2::text is null or r.status = $2)
       order by r.created_at desc limit $3`, [q.data.assistant ?? null, q.data.status ?? null, q.data.limit * 3])).rows);
    const visible = rows.filter(r =>
      q.data.escopo === 'minhas' ? r.user_id === a.userId
        : q.data.escopo === 'revisar' ? can(a, 'outputs.review', r.area_id) && r.user_id !== a.userId
          : canSeeRun(a, r));
    return visible.slice(0, q.data.limit).map(({ area_id, user_id, ...r }) => { void area_id; void user_id; return r; });
  });

  app.get('/api/runs/:id', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = (await tx.query(
        `select r.*, a.slug as assistant, a.name as assistant_name, u.email as user_email, rv.email as reviewer_email
         from runs r join assistants a on a.id = r.assistant_id join users u on u.id = r.user_id
         left join users rv on rv.id = r.reviewed_by where r.id = $1`, [id])).rows[0];
      if (!r || !canSeeRun(a, r)) return null;
      const files = (await tx.query(`select id, name, mime, bytes, sha256, kind, pages from run_files where run_id = $1 order by name`, [id])).rows;
      const v = (await tx.query(`select definition from assistant_versions where assistant_id = $1 and version = $2`, [r.assistant_id, r.assistant_version])).rows[0];
      return { r, files, def: assistantDefinitionSchema.parse(v.definition) };
    });
    if (!out) return reply.code(404).send({ error: 'nao_encontrado' });
    const { r, files, def } = out;
    return {
      id: r.id, status: r.status, assistant: r.assistant, assistantName: r.assistant_name, version: r.assistant_version,
      user: r.user_email, createdAt: r.created_at, finishedAt: r.finished_at, processingMs: r.processing_ms,
      text: r.input_text, files, result: r.result, editedResult: r.edited_result ?? null, diff: r.review_diff ?? null,
      review: r.reviewed_at ? { by: r.reviewer_email, at: r.reviewed_at, reason: r.review_reason } : null,
      flags: r.flags, divergences: r.divergences, pendings: r.pendings, sources: r.sources, error: r.error,
      provider: r.provider, model: r.model, pages: r.pages, costBrl: Number(r.cost_brl), expiresAt: r.expires_at,
      reviewRequired: def.review.required, reviewers: def.review.reviewers, reviewChecklist: def.review.checklist,
      exportFormats: def.output.files.length ? def.output.files : (def.pipeline.find(s => s.bloco === 'exportar')?.params.formatos ?? []),
      canReview: r.status === 'rascunho' && canReviewRun(a, r, def.review),
    };
  });

  // Arquivo de entrada original (para a revisão conferir a origem).
  app.get('/api/runs/:id/files/:fileId', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id, fileId } = req.params as { id: string; fileId: string };
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const f = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = (await tx.query(`select user_id, area_id from runs where id = $1`, [id])).rows[0];
      if (!r || !canSeeRun(a, r)) return null;
      return (await tx.query(`select name, mime, object_key from run_files where id = $1 and run_id = $2`, [fileId, id])).rows[0] ?? null;
    });
    if (!f) return reply.code(404).send({ error: 'nao_encontrado' });
    const bytes = await app.deps.objects.get(f.object_key);
    return reply.type(f.mime || 'application/octet-stream')
      .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .header('x-content-type-options', 'nosniff')
      .send(Buffer.from(bytes));
  });
}
