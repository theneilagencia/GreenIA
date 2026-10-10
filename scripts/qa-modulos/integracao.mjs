// §12. Integration Builder com APIs públicas de sandbox (JSONPlaceholder: escrita simulada pelo serviço; httpbin).
// Liga o recurso SÓ para esta conta durante o teste e devolve a configuração anterior no fim.
const JP = 'https://jsonplaceholder.typicode.com', HB = 'https://httpbin.org';
const TAREFA = { type: 'object', required: ['id', 'title', 'completed'], properties: { userId: { type: 'integer' }, id: { type: 'integer' }, title: { type: 'string' }, completed: { type: 'boolean' } } };
const SPEC = { openapi: '3.0.3', info: { title: 'Sandbox Tarefas' }, servers: [{ url: JP }], paths: {
  '/todos': { get: { operationId: 'listarTarefas', summary: 'Tarefas', parameters: [{ name: 'userId', in: 'query', schema: { type: 'integer' } }], responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: TAREFA } } } } } } },
  '/posts': { post: { operationId: 'registrarNota', summary: 'Notas de acompanhamento', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['title', 'body', 'userId'], properties: { title: { type: 'string' }, body: { type: 'string' }, userId: { type: 'integer' } } } } } }, responses: { 201: { content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } } } } } },
  '/posts/{id}': { delete: { operationId: 'apagarNota', summary: 'Apagar nota', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } } } } };
const HBSPEC = (t, ops) => ({ openapi: '3.0.3', info: { title: t }, servers: [{ url: HB }], paths: Object.fromEntries(ops.map(([id, p, s]) => [p, { get: { operationId: id, summary: id, responses: { 200: { content: { 'application/json': { schema: s || { type: 'object' } } } } } } }])) });
export default async function (c, fase = 'tudo') {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  c.destino ||= c.eu.quickWins?.areas?.length ? { areas: [c.eu.quickWins.areas[0].id] } : { toda_empresa: true };
  const R = c.estado.ib ||= { checks: [] };
  const ok = (k, v, d) => { R.checks.push({ k, ok: !!v, d }); c.log(`  ${v ? 'OK ' : 'FALHA'} ${k}: ${String(d).slice(0, 220)}`); };
  const cfg0 = (await c.api('GET', '/api/admin/config')).dados?.integracoes;
  R.config_anterior = cfg0;
  try {
    // Recurso desligado: um pedido com integração vira Quick Win comum (sem bloquear).
    const desl = await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao: 'Consulte as tarefas no Sandbox Tarefas e faça um resumo.' });
    ok('desligado_nao_bloqueia', desl.status === 200 && !desl.dados.integracoes, `status ${desl.status} integracoes=${JSON.stringify(desl.dados?.integracoes || null)}`);
    ok('ligar', (await c.api('PUT', '/api/admin/config', { integracoes: { ativa: true, pessoas: [c.CONTA], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: false } })).status === 200, 'só para a conta de QA');
    const conector = async (nome, spec, escolhas, config = {}) => {
      const d = await c.api('POST', '/api/admin/integracoes/descobrir', { especificacao: JSON.stringify(spec) });
      const k = await c.api('POST', '/api/admin/integracoes', { nome: `QA - ${nome}`, sistema: nome, base_url: d.dados.base_url, auth_type: 'none', operacoes: d.dados.operacoes, config: { timeout_ms: 8000, ...config } });
      c.estado.criados.conectores.push(k.dados.id);
      await c.api('PUT', `/api/admin/integracoes/${k.dados.id}/capabilities`, { escolhas });
      const t = (await c.api('POST', `/api/admin/integracoes/${k.dados.id}/testar`, {})).dados;
      let status = null;
      if (t.passou) { await c.api('POST', `/api/admin/integracoes/aprovacoes/${t.aprovacao.id}/decidir`, { aprovar: true }); status = (await c.api('POST', `/api/admin/integracoes/${k.dados.id}/publicar`, {})).dados?.status; }
      return { id: k.dados.id, t, status };
    };
    const tar = await conector('Sandbox Tarefas', SPEC, [{ operation_id: 'listarTarefas' }, { operation_id: 'registrarNota' }, { operation_id: 'apagarNota' }]);
    ok('C_conector_read_publicado', tar.status === 'ACTIVE', `teste=${tar.t.passou} ${JSON.stringify(tar.t.resultados.map(r => [r.nome, r.status]))}`);
    ok('D_write_simulado_no_teste', tar.t.resultados.filter(r => r.modo === 'write').every(r => r.status === 'SIMULATED'), 'escritas simuladas');
    // A/B: capability existente e ausente (✓ / ⚠ / ✕).
    const res = (await c.api('POST', '/api/integracoes/necessidades', { descricao: 'Consulte as tarefas no Sandbox Tarefas, registre uma nota no Sandbox Tarefas, apague a nota 1 no Sandbox Tarefas e consulte os pedidos no ERP.' })).dados?.necessidades || [];
    ok('A_B_resolucao', JSON.stringify(res.map(n => n.estado)) === JSON.stringify(['disponivel', 'requer_aprovacao', 'nao_permitido', 'configurar']), JSON.stringify(res.map(n => [n.categoria, n.sistema, n.estado])));
    // C/D/E/F com Quick Win: leitura executa; escrita espera aprovação; aprovar executa; negar bloqueia.
    const q = await criarQw(c, { nome: 'Integração leitura e escrita', descricao: 'Consulte as tarefas no Sandbox Tarefas e registre uma nota de acompanhamento com o resumo no Sandbox Tarefas.' });
    ok('QW_mostra_capabilities', !!q.it?.integracoes, JSON.stringify(q.it?.integracoes?.map(n => [n.categoria, n.estado]) || null));
    const e1 = await executar(c, q.qw.id, 'Use as tarefas consultadas; a nota é do usuário 1 (dados públicos de teste).');
    const ps = e1.exec.integracoes?.passos || [];
    ok('C_leitura_executa', ps[0]?.status === 'SUCCESS', JSON.stringify(ps));
    ok('D_escrita_aprovacao', ps[1]?.status === 'APPROVAL_REQUIRED' || e1.exec.integracoes?.motivo === 'resultado_nao_conferido', `${JSON.stringify(ps[1])} q=${e1.exec.qualidade?.status}`);
    if (ps[1]?.aprovacao) {
      await c.api('POST', `/api/admin/integracoes/aprovacoes/${ps[1].aprovacao}/decidir`, { aprovar: true });
      const ex = (await c.api('POST', `/api/integracoes/planos/${e1.exec.integracoes.plano}/executar`, {})).dados;
      ok('E_aprovada_executa', ex?.passos?.[1]?.status === 'SUCCESS', JSON.stringify(ex?.passos?.map(p => p.status)));
    }
    const e2 = await executar(c, q.qw.id, 'Mesmo material; outra nota do usuário 1 (teste).');
    const p2 = e2.exec.integracoes?.passos?.[1];
    if (p2?.aprovacao) {
      await c.api('POST', `/api/admin/integracoes/aprovacoes/${p2.aprovacao}/decidir`, { aprovar: false, motivo: 'QA negação' });
      const ex = (await c.api('POST', `/api/integracoes/planos/${e2.exec.integracoes.plano}/executar`, {})).dados;
      ok('F_negada_nao_executa', ex?.passos?.[1]?.status !== 'SUCCESS', JSON.stringify(ex?.passos?.map(p => p.status)));
    } else ok('F_negada_nao_executa', false, `sem aprovação pendente: ${JSON.stringify(e2.exec.integracoes)}`);
    // G/H/I: falha (503), tempo esgotado, esquema.
    const g = await conector('Sandbox Falha', HBSPEC('Sandbox Falha', [['indisponivel', '/status/503']]), [{ operation_id: 'indisponivel' }], { max_tentativas: 2, backoff_ms: 200 });
    ok('G_falha_controlada', g.t.resultados[0]?.status === 'FAILED' && g.t.resultados[0]?.tentativas >= 2 && !g.t.passou, JSON.stringify(g.t.resultados[0]));
    const h = await conector('Sandbox Lento', HBSPEC('Sandbox Lento', [['lento', '/delay/6']]), [{ operation_id: 'lento' }], { timeout_ms: 2000, max_tentativas: 1 });
    ok('H_tempo_esgotado', h.t.resultados[0]?.erro === 'tempo_esgotado', JSON.stringify(h.t.resultados[0]));
    const i = await conector('Sandbox Esquema', { ...HBSPEC('Sandbox Esquema', []), servers: [{ url: JP }], paths: { '/todos/1': { get: { operationId: 'tarefaUm', summary: 'Tarefa', responses: { 200: { content: { 'application/json': { schema: { type: 'object', required: ['id', 'nome_cliente'], properties: { id: { type: 'integer' }, nome_cliente: { type: 'string' } } } } } } } } } } }, [{ operation_id: 'tarefaUm' }]);
    ok('I_esquema', i.t.resultados[0]?.erro === 'resposta_fora_do_esquema', JSON.stringify(i.t.resultados[0]));
    // J: reuso — outro Quick Win usa a mesma capability.
    const q2 = await criarQw(c, { nome: 'Integração reuso', descricao: 'Busque as tarefas no Sandbox Tarefas e liste as pendências do usuário 2.' });
    ok('J_reuso', q2.it?.integracoes?.[0]?.capability_id && q2.it.integracoes[0].capability_id === q.it?.integracoes?.[0]?.capability_id, JSON.stringify(q2.it?.integracoes?.map(n => [n.capability_id, n.estado])));
    // Ligado, um Quick Win comum continua sem etapa extra.
    const comum = await criarQw(c, { nome: 'Comum com recurso ligado', descricao: 'Escreva um comunicado curto sobre a troca de horário do refeitório.' });
    const ec = await executar(c, comum.qw.id, 'Novo horário 11h às 14h a partir de 13/10 (fictício).');
    ok('ligado_nao_bloqueia_comum', !comum.it?.integracoes && !ec.exec.integracoes && ['aprovado', 'corrigido', 'parcial'].includes(ec.exec.qualidade?.status), `q=${ec.exec.qualidade?.status} integ=${JSON.stringify(ec.exec.integracoes)}`);
  } finally {
    const r = await c.api('PUT', '/api/admin/config', { integracoes: cfg0 || { ativa: false, pessoas: [], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: false } });
    c.log(`  config de integrações devolvida: ${r.status} ativa=${(await c.api('GET', '/api/admin/config')).dados?.integracoes?.ativa}`);
    c.salvar('11-integracao', R);
  }
  void fase;
}
