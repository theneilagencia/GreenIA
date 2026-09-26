// Cliente HTTP que fala com a GreenIA como um navegador (cookie de sessão e CSRF).
// Usado pelos testes, pelas capturas e pela demonstração.
export function cliente(app, base) {
  let cookie = '', csrf = '';
  const c = {
    async req(metodo, caminho, corpo, extra = {}) {
      const r = await fetch(base + caminho, {
        method: metodo,
        headers: { ...(cookie ? { cookie } : {}), ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' && csrf ? { 'x-csrf': csrf } : {}), ...extra },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      const sc = r.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const texto = await r.text();
      let dados; try { dados = JSON.parse(texto); } catch { dados = texto; }
      return { status: r.status, dados, headers: r.headers };
    },
    get: (p, e) => c.req('GET', p, undefined, e),
    post: (p, b, e) => c.req('POST', p, b ?? {}, e),
    put: (p, b) => c.req('PUT', p, b ?? {}),
    patch: (p, b) => c.req('PATCH', p, b ?? {}),
    del: p => c.req('DELETE', p, {}),
    async entrar(email, op = {}) {
      await c.post('/api/login/codigo', { email });
      const msg = app.email.enviados.filter(m => m.para === email).at(-1);
      const codigo = /(\d{6})/.exec(msg.assunto)[1];
      const r = await c.post('/api/login/entrar', { email, codigo });
      if (r.status !== 200) throw new Error('login falhou: ' + JSON.stringify(r.dados));
      csrf = r.dados.csrf;
      if (!op.semCiencia) await c.post('/api/politica/ciencia', { versao: (await c.get('/api/politica')).dados.versao });
      c.pessoa = (await c.get('/api/eu')).dados.pessoa;
      return c;
    },
    get csrf() { return csrf; },
    set csrf(v) { csrf = v; },
  };
  return c;
}
