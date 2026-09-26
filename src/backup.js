// Backup e restauração. O backup é uma cópia consistente do banco (VACUUM INTO,
// funciona com o servidor no ar), compactada com gzip. Vai para uma pasta local
// e, se BACKUP_DESTINO for s3://bucket/prefixo, também para um armazenamento
// compatível com S3 (AWS, Cloudflare R2, Backblaze B2, MinIO, Magalu Cloud...).
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

async function s3(metodo, alvo, corpo) {
  const hashCorpo = sha256(corpo || '');
  const cab = assinarS3({ metodo, url: alvo.url, hashCorpo, ...alvo, cabecalhos: corpo ? { 'content-type': 'application/gzip' } : {} });
  const r = await fetch(alvo.url, { method: metodo, headers: cab, body: corpo });
  if (!r.ok) throw new Error(`S3 respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

// Faz o backup. Devolve o caminho local e, se houver, a URL no S3.
export async function fazerBackup(db, { pasta = 'dados/backups', destino = '', manter = 14, agora = new Date(), env = process.env } = {}) {
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
  const alvo = alvoS3(destino, nome, env);
  if (alvo) await s3('PUT', alvo, gz);
  return { local, tamanho: gz.length, remoto: alvo?.url || null };
}

// Confere se um arquivo SQLite está íntegro e é um banco da GreenIA.
export function conferir(arquivo) {
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const r = db.prepare('pragma integrity_check').get();
    if (Object.values(r)[0] !== 'ok') throw new Error('O arquivo de backup está corrompido: ' + Object.values(r)[0]);
    for (const t of ['config', 'pessoas', 'eventos', 'conversas']) {
      if (!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(t)) throw new Error(`O arquivo não é um banco da GreenIA (falta a tabela ${t}).`);
    }
    return { pessoas: db.prepare('select count(*) as n from pessoas').get().n, eventos: db.prepare('select count(*) as n from eventos').get().n };
  } finally { db.close(); }
}

// Restaura um backup (arquivo local .gz ou s3://bucket/caminho). Com o servidor parado.
// O banco atual não é apagado: fica ao lado, com o sufixo .antes-da-restauracao.
export async function restaurar(origem, banco, { env = process.env } = {}) {
  let gz;
  if (origem.startsWith('s3://')) {
    const alvo = alvoS3(origem.replace(/[^/]+$/, ''), basename(origem), env);
    gz = Buffer.from(await (await s3('GET', alvo)).arrayBuffer());
  } else gz = readFileSync(origem);
  mkdirSync(dirname(banco), { recursive: true });
  const temp = `${banco}.restaurando`;
  writeFileSync(temp, gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz);   // aceita .gz ou .sqlite
  let resumo;
  try { resumo = conferir(temp); } catch (e) { rmSync(temp, { force: true }); throw e; }
  let anterior = null;
  if (existsSync(banco) && statSync(banco).size > 0) { anterior = `${banco}.antes-da-restauracao`; renameSync(banco, anterior); }
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
      .then(r => { app.log(`backup feito: ${r.local}${r.remoto ? ' e ' + r.remoto : ''}`); registrar(app, 'backup_feito', null, { tamanho: r.tamanho, remoto: !!r.remoto }); })
      .catch(e => { app.log('backup falhou', e.message); registrar(app, 'backup_falhou', null, { erro: e.message }); });
  }, 30e3);
  t.unref();
  return t;
}
