// Cópia dos backups num armazenamento compatível com S3 (AWS S3, Cloudflare R2, Backblaze B2, MinIO, Magalu Cloud).
// Desligada até ser configurada (BACKUP_DESTINO=s3://bucket/prefixo + S3_* + BACKUP_CHAVE_CIFRA). Quando ligada:
//
// - Chave do objeto sem ambiguidade: <prefixo>/<banco>/greenia-<banco>-AAAAMMDD-HHMMSS.sqlite.gz.enc.
// - Cifra no cliente (AES-256-GCM) com BACKUP_CHAVE_CIFRA (32 bytes em base64), distinta da chave-mestra da aplicação.
//   O nome do objeto entra como dado autenticado: um arquivo trocado de lugar não é aceito.
// - Integridade: SHA-256 do .gz e do arquivo cifrado nos metadados; o S3 confere o corpo pela assinatura
//   (x-amz-content-sha256); depois do envio, um HEAD confere tamanho e metadados; a restauração confere os dois hashes.
// - SSE opcional (S3_SSE=AES256 ou aws:kms): pedida no envio e conferida no cabeçalho da resposta.
// - Expiração CONFERIDA, não declarada: antes do primeiro envio de cada rodada, lê a regra de ciclo de vida do bucket
//   (GetBucketLifecycleConfiguration) e o versionamento (GetBucketVersioning). Sem regra ativa que expire o prefixo
//   em até o prazo da política (e, com versionamento, que expire também as versões anteriores), nada é enviado.
// - Nada de DeleteObject: quem apaga é a regra de ciclo de vida do bucket. Política IAM mínima em
//   docs/operacao/backup-e-restauracao.md.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const sha256 = d => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
const codificar = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export class ErroBackup extends Error {
  constructor(code, mensagem, extra = {}) { super(mensagem); this.code = code; Object.assign(this, extra); }
}

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

// Chave de cifra dos backups: 32 bytes em base64. Nunca a chave-mestra da aplicação.
export function chaveCifraDe(env = {}, { mestra = null } = {}) {
  const v = String(env.BACKUP_CHAVE_CIFRA || '').trim();
  if (!v) throw new ErroBackup('S3_SEM_CHAVE_CIFRA', 'Backup em S3 precisa de BACKUP_CHAVE_CIFRA (32 bytes em base64; gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))").');
  const k = Buffer.from(v, 'base64');
  if (k.length !== 32) throw new ErroBackup('S3_CHAVE_CIFRA_INVALIDA', 'BACKUP_CHAVE_CIFRA precisa ter exatamente 32 bytes em base64.');
  if ((mestra && Buffer.isBuffer(mestra) && mestra.equals(k)) || (env.CHAVE_MESTRA && String(env.CHAVE_MESTRA).trim() === v))
    throw new ErroBackup('S3_CHAVE_CIFRA_IGUAL_MESTRA', 'BACKUP_CHAVE_CIFRA precisa ser diferente da chave-mestra da aplicação.');
  return k;
}

// Endereço do destino. Sem esquema ("host:porta", como o Render entrega o endereço interno de um serviço privado),
// vale http:// — o tráfego fica na rede privada e o conteúdo já sai cifrado e assinado daqui.
export const endpointS3 = e => { const v = String(e || '').trim().replace(/\/+$/, ''); return /^https?:\/\//i.test(v) ? v : `http://${v}`; };

// Configuração do destino. null quando o destino não é s3:// (S3 desligado).
export function configS3(destino, env = {}, { mestra = null } = {}) {
  const m = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/.exec(String(destino || '').trim());
  if (!m) { if (String(destino || '').trim()) throw new ErroBackup('S3_DESTINO_INVALIDO', 'BACKUP_DESTINO precisa ser s3://bucket/prefixo.'); return null; }
  if (!env.S3_ENDPOINT || !env.S3_CHAVE || !env.S3_SEGREDO) throw new ErroBackup('S3_CONFIG', 'Backup em S3 precisa de S3_ENDPOINT, S3_CHAVE e S3_SEGREDO.');
  const sse = String(env.S3_SSE || '').trim();
  if (sse && !['AES256', 'aws:kms'].includes(sse)) throw new ErroBackup('S3_SSE_INVALIDA', 'S3_SSE aceita AES256 ou aws:kms.');
  const prefixo = (m[2] || '').replace(/^\/+|\/+$/g, '');
  return { endpoint: endpointS3(env.S3_ENDPOINT), bucket: m[1], prefixo: prefixo ? prefixo + '/' : '', chave: env.S3_CHAVE, segredo: env.S3_SEGREDO,
    regiao: env.S3_REGIAO || 'us-east-1', incremental: env.BACKUP_INCREMENTAL === '1', sse, kmsChave: env.S3_SSE_KMS_ID || '', cifra: chaveCifraDe(env, { mestra }), timeoutMs: Number(env.S3_TIMEOUT_MS) || 120e3 };
}

export const urlS3 = (cfg, chaveObjeto = '', query = '') => `${cfg.endpoint}/${cfg.bucket}${chaveObjeto ? '/' + chaveObjeto.split('/').map(codificar).join('/') : ''}${query ? '?' + query : ''}`;

// Uma requisição assinada. Erros viram ErroBackup com código S3_HTTP_<status> (sem credenciais na mensagem).
export async function pedirS3(cfg, metodo, { objeto = '', query = '', corpo = null, cabecalhos = {}, aceitar = [] } = {}, f = globalThis.fetch) {
  const url = urlS3(cfg, objeto, query);
  const cab = assinarS3({ metodo, url, hashCorpo: sha256(corpo || ''), chave: cfg.chave, segredo: cfg.segredo, regiao: cfg.regiao, cabecalhos });
  // Todas as operações usadas são idempotentes (PUT do mesmo objeto, GET, HEAD): erro de rede (inclusive conexão
  // ociosa fechada pelo servidor enquanto o próximo banco era compactado), 429 e 5xx são tentados de novo, até 3 vezes.
  let r, ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      r = await f(url, { method: metodo, headers: tentativa === 1 ? cab : assinarS3({ metodo, url, hashCorpo: sha256(corpo || ''), chave: cfg.chave, segredo: cfg.segredo, regiao: cfg.regiao, cabecalhos }), body: corpo || undefined, signal: AbortSignal.timeout(cfg.timeoutMs) });
      if ((r.status === 429 || r.status >= 500) && tentativa < 3) { await r.arrayBuffer().catch(() => {}); await new Promise(ok => setTimeout(ok, 250 * tentativa)); continue; }
      ultimoErro = null;
      break;
    } catch (e) {
      ultimoErro = e;
      if (tentativa < 3 && e.name !== 'TimeoutError') await new Promise(ok => setTimeout(ok, 250 * tentativa));
      else break;
    }
  }
  if (ultimoErro) throw new ErroBackup('S3_REDE', `S3 inacessível (${ultimoErro.name === 'TimeoutError' ? 'tempo esgotado' : ultimoErro.cause?.code || ultimoErro.code || 'erro de rede'}).`);
  const dados = metodo === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await r.arrayBuffer());
  if (!r.ok && !aceitar.includes(r.status)) {
    const codigo = /<Code>([^<]{1,80})<\/Code>/.exec(dados.toString('utf8'))?.[1] || '';
    throw new ErroBackup(`S3_HTTP_${r.status}`, `S3 respondeu ${r.status}${codigo ? ` (${codigo})` : ''}.`, { status: r.status });
  }
  return { status: r.status, headers: r.headers, corpo: dados };
}

// ---------------------------------------------------------------- Ciclo de vida (expiração conferida)
const tag = (xml, nome) => { const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml); return m ? m[1] : null; };
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

// Lê lifecycle, versionamento e Object Lock do bucket. Só precisa das credenciais (não da chave de cifra).
export async function conferirExpiracaoS3(destino, env = process.env, { limiteDias = 7 } = {}, f = globalThis.fetch) {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(destino || '');
  if (!m) return { ok: false, motivo: 'destino S3 inválido' };
  if (!env.S3_ENDPOINT || !env.S3_CHAVE || !env.S3_SEGREDO) throw new ErroBackup('S3_CONFIG', 'Backup em S3 precisa de S3_ENDPOINT, S3_CHAVE e S3_SEGREDO.');
  const cfg = { endpoint: endpointS3(env.S3_ENDPOINT), bucket: m[1], chave: env.S3_CHAVE, segredo: env.S3_SEGREDO, regiao: env.S3_REGIAO || 'us-east-1', timeoutMs: Number(env.S3_TIMEOUT_MS) || 120e3 };
  const prefixo = m[2] ? m[2].replace(/\/?$/, '/') : '';
  const todos = Array.from({ length: 500 }, (_, i) => 100 + i);   // devolve qualquer status: a decisão é aqui
  try {
    const lc = await pedirS3(cfg, 'GET', { query: 'lifecycle', aceitar: todos }, f);
    if (lc.status !== 200) return { ok: false, motivo: lc.status === 404 ? 'o bucket não tem regra de expiração (lifecycle)' : `não foi possível ler a regra de expiração do bucket (${lc.status})` };
    const ver = await pedirS3(cfg, 'GET', { query: 'versioning', aceitar: todos }, f);
    if (ver.status !== 200) return { ok: false, motivo: `não foi possível conferir o versionamento do bucket (${ver.status})` };
    const versionado = /<Status>\s*(?:Enabled|Suspended)\s*<\/Status>/.test(ver.corpo.toString('utf8'));
    const ol = await pedirS3(cfg, 'GET', { query: 'object-lock', aceitar: todos }, f);
    if (ol.status === 200 && /<ObjectLockEnabled>\s*Enabled/.test(ol.corpo.toString('utf8'))) return { ok: false, motivo: 'o bucket tem Object Lock: a expiração pode ser impedida' };
    if (ol.status !== 200 && ![404, 501].includes(ol.status)) return { ok: false, motivo: `não foi possível conferir o Object Lock do bucket (${ol.status})` };
    return avaliarLifecycle(lc.corpo.toString('utf8'), { prefixo, limiteDias, versionado });
  } catch (e) { return { ok: false, motivo: `não foi possível consultar o bucket (${e.code || e.name || 'erro'})` }; }
}

// ---------------------------------------------------------------- Cifra no cliente
// Formato: "GRNIABK1" | u16 tamanho do nome | nome do objeto | iv (12) | dados cifrados | tag (16).
// O cabeçalho (com o nome) é o dado autenticado (AAD) do GCM.
const MAGICO = Buffer.from('GRNIABK1');
export const FORMATO = 'greenia-aes256gcm-v1';
export function cifrarBackup(chave, nome, dados) {
  const n = Buffer.from(nome, 'utf8');
  const cab = Buffer.concat([MAGICO, Buffer.from([n.length >> 8, n.length & 255]), n]);
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(cab);
  const corpo = Buffer.concat([c.update(dados), c.final()]);
  return Buffer.concat([cab, iv, corpo, c.getAuthTag()]);
}
export const ehCifrado = b => b.length > MAGICO.length + 2 && b.subarray(0, MAGICO.length).equals(MAGICO);
export function decifrarBackup(chave, b, { nomeEsperado = null } = {}) {
  if (!ehCifrado(b)) throw new ErroBackup('BACKUP_FORMATO', 'O arquivo não é um backup cifrado da GreenIA.');
  const tam = (b[8] << 8) | b[9], fimCab = 10 + tam;
  const nome = b.subarray(10, fimCab).toString('utf8');
  if (nomeEsperado != null && nome !== nomeEsperado) throw new ErroBackup('BACKUP_NOME', 'O backup cifrado pertence a outro objeto (nome não confere).');
  try {
    const d = createDecipheriv('aes-256-gcm', chave, b.subarray(fimCab, fimCab + 12));
    d.setAAD(b.subarray(0, fimCab));
    d.setAuthTag(b.subarray(b.length - 16));
    return { nome, dados: Buffer.concat([d.update(b.subarray(fimCab + 12, b.length - 16)), d.final()]) };
  } catch { throw new ErroBackup('BACKUP_DECIFRAR', 'Não foi possível decifrar o backup: chave BACKUP_CHAVE_CIFRA diferente ou arquivo alterado.'); }
}

// ---------------------------------------------------------------- Envio, leitura e listagem
export const objetoBackup = (cfg, banco, carimbo) => `${cfg.prefixo}${banco}/greenia-${banco}-${carimbo}.sqlite.gz.enc`;
const BANCO_VALIDO = /^[a-z0-9][a-z0-9_-]{0,80}$/i;

// Envia um backup (.gz) cifrado. `verificacao`: cache da conferência do ciclo de vida para a rodada.
// `verificacao.resultado`: conferência da expiração (conferirExpiracaoS3) feita antes; sem ela aprovada, nada é enviado.
export async function enviarBackupS3(cfg, { banco, carimbo, gz, criadoEm, verificacao = {} }, f = globalThis.fetch) {
  if (!BANCO_VALIDO.test(banco)) throw new ErroBackup('S3_BANCO_INVALIDO', 'Identificador de banco inválido para o nome do objeto.');
  if (!verificacao.resultado?.ok) throw new ErroBackup('S3_SEM_EXPIRACAO', `Envio ao S3 recusado: ${verificacao.resultado?.motivo || 'expiração do bucket não conferida'}.`, { ciclo: verificacao.resultado || null });
  const objeto = objetoBackup(cfg, banco, carimbo);
  if (cfg.incremental) return (await import('./backup-incremental.js')).enviarIncremental(cfg, { objeto, banco, gz, criadoEm }, f);
  const corpo = cifrarBackup(cfg.cifra, objeto, gz);
  const meta = { 'x-amz-meta-sha256': sha256(gz), 'x-amz-meta-sha256-cifrado': sha256(corpo), 'x-amz-meta-banco': banco, 'x-amz-meta-criado-em': criadoEm, 'x-amz-meta-formato': FORMATO };
  const sse = cfg.sse ? { 'x-amz-server-side-encryption': cfg.sse, ...(cfg.sse === 'aws:kms' && cfg.kmsChave ? { 'x-amz-server-side-encryption-aws-kms-key-id': cfg.kmsChave } : {}) } : {};
  const r = await pedirS3(cfg, 'PUT', { objeto, corpo, cabecalhos: { 'content-type': 'application/octet-stream', ...meta, ...sse } }, f);
  if (cfg.sse && r.headers.get('x-amz-server-side-encryption') !== cfg.sse) throw new ErroBackup('S3_SSE_NAO_CONFIRMADA', `O S3 não confirmou a cifra no servidor (${cfg.sse}).`);
  const h = await pedirS3(cfg, 'HEAD', { objeto }, f);
  if (Number(h.headers.get('content-length')) !== corpo.length || h.headers.get('x-amz-meta-sha256-cifrado') !== meta['x-amz-meta-sha256-cifrado'] || h.headers.get('x-amz-meta-sha256') !== meta['x-amz-meta-sha256'])
    throw new ErroBackup('S3_CONFERENCIA', 'O objeto no S3 não confere com o enviado (tamanho ou SHA-256).');
  return { url: `s3://${cfg.bucket}/${objeto}`, objeto, tamanhoCifrado: corpo.length, sha256: meta['x-amz-meta-sha256'], sse: cfg.sse || null, etag: r.headers.get('etag') || null };
}

// Lê um backup do S3, confere os dois SHA-256 e devolve o .gz decifrado.
export async function baixarBackupS3(cfg, objeto, f = globalThis.fetch) {
  const r = await pedirS3(cfg, 'GET', { objeto }, f);
  const esperadoCifrado = r.headers.get('x-amz-meta-sha256-cifrado'), esperado = r.headers.get('x-amz-meta-sha256');
  if (!esperadoCifrado || !esperado) throw new ErroBackup('S3_SEM_METADADOS', 'O objeto não tem os metadados de integridade (sha256): não foi enviado por esta versão.');
  if (sha256(r.corpo) !== esperadoCifrado) throw new ErroBackup('S3_INTEGRIDADE', 'O arquivo baixado não confere com o SHA-256 registrado no envio.');
  const { ehIncremental } = await import('./backup-incremental-formato.js');
  if (ehIncremental(r.corpo)) {
    const x = await (await import('./backup-incremental.js')).reconstruirIncremental(cfg, objeto, r.corpo, esperado, f);
    return { ...x, sha256: sha256(x.gz), criadoEm: r.headers.get('x-amz-meta-criado-em') };
  }
  const { dados } = decifrarBackup(cfg.cifra, r.corpo, { nomeEsperado: objeto });
  if (sha256(dados) !== esperado) throw new ErroBackup('S3_INTEGRIDADE', 'O backup decifrado não confere com o SHA-256 registrado no envio.');
  return { gz: dados, sha256: esperado, banco: r.headers.get('x-amz-meta-banco'), criadoEm: r.headers.get('x-amz-meta-criado-em') };
}

// ListObjectsV2 (com paginação) num prefixo relativo ao prefixo configurado.
export async function listarS3(cfg, sub = '', f = globalThis.fetch) {
  const itens = [];
  let token = '';
  for (let i = 0; i < 1000; i++) {
    const q = new URLSearchParams({ 'list-type': '2', prefix: cfg.prefixo + sub, ...(token ? { 'continuation-token': token } : {}) });
    const r = await pedirS3(cfg, 'GET', { query: q.toString().replace(/\+/g, '%20') }, f);
    const xml = r.corpo.toString('utf8');
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) itens.push({ objeto: tag(m[1], 'Key').replace(/&amp;/g, '&'), tamanho: Number(tag(m[1], 'Size')), modificado: tag(m[1], 'LastModified') });
    token = tag(xml, 'NextContinuationToken') || '';
    if (tag(xml, 'IsTruncated') !== 'true' || !token) break;
  }
  return itens;
}

// Backup mais novo de cada banco (pelo carimbo no nome do objeto).
export function maisNovosPorBanco(itens) {
  const r = new Map();
  for (const i of itens) {
    const m = /(?:^|\/)([^/]+)\/greenia-\1-(\d{8}-\d{6})\.sqlite\.gz\.enc$/.exec(i.objeto);
    if (m && (!r.has(m[1]) || r.get(m[1]).carimbo < m[2])) r.set(m[1], { ...i, banco: m[1], carimbo: m[2] });
  }
  return r;
}

// Envelope selado da chave-mestra (src/chave-recuperacao.js): já cifrado com BACKUP_ENVELOPE_SEGREDO; aqui ainda
// passa pela cifra dos backups. Reenviado a cada rodada (a regra de ciclo de vida também o expira).
export const objetoEnvelope = (cfg, carimbo) => `${cfg.prefixo}chave-mestra/envelope-${carimbo}.json.enc`;
export async function enviarEnvelopeS3(cfg, destino, { envelope, carimbo, limiteDias, env, verificacao = {} }, f = globalThis.fetch) {
  verificacao.resultado ??= await conferirExpiracaoS3(destino, env, { limiteDias }, f);
  if (!verificacao.resultado.ok) throw new ErroBackup('S3_SEM_EXPIRACAO', `Envio ao S3 recusado: ${verificacao.resultado.motivo}.`);
  const objeto = objetoEnvelope(cfg, carimbo);
  const claro = Buffer.from(JSON.stringify(envelope));
  const corpo = cifrarBackup(cfg.cifra, objeto, claro);
  await pedirS3(cfg, 'PUT', { objeto, corpo, cabecalhos: { 'content-type': 'application/octet-stream', 'x-amz-meta-sha256': sha256(claro), 'x-amz-meta-sha256-cifrado': sha256(corpo), 'x-amz-meta-formato': FORMATO,
    ...(cfg.sse ? { 'x-amz-server-side-encryption': cfg.sse } : {}) } }, f);
  return { objeto, impressao: envelope.impressao };
}
export async function baixarEnvelopeS3(cfg, objeto, f = globalThis.fetch) {
  const { gz } = await baixarBackupS3(cfg, objeto, f);   // mesma conferência de SHA-256 e cifra
  return JSON.parse(gz.toString('utf8'));
}
// Envelope mais novo no prefixo.
export const envelopeMaisNovo = itens => itens.filter(i => /(?:^|\/)chave-mestra\/envelope-\d{8}-\d{6}\.json\.enc$/.test(i.objeto)).sort((a, b) => (a.objeto < b.objeto ? 1 : -1))[0] || null;
