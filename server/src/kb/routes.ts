// Documentos da base: enviar, nova versão, listar, pesquisar. Envio e versão
// exigem kb.manage na área do documento (ou admin, para documentos gerais).
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canApproveShare, changeShares, shareSchema, shareTarget } from '../areas/sharing.ts';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { tenantPrefix } from '../storage/object-store.ts';
import { KB_EXT_MIME, KB_TEXT_TYPES } from './indexer.ts';

const contentSchema = z.object({
  contentType: z.string(),
  text: z.string().optional(),
  contentBase64: z.string().optional(),
}).refine(v => v.text !== undefined || v.contentBase64 !== undefined, 'envie text ou contentBase64');

const createSchema = contentSchema.and(z.object({
  title: z.string().trim().min(1).max(200),
  areaSlug: z.string().optional(),
  compartilhar: shareSchema.optional(),      // outras áreas ou toda a empresa
}));

function bytesOf(c: z.infer<typeof contentSchema>) {
  return c.text !== undefined ? new TextEncoder().encode(c.text) : new Uint8Array(Buffer.from(c.contentBase64 || '', 'base64'));
}

export async function kbRoutes(app: FastifyInstance) {
  // Grava a versão no armazenamento e na tabela, e põe a indexação na fila.
  async function storeVersion(tenantId: string, userId: string, documentId: string, version: number, body: Uint8Array, mime: string) {
    const sha = createHash('sha256').update(body).digest('hex');
    const key = `${tenantPrefix(tenantId)}kb/${documentId}/v${version}/${sha}`;
    await app.deps.objects.put(key, body, mime);
    return { key, sha };
  }

  const bodyLimit = app.deps.config.KB_UPLOAD_BODY_LIMIT_MB * 1024 * 1024;

  app.post('/api/kb/documents', { bodyLimit }, async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = createSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    if (!KB_TEXT_TYPES.includes(p.data.contentType)) return reply.code(415).send({ error: 'tipo_nao_suportado', aceitos: KB_TEXT_TYPES });
    const body = bytesOf(p.data);
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const { config } = parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0]?.config);
      if (body.length > config.limits.maxFileMb * 1024 * 1024) return { status: 413, body: { error: 'arquivo_grande_demais', limiteMb: config.limits.maxFileMb } };
      const areaId = p.data.areaSlug ? (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id : null;
      if (p.data.areaSlug && !areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      if (!can(a, 'kb.manage', areaId)) return { status: 403, body: { error: 'sem_permissao' } };
      const wanted = p.data.compartilhar?.areas ?? [];
      const found = wanted.length ? (await tx.query(`select slug from areas where slug = any($1)`, [wanted])).rows.map(r => r.slug) : [];
      const missing = wanted.filter(w => !found.includes(w));
      if (missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: missing } };
      const doc = (await tx.query(`insert into kb_documents (tenant_id, area_id, title, created_by) values ($1, $2, $3, $4) returning id`,
        [a.tenantId, areaId, p.data.title, a.userId])).rows[0];
      if (p.data.compartilhar) await changeShares(tx, a, 'documento', { id: doc.id, area_id: areaId ?? null, company_wide: false, label: p.data.title }, p.data.compartilhar, 'criação', true);
      const { key, sha } = await storeVersion(a.tenantId, a.userId, doc.id, 1, body, p.data.contentType);
      await tx.query(`insert into kb_document_versions (tenant_id, document_id, version, object_key, sha256, mime, bytes, created_by) values ($1, $2, 1, $3, $4, $5, $6, $7)`,
        [a.tenantId, doc.id, key, sha, p.data.contentType, body.length, a.userId]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'documento_enviado', target: `documento:${doc.id}@1`, details: { sha256: sha, bytes: body.length } });
      return { status: 201, body: { documentId: doc.id as string, version: 1 } };
    });
    // Indexa depois do commit (a tarefa lê a versão em outra transação).
    if (out.status === 201) await app.deps.queue.enqueue('kb:index', { tenantId: a.tenantId, documentId: out.body.documentId, version: 1 });
    return reply.code(out.status).send(out.body);
  });

  app.post('/api/kb/documents/:id/versions', { bodyLimit }, async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = contentSchema.safeParse(req.body);
    if (!p.success || !/^[0-9a-f-]{36}$/.test(id)) return reply.code(400).send({ error: 'dados_invalidos' });
    if (!KB_TEXT_TYPES.includes(p.data.contentType)) return reply.code(415).send({ error: 'tipo_nao_suportado', aceitos: KB_TEXT_TYPES });
    const body = bytesOf(p.data);
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const doc = (await tx.query(`select id, area_id from kb_documents where id = $1 for update`, [id])).rows[0];
      if (!doc) return { status: 404, body: { error: 'documento_nao_encontrado' } };
      if (!can(a, 'kb.manage', doc.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      const version = (await tx.query(`select coalesce(max(version), 0) + 1 as v from kb_document_versions where document_id = $1`, [id])).rows[0].v as number;
      const { key, sha } = await storeVersion(a.tenantId, a.userId, id, version, body, p.data.contentType);
      await tx.query(`insert into kb_document_versions (tenant_id, document_id, version, object_key, sha256, mime, bytes, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [a.tenantId, id, version, key, sha, p.data.contentType, body.length, a.userId]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'documento_nova_versao', target: `documento:${id}@${version}`, details: { sha256: sha } });
      return { status: 201, body: { documentId: id, version } };
    });
    if (out.status === 201) await app.deps.queue.enqueue('kb:index', { tenantId: a.tenantId, documentId: id, version: out.body.version });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/kb/documents', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select d.id, d.title, d.current_version as version, ar.slug as area, d.company_wide as empresa,
              coalesce((select array_agg(x.slug order by x.slug) from kb_document_shares s join areas x on x.id = s.area_id where s.document_id = d.id), '{}') as "compartilhadoCom",
              (select v.status from kb_document_versions v where v.document_id = d.id order by v.version desc limit 1) as ultimo_status
       from kb_documents d left join areas ar on ar.id = d.area_id order by d.title`).then(r => r.rows));
  });

  // Compartilha o documento com outras áreas ou com toda a empresa.
  app.put('/api/kb/documents/:id/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = shareSchema.safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const doc = await shareTarget(tx, 'documento', id);
      if (!doc) return { status: 404, body: { error: 'nao_encontrado' } };
      const approver = await canApproveShare(tx, a, doc.area_id);
      const manages = can(a, 'kb.manage', doc.area_id);
      if (!approver && !manages && !can(a, 'qw.decide', doc.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      const r = await changeShares(tx, a, 'documento', doc, p.data, 'painel', approver || manages);
      if ('error' in r) return { status: 403, body: { error: r.error } };
      if (r.missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: r.missing } };
      return { status: 200, body: { id, aplicados: r.aplicados, pendentes: r.pendentes, removidos: r.removidos } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/kb/search', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = String((req.query as Record<string, unknown>).q || '').slice(0, 500);
    const area = String((req.query as Record<string, unknown>).area || '').slice(0, 60);
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      // Com área: documentos dela e das subáreas, compartilhados com elas e os da empresa.
      const areaId = area ? (await tx.query(`select id from areas where slug = $1`, [area])).rows[0]?.id ?? null : null;
      if (area && !areaId) return [];
      return (await app.deps.knowledge.search(tx, q, { areaId, limit: 10 })).map(h => ({ documentId: h.documentId, version: h.version, title: h.title, trecho: h.text.slice(0, 300) }));
    });
  });

  // Importação em lote (implantação): cada arquivo vira um documento, indexado
  // na fila. A resposta já traz o que foi recusado; o andamento da indexação,
  // com os erros, fica em GET /api/kb/import/:lote.
  const importSchema = z.object({
    areaSlug: z.string().optional(),
    files: z.array(z.object({
      name: z.string().trim().min(1).max(200),
      contentBase64: z.string().min(1),
      title: z.string().trim().min(1).max(200).optional(),
    })).min(1).max(500),
  });

  app.post('/api/kb/import', { bodyLimit }, async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = importSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const lote = randomUUID();
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const { config } = parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0]?.config);
      const areaId = p.data.areaSlug ? (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id : null;
      if (p.data.areaSlug && !areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      if (!can(a, 'kb.manage', areaId)) return { status: 403, body: { error: 'sem_permissao' } };
      const seen = new Set<string>();
      const documentos: { arquivo: string; documentId: string | null; erro: string | null }[] = [];
      for (const f of p.data.files) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const mime = KB_EXT_MIME[ext === 'markdown' ? 'md' : ext];
        const bytes = new Uint8Array(Buffer.from(f.contentBase64, 'base64'));
        const erro = !mime ? `tipo não aceito (.${ext}); aceitos: ${Object.keys(KB_EXT_MIME).join(', ')}`
          : bytes.length > config.limits.maxFileMb * 1024 * 1024 ? `arquivo acima de ${config.limits.maxFileMb} MB`
            : seen.has(f.name.toLowerCase()) ? 'nome repetido no lote' : null;
        seen.add(f.name.toLowerCase());
        if (erro) { documentos.push({ arquivo: f.name, documentId: null, erro }); continue; }
        const title = f.title ?? f.name.replace(/\.[^.]+$/, '');
        const doc = (await tx.query(`insert into kb_documents (tenant_id, area_id, title, created_by, import_batch) values ($1, $2, $3, $4, $5) returning id`,
          [a.tenantId, areaId, title, a.userId, lote])).rows[0];
        const { key, sha } = await storeVersion(a.tenantId, a.userId, doc.id, 1, bytes, mime);
        await tx.query(`insert into kb_document_versions (tenant_id, document_id, version, object_key, sha256, mime, bytes, created_by) values ($1, $2, 1, $3, $4, $5, $6, $7)`,
          [a.tenantId, doc.id, key, sha, mime, bytes.length, a.userId]);
        documentos.push({ arquivo: f.name, documentId: doc.id, erro: null });
      }
      const aceitos = documentos.filter(d => d.documentId).length;
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'documentos_importados', target: `lote:${lote}`,
        details: { aceitos, recusados: documentos.length - aceitos, areaId } });
      return { status: 202, body: { lote, aceitos, recusados: documentos.length - aceitos, documentos } };
    });
    if (out.status === 202) {
      for (const d of (out.body as { documentos: { documentId: string | null }[] }).documentos) {
        if (d.documentId) await app.deps.queue.enqueue('kb:index', { tenantId: a.tenantId, documentId: d.documentId, version: 1 });
      }
    }
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/kb/import/:lote', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { lote } = req.params as { lote: string };
    if (!z.uuid().safeParse(lote).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const rows = await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select d.id, d.title, v.status, v.error from kb_documents d join kb_document_versions v on v.document_id = d.id and v.version = 1
       where d.import_batch = $1 order by d.title`, [lote]).then(r => r.rows));
    if (!rows.length) return reply.code(404).send({ error: 'nao_encontrado' });
    const resumo = { indexados: rows.filter(r => r.status === 'indexado').length, pendentes: rows.filter(r => r.status === 'pendente').length, erros: rows.filter(r => r.status === 'erro').length };
    return { lote, resumo, documentos: rows.map(r => ({ documentId: r.id, titulo: r.title, status: r.status, erro: r.error })) };
  });
}
