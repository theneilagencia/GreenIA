// Saída e portabilidade. Os dados continuam sendo do cliente:
//   exportação completa  ZIP com JSON e CSV de cada conjunto (configuração,
//                        pessoas, assistentes e versões, base de conhecimento,
//                        saídas retidas, medições, consumo, política, incidentes
//                        e auditoria com a cadeia de hash) e os arquivos
//                        originais. Segredos e dados de sessão ficam de fora.
//   exclusão total       apaga os arquivos do tenant no armazenamento e todas
//                        as linhas no banco, confere que nada sobrou e grava um
//                        comprovante fora das tabelas do tenant.
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { Db, Tx } from '../db/pool.ts';
import { withTenant } from '../db/pool.ts';
import { tenantPrefix, type ObjectStore } from '../storage/object-store.ts';
import { toCsv } from '../util/csv.ts';
import { verifyChain } from '../audit/routes.ts';

const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

// Conjuntos exportados: nome do arquivo → consulta (a transação já está no
// contexto do tenant; a RLS garante que só vêm linhas dele).
const DATASETS: Record<string, string> = {
  'cliente': `select id, slug, name, status, config, created_at from tenants`,
  'dominios': `select domain from tenant_domains`,
  'hosts': `select host from tenant_hosts`,
  'provedores-de-login': `select id, kind, label, config, enabled, created_at from auth_providers`,
  'areas': `select id, slug, name, created_at from areas`,
  'pessoas': `select id, email, name, status, created_at, onboarding_done_at from users`,
  'papeis': `select m.user_id, u.email, m.area_id, a.slug as area, m.role, m.created_at from memberships m join users u on u.id = m.user_id left join areas a on a.id = m.area_id`,
  'assistentes': `select id, slug, name, area_id, status, current_version, created_at from assistants`,
  'assistentes-versoes': `select assistant_id, version, definition, created_by, created_at from assistant_versions`,
  'base-documentos': `select id, area_id, title, current_version, created_by, created_at from kb_documents`,
  'base-versoes': `select document_id, version, object_key, sha256, mime, bytes, status, error, created_by, created_at from kb_document_versions`,
  'execucoes': `select id, assistant_id, assistant_version, area_id, user_id, status, input_text, input_sha256, confirmed_warnings, result, edited_result, review_diff, review_reason, reviewed_by, reviewed_at,
                flags, divergences, pendings, sources, provider, model, input_tokens, output_tokens, pages, cost_brl, output_sha256, error, created_at, started_at, finished_at, processing_ms, expires_at from runs`,
  'execucoes-arquivos': `select id, run_id, name, mime, bytes, sha256, object_key, kind, pages from run_files`,
  'saidas-do-chat': `select id, user_id, assistant_id, assistant_version, area_id, content, sources, input_sha256, output_sha256, model, created_at, expires_at from outputs`,
  'medicoes': `select id, assistant_id, indicator, phase, value, unit, origin, period_start, period_end, method, informed_by, notes, recorded_by, created_at from metric_values`,
  'decisoes': `select id, assistant_id, decision, decided_on, responsible, justification, recorded_by, created_at from assistant_decisions`,
  'consumo': `select id, user_id, assistant_id, run_id, provider, model, input_tokens, output_tokens, pages, cost_brl, price_id, at from usage_events`,
  'alertas-de-cota': `select month, threshold, created_at from quota_alerts`,
  'politica-de-uso': `select version, title, body, body_sha256, rules, published_by, published_at from usage_policies`,
  'politica-ciencia': `select user_id, version, acked_at from policy_acks`,
  'incidentes': `select id, kind, description, area_id, reporter_id, run_id, screen, status, created_at, updated_at from incidents`,
  'incidentes-historico': `select incident_id, at, actor, status_from, status_to, note from incident_events`,
  'auditoria': `select seq, at, actor_user_id, action, target, details, prev_hash, hash from audit_log order by seq`,
};

const EXT: Record<string, string> = {
  'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv', 'application/pdf': 'pdf', 'application/xml': 'xml', 'text/xml': 'xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120) || 'arquivo';

export async function buildTenantExport(db: Db, objects: ObjectStore, tenantId: string) {
  const zip = new JSZip();
  const files: { caminho: string; bytes: number; sha256: string }[] = [];
  const add = (path: string, content: string | Uint8Array) => {
    zip.file(path, content);
    const b = typeof content === 'string' ? Buffer.from(content) : content;
    files.push({ caminho: path, bytes: b.length, sha256: sha(b) });
  };
  const data = await withTenant(db, { tenantId, allAreas: true }, async (tx: Tx) => {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const [name, sql] of Object.entries(DATASETS)) out[name] = (await tx.query(sql)).rows;
    const chain = await verifyChain(tx);
    return { out, chain };
  });
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(data.out)) {
    counts[name] = rows.length;
    add(`dados/${name}.json`, JSON.stringify(rows, null, 2) + '\n');
    add(`dados/${name}.csv`, toCsv(rows));
  }
  // Arquivos originais: base de conhecimento (todas as versões) e entradas das execuções retidas.
  const docs = new Map(data.out['base-documentos'].map(d => [d.id as string, d.title as string]));
  for (const v of data.out['base-versoes']) {
    const bytes = await objects.get(v.object_key as string).catch(() => null);
    if (bytes) add(`arquivos/base/${v.document_id}/v${v.version}/${safeName(docs.get(v.document_id as string) ?? 'documento')}.${EXT[v.mime as string] ?? 'bin'}`, bytes);
  }
  for (const f of data.out['execucoes-arquivos']) {
    const bytes = await objects.get(f.object_key as string).catch(() => null);
    if (bytes) add(`arquivos/execucoes/${f.run_id}/${safeName(f.name as string)}`, bytes);
  }
  const tenant = data.out['cliente'][0] as { id: string; slug: string; name: string };
  const manifest = {
    formato: 'GreenIA, exportação completa do tenant, versão 1',
    cliente: { id: tenant.id, slug: tenant.slug, nome: tenant.name },
    geradaEm: new Date().toISOString(),
    registros: counts,
    arquivos: files.length,
    auditoria: { registros: Number(data.chain.registros), cadeiaIntegra: data.chain.ok, hashFinal: data.chain.hash_final },
    conteudo: files,
    observacoes: [
      'Cada conjunto vem em JSON e em CSV (separador ponto e vírgula, UTF-8 com BOM).',
      'A auditoria traz seq, prev_hash e hash de cada registro: dá para refazer a cadeia com SHA-256 sobre a forma canônica descrita em server/migrations/007_audit_chain.sql.',
      'Ficam de fora: sessões, códigos de login e fluxos de autenticação em andamento (dados transitórios de segurança) e os trechos indexados (derivados dos originais).',
    ],
  };
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  zip.file('manifesto.json', manifestText);
  zip.file('LEIAME.txt', [
    `Exportação completa de ${tenant.name} (${tenant.slug}), gerada em ${manifest.geradaEm}.`,
    'dados/: um arquivo JSON e um CSV por conjunto (pessoas, assistentes, base, execuções, medições, consumo, política, incidentes, auditoria).',
    'arquivos/: os originais da base de conhecimento (todas as versões) e das execuções retidas.',
    'manifesto.json: contagens, integridade da auditoria e o SHA-256 de cada arquivo.',
  ].join('\r\n') + '\r\n');
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, manifest };
}

// Tabelas com tenant_id (lidas do catálogo, para a verificação não depender de uma lista fixa).
async function tenantTables(db: Db): Promise<string[]> {
  return (await db.query(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' order by 1`)).rows.map(r => r.table_name as string);
}

async function countRows(db: Db, tables: string[], tenantId: string) {
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = Number((await db.query(`select count(*) from "${t}" where tenant_id = $1`, [tenantId])).rows[0].count);
  counts.tenants = Number((await db.query(`select count(*) from tenants where id = $1`, [tenantId])).rows[0].count);
  return counts;
}

// Exclusão total (fim de contrato). Roda com a conexão do dono das tabelas.
export async function deleteTenant(ownerDb: Db, objects: ObjectStore, tenantId: string, who: { email: string; reason: string }) {
  const t = (await ownerDb.query(`select id, slug, name, is_platform from tenants where id = $1`, [tenantId])).rows[0];
  if (!t) throw new Error('tenant não encontrado');
  if (t.is_platform) throw new Error('o tenant da plataforma não pode ser excluído');
  const tables = await tenantTables(ownerDb);
  const before = await countRows(ownerDb, tables, tenantId);
  const head = (await ownerDb.query(`select hash from audit_log where tenant_id = $1 order by seq desc limit 1`, [tenantId])).rows[0]?.hash ?? null;
  // Âncoras no bucket externo (Object Lock): não podem ser apagadas antes do fim
  // da retenção. Só têm identificador, número de registro e hash, sem conteúdo.
  const anc = (await ownerDb.query(`select count(*)::int as n, max(retain_until) as ate, min(bucket) as bucket from audit_anchors where tenant_id = $1`, [tenantId])).rows[0];
  const externalAnchors = anc.n ? { quantidade: anc.n, bucket: anc.bucket, retidasAte: new Date(anc.ate).toISOString(),
    observacao: 'âncoras da auditoria (identificador do tenant, número do registro e hash, sem conteúdo) ficam no bucket com Object Lock até o fim da retenção' } : null;

  // 1) Armazenamento: tudo que está no prefixo do tenant.
  const prefix = tenantPrefix(tenantId);
  const objectsBefore = (await objects.list(prefix)).length;
  await objects.deletePrefix(prefix);

  // 2) Banco: a exclusão do tenant apaga em cascata todas as tabelas; a
  // auditoria só aceita a exclusão com greenia.purge_tenant definido para ele.
  const client = await ownerDb.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('greenia.purge_tenant', $1, true)`, [tenantId]);
    await client.query(`delete from tenants where id = $1`, [tenantId]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // 3) Verificação: nenhuma linha e nenhum objeto do tenant.
  const after = await countRows(ownerDb, tables, tenantId);
  const remainingRows = Object.values(after).reduce((a, b) => a + b, 0);
  const remainingObjects = (await objects.list(prefix)).length;
  const verification = { linhasRestantes: remainingRows, objetosRestantes: remainingObjects, porTabela: after, ok: remainingRows === 0 && remainingObjects === 0 };
  const body = { tenantId, slug: t.slug, nome: t.name, solicitadoPor: who.email, motivo: who.reason, registros: before, objetosApagados: objectsBefore, auditoria: { registros: before.audit_log ?? 0, hashFinal: head, ancorasExternas: externalAnchors }, verificacao: verification, em: new Date().toISOString() };
  const receiptSha = sha(JSON.stringify(body));
  const id = (await ownerDb.query(
    `insert into tenant_deletions (former_tenant_id, tenant_slug, tenant_name, requested_by, reason, counts, objects_deleted, audit_records, audit_head_hash, verification, receipt_sha256)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id, deleted_at`,
    [tenantId, t.slug, t.name, who.email, who.reason, before, objectsBefore, before.audit_log ?? 0, head, verification, receiptSha])).rows[0];
  return { comprovante: id.id as string, sha256: receiptSha, ...body };
}
