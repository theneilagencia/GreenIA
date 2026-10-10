// Por que a execução com integração sai "inconsistente" (o que bloqueia a escrita)? Mostra a conferência.
export default async function (c) {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  const cfg0 = (await c.api('GET', '/api/admin/config')).dados?.integracoes;
  await c.api('PUT', '/api/admin/config', { integracoes: { ativa: true, pessoas: [c.CONTA], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: false } });
  try {
    const q = await criarQw(c, { nome: 'Integração diagnóstico', descricao: 'Consulte as tarefas no Sandbox Tarefas e registre uma nota de acompanhamento com o resumo no Sandbox Tarefas.' });
    c.log('entregaveis', JSON.stringify(q.reg.interpretar.entregaveis));
    const e = await executar(c, q.qw.id, 'Use as tarefas consultadas; a nota é do usuário 1 (dados públicos de teste).');
    c.log(JSON.stringify(e.exec.qualidade), JSON.stringify(e.exec.secoes));
    c.arquivo('ibq.md', e.bruto.linhas.filter(l => l.t === 'texto').map(l => l.v).join(''));
  } finally { await c.api('PUT', '/api/admin/config', { integracoes: cfg0 }); }
}
