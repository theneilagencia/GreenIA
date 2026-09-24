// Revisão humana das saídas de assistentes e exportação final.
//   rascunho → aprovado | aprovado_com_edicao (guarda a saída editada e o diff) | rejeitado (motivo obrigatório)
// Só quem tem o papel de revisão previsto no assistente revisa; com revisão
// obrigatória, quem executou não revisa a própria saída. Só saída aprovada é
// exportada como final (a versão editada, quando houver).
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTwoFilesPatch } from 'diff';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { audit } from '../audit.ts';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { exportSections, type ExportFormat } from '../blocks/exportar.ts';
import type { InputFile, Section } from '../blocks/types.ts';
import { canReviewRun, canSeeRun } from './access.ts';

const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

const reviewSchema = z.object({
  decisao: z.enum(['aprovado', 'aprovado_com_edicao', 'rejeitado']),
  motivo: z.string().trim().max(2000).optional(),
  resultadoEditado: z.object({ sections: z.array(z.record(z.string(), z.unknown())) }).optional(),
});

const exportQuery = z.object({ format: z.enum(['xlsx', 'csv', 'pdf', 'docx', 'zip']) });

// A edição só pode mudar o conteúdo das seções, não a estrutura (mesmas seções, na mesma ordem).
function sameShape(original: Section[], edited: Record<string, unknown>[]): string | null {
  if (original.length !== edited.length) return 'a saída editada precisa ter as mesmas seções da original';
  for (const [i, s] of original.entries()) {
    const e = edited[i];
    if (e.id !== s.id || e.kind !== s.kind || e.bloco !== s.bloco) return `seção ${i + 1} (${s.titulo}) não corresponde à original`;
    if (e.data === undefined) return `seção ${s.titulo} sem dados`;
  }
  return null;
}

const pretty = (sections: unknown[]) => JSON.stringify(sections, null, 2) + '\n';

export async function reviewRoutes(app: FastifyInstance) {
  app.post('/api/runs/:id/review', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const p = reviewSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const body = p.data;

    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const run = (await tx.query(
        `select r.*, a.slug from runs r join assistants a on a.id = r.assistant_id where r.id = $1 for update of r`, [id])).rows[0];
      if (!run || !canSeeRun(a, run)) return { status: 404, body: { error: 'nao_encontrado' } };
      const def = assistantDefinitionSchema.parse((await tx.query(
        `select definition from assistant_versions where assistant_id = $1 and version = $2`, [run.assistant_id, run.assistant_version])).rows[0].definition);
      if (!canReviewRun(a, run, def.review)) return { status: 403, body: { error: run.user_id === a.userId ? 'autor_nao_revisa' : 'sem_permissao_de_revisao' } };
      if (run.status !== 'rascunho') return { status: 409, body: { error: 'nao_esta_em_revisao', status: run.status } };

      let decisao = body.decisao;
      let edited: Section[] | null = null;
      let diff: string | null = null;
      const original = (run.result?.sections ?? []) as Section[];
      if (decisao === 'rejeitado' && (!body.motivo || body.motivo.length < 5)) return { status: 400, body: { error: 'motivo_obrigatorio' } };
      if (decisao === 'aprovado_com_edicao') {
        if (!body.resultadoEditado) return { status: 400, body: { error: 'saida_editada_obrigatoria' } };
        const problem = sameShape(original, body.resultadoEditado.sections);
        if (problem) return { status: 400, body: { error: 'saida_editada_invalida', detalhe: problem } };
        edited = body.resultadoEditado.sections as unknown as Section[];
        diff = createTwoFilesPatch('saida-original.json', 'saida-revisada.json', pretty(original), pretty(edited), '', '', { context: 2 });
        if (pretty(original) === pretty(edited)) { decisao = 'aprovado'; edited = null; diff = null; }   // nada mudou
      }
      const changed = edited ? original.filter((s, i) => JSON.stringify(s.data) !== JSON.stringify(edited![i].data)).map(s => s.id) : [];
      await tx.query(
        `update runs set status = $2, edited_result = $3, review_diff = $4, review_reason = $5, reviewed_by = $6, reviewed_at = now() where id = $1`,
        [id, decisao, edited ? { sections: edited } : null, diff, body.motivo ?? null, a.userId]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'revisao_decidida', target: `execucao:${id}`, details: {
        decisao, motivo: body.motivo ?? null, secoesEditadas: changed,
        saidaOriginal: run.output_sha256, saidaRevisada: edited ? sha(JSON.stringify({ sections: edited })) : run.output_sha256,
      } });
      return { status: 200, body: { id, status: decisao, secoesEditadas: changed } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/runs/:id/export', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const q = exportQuery.safeParse(req.query);
    if (!z.uuid().safeParse(id).success || !q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const format = q.data.format as ExportFormat;
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const run = (await tx.query(
        `select r.*, a.name as assistant_name, t.name as tenant_name, rv.email as reviewer
         from runs r join assistants a on a.id = r.assistant_id join tenants t on t.id = r.tenant_id
         left join users rv on rv.id = r.reviewed_by where r.id = $1`, [id])).rows[0];
      if (!run || !canSeeRun(a, run)) return { status: 404 as const };
      if (!['aprovado', 'aprovado_com_edicao'].includes(run.status)) return { status: 409 as const, error: 'saida_nao_aprovada' };
      const def = assistantDefinitionSchema.parse((await tx.query(
        `select definition from assistant_versions where assistant_id = $1 and version = $2`, [run.assistant_id, run.assistant_version])).rows[0].definition);
      const formats = def.output.files.length ? def.output.files : ((def.pipeline.find(s => s.bloco === 'exportar')?.params.formatos as string[] | undefined) ?? []);
      if (!formats.includes(format)) return { status: 409 as const, error: 'formato_nao_previsto', formats };
      const files = format === 'zip' ? (await tx.query(`select id, name, mime, sha256, object_key from run_files where run_id = $1`, [id])).rows : [];
      return { status: 200 as const, run, files };
    });
    if (out.status === 404) return reply.code(404).send({ error: 'nao_encontrado' });
    if (out.status === 409) return reply.code(409).send({ error: out.error, ...('formats' in out ? { formatos: out.formats } : {}) });
    const { run } = out;
    const inputs: InputFile[] = [];
    for (const f of out.files) inputs.push({ id: f.id, name: f.name, mime: f.mime, sha256: f.sha256, bytes: await app.deps.objects.get(f.object_key) });
    const sections = ((run.edited_result ?? run.result)?.sections ?? []) as Section[];
    let file;
    try {
      file = await exportSections(format, sections, {
        runId: run.id, assistente: run.assistant_name, versao: run.assistant_version, criadoEm: new Date(run.created_at).toISOString(), tenant: run.tenant_name,
        revisao: { status: run.status, revisor: run.reviewer ?? '', em: new Date(run.reviewed_at).toISOString() },
      }, inputs);
    } catch (e) {
      return reply.code(409).send({ error: 'exportacao_indisponivel', detalhe: (e as Error).message });
    }
    await withTenant(app.deps.db, tenantCtx(a), tx => audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'exportacao', target: `execucao:${id}`,
      details: { formato: format, arquivo: file.name, sha256: sha(file.bytes), versaoRevisada: !!run.edited_result } }));
    return reply.type(file.mime).header('content-disposition', `attachment; filename="${file.name}"`).send(Buffer.from(file.bytes));
  });
}
