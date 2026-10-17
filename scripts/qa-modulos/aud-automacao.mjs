// Auditoria (T18): automação pedida no chat roda sozinha na programação. Caminho completo, pelas mesmas rotas da tela:
// pedido no chat -> "Quick Win sugerido" da resposta -> assistente (interpretar) -> Quick Win criado e publicado ->
// programação para daqui a alguns minutos -> execução pelo servidor (sem navegador) -> resultado com fontes.
// Uso: rodar aud-automacao criar [minutos=4]  |  rodar aud-automacao conferir  |  rodar aud-automacao limpar
// A pesquisa na internet da empresa de homologação fica ligada entre "criar" e "limpar" e volta ao valor anterior.
const PEDIDO = 'Crie uma automação que, toda segunda-feira de manhã, pesquise novidades relevantes sobre inteligência artificial aplicada ao desenvolvimento de software e marketing. Entregue um resumo com fontes, impactos práticos e recomendações.';
export default async function (c, fase = 'criar', minutos = '4') {
  const st = c.estado.audAuto ||= {};
  if (fase === 'criar') {
    st.pesquisaAntes = (await c.api('GET', '/api/admin/config')).dados?.pesquisaWeb || { ativa: false };
    c.log('  pesquisa liga:', (await c.api('PUT', '/api/admin/config', { pesquisaWeb: { ...st.pesquisaAntes, ativa: true } })).status);
    const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa;
    const r = await c.enviar(conv.id, { texto: PEDIDO });
    const fim = r.linhas.find(l => l.t === 'fim');
    c.log('  chat', r.status, 'resposta', fim?.id, `${Math.round(r.ms / 1000)}s`);
    const sug = await c.api('GET', `/api/conversas/${conv.id}/mensagens/${fim?.id}/quick-win-sugerido`);
    c.log('  sugerido', sug.status, JSON.stringify(sug.dados).slice(0, 300));
    if (sug.status !== 200 || !sug.dados?.descricao) { c.salvar('aud-automacao-falha', { etapa: 'sugerido', sug }); return; }
    const interp = await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao: sug.dados.descricao.slice(0, 1000) });
    c.log('  interpretar', interp.status, JSON.stringify(interp.dados?.operacao?.ferramentas_permitidas || null));
    const assistente = { nome: sug.dados.nome, descricao: sug.dados.descricao.slice(0, 1000), como: { modo: 'pronto' },
      ...(interp.dados?.operacao ? { operacao: interp.dados.operacao } : {}), ...(interp.dados?.fonte === 'ia' && interp.dados?.chave ? { interpretacao: { chave: interp.dados.chave, operacao: interp.dados.operacao } } : {}) };
    const q = await c.api('POST', '/api/quick-wins', { assistente, toda_empresa: true });
    c.log('  quick win', q.status, q.dados?.id, q.status !== 200 ? JSON.stringify(q.dados).slice(0, 300) : '');
    if (q.status !== 200) { c.salvar('aud-automacao-falha', { etapa: 'criar', q: q.dados }); return; }
    st.quick_win = q.dados.id; c.estado.criados.quick_wins.push(q.dados.id);
    const pub = await c.api('POST', `/api/quick-wins/${st.quick_win}/publicar`, {});
    c.log('  publicar', pub.status, pub.status !== 200 ? JSON.stringify(pub.dados).slice(0, 300) : '');
    const alvo = new Date(Date.now() + Number(minutos) * 60e3);
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(alvo);
    const p = await c.api('POST', `/api/quick-wins/${st.quick_win}/programacoes`, { nome: 'Novidades de IA (auditoria)', tipo: 'horario', agenda: { frequencia: 'diaria', hora, fuso: 'America/Sao_Paulo' },
      entrada: 'Pesquise as novidades da última semana sobre IA aplicada ao desenvolvimento de software e ao marketing.', limite_creditos: 100, max_dia: 1 });
    c.log('  programar', p.status, hora, p.status !== 200 ? JSON.stringify(p.dados).slice(0, 300) : '');
    if (p.status !== 200) return;
    st.programacao = p.dados.id;
    const a = await c.api('POST', `/api/quick-wins/${st.quick_win}/programacoes/${st.programacao}/estado`, { ativa: true });
    c.log('  ativar', a.status, a.dados?.proxima_em);
    c.salvar('aud-automacao-criar', { conversa: conv.id, resposta: fim?.id, sugerido: sug.dados, operacao: interp.dados?.operacao || null, quick_win: st.quick_win, publicar: pub.status, programacao: st.programacao, hora, proxima_em: a.dados?.proxima_em });
  } else if (fase === 'conferir') {
    const p = await c.api('GET', `/api/quick-wins/${st.quick_win}/programacoes`);
    const s = (p.dados?.programacoes || []).find(x => x.id === st.programacao);
    c.log('  programação', s ? `ativa=${s.ativa} próxima=${s.proxima_em} créditos=${s.creditos_usados}` : p.status);
    for (const e of s?.execucoes || []) c.log('  execução', e.id, e.status, e.prevista_em, e.finalizada_em, e.motivo || '');
    const e = s?.execucoes?.find(x => x.conversa_id);
    let resultado = null;
    if (e) {
      const d = (await c.api('GET', `/api/conversas/${e.conversa_id}`)).dados;
      const msgs = d.mensagens || d.conversa?.mensagens || [];
      const resp = msgs.filter(m => m.papel === 'assistant').at(-1);
      resultado = { conversa: e.conversa_id, caracteres: resp?.texto?.length || 0, fontes_web: (resp?.fontes || []).filter(f => /^https?:/.test(f.url || '')).length, links_no_texto: (resp?.texto?.match(/https?:\/\/\S+/g) || []).length, qualidade: resp?.qualidade?.status || null, inicio: resp?.texto?.slice(0, 900) || '' };
      c.log('  resultado', JSON.stringify({ ...resultado, inicio: undefined }));
      c.arquivo(`aud-automacao-resultado-${e.id}.md`, resp?.texto || '');
    }
    c.salvar(`aud-automacao-conferir-${Date.now()}`, { programacao: s || p.dados, resultado });
  } else if (fase === 'limpar') {
    if (st.programacao) c.log('  pausar', (await c.api('POST', `/api/quick-wins/${st.quick_win}/programacoes/${st.programacao}/estado`, { ativa: false })).status);
    if (st.pesquisaAntes) c.log('  pesquisa restaurada', (await c.api('PUT', '/api/admin/config', { pesquisaWeb: st.pesquisaAntes })).status, `ativa=${!!st.pesquisaAntes.ativa}`);
  }
}
