// Âncora diária da cadeia de auditoria. Uma vez por dia, para cada tenant, o
// hash final da cadeia vai para um bucket S3 com Object Lock em modo
// compliance, numa conta AWS separada da produção (bucket e papel vêm da
// configuração). A âncora não pode ser apagada nem sobrescrita antes do fim
// da retenção, nem pela conta de produção nem pelo dono do banco.
// A verificação da cadeia compara o registro ancorado com a âncora lida do
// bucket: quem reescrever a cadeia inteira no banco não consegue reescrever a
// âncora. O corpo da âncora não tem conteúdo de cliente: só identificador do
// tenant, número do registro, hash e datas.
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import { withTenant, type Tx } from '../db/pool.ts';
import { audit } from '../audit.ts';
import { verifyChain } from './routes.ts';

export interface AnchorBody {
  formato: 'greenia-ancora-v1';
  tenantId: string;
  data: string;                   // AAAA-MM-DD
  seq: number;                    // último registro coberto
  hash: string;                   // hash desse registro
  registros: number;
  ancoraAnterior: { data: string; hash: string } | null;
  publicadaEm: string;
}

export interface PublishedAnchor { bucket: string; key: string; versionId: string | null; retainUntil: Date }

export interface AnchorStore {
  readonly bucket: string;
  publish(key: string, body: AnchorBody, retainUntil: Date): Promise<PublishedAnchor>;
  read(key: string, versionId: string | null): Promise<AnchorBody>;
}

export class AnchorExistsError extends Error {}

// S3 com Object Lock. O bucket precisa ter sido criado com Object Lock ligado
// (e versionamento); a retenção em modo COMPLIANCE vai em cada objeto.
export class S3AnchorStore implements AnchorStore {
  readonly bucket: string;
  private s3: S3Client;
  private prefix: string;
  constructor(config: Config) {
    this.bucket = config.AUDIT_ANCHOR_BUCKET!;
    this.prefix = config.AUDIT_ANCHOR_PREFIX;
    this.s3 = new S3Client({
      region: config.AUDIT_ANCHOR_REGION,
      endpoint: config.AUDIT_ANCHOR_ENDPOINT || undefined,
      forcePathStyle: !!config.AUDIT_ANCHOR_ENDPOINT,
      credentials: config.AUDIT_ANCHOR_ROLE_ARN ? fromTemporaryCredentials({
        params: { RoleArn: config.AUDIT_ANCHOR_ROLE_ARN, RoleSessionName: 'greenia-ancora-auditoria', ExternalId: config.AUDIT_ANCHOR_EXTERNAL_ID, DurationSeconds: 900 },
      }) : undefined,
    });
  }

  async publish(key: string, body: AnchorBody, retainUntil: Date): Promise<PublishedAnchor> {
    const full = this.prefix + key;
    const r = await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: full, Body: JSON.stringify(body, null, 2), ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE', ObjectLockRetainUntilDate: retainUntil,
      ChecksumAlgorithm: 'SHA256',
      IfNoneMatch: '*',               // nunca sobrescreve uma âncora do mesmo dia
    })).catch(e => {
      if ((e as { name?: string }).name === 'PreconditionFailed') throw new AnchorExistsError(full);
      throw e;
    });
    return { bucket: this.bucket, key: full, versionId: r.VersionId ?? null, retainUntil };
  }

  async read(key: string, versionId: string | null): Promise<AnchorBody> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId ?? undefined }));
    return JSON.parse(await r.Body!.transformToString('utf-8')) as AnchorBody;
  }
}

// Em memória (testes): como o Object Lock, não deixa sobrescrever.
export class MemoryAnchorStore implements AnchorStore {
  readonly bucket = 'ancoras-teste';
  objects = new Map<string, { body: string; retainUntil: Date }>();
  async publish(key: string, body: AnchorBody, retainUntil: Date) {
    if (this.objects.has(key)) throw new AnchorExistsError(key);
    this.objects.set(key, { body: JSON.stringify(body), retainUntil });
    return { bucket: this.bucket, key, versionId: 'v1', retainUntil };
  }
  async read(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error('âncora não encontrada: ' + key);
    return JSON.parse(o.body) as AnchorBody;
  }
}

const today = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);   // AAAA-MM-DD
export const anchorKey = (tenantId: string, date: string) => `ancoras/${tenantId}/${date}.json`;

export type AnchorResult = { tenantId: string; status: 'publicada' | 'ja_publicada' | 'cadeia_quebrada' | 'vazia' | 'erro'; seq?: number; erro?: string };

// Publica a âncora do dia de um tenant (idempotente: uma por dia).
export async function publishTenantAnchor(app: FastifyInstance, store: AnchorStore, tenantId: string, now = new Date()): Promise<AnchorResult> {
  const date = today(now);
  const ctx = { tenantId, allAreas: true };
  const state = await withTenant(app.deps.db, ctx, async tx => {
    if ((await tx.query(`select 1 from audit_anchors where anchor_date = $1`, [date])).rowCount) return { status: 'ja_publicada' as const };
    const chain = await verifyChain(tx);
    const head = (await tx.query(`select seq, hash from audit_log order by seq desc limit 1`)).rows[0];
    const prev = (await tx.query(`select anchor_date, hash from audit_anchors order by anchor_date desc limit 1`)).rows[0];
    return { status: 'ok' as const, chain, head, prev };
  });
  if (state.status === 'ja_publicada') return { tenantId, status: 'ja_publicada' };
  const { chain, head, prev } = state;
  if (!head) return { tenantId, status: 'vazia' };
  // Cadeia quebrada não é ancorada: a âncora atestaria um estado adulterado.
  if (!chain.ok) {
    await withTenant(app.deps.db, ctx, tx => audit(tx, { tenantId, action: 'ancora_nao_publicada', details: { motivo: 'cadeia quebrada', primeiroQuebrado: chain.primeiro_quebrado } }));
    app.log.error({ tenantId, primeiroQuebrado: chain.primeiro_quebrado }, 'auditoria: cadeia quebrada, âncora não publicada');
    return { tenantId, status: 'cadeia_quebrada' };
  }
  const body: AnchorBody = {
    formato: 'greenia-ancora-v1', tenantId, data: date, seq: Number(head.seq), hash: head.hash, registros: Number(chain.registros),
    ancoraAnterior: prev ? { data: String(prev.anchor_date instanceof Date ? prev.anchor_date.toISOString().slice(0, 10) : prev.anchor_date), hash: prev.hash } : null,
    publicadaEm: now.toISOString(),
  };
  const retainUntil = new Date(now.getTime() + app.deps.config.AUDIT_ANCHOR_RETENTION_DAYS * 86400_000);
  let pub: PublishedAnchor;
  try {
    pub = await store.publish(anchorKey(tenantId, date), body, retainUntil);
  } catch (e) {
    if (e instanceof AnchorExistsError) return { tenantId, status: 'ja_publicada' };
    app.log.error({ tenantId, err: (e as Error).message }, 'auditoria: falha ao publicar a âncora');
    await withTenant(app.deps.db, ctx, tx => audit(tx, { tenantId, action: 'ancora_nao_publicada', details: { motivo: 'falha no bucket', erro: (e as Error).message.slice(0, 300) } }));
    return { tenantId, status: 'erro', erro: (e as Error).message };
  }
  await withTenant(app.deps.db, ctx, async tx => {
    await tx.query(`insert into audit_anchors (tenant_id, anchor_date, seq, hash, records, bucket, object_key, version_id, retain_until)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, date, body.seq, body.hash, body.registros, pub.bucket, pub.key, pub.versionId, pub.retainUntil]);
    await audit(tx, { tenantId, action: 'ancora_publicada', target: `ancora:${date}`, details: { seq: body.seq, hash: body.hash, bucket: pub.bucket, chave: pub.key, retidaAte: pub.retainUntil.toISOString() } });
  });
  return { tenantId, status: 'publicada', seq: body.seq };
}

// Tarefa diária: todos os tenants.
export function makeAnchorJob(app: FastifyInstance) {
  return async () => {
    const store = app.deps.anchors;
    if (!store) return [];
    if (!app.deps.ownerDb) throw new Error('âncora da auditoria precisa da conexão do dono para listar os tenants');
    const tenants = (await app.deps.ownerDb.query(`select id from tenants order by created_at`)).rows.map(r => r.id as string);
    const out: AnchorResult[] = [];
    for (const t of tenants) out.push(await publishTenantAnchor(app, store, t).catch(e => ({ tenantId: t, status: 'erro' as const, erro: (e as Error).message })));
    return out;
  };
}

export interface AnchorCheck {
  status: 'confere' | 'diverge' | 'sem_ancora' | 'indisponivel' | 'desligada';
  data?: string; seq?: number; hashAncorado?: string; motivo?: string;
}

// Confere a cadeia atual com a última âncora publicada (lida do bucket).
export async function checkLatestAnchor(tx: Tx, store: AnchorStore | undefined): Promise<AnchorCheck> {
  if (!store) return { status: 'desligada' };
  const a = (await tx.query(`select anchor_date, seq, object_key, version_id from audit_anchors order by anchor_date desc limit 1`)).rows[0];
  if (!a) return { status: 'sem_ancora' };
  const data = a.anchor_date instanceof Date ? a.anchor_date.toISOString().slice(0, 10) : String(a.anchor_date);
  let body: AnchorBody;
  try { body = await store.read(a.object_key, a.version_id); }
  catch (e) { return { status: 'indisponivel', data, motivo: 'não foi possível ler a âncora no bucket: ' + (e as Error).message.slice(0, 200) }; }
  const row = (await tx.query(`select hash from audit_log where seq = $1`, [body.seq])).rows[0];
  const base = { data: body.data, seq: body.seq, hashAncorado: body.hash };
  if (!row) return { status: 'diverge', ...base, motivo: `o registro ${body.seq}, ancorado em ${body.data}, não existe mais na cadeia` };
  if (row.hash !== body.hash) return { status: 'diverge', ...base, motivo: `o registro ${body.seq} tem hash diferente do ancorado em ${body.data}` };
  return { status: 'confere', ...base };
}
