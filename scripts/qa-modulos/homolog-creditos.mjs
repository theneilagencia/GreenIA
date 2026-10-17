// Créditos visíveis em produção: o que /api/eu devolve do plano e a resposta do chat à dúvida de créditos.
// Uso: rodar homolog-creditos
export default async function (c) {
  const eu = (await c.api('GET', '/api/eu')).dados;
  c.log(`  plano: ${JSON.stringify(eu.plano ? { fase: eu.plano.fase, percentual: eu.plano.percentual, renova: eu.plano.renova, ilimitado: eu.plano.ilimitado, mensagem: eu.plano.mensagem } : null)}`);
  const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa.id;
  const r = await c.enviar(conv, { texto: 'como são os créditos no GreenIA? Eu vivo estourando no Claude... se por acaso um cliente estoura ele consegue comprar da mesma forma que compraria no Claude?' });
  const texto = r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
  const final = r.linhas.find(l => l.t === 'substituir')?.v || texto;
  c.arquivo('resposta-creditos.md', final);
  c.log(`  chat: ${r.status} ${final.length} caracteres; menciona administrador=${/administrador/i.test(final)} renovação=${/renova/i.test(final)} dólar=${/US\$|\$\s?\d/.test(final)}`);
  c.salvar('creditos', { plano: eu.plano || null, status: r.status });
}
