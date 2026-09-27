// Ajuda dos testes multiempresa: sobe a plataforma e um navegador simples com vários cookies e cabeçalho Host.
import { request } from 'node:http';
import { criarPlataforma } from '../src/plataforma/servidor.js';

export async function subirPlataforma(op = {}) {
  const P = criarPlataforma({ cookieSeguro: false, log: () => {}, admins: ['ops@theneil.com.br'], hostPlataforma: 'plataforma.teste', urlBase: 'http://plataforma.teste', ...op });
  await new Promise(r => P.servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${P.servidor.address().port}`;
  return { P, base, fechar: () => new Promise(r => { P.servidor.close(r); P.servidor.closeAllConnections?.(); }), navegador: (host = 'plataforma.teste') => navegador(P, base, host) };
}

export function navegador(P, base, host) {
  const jar = new Map();
  let csrf = '';
  const n = {
    host,
    // node:http em vez de fetch: o fetch ignora o cabeçalho Host, e aqui ele decide a empresa.
    req(metodo, caminho, corpo, extra = {}) {
      const u = new URL(base + caminho);
      const dados = corpo !== undefined ? JSON.stringify(corpo) : null;
      const headers = { host: n.host, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...(dados ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados) } : {}), ...(metodo !== 'GET' && csrf ? { 'x-csrf': csrf } : {}), ...extra };
      return new Promise((ok, falha) => {
        const q = request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers }, r => {
          const partes = [];
          r.on('data', c => partes.push(c));
          r.on('end', () => {
            for (const sc of [].concat(r.headers['set-cookie'] || [])) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
            const texto = Buffer.concat(partes).toString('utf8');
            let d; try { d = JSON.parse(texto); } catch { d = texto; }
            ok({ status: r.statusCode, dados: d, headers: { get: h => r.headers[h.toLowerCase()] ?? null } });
          });
        });
        q.on('error', falha);
        if (dados) q.write(dados);
        q.end();
      });
    },
    get: (p, e) => n.req('GET', p, undefined, e),
    post: (p, b, e) => n.req('POST', p, b ?? {}, e),
    put: (p, b) => n.req('PUT', p, b ?? {}),
    del: p => n.req('DELETE', p, {}),
    ultimoCodigo: email => /(\d{6})/.exec(P.email.enviados.filter(m => m.para === email).at(-1).assunto)[1],
    async entrarConsole(email) {
      await n.post('/api/plataforma/login/codigo', { email });
      const r = await n.post('/api/plataforma/login/entrar', { email, codigo: n.ultimoCodigo(email) });
      if (r.status !== 200) throw new Error('login do console falhou: ' + JSON.stringify(r.dados));
      csrf = r.dados.csrf;
      return n;
    },
    async entrarEmpresa(email, { ciencia = true } = {}) {
      const c = await n.post('/api/login/codigo', { email });
      if (c.status !== 200) return c;
      const r = await n.post('/api/login/entrar', { email, codigo: n.ultimoCodigo(email) });
      if (r.status !== 200) return r;
      csrf = r.dados.csrf;
      if (ciencia) await n.post('/api/politica/ciencia', { versao: (await n.get('/api/politica')).dados.versao });
      return r;
    },
    cookies: jar,
    get csrf() { return csrf; }, set csrf(v) { csrf = v; },
  };
  return n;
}
