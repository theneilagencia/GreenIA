// §4. Confirma produção antes dos testes (só metadados): saúde, versão, IA, empresa, usuário, modelos, flags (pesquisa
// na internet, imagens, integrações), navegador do design pela IA, conhecimento da empresa e catálogo.
export default async function (c) {
  const saude = (await c.api('GET', '/api/saude')).dados;
  const eu = (await c.api('GET', '/api/eu')).dados;
  const pub = (await c.api('GET', '/api/publico')).dados;
  const cfg = (await c.api('GET', '/api/admin/config')).dados || {};
  const modelos = (await c.api('GET', '/api/admin/modelos')).dados;
  const lm = modelos?.modelos || modelos || [];
  const diag = await c.api('GET', '/api/admin/visual/diagnostico');
  const conhecimento = (await c.api('GET', '/api/conhecimento')).dados;
  const qws = (await c.api('GET', '/api/quick-wins')).dados?.quickWins || [];
  const integ = await c.api('GET', '/api/admin/integracoes');
  const r = {
    saude, empresa: pub?.empresa, usuario: eu.pessoa?.email, admin: !!eu.pessoa?.admin, ia_configurada: eu.iaConfigurada,
    modelos: Array.isArray(lm) ? { total: lm.length, liberados: lm.filter(m => m.liberado).length, homologados: lm.filter(m => m.homologado).length } : null,
    flags: { pesquisa_web: !!cfg.pesquisaWeb?.ativa, imagens: !!cfg.producaoVisual?.imagens?.ativa, integracoes: !!cfg.integracoes?.ativa, sigilo: cfg.allow_sensitive_processing_with_guardrails ?? null },
    design_ia: { status: diag.status, ...(diag.dados || {}) },
    conhecimento: { documentos: (conhecimento?.documentos || []).length },
    catalogo: { total: qws.length, qa: qws.filter(q => /^QA - /.test(q.nome)).length },
    integration_builder: { status: integ.status, conectores: (integ.dados?.conectores || []).length },
    areas_qw: ((await c.api('GET', '/api/areas')).dados?.areas || []).filter(a => (eu.quickWins?.areas || []).some(x => x.id === a.id)).map(a => ({ id: a.id, sigilosa: !!a.sigilosa })),
  };
  c.salvar('00-confirmar', r);
  c.log(JSON.stringify(r).slice(0, 2000));
}
