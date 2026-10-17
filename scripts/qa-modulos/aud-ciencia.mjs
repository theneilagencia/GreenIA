// Registra a ciência da política atual (como a pessoa faria no aviso "A política mudou") para a conta de QA.
export default async function (c) {
  const p = (await c.api('GET', '/api/politica')).dados;
  if (!p?.cienciaPendente) return c.log('  ciência: nada pendente, versão', p?.versao);
  c.log('  ciência versão', p.versao, (await c.api('POST', '/api/politica/ciencia', { versao: p.versao })).status);
}
