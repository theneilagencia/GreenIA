// Mapeamentos de importação pela tela: o admin ou key user sobe um arquivo de
// exemplo, vê as linhas como vieram, mapeia os campos, confere a pré-visualização
// normalizada e salva. Cada alteração é uma versão nova, com auditoria.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { aplicarMapeamento, decodificar, lerCsv, lerXlsx, serveParaArquivo } from './apply.ts';
import { mapeamentoConfigSchema, type MapeamentoConfig } from './schema.ts';
import { criarMapeamento, slugify } from './service.ts';

const MAX_AMOSTRA = 5 * 1024 * 1024;
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const arquivoSchema = z.object({ nome: z.string().min(1).max(200), base64: z.string().min(1).max(Math.ceil(MAX_AMOSTRA * 4 / 3) + 8) });
const bytesDe = (a: z.infer<typeof arquivoSchema>) => new Uint8Array(Buffer.from(a.base64, 'base64'));

export const podeGerir = (a: AuthContext) => can(a, 'imports.manage') || a.areaRoles.some(r => r.role === 'key_user');

// Resumo do que um mapeamento entrega, para a lista e para escolher no assistente.
const campos = (c: MapeamentoConfig) => c.campos.map(f => ({ campo: f.campo, tipo: f.tipo, obrigatorio: f.obrigatorio }));

// Pré-visualização: aplica a configuração ao arquivo de exemplo sem gravar nada.
async function previa(cfg: MapeamentoConfig, arq: z.infer<typeof arquivoSchema>, limite = 50) {
  const r = await aplicarMapeamento(bytesDe(arq), arq.nome, cfg);
  return {
    serveParaEsteArquivo: serveParaArquivo(cfg, arq.nome),
    colunas: r.colunas, linhasLidas: r.linhasLidas, linhasIgnoradas: r.linhasIgnoradas,
    registros: r.registros.length, amostra: r.registros.slice(0, limite).map(x => ({ ...x.dados, _origem: x.origem })),
    erros: r.erros.slice(0, 100), totalErros: r.erros.length,
  };
}

export async function importMappingRoutes(app: FastifyInstance) {
  const auth = (req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) => {
    const a = requireAuth(req, reply);
    if (!a) return null;
    if (!podeGerir(a)) { reply.code(403).send({ error: 'sem_permissao', detalhe: 'mapeamentos de importação: admin do cliente ou key user' }); return null; }
    return a;
  };

  // Primeiras linhas do arquivo como vieram, para montar o mapeamento.
  app.post('/api/admin/import-mappings/inspecionar', async (req, reply) => {
    const a = auth(req, reply);
    if (!a) return;
    const p = z.object({ arquivo: arquivoSchema, codificacao: z.enum(['utf-8', 'latin1']).optional(), separador: z.string().min(1).max(3).optional() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const bytes = bytesDe(p.data.arquivo);
    if (bytes.length > MAX_AMOSTRA) return reply.code(413).send({ error: 'arquivo_grande', detalhe: 'use uma amostra de até 5 MB' });
    const ext = p.data.arquivo.nome.toLowerCase().split('.').pop() ?? '';
    if (ext === 'xlsx') {
      try {
        const x = await lerXlsx(bytes);
        return { formato: 'xlsx', planilhas: [...x.planilhas.values()].map(pl => ({ nome: pl.nome, celulas: pl.linhas().slice(0, 30).map(l => l.celulas) })) };
      } catch { return reply.code(400).send({ error: 'arquivo_invalido' }); }
    }
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    const codificacao = p.data.codificacao ?? (utf8.includes('\uFFFD') ? 'latin1' : 'utf-8');
    const texto = decodificar(bytes, codificacao);
    const linhas = texto.split(/\r?\n/).slice(0, 30);
    if (ext === 'json' || ext === 'xml') return { formato: ext, codificacao, linhas };
    // Separador provável: o que aparece o mesmo número de vezes em mais linhas.
    const contagem = [';', ',', '\t', '|'].map(x => ({ x, n: linhas.filter(l => l.split(x).length > 2).length })).sort((u, v) => v.n - u.n)[0];
    const sep = p.data.separador ?? (contagem.n ? contagem.x : null);
    return {
      formato: sep ? 'csv' : 'txt_largura_fixa', codificacao, separador: sep === '\t' ? '\\t' : sep, linhas,
      celulas: sep ? lerCsv(linhas.join('\n'), sep, '"').map(l => l.celulas) : undefined,
    };
  });

  app.post('/api/admin/import-mappings/previa', async (req, reply) => {
    const a = auth(req, reply);
    if (!a) return;
    const p = z.object({ config: z.unknown(), arquivo: arquivoSchema }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const c = mapeamentoConfigSchema.safeParse(p.data.config);
    if (!c.success) return reply.code(400).send({ error: 'mapeamento_invalido', problemas: c.error.issues.map(i => ({ caminho: i.path.join('.'), mensagem: i.message })) });
    if (bytesDe(p.data.arquivo).length > MAX_AMOSTRA) return reply.code(413).send({ error: 'arquivo_grande', detalhe: 'use uma amostra de até 5 MB' });
    return previa(c.data, p.data.arquivo);
  });

  app.get('/api/admin/import-mappings', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    // Quem configura assistentes também precisa ver a lista (sem a configuração completa).
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const rows = (await tx.query(`select m.*, v.config, v.created_at as version_at, u.email as updated_by from import_mappings m
        join import_mapping_versions v on v.mapping_id = m.id and v.version = m.current_version left join users u on u.id = v.created_by order by m.archived_at nulls first, m.name`)).rows;
      return rows.map(r => ({ id: r.id, slug: r.slug, nome: r.name, descricao: r.description, versao: r.current_version, formato: r.config.formato,
        campos: campos(r.config), arquivado: !!r.archived_at, atualizadoEm: r.version_at, atualizadoPor: r.updated_by }));
    });
  });

  app.get('/api/admin/import-mappings/:id', async (req, reply) => {
    const a = auth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const m = (await tx.query(`select * from import_mappings where id = $1`, [id])).rows[0];
      if (!m) return null;
      const versoes = (await tx.query(`select v.version, v.config, v.note, v.created_at, u.email from import_mapping_versions v left join users u on u.id = v.created_by where v.mapping_id = $1 order by v.version desc`, [id])).rows;
      return { id: m.id, slug: m.slug, nome: m.name, descricao: m.description, versao: m.current_version, arquivado: !!m.archived_at,
        config: versoes.find(v => v.version === m.current_version)?.config,
        versoes: versoes.map(v => ({ versao: v.version, nota: v.note, em: v.created_at, por: v.email, config: v.config })) };
    });
    return out ?? reply.code(404).send({ error: 'nao_encontrado' });
  });

  app.post('/api/admin/import-mappings', async (req, reply) => {
    const a = auth(req, reply);
    if (!a) return;
    const p = z.object({ slug: z.string().regex(SLUG).optional(), nome: z.string().trim().min(2).max(120), descricao: z.string().max(1000).default(''),
      config: z.unknown(), nota: z.string().max(1000).default(''), arquivoExemplo: arquivoSchema.optional() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const c = mapeamentoConfigSchema.safeParse(p.data.config);
    if (!c.success) return reply.code(400).send({ error: 'mapeamento_invalido', problemas: c.error.issues.map(i => ({ caminho: i.path.join('.'), mensagem: i.message })) });
    // Com arquivo de exemplo, só salva se a pré-visualização ler pelo menos um registro.
    const teste = p.data.arquivoExemplo ? await previa(c.data, p.data.arquivoExemplo, 5) : null;
    if (teste && !teste.registros) return reply.code(422).send({ error: 'exemplo_sem_registros', previa: teste });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const slug = p.data.slug ?? slugify(p.data.nome);
      if ((await tx.query(`select 1 from import_mappings where slug = $1`, [slug])).rowCount) return { status: 409, body: { error: 'slug_em_uso' } };
      const m = await criarMapeamento(tx, a.tenantId, a.userId, { slug, nome: p.data.nome, descricao: p.data.descricao, config: c.data, nota: p.data.nota });
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'mapeamento_importacao_criado', target: `mapeamento:${slug}@1`,
        details: { formato: c.data.formato, campos: c.data.campos.map(f => f.campo), testadoCom: p.data.arquivoExemplo?.nome ?? null, registrosNoExemplo: teste?.registros ?? null } });
      return { status: 201, body: m };
    });
    return reply.code(out.status).send(out.body);
  });

  // Versão nova (a anterior continua guardada).
  app.put('/api/admin/import-mappings/:id', async (req, reply) => {
    const a = auth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ nome: z.string().trim().min(2).max(120).optional(), descricao: z.string().max(1000).optional(), config: z.unknown(),
      nota: z.string().trim().min(3, 'diga o que mudou').max(1000), arquivoExemplo: arquivoSchema.optional() }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos', problemas: p.success ? undefined : p.error.issues.map(i => ({ caminho: i.path.join('.'), mensagem: i.message })) });
    const c = mapeamentoConfigSchema.safeParse(p.data.config);
    if (!c.success) return reply.code(400).send({ error: 'mapeamento_invalido', problemas: c.error.issues.map(i => ({ caminho: i.path.join('.'), mensagem: i.message })) });
    const teste = p.data.arquivoExemplo ? await previa(c.data, p.data.arquivoExemplo, 5) : null;
    if (teste && !teste.registros) return reply.code(422).send({ error: 'exemplo_sem_registros', previa: teste });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const m = (await tx.query(`select * from import_mappings where id = $1 for update`, [id])).rows[0];
      if (!m) return { status: 404, body: { error: 'nao_encontrado' } };
      const versao = m.current_version + 1;
      await tx.query(`insert into import_mapping_versions (tenant_id, mapping_id, version, config, note, created_by) values ($1, $2, $3, $4, $5, $6)`, [a.tenantId, id, versao, c.data, p.data.nota, a.userId]);
      await tx.query(`update import_mappings set current_version = $2, name = coalesce($3, name), description = coalesce($4, description), updated_at = now() where id = $1`,
        [id, versao, p.data.nome ?? null, p.data.descricao ?? null]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'mapeamento_importacao_alterado', target: `mapeamento:${m.slug}@${versao}`,
        details: { nota: p.data.nota, formato: c.data.formato, campos: c.data.campos.map(f => f.campo), testadoCom: p.data.arquivoExemplo?.nome ?? null } });
      return { status: 200, body: { id, slug: m.slug, versao } };
    });
    return reply.code(out.status).send(out.body);
  });

  for (const [path, arquivar] of [['arquivar', true], ['reativar', false]] as const) {
    app.post(`/api/admin/import-mappings/:id/${path}`, async (req, reply) => {
      const a = auth(req, reply);
      if (!a) return;
      const { id } = req.params as { id: string };
      if (!z.uuid().safeParse(id).success) return reply.code(400).send({ error: 'dados_invalidos' });
      const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        const m = (await tx.query(`update import_mappings set archived_at = ${arquivar ? 'now()' : 'null'}, updated_at = now() where id = $1 returning slug`, [id])).rows[0];
        if (!m) return false;
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: arquivar ? 'mapeamento_importacao_arquivado' : 'mapeamento_importacao_reativado', target: `mapeamento:${m.slug}` });
        return true;
      });
      return out ? { ok: true } : reply.code(404).send({ error: 'nao_encontrado' });
    });
  }
}
