// Auditoria: liga a pesquisa na internet da empresa de homologação só durante um teste e restaura o valor anterior.
// Uso: rodar aud-pesquisa <plano.json> <ID>
import auditar from './aud-teste.mjs';
export default async function (c, plano, id) {
  const antes = (await c.api('GET', '/api/admin/config')).dados?.pesquisaWeb || { ativa: false };
  c.log(`  pesquisa antes: ativa=${!!antes.ativa}`);
  try {
    const r = await c.api('PUT', '/api/admin/config', { pesquisaWeb: { ...antes, ativa: true } });
    c.log(`  pesquisa ligada: ${r.status}`);
    await auditar(c, plano, id);
  } finally {
    const r = await c.api('PUT', '/api/admin/config', { pesquisaWeb: antes });
    c.log(`  pesquisa restaurada (ativa=${!!antes.ativa}): ${r.status}`);
  }
}
