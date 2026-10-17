// Diagnóstico do navegador de composição em produção (rota admin) e conferência da sessão.
export default async function (c) {
  const eu = await c.api('GET', '/api/eu');
  const d = await c.api('GET', '/api/admin/visual/diagnostico');
  c.salvar('21-diag', { eu: eu.status, diag: d });
  c.log('eu', eu.status, 'diag', d.status, JSON.stringify(d.dados).slice(0, 800));
}
