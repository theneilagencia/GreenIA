// Auditoria: devolve a pesquisa na internet da empresa de homologação ao estado original (desligada).
export default async function (c) {
  const antes = (await c.api('GET', '/api/admin/config')).dados?.pesquisaWeb || {};
  const r = await c.api('PUT', '/api/admin/config', { pesquisaWeb: { ...antes, ativa: false } });
  const depois = (await c.api('GET', '/api/admin/config')).dados?.pesquisaWeb || {};
  c.log('  pesquisa desligada:', r.status, `ativa=${!!depois.ativa}`);
}
