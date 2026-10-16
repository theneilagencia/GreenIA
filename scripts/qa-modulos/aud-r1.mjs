// Produção (homologação): o pedido real que falhou (PPTX + PDF de referência de layout + contrato com CPF), com a
// política da empresa protegendo CPF como na empresa onde falhou. A política volta ao valor anterior no fim.
export default async function (c, plano, id = 'R1') {
  const antes = (await c.api('GET', '/api/admin/config')).dados?.acoesChat || {};
  c.log('  cpf antes:', antes.cpf);
  try {
    c.log('  cpf proteger:', (await c.api('PUT', '/api/admin/config', { acoesChat: { ...antes, cpf: 'proteger' } })).status);
    // Carregado a cada execução: a sessão de QA guarda em cache os módulos importados de forma estática.
    const { default: auditar } = await import(`./aud-teste.mjs?v=${Date.now()}`);
    await auditar(c, plano, id);
  } finally {
    c.log('  cpf restaurado:', (await c.api('PUT', '/api/admin/config', { acoesChat: antes })).status, antes.cpf);
  }
}
