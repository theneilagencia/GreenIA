// §17. Erros controláveis em produção sem mexer em configuração: mensagem vazia, texto grande demais, conversa
// inexistente, interrupção do cliente no meio da execução (estado preservado e nova tentativa segura).
export default async function (c, caso = '1') {
  const conv = c.estado.casos[Number(caso)]?.convUso;
  const out = {};
  out.vazia = await c.enviar(conv, { texto: '' }).then(r => ({ status: r.status, erro: r.erro?.slice(0, 160) || r.linhas.find(l => l.t === 'erro')?.mensagem || null }));
  out.grande = await c.enviar(conv, { texto: 'x'.repeat(400_000) }).then(r => ({ status: r.status, erro: r.erro?.slice(0, 160) || r.linhas.find(l => l.t === 'erro')?.mensagem || null }));
  out.inexistente = (await c.pedir('POST', '/api/conversas/999999/mensagens', { texto: 'oi' })).status;
  const antes = (await c.api('GET', `/api/conversas/${conv}`)).dados?.mensagens?.length;
  // Interrompe a leitura logo no início (o cliente "cai").
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 1500);
  try { await fetch(c.BASE + `/api/conversas/${conv}/mensagens`, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', cookie: c.cookiesNavegador().map(x => `${x.name}=${x.value}`).join('; '), 'x-csrf': '' }, body: JSON.stringify({ texto: 'resuma em uma frase' }) }); } catch { /* interrompido */ }
  clearTimeout(t);
  await new Promise(ok => setTimeout(ok, 15000));
  const depois = (await c.api('GET', `/api/conversas/${conv}`)).dados;
  out.interrompido = { mensagens_antes: antes, mensagens_depois: depois?.mensagens?.length, ultima: depois?.mensagens?.at(-1)?.papel || null };
  const r = await c.enviar(conv, { texto: 'resuma em uma frase' });
  out.nova_tentativa = { status: r.status, caracteres: r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('').length };
  c.salvar('08-erros', out); c.log(JSON.stringify(out));
}
