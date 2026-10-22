// Receptor de backup: serviço privado no Render ("greenia-backup", disco próprio) que guarda a cópia de cada backup
// fora do disco de produção. Fala o pedaço do protocolo S3 que src/backup-s3.js usa (PUT/GET/HEAD de objeto,
// ListObjectsV2, ciclo de vida, versionamento e Object Lock), com assinatura SigV4 conferida em todo pedido. Assim o
// cliente de backup não muda: cifra AES-256-GCM no servidor de produção, hash conferido no envio e na volta.
//
// - Guarda em disco (RECEPTOR_PASTA, padrão dados/receptor-backup): um arquivo por objeto + metadados, nome do arquivo
//   = SHA-256 da chave do objeto (nada da chave vira caminho).
// - Expiração própria e real: objetos com mais de RECEPTOR_DIAS (padrão 7, máximo 7) são apagados de hora em hora, e a
//   regra declarada em ?lifecycle é exatamente essa. Não há DELETE pela rede.
// - Sem versionamento e sem Object Lock (o cliente exige os dois assim para confiar no prazo).
// - Só escuta pedidos assinados com S3_CHAVE/S3_SEGREDO; /saude responde sem assinatura (contagem e bytes, sem nomes).
//
// Variáveis: S3_CHAVE, S3_SEGREDO (obrigatórias), S3_REGIAO (us-east-1), RECEPTOR_BUCKET (greenia-backups),
// RECEPTOR_DIAS (7), RECEPTOR_PASTA, PORT (10000), RECEPTOR_MAX_MB (512).
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assinarS3, ehCifrado } from './backup-s3.js';
import { blocoIncremental, ehIncremental, indiceIncremental } from './backup-incremental-formato.js';

const sha256 = d => createHash('sha256').update(d).digest('hex');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlErro = (codigo, msg = '') => `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${codigo}</Code><Message>${esc(msg)}</Message></Error>`;
const DESVIO_MAX_MS = 15 * 60e3;   // pedido assinado vale 15 min (como o S3)

export function criarReceptor({ pasta, bucket = 'greenia-backups', chave, segredo, regiao = 'us-east-1', dias = 7, maxBytes = 512 * 1024 * 1024,
  agora = () => new Date(), relogio = agora, log = console.log } = {}) {
  // agora: data gravada e expiração; relogio: conferência da validade da assinatura (separados só nos testes).
  if (!chave || !segredo) throw new Error('Receptor de backup precisa de S3_CHAVE e S3_SEGREDO.');
  if (!(dias >= 1 && dias <= 7)) throw new Error('RECEPTOR_DIAS precisa estar entre 1 e 7.');
  const raiz = resolve(pasta); const objs = join(raiz, 'objetos'); mkdirSync(objs, { recursive: true });
  // Só arquivos de estágio, antes de aceitar conexões. Objetos e metadados
  // confirmados continuam sujeitos exclusivamente à retenção configurada.
  let temporariosRemovidos = 0;
  for (const e of readdirSync(objs, { withFileTypes: true })) {
    if (e.isFile() && /^[a-f0-9]{64}(?:\.\d+|\.json)\.tmp$/.test(e.name)) {
      rmSync(join(objs, e.name)); temporariosRemovidos++;
    }
  }
  if (temporariosRemovidos) log(`receptor: ${temporariosRemovidos} arquivo(s) temporário(s) de upload incompleto removido(s)`);
  const arq = k => join(objs, sha256(k));
  const lerMeta = n => { try { return JSON.parse(readFileSync(join(objs, n), 'utf8')); } catch { return null; } };
  const todos = () => readdirSync(objs).filter(n => n.endsWith('.json')).map(lerMeta).filter(Boolean);
  const lifecycle = `<?xml version="1.0" encoding="UTF-8"?><LifecycleConfiguration><Rule><ID>expira-backups</ID><Filter><Prefix></Prefix></Filter><Status>Enabled</Status><Expiration><Days>${dias}</Days></Expiration></Rule></LifecycleConfiguration>`;

  // Expiração: apaga do disco o que passou do prazo (é a regra que o ?lifecycle declara).
  function expirar() {
    const limite = agora().getTime() - dias * 864e5; let n = 0;
    // Primeiro expiram os pontos de recuperação; blocos só saem quando nenhum
    // ponto válido depende deles. Uma cópia nova não renova o histórico antigo.
    const metas = todos(), refs = new Set();
    let seguro = !readdirSync(objs).filter(x => x.endsWith('.json')).some(x => !lerMeta(x));
    for (const m of metas) {
      if (blocoIncremental(m.chave)) continue;
      if (Date.parse(m.em) < limite) { rmSync(arq(m.chave), { force: true }); rmSync(arq(m.chave) + '.json', { force: true }); n++; }
      else if (m.incremental) {
        try { for (const k of indiceIncremental(readFileSync(arq(m.chave)), m.chave).refs) refs.add(k); }
        catch { seguro = false; }
      }
    }
    // Margem para upload em andamento/interrompido; o índice é publicado por último.
    if (seguro) for (const m of metas) if (blocoIncremental(m.chave) && !refs.has(m.chave) && Date.parse(m.em) < agora().getTime() - 3600e3) {
      rmSync(arq(m.chave), { force: true }); rmSync(arq(m.chave) + '.json', { force: true }); n++;
    }
    if (!seguro) log('receptor: coleta de blocos suspensa por índice/metadados inválidos');
    if (n) log(`receptor: ${n} objeto(s) expirado(s) após ${dias} dias`);
    return n;
  }
  function uso() { const t = todos(); return { objetos: t.length, bytes: t.reduce((s, m) => s + (m.tamanho || 0), 0) }; }

  const servidor = createServer((req, res) => {
    const responder = (status, xml = '', cab = {}) => { if (res.headersSent) return; res.writeHead(status, { 'content-type': 'application/xml', ...cab }); res.end(req.method === 'HEAD' ? undefined : xml); };
    const u = new URL(req.url, 'http://receptor');
    if (req.method === 'GET' && (u.pathname === '/saude' || u.pathname === '/api/saude' || u.pathname === '/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, dias, ...uso() })); }
    const partes = []; let tamanho = 0, grande = false;
    req.on('data', d => { tamanho += d.length; if (tamanho > maxBytes) { grande = true; req.destroy(); } else partes.push(d); });
    req.on('error', () => {});
    req.on('end', () => {
      if (grande) return responder(413, xmlErro('EntityTooLarge'));
      const corpo = Buffer.concat(partes);
      const auth = String(req.headers.authorization || '');
      const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
      if (!m || m[1] !== chave || m[3] !== regiao) return responder(403, xmlErro('InvalidAccessKeyId'));
      const hashCorpo = req.headers['x-amz-content-sha256'];
      if (hashCorpo !== sha256(corpo)) return responder(400, xmlErro('XAmzContentSHA256Mismatch'));
      const d = String(req.headers['x-amz-date'] || '');
      const quando = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
      if (!(Math.abs(relogio().getTime() - quando.getTime()) <= DESVIO_MAX_MS)) return responder(403, xmlErro('RequestTimeTooSkewed'));
      const assinados = m[4].split(';');
      const cab = Object.fromEntries(assinados.filter(n => !['host', 'x-amz-content-sha256', 'x-amz-date'].includes(n)).map(n => [n, req.headers[n]]));
      const urlAssinada = `http://${req.headers.host}${req.url}`;
      if (assinarS3({ metodo: req.method, url: urlAssinada, cabecalhos: cab, hashCorpo, chave, segredo, regiao, agora: quando }).authorization !== auth) return responder(403, xmlErro('SignatureDoesNotMatch'));
      const [, b, ...resto] = decodeURIComponent(u.pathname).split('/');
      const objeto = resto.join('/');
      const q = Object.fromEntries(u.searchParams);
      if (b !== bucket) return responder(404, xmlErro('NoSuchBucket'));
      try {
        if (!objeto) {
          if (req.method !== 'GET') return responder(405, xmlErro('MethodNotAllowed'));
          if ('greenia-incremental' in q) return responder(200, JSON.stringify({ v: 1, retencao: 'referencias' }), { 'content-type': 'application/json' });
          if ('lifecycle' in q) return responder(200, lifecycle);
          if ('object-lock' in q) return responder(404, xmlErro('ObjectLockConfigurationNotFoundError'));
          if ('versioning' in q) return responder(200, '<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration></VersioningConfiguration>');
          if (q['list-type'] === '2') {
            const max = Math.min(1000, Number(q['max-keys']) || 1000);
            const lista = todos().filter(x => x.chave.startsWith(q.prefix || '')).sort((x, y) => x.chave.localeCompare(y.chave));
            const ini = q['continuation-token'] ? Number(Buffer.from(q['continuation-token'], 'base64').toString()) || 0 : 0;
            const pagina = lista.slice(ini, ini + max), truncado = ini + max < lista.length;
            return responder(200, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${esc(bucket)}</Name><Prefix>${esc(q.prefix || '')}</Prefix><KeyCount>${pagina.length}</KeyCount><IsTruncated>${truncado}</IsTruncated>`
              + (truncado ? `<NextContinuationToken>${Buffer.from(String(ini + max)).toString('base64')}</NextContinuationToken>` : '')
              + pagina.map(x => `<Contents><Key>${esc(x.chave)}</Key><LastModified>${x.em}</LastModified><Size>${x.tamanho}</Size></Contents>`).join('') + '</ListBucketResult>');
          }
          return responder(400, xmlErro('InvalidRequest'));
        }
        if (objeto.length > 1024) return responder(400, xmlErro('KeyTooLongError'));
        if (req.method === 'PUT') {
          if (req.headers['x-amz-server-side-encryption']) return responder(501, xmlErro('NotImplemented', 'sem SSE: os objetos já chegam cifrados no cliente'));
          const meta = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith('x-amz-meta-')));
          const f = arq(objeto), tmp = `${f}.${process.pid}.tmp`;
          const incremental = ehIncremental(corpo);
          if (blocoIncremental(objeto)) {
            if (existsSync(f)) {
              const anterior = lerMeta(sha256(objeto) + '.json');
              // Bloco íntegro é imutável. Um bloco corrompido pode ser reparado
              // pelo cliente autenticado, com a mesma publicação atômica.
              if (anterior?.sha256 === anterior?.meta?.['x-amz-meta-sha256-cifrado'] && sha256(readFileSync(f)) === anterior?.sha256) return responder(409, xmlErro('ImmutableBlock'));
            }
            if (!ehCifrado(corpo) || corpo.length > 262144 + 4096 || meta['x-amz-meta-formato'] !== 'greenia-aes256gcm-v1' || meta['x-amz-meta-sha256-cifrado'] !== sha256(corpo) || !/^[a-f0-9]{64}$/.test(meta['x-amz-meta-raw-sha256'] || '') || !(+meta['x-amz-meta-raw-bytes'] > 0 && +meta['x-amz-meta-raw-bytes'] <= 262144))
              return responder(400, xmlErro('InvalidBlock'));
          }
          if (incremental) {
            let indice; try { indice = indiceIncremental(corpo, objeto); } catch { return responder(400, xmlErro('InvalidIncrementalIndex')); }
            // Recusa publicação com bloco ausente ou corrompido. Nunca confirma
            // um novo ponto de recuperação que já nasce sem suas dependências.
            for (const k of indice.refs) {
              const m = lerMeta(sha256(k) + '.json');
              if (!m || m.chave !== k || !existsSync(arq(k)) || sha256(readFileSync(arq(k))) !== m.sha256) return responder(409, xmlErro('MissingOrCorruptBlock'));
            }
            if (meta['x-amz-meta-sha256-cifrado'] !== sha256(corpo)) return responder(400, xmlErro('InvalidIncrementalHash'));
          }
          try {
            writeFileSync(tmp, corpo);
            // Reserva também a escrita dos metadados antes de substituir um
            // objeto existente: ENOSPC nesta etapa preserva a cópia anterior.
            writeFileSync(`${f}.json.tmp`, JSON.stringify({ chave: objeto, meta, tamanho: corpo.length, em: agora().toISOString(), sha256: sha256(corpo), ...(incremental ? { incremental: true } : {}) }));
            renameSync(tmp, f);
            renameSync(`${f}.json.tmp`, `${f}.json`);
          } finally {
            rmSync(tmp, { force: true });
            rmSync(`${f}.json.tmp`, { force: true });
          }
          return responder(200, '', { etag: `"${createHash('md5').update(corpo).digest('hex')}"` });
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
          const f = arq(objeto), me = existsSync(`${f}.json`) && lerMeta(`${sha256(objeto)}.json`);
          if (!me || me.chave !== objeto || !existsSync(f)) return responder(404, xmlErro('NoSuchKey'));
          if (blocoIncremental(objeto) && (me.sha256 !== me.meta['x-amz-meta-sha256-cifrado'] || sha256(readFileSync(f)) !== me.sha256)) return responder(500, xmlErro('CorruptBlock'), { 'x-greenia-erro': 'CorruptBlock' });
          res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(f).size, 'last-modified': new Date(me.em).toUTCString(), ...me.meta });
          return res.end(req.method === 'HEAD' ? undefined : readFileSync(f));
        }
        if (req.method === 'DELETE') return responder(403, xmlErro('AccessDenied', 'o receptor não apaga pela rede; a expiração é automática'));
        return responder(405, xmlErro('MethodNotAllowed'));
      } catch (e) {
        log(`receptor: erro ${e.code || 'interno'}`);
        return responder(e.code === 'ENOSPC' ? 507 : 500, xmlErro(e.code === 'ENOSPC' ? 'InsufficientStorage' : 'InternalError'));
      }
    });
  });
  return { servidor, expirar, uso, raiz };
}

// Execução no Render: node src/receptor-backup.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  const r = criarReceptor({ pasta: env.RECEPTOR_PASTA || 'dados/receptor-backup', bucket: env.RECEPTOR_BUCKET || 'greenia-backups', chave: env.S3_CHAVE, segredo: env.S3_SEGREDO,
    regiao: env.S3_REGIAO || 'us-east-1', dias: Number(env.RECEPTOR_DIAS || 7), maxBytes: Number(env.RECEPTOR_MAX_MB || 512) * 1024 * 1024 });
  r.expirar(); setInterval(() => { try { r.expirar(); } catch (e) { console.log('receptor: expiração falhou', e.code || ''); } }, 3600e3).unref();
  const porta = Number(env.PORT || 10000);
  r.servidor.listen(porta, '0.0.0.0', () => console.log(`Receptor de backup na porta ${porta}: ${JSON.stringify(r.uso())}, expiração ${env.RECEPTOR_DIAS || 7} dias.`));
  process.on('SIGTERM', () => r.servidor.close(() => process.exit(0)));
}
