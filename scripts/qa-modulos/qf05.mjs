// §9–17. QF-05: o design pela IA cai no motor clássico? Para cada peça visual, só metadados: Quick Win, execução,
// artefato, tipo, motor pedido e escolhido, motivo do fallback (classificado), códigos da conferência do design,
// imagem, tempos e situação. Nada de conteúdo, prompt ou arquivo.
// Uso: rodar qf05 [rodada]
const CASOS = [
  { id: 'apresentacao', nome: 'QF05 Apresentação', descricao: 'Transforme os números do trimestre em uma apresentação de 5 slides para a diretoria.', material: 'Trimestre fictício QA: receita R$ 4,2 mi (meta R$ 4,0 mi); margem 18%; 312 clientes ativos; 2 riscos: concentração de 40% em 3 clientes e atraso na contratação de 2 vendedores. Decisão pedida: aprovar orçamento de marketing.' },
  { id: 'dashboard', nome: 'QF05 Dashboard', descricao: 'Monte um dashboard visual com os indicadores de manutenção do mês.', material: 'Manutenção fictícia QA (setembro): 48 ordens abertas, 41 concluídas, tempo médio de reparo 6,5 h, disponibilidade 96,2%, 3 paradas não programadas.' },
  { id: 'infografico', nome: 'QF05 Infográfico', descricao: 'Transforme a política de home office em um infográfico de uma página.', material: 'Política fictícia QA: até 3 dias por semana em casa; pedido com 5 dias de antecedência; reunião presencial às terças; ajuda de custo de R$ 120 por mês; equipamento fornecido pela empresa.' },
  { id: 'poster', nome: 'QF05 Cartaz', descricao: 'Crie um cartaz para divulgar a semana de segurança do trabalho.', material: 'Semana fictícia QA: 10 a 14 de novembro; palestras às 9h no auditório; tema "Cuidar de si é cuidar de todos"; inscrições na portaria.' },
  { id: 'comparacao', nome: 'QF05 Comparação', descricao: 'Compare as duas propostas em uma página visual e recomende uma.', material: 'Proposta A (fictícia): R$ 52.000, entrega em 30 dias, garantia de 12 meses. Proposta B (fictícia): R$ 47.500, entrega em 45 dias, garantia de 6 meses.' },
  { id: 'timeline', nome: 'QF05 Timeline', descricao: 'Crie uma timeline visual do projeto com as etapas e datas.', material: 'Projeto fictício QA: levantamento 01/10 a 15/10; configuração 16/10 a 30/11; testes 01/12 a 20/12; treinamento 05/01 a 16/01; entrada em produção 02/02/2027.' },
  { id: 'imagem_final', nome: 'QF05 Imagem final', descricao: 'Gere a imagem final de um post quadrado anunciando o novo horário de atendimento.', material: 'Novo horário fictício: segunda a sábado, das 8h às 20h, a partir de 1º de novembro.' },
];
// Classificação do motivo (§12). O motor clássico na imagem final é a composição determinística pedida (§26).
export function classificar(ev) {
  // Versão com registro estruturado (e702aca+): o próprio evento traz motor e categoria.
  if (ev.motor_usado) return { motor: ev.motor_usado, categoria: ev.fallback_categoria || null, motivo: ev.fallback_motivo || null, pedido: ev.motor_pedido, ajuste: ev.design_ajuste || null, tentativas: ev.design_tentativas ?? null, ms_design: ev.ms_design ?? null };
  if (ev.motor === 'design') return { motor: 'ai', categoria: null };
  const m = ev.motivo_classico;
  if (ev.tipo === 'image' && !m) return { motor: 'classic', categoria: 'EXPECTED_FALLBACK', motivo: 'composicao_deterministica_da_imagem_final' };
  if (!m) return { motor: 'classic', categoria: 'UNEXPECTED_FALLBACK', motivo: 'sem_motivo_registrado' };
  if (m === 'sem_ia') return { motor: 'classic', categoria: 'CONFIG_FALLBACK', motivo: m };
  if (m === 'paginas') return { motor: 'classic', categoria: 'EXPECTED_FALLBACK', motivo: m };
  if (m === 'conferencia' || m === 'resposta_invalida') return { motor: 'classic', categoria: 'VALIDATION_FALLBACK', motivo: m, codigos: ev.detalhe_classico || null };
  if (/tempo|timeout/.test(m)) return { motor: 'classic', categoria: 'TIMEOUT_FALLBACK', motivo: m };
  if (/chromium|memoria|indisponivel|navegador/.test(m)) return { motor: 'classic', categoria: 'PROVIDER_FALLBACK', motivo: m };
  return { motor: 'classic', categoria: 'ERROR_FALLBACK', motivo: m, detalhe: ev.detalhe_classico || null };
}
export default async function (c, rodada = 'qf05') {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  const ids = new Set((c.eu.quickWins?.areas || []).map(a => a.id));
  const minhas = ((await c.api('GET', '/api/areas')).dados?.areas || []).filter(a => ids.has(a.id));
  // Área sem proteção reforçada (a reforçada bloqueia a imagem por governança; o design pela IA não depende disso).
  const livre = minhas.find(a => !a.sigilosa) || minhas[0];
  c.destino = livre ? { areas: [livre.id] } : { toda_empresa: true };
  const out = [];
  for (const caso of CASOS) {
    const t0 = Date.now();
    const cr = await criarQw(c, { ...caso, nome: `${caso.nome} ${rodada}` });
    if (!cr.qw) { out.push({ caso: caso.id, erro: 'criacao' }); continue; }
    const e = await executar(c, cr.qw.id, caso.material, { teste: true });
    const fim = e.bruto?.linhas?.find(l => l.t === 'fim') || {};
    const arts = fim.artefatos || [];
    const evs = (await c.api('GET', '/api/admin/eventos?tipo=visual.produced')).dados;
    const lista = (evs?.eventos || evs || []).map(x => ({ ...(typeof x.detalhes === 'string' ? JSON.parse(x.detalhes) : x.detalhes || {}), em: x.em }));
    for (const a of arts.length ? arts : [null]) {
      const ev = a ? lista.find(x => x.artefato === a.id) : null;
      const cl = ev ? classificar(ev) : { motor: null, categoria: arts.length ? 'SEM_EVENTO' : 'SEM_ARTEFATO' };
      out.push({ caso: caso.id, quickwin_id: cr.qw.id, execution_id: e.conv, artifact_id: a?.id || null, visual_type: a?.tipo || null,
        design_engine_requested: ev ? (cl.pedido || (ev.tipo === 'image' ? 'classic(imagem final)' : 'ai')) : null, ajuste_deterministico: cl.ajuste || null, design_tentativas: cl.tentativas ?? null, ms_design: cl.ms_design ?? null, design_engine_selected: cl.motor, fallback_used: cl.motor === 'classic',
        fallback_category: cl.categoria, fallback_reason: cl.motivo || null, codigos_conferencia_design: ev?.detalhe_classico || null,
        imagem: ev?.imagem || null, status_artefato: a?.status || null, qualidade: e.exec?.qualidade?.status || null, correcoes: ev?.correcoes ?? null,
        ms_execucao: e.exec?.ms ?? null, ms_visual: ev?.ms ?? null, ms_total: Date.now() - t0, exportacoes: a?.exportacoes || null });
    }
    const u = out.filter(x => x.caso === caso.id).map(x => `${x.visual_type}:${x.design_engine_requested}->${x.design_engine_selected}${x.ajuste_deterministico ? `(ajuste:${x.ajuste_deterministico})` : ''}${x.fallback_category ? `/${x.fallback_category}:${x.fallback_reason}${x.codigos_conferencia_design ? `[${x.codigos_conferencia_design}]` : ''}` : ''} q=${x.qualidade}`).join(' ');
    c.log(`${caso.id}: ${u}`);
    c.salvar(`30-${rodada}`, out);
  }
  const resumo = out.reduce((m, x) => { const k = x.fallback_category || (x.design_engine_selected === 'ai' ? 'AI' : 'NA'); m[k] = (m[k] || 0) + 1; return m; }, {});
  c.log('RESUMO', JSON.stringify(resumo));
}
