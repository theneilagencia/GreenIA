// S3 falso (só para testes e para o ensaio sintético): servidor HTTP local, em memória, que confere a assinatura
// SigV4 e o x-amz-content-sha256 de cada pedido e responde como o S3 a PUT/GET/HEAD de objeto, ListObjectsV2,
// GetBucketLifecycleConfiguration e GetBucketVersioning. DELETE é recusado (a política IAM proposta não o concede).
// Nada sai da máquina: escuta em 127.0.0.1, porta livre.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { assinarS3 } from '../../src/backup-s3.js';

const sha256 = d => createHash('sha256').update(d).digest('hex');
const xmlErro = (codigo, msg = '') => `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${codigo}</Code><Message>${msg}</Message></Error>`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Regra de ciclo de vida no formato do S3.
export function regraLifecycle({ dias = null, ncDias = null, prefixo = '', status = 'Enabled', filtro = null, id = 'expira-backups' } = {}) {
  const f = filtro ?? `<Filter><Prefix>${esc(prefixo)}</Prefix></Filter>`;
  return `<Rule><ID>${id}</ID>${f}<Status>${status}</Status>${dias != null ? `<Expiration><Days>${dias}</Days></Expiration>` : ''}${ncDias != null ? `<NoncurrentVersionExpiration><NoncurrentDays>${ncDias}</NoncurrentDays></NoncurrentVersionExpiration>` : ''}</Rule>`;
}
export const lifecycleXml = (...regras) => `<?xml version="1.0" encoding="UTF-8"?><LifecycleConfiguration>${regras.join('')}</LifecycleConfiguration>`;

export async function subirS3Falso({ bucket = 'greenia-backups', chave = 'AKIAENSAIOFALSO', segredo = 'segredo-do-s3-falso-apenas-local', regiao = 'us-east-1', lifecycle = null, versionamento = null,
  confirmarSse = true, maxChaves = 1000 } = {}) {
  const objetos = new Map();
  const pedidos = [];
  const estado = { lifecycle, versionamento, confirmarSse, corromper: null };
  const servidor = createServer((req, res) => {
    const partes = [];
    req.on('data', d => partes.push(d));
    req.on('end', () => {
      const corpo = Buffer.concat(partes);
      const u = new URL(`http://${req.headers.host}${req.url}`);
      const q = Object.fromEntries(u.searchParams);
      pedidos.push({ metodo: req.method, caminho: decodeURIComponent(u.pathname), query: u.search.slice(1), cabecalhos: { ...req.headers } });
      const responder = (status, xml = '', cab = {}) => { res.writeHead(status, { 'content-type': 'application/xml', ...cab }); res.end(req.method === 'HEAD' ? undefined : xml); };
      // Assinatura: recalcula com os cabeçalhos assinados e confere.
      const auth = String(req.headers.authorization || '');
      const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
      if (!m || m[1] !== chave || m[3] !== regiao) return responder(403, xmlErro('InvalidAccessKeyId'));
      const hashCorpo = req.headers['x-amz-content-sha256'];
      if (hashCorpo !== sha256(corpo)) return responder(400, xmlErro('XAmzContentSHA256Mismatch'));
      const assinados = m[4].split(';');
      const cab = Object.fromEntries(assinados.filter(n => !['host', 'x-amz-content-sha256', 'x-amz-date'].includes(n)).map(n => [n, req.headers[n]]));
      const d = req.headers['x-amz-date'];
      const agora = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
      const esperado = assinarS3({ metodo: req.method, url: u.toString(), cabecalhos: cab, hashCorpo, chave, segredo, regiao, agora });
      if (esperado.authorization !== auth) return responder(403, xmlErro('SignatureDoesNotMatch'));
      const [, b, ...resto] = decodeURIComponent(u.pathname).split('/');
      const objeto = resto.join('/');
      if (b !== bucket) return responder(404, xmlErro('NoSuchBucket'));
      if (!objeto) {
        if (req.method !== 'GET') return responder(405, xmlErro('MethodNotAllowed'));
        if ('lifecycle' in q) return estado.lifecycle ? responder(200, estado.lifecycle) : responder(404, xmlErro('NoSuchLifecycleConfiguration'));
        if ('versioning' in q) return responder(200, `<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration>${estado.versionamento ? `<Status>${estado.versionamento}</Status>` : ''}</VersioningConfiguration>`);
        if (q['list-type'] === '2') {
          const todos = [...objetos.keys()].filter(k => k.startsWith(q.prefix || '')).sort();
          const ini = q['continuation-token'] ? Number(Buffer.from(q['continuation-token'], 'base64').toString()) : 0;
          const pagina = todos.slice(ini, ini + maxChaves), truncado = ini + maxChaves < todos.length;
          return responder(200, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${esc(q.prefix || '')}</Prefix><KeyCount>${pagina.length}</KeyCount><IsTruncated>${truncado}</IsTruncated>`
            + (truncado ? `<NextContinuationToken>${Buffer.from(String(ini + maxChaves)).toString('base64')}</NextContinuationToken>` : '')
            + pagina.map(k => `<Contents><Key>${esc(k)}</Key><LastModified>${objetos.get(k).em}</LastModified><Size>${objetos.get(k).corpo.length}</Size></Contents>`).join('') + '</ListBucketResult>');
        }
        return responder(400, xmlErro('InvalidRequest'));
      }
      if (req.method === 'PUT') {
        const meta = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith('x-amz-meta-')));
        const sse = req.headers['x-amz-server-side-encryption'] || null;
        objetos.set(objeto, { corpo, meta, sse, em: new Date().toISOString() });
        return responder(200, '', { etag: `"${createHash('md5').update(corpo).digest('hex')}"`, ...(sse && estado.confirmarSse ? { 'x-amz-server-side-encryption': sse } : {}) });
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const o = objetos.get(objeto);
        if (!o) return responder(404, xmlErro('NoSuchKey'));
        const dados = estado.corromper === objeto ? Buffer.concat([o.corpo.subarray(0, -1), Buffer.from([o.corpo.at(-1) ^ 1])]) : o.corpo;
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': dados.length, ...o.meta, ...(o.sse ? { 'x-amz-server-side-encryption': o.sse } : {}) });
        return res.end(req.method === 'HEAD' ? undefined : dados);
      }
      if (req.method === 'DELETE') return responder(403, xmlErro('AccessDenied', 'a política não concede s3:DeleteObject'));
      return responder(405, xmlErro('MethodNotAllowed'));
    });
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${servidor.address().port}`;
  return {
    endpoint, bucket, objetos, pedidos, estado,
    env: (prefixo = 'greenia') => ({ BACKUP_DESTINO: `s3://${bucket}/${prefixo}`, S3_ENDPOINT: endpoint, S3_CHAVE: chave, S3_SEGREDO: segredo, S3_REGIAO: regiao }),
    fechar: () => new Promise(r => { servidor.close(r); servidor.closeAllConnections?.(); }),
  };
}
