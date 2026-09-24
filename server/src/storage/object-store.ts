// Armazenamento de objetos compatível com S3 (AWS S3 em sa-east-1; MinIO no
// ambiente local). Criptografia em repouso pedida em cada gravação (SSE-S3 ou
// SSE-KMS). Chaves sempre começam por tenants/<tenant_id>/.
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { Config } from '../config.ts';

export interface ObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<number>;
}

export const tenantPrefix = (tenantId: string) => `tenants/${tenantId}/`;

export class S3ObjectStore implements ObjectStore {
  private s3: S3Client;
  private bucket: string;
  private sse: Config['S3_SSE'];
  private kmsKeyId?: string;

  constructor(config: Config) {
    this.s3 = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
    this.bucket = config.S3_BUCKET;
    this.sse = config.S3_SSE;
    this.kmsKeyId = config.S3_KMS_KEY_ID;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
      ...(this.sse === 'none' ? {} : { ServerSideEncryption: this.sse }),
      ...(this.sse === 'aws:kms' && this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
    }));
  }

  async get(key: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!r.Body) throw new Error('objeto vazio: ' + key);
    return r.Body.transformToByteArray();
  }

  async list(prefix: string) {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents || []) if (o.Key) keys.push(o.Key);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async deletePrefix(prefix: string) {
    if (!prefix.startsWith('tenants/')) throw new Error('deletePrefix só dentro de tenants/');
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) } }));
    }
    return keys.length;
  }
}

// Em memória (testes). Guarda também o tipo de conteúdo.
export class MemoryObjectStore implements ObjectStore {
  objects = new Map<string, { body: Uint8Array; contentType: string }>();
  async put(key: string, body: Uint8Array, contentType: string) { this.objects.set(key, { body, contentType }); }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error('objeto não encontrado: ' + key);
    return o.body;
  }
  async list(prefix: string) { return [...this.objects.keys()].filter(k => k.startsWith(prefix)); }
  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    for (const k of keys) this.objects.delete(k);
    return keys.length;
  }
}
