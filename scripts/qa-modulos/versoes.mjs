// O–P / §15. Versões: v1 publicada; rascunho editado; teste usa o rascunho; publicar v2; uso real usa v2;
// restaurar v1; uso real volta a v1; histórico. Marca verificável: uma assinatura pedida só na v2.
const textoDe = r => r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
export default async function (c, caso = '13') {
  const { CASOS, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  const qw = c.estado.casos[Number(caso)]?.qw;
  if (!qw) { c.log('sem quick win do caso', caso); return; }
  const base = CASOS.find(x => x.id === Number(caso));
  const out = { caso: Number(caso), qw };
  const MARCA = 'Equipe de Facilities QA';
  const nova = `${base.descricao} Termine sempre com a assinatura "${MARCA}".`;
  const it = await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao: nova, quick_win_id: qw });
  const ed = await c.api('PUT', `/api/quick-wins/${qw}`, { assistente: { descricao: nova, como: { modo: 'pronto' }, ...(it.dados?.operacao ? { operacao: { ...it.dados.operacao, origem: 'pessoa' } } : {}), ...(it.dados?.chave ? { interpretacao: { chave: it.dados.chave, operacao: it.dados.operacao } } : {}) } });
  out.editar = { status: ed.status, erro: ed.status !== 200 ? JSON.stringify(ed.dados).slice(0, 200) : null };
  const usoAntes = await executar(c, qw, base.material, { teste: false });
  out.uso_v1_com_rascunho = { tem_marca: textoDe(usoAntes.bruto).includes(MARCA), q: usoAntes.exec.qualidade?.status };
  const teste = await executar(c, qw, base.material, { teste: true });
  out.teste_rascunho = { tem_marca: textoDe(teste.bruto).includes(MARCA), q: teste.exec.qualidade?.status };
  const pub = await c.api('POST', `/api/quick-wins/${qw}/publicar`, {});
  out.publicar_v2 = pub.status;
  const v2 = await executar(c, qw, base.material, { teste: false });
  out.uso_v2 = { tem_marca: textoDe(v2.bruto).includes(MARCA), q: v2.exec.qualidade?.status };
  const hist = (await c.api('GET', `/api/quick-wins/${qw}/versoes`)).dados?.versoes || [];
  out.historico = hist.map(v => ({ numero: v.numero, atual: v.atual, teste: v.teste }));
  const r = await c.api('POST', `/api/quick-wins/${qw}/versoes/1/restaurar`, {});
  out.restaurar_v1 = r.status;
  const v1 = await executar(c, qw, base.material, { teste: false });
  out.uso_apos_restaurar = { tem_marca: textoDe(v1.bruto).includes(MARCA), q: v1.exec.qualidade?.status };
  // A conversa antiga continua com a versão com que começou?
  const antiga = c.estado.casos[Number(caso)]?.convUso;
  if (antiga) { const r2 = await c.enviar(antiga, { executar_quick_win: true, texto: base.material }); out.conversa_antiga_reexec = { tem_marca: textoDe(r2).includes(MARCA) }; }
  out.historico_final = ((await c.api('GET', `/api/quick-wins/${qw}/versoes`)).dados?.versoes || []).map(v => ({ numero: v.numero, atual: v.atual }));
  c.salvar(`05-versoes-${caso}`, out);
  c.log(JSON.stringify(out));
}
