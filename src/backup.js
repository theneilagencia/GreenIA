// Backup e restauração. O backup é uma cópia consistente do banco (VACUUM INTO,
// funciona com o servidor no ar), compactada com gzip. Vai para uma pasta local
// e, se BACKUP_DESTINO for s3://bucket/prefixo, também para um armazenamento
// compatível com S3 (AWS, Cloudflare R2, Backblaze B2, MinIO, Magalu Cloud...), só depois de
// conferir no próprio bucket a regra de expiração (conferirExpiracaoS3).
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { registrar } from './eventos.js';

const sha256 = d => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
const codificar = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Assinatura AWS Signature Version 4 para S3. Devolve os cabeçalhos a enviar.
export function assinarS3({ metodo, url, cabecalhos = {}, hashCorpo, chave, segredo, regiao, agora = new Date() }) {
  const u = new URL(url);
  const data = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dia = data.slice(0, 8);
  const h = { ...Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': data };
  const nomes = Object.keys(h).sort();
  const uri = u.pathname.split('/').map(p => codificar(decodeURIComponent(p))).join('/');
  const query = [...u.searchParams].map(([k, v]) => `${codificar(k)}=${codificar(v)}`).sort().join('&');
  const canonico = [metodo, uri, query, nomes.map(n => `${n}:${h[n]}\n`).join(''), nomes.join(';'), hashCorpo].join('\n');
  const escopo = `${dia}/${regiao}/s3/aws4_request`;
  const texto = ['AWS4-HMAC-SHA256', data, escopo, sha256(canonico)].join('\n');
  const k = ['s3', 'aws4_request'].reduce((a, p) => hmac(a, p), hmac(hmac('AWS4' + segredo, dia), regiao));
  const assinatura = createHmac('sha256', k).update(texto).digest('hex');
  delete h.host;
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${chave}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${assinatura}` };
}

function alvoS3(destino, nome, env) {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(destino || '');
  if (!m) return null;
  if (!env.S3_ENDPOINT || !env.S3_CHAVE || !env.S3_SEGREDO) throw new Error('Backup em S3 precisa de S3_ENDPOINT, S3_CHAVE e S3_SEGREDO.');
  const prefixo = m[2] ? m[2].replace(/\/?$/, '/') : '';
  return { url: `${env.S3_ENDPOINT.replace(/\/$/, '')}/${m[1]}/${prefixo}${nome}`, chave: env.S3_CHAVE, segredo: env.S3_SEGREDO, regiao: env.S3_REGIAO || 'us-east-1' };
}

async function s3Resposta(metodo, alvo, corpo) {
  const hashCorpo = sha256(corpo || '');
  const cab = assinarS3({ metodo, url: alvo.url, hashCorpo, ...alvo, cabecalhos: corpo ? { 'content-type': 'application/gzip' } : {} });
  return fetch(alvo.url, { method: metodo, headers: cab, body: corpo });
}
async function s3(metodo, alvo, corpo) {
  const r = await s3Resposta(metodo, alvo, corpo);
  if (!r.ok) throw new Error(`S3 respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

// Expiração das cópias no S3: conferida NO BUCKET antes de cada envio (GetBucketLifecycleConfiguration,
// GetBucketVersioning e GetObjectLockConfiguration). Uma variável de ambiente que só "declara" a regra não prova
// nada e não libera o envio. O envio só acontece quando uma regra ativa, sem filtro por etiqueta ou tamanho, cobre o
// prefixo das cópias e expira o objeto em até `limiteDias`; com versionamento, a versão antiga também precisa expirar
// e a soma dos dois prazos fica dentro do limite; com Object Lock ligado, o envio fica bloqueado. A remoção depois da
// expiração é feita pelo provedor do bucket, no tempo dele (o código só confere a regra).
const xmlTexto = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export function avaliarLifecycle(xml, { prefixo = '', limiteDias = 7, versionado = false } = {}) {
  let expira = null, antigas = null;
  for (const [, r] of String(xml || '').matchAll(/<Rule>([\s\S]*?)<\/Rule>/g)) {
    if (!/<Status>\s*Enabled\s*<\/Status>/.test(r)) continue;
    if (/<Tag>|<ObjectSize(?:GreaterThan|LessThan)>/.test(r)) continue;   // regra que não cobre todos os objetos
    const p = /<Prefix>([^<]*)<\/Prefix>/.exec(r);
    if (!prefixo.startsWith(p ? xmlTexto(p[1]) : '')) continue;
    const e = /<Expiration>[\s\S]*?<Days>\s*(\d+)\s*<\/Days>[\s\S]*?<\/Expiration>/.exec(r);
    if (e && +e[1] >= 1) expira = Math.min(expira ?? Infinity, +e[1]);
    const n = /<NoncurrentVersionExpiration>([\s\S]*?)<\/NoncurrentVersionExpiration>/.exec(r);
    const nd = n && /<NoncurrentDays>\s*(\d+)\s*<\/NoncurrentDays>/.exec(n[1]);
    if (nd && +nd[1] >= 1 && !/<NewerNoncurrentVersions>\s*[1-9]/.test(n[1])) antigas = Math.min(antigas ?? Infinity, +nd[1]);
  }
  if (expira == null) return { ok: false, motivo: `nenhuma regra ativa de expiração cobre o prefixo "${prefixo}"` };
  if (expira > limiteDias) return { ok: false, motivo: `a regra do bucket expira em ${expira} dias, mais que o limite de ${limiteDias}`, expiraDias: expira };
  if (versionado) {
    if (antigas == null) return { ok: false, motivo: 'bucket com versionamento e sem expiração das versões antigas', expiraDias: expira };
    if (expira + antigas > limiteDias) return { ok: false, motivo: `expiração (${expira} dias) mais versões antigas (${antigas} dias) passa do limite de ${limiteDias}`, expiraDias: expira, antigasDias: antigas };
  }
  return { ok: true, expiraDias: expira, antigasDias: versionado ? antigas : null, versionado };
}

export async function conferirExpiracaoS3(destino, env = process.env, { limiteDias = 7 } = {}) {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(destino || '');
  if (!m) return { ok: false, motivo: 'destino S3 inválido' };
  const base = alvoS3(`s3://${m[1]}`, '', env);
  const bucket = q => ({ ...base, url: `${base.url.replace(/\/$/, '')}?${q}` });
  const prefixo = m[2] ? m[2].replace(/\/?$/, '/') : '';
  try {
    const lc = await s3Resposta('GET', bucket('lifecycle'));
    if (!lc.ok) return { ok: false, motivo: lc.status === 404 ? 'o bucket não tem regra de expiração (lifecycle)' : `não foi possível ler a regra de expiração do bucket (${lc.status})` };
    const ver = await s3Resposta('GET', bucket('versioning'));
    if (!ver.ok) return { ok: false, motivo: `não foi possível conferir o versionamento do bucket (${ver.status})` };
    const versionado = /<Status>\s*(?:Enabled|Suspended)\s*<\/Status>/.test(await ver.text());
    const ol = await s3Resposta('GET', bucket('object-lock'));
    if (ol.ok && /<ObjectLockEnabled>\s*Enabled/.test(await ol.text())) return { ok: false, motivo: 'o bucket tem Object Lock: a expiração pode ser impedida' };
    if (!ol.ok && ![404, 501].includes(ol.status)) return { ok: false, motivo: `não foi possível conferir o Object Lock do bucket (${ol.status})` };
    return avaliarLifecycle(await lc.text(), { prefixo, limiteDias, versionado });
  } catch (e) { return { ok: false, motivo: `não foi possível consultar o bucket (${e.code || e.name || 'erro'})` }; }
}

// Faz o backup. Devolve o caminho local e, se houver, a URL no S3.
export function fazerBackupLocal(db, { pasta = 'dados/backups', manter = 14, agora = new Date() } = {}) {
  mkdirSync(pasta, { recursive: true });
  const nome = `greenia-${agora.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}.sqlite.gz`;
  const temp = join(pasta, `.${nome}.tmp`);
  rmSync(temp, { force: true });
  db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`);
  const gz = gzipSync(readFileSync(temp), { level: 9 });
  rmSync(temp);
  const local = join(pasta, nome);
  writeFileSync(local, gz);
  // Retenção local: fica com os mais recentes.
  const antigos = readdirSync(pasta).filter(f => /^greenia-\d{8}-\d{6}\.sqlite\.gz$/.test(f)).sort().reverse().slice(Math.max(1, manter));
  for (const f of antigos) rmSync(join(pasta, f));
  return { local, tamanho:gz.length, nome, sha256: sha256(gz) };
}

// Com destino S3, a cópia só é enviada se a expiração do bucket for conferida antes (conferirExpiracaoS3). Sem
// isso, a cópia fica só no disco local e o motivo volta em `s3Bloqueado`.
export async function fazerBackup(db, { pasta = 'dados/backups', destino = '', manter = 14, agora = new Date(), env = process.env, limiteDias = 7 } = {}) {
  const { local,tamanho,nome,sha256:hash }=fazerBackupLocal(db,{pasta,manter,agora});
  const gz=readFileSync(local);
  const alvo = alvoS3(destino, nome, env);
  if (!alvo) return { local, tamanho, sha256: hash, remoto: null };
  const conferido = await conferirExpiracaoS3(destino, env, { limiteDias });
  if (!conferido.ok) return { local, tamanho, sha256: hash, remoto: null, s3Bloqueado: conferido.motivo };
  await s3('PUT', alvo, gz);
  return { local, tamanho, sha256: hash, remoto: alvo.url, s3: conferido };
}

// Confere se um arquivo SQLite está íntegro e é um banco da GreenIA.
export function conferir(arquivo, { tipo = 'empresa' } = {}) {
  if (!['empresa', 'plataforma'].includes(tipo)) throw new Error('Tipo de banco inválido: use empresa ou plataforma.');
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const r = db.prepare('pragma integrity_check').get();
    if (Object.values(r)[0] !== 'ok') throw new Error('O arquivo de backup está corrompido: ' + Object.values(r)[0]);
    const tabelas = tipo === 'plataforma' ? ['companies', 'plans', 'users', 'company_users', 'roles', 'role_permissions', 'platform_settings', 'audit_log'] : ['config', 'pessoas', 'eventos', 'conversas'];
    for (const t of tabelas) {
      if (!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(t)) throw new Error(`O arquivo não é um banco da GreenIA do tipo ${tipo} (falta a tabela ${t}).`);
    }
    if (db.prepare('pragma foreign_key_check').all().length) throw new Error('O backup contém referências inconsistentes entre registros.');
    if (tipo === 'plataforma') return { tipo, empresas: db.prepare('select count(*) as n from companies').get().n, usuarios: db.prepare('select count(*) as n from users').get().n, eventos: db.prepare('select count(*) as n from audit_log').get().n };
    return { tipo, pessoas: db.prepare('select count(*) as n from pessoas').get().n, eventos: db.prepare('select count(*) as n from eventos').get().n };
  } finally { db.close(); }
}

// Restaura um backup (arquivo local .gz ou s3://bucket/caminho). Com o servidor parado.
// O banco atual não é apagado: fica ao lado, com o sufixo .antes-da-restauracao.
export async function restaurar(origem, banco, { env = process.env, tipo = 'empresa' } = {}) {
  let gz;
  if (origem.startsWith('s3://')) {
    const alvo = alvoS3(origem.replace(/[^/]+$/, ''), basename(origem), env);
    gz = Buffer.from(await (await s3('GET', alvo)).arrayBuffer());
  } else gz = readFileSync(origem);
  mkdirSync(dirname(banco), { recursive: true });
  const temp = `${banco}.restaurando`;
  writeFileSync(temp, gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz);   // aceita .gz ou .sqlite
  let resumo;
  try { resumo = conferir(temp, { tipo }); } catch (e) { rmSync(temp, { force: true }); throw e; }
  let anterior = null;
  if (existsSync(banco) && statSync(banco).size > 0) {
    anterior = `${banco}.antes-da-restauracao`; renameSync(banco, anterior);
    // Manifesto: a cópia anterior expira no prazo de backup manual da política de retenção (src/retencao.js).
    writeFileSync(`${anterior}.json`, JSON.stringify({ tipo: 'antes-da-restauracao', criado_em: new Date().toISOString(), origem: basename(origem) }, null, 2) + '\n');
  }
  for (const s of ['-wal', '-shm']) rmSync(banco + s, { force: true });
  renameSync(temp, banco);
  return { ...resumo, anterior };
}

// Backup automático uma vez por dia, na hora marcada (HH:MM, horário do servidor).
export function agendarBackup(app, { hora, ...op }) {
  if (!/^\d{2}:\d{2}$/.test(hora || '')) return null;
  let ultimo = '';
  const t = setInterval(() => {
    const agora = new Date();
    const hhmm = agora.toTimeString().slice(0, 5);
    const dia = agora.toDateString();
    if (hhmm !== hora || ultimo === dia) return;
    ultimo = dia;
    fazerBackup(app.db, op)
      .then(r => {
        app.log(`backup feito: ${r.local}${r.remoto ? ' e ' + r.remoto : ''}`);
        if (r.s3Bloqueado) app.log(`ATENÇÃO: cópia não enviada ao S3: ${r.s3Bloqueado}`);
        registrar(app, 'backup.completed', null, { tamanho: r.tamanho, remoto: !!r.remoto, ...(r.s3Bloqueado ? { s3_bloqueado: r.s3Bloqueado } : {}) });
      })
      .catch(e => { app.log('backup falhou', e.message); registrar(app, 'backup.failed', null, { erro: e.message }); });
  }, 30e3);
  t.unref();
  return t;
}
