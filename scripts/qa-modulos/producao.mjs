// Confirma o ambiente: saúde, versão, IA, empresa, usuário, recursos e catálogo (só metadados).
export default async function (c) {
  const saude = (await c.api('GET', '/api/saude')).dados;
  const eu = (await c.api('GET', '/api/eu')).dados;
  const pub = (await c.api('GET', '/api/publico')).dados;
  const cfg = (await c.api('GET', '/api/admin/config')).dados;
  const qws = await c.api('GET', '/api/quick-wins');
  const lista = qws.dados?.quickWins || qws.dados?.quick_wins || qws.dados || [];
  const r = { saude, empresa: pub?.empresa, plataforma: eu.plataforma ? { empresa: eu.plataforma.empresa?.name || eu.plataforma.empresa || null } : null,
    usuario: eu.pessoa?.email, admin: !!eu.pessoa?.admin, iaConfigurada: eu.iaConfigurada, integracoes_para_mim: eu.integracoes === true,
    cfg_integracoes: cfg?.integracoes, cfg_imagens: cfg?.producaoVisual, permissoes_qw: eu.quickWins ? { criar: eu.quickWins.criar, areas: (eu.quickWins.areas || []).length, todaEmpresa: eu.quickWins.todaEmpresa } : null,
    catalogo: { status: qws.status, total: Array.isArray(lista) ? lista.length : null, qa_existentes: Array.isArray(lista) ? lista.filter(q => String(q.nome).startsWith('QA - ')).map(q => ({ id: q.id, nome: q.nome })) : null },
    plano: eu.plano ? { fase: eu.plano.fase, percentual: eu.plano.percentual } : null };
  c.salvar('01-producao', r);
  c.log(JSON.stringify(r).slice(0, 1500));
}
