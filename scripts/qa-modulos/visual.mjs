// §11. Produção visual: apresentação, relatório, comparação, dashboard, checklist, timeline e cartaz. Para cada
// artefato: prévia, páginas, PDF (páginas), PNG, JPG, SVG, motor (design pela IA ou clássico) e motivo.
const CASOS = [
  { id: 'v-apresentacao', nome: 'Visual apresentação', descricao: 'Transforme estes resultados em uma apresentação de 5 slides para a diretoria.', material: 'Resultados do 3º trimestre de 2026 (fictícios): receita R$ 12,4 milhões (meta R$ 12,0 milhões); margem 18%; clientes ativos 1.240; custo de frete subiu 9%; riscos: atraso de fornecedor de embalagens e câmbio; próximos passos: renegociar frete até 30/11 e concluir o novo CD em dezembro.' },
  { id: 'v-relatorio', nome: 'Visual relatório', descricao: 'Gere um relatório visual em PDF com a situação mensal da manutenção, com indicadores e gráfico.', material: 'Manutenção setembro 2026 (fictício): ordens abertas 142; concluídas 128; backlog 14; disponibilidade linha 1 96%, linha 2 91%, linha 3 94%; custo de peças julho R$ 84 mil, agosto R$ 91 mil, setembro R$ 78 mil.' },
  { id: 'v-comparacao', nome: 'Visual comparação', descricao: 'Compare as três propostas e entregue uma página visual com a comparação e a recomendação.', material: 'Propostas fictícias. Alfa QA: R$ 18.000/mês, início em 15 dias, reposição em 24h. Beta QA: R$ 16.500/mês, início em 30 dias, reposição em 48h. Gama QA: R$ 19.200/mês, início em 7 dias, reposição em 12h e seguro incluso.' },
  { id: 'v-dashboard', nome: 'Visual dashboard', descricao: 'Monte um dashboard visual com os indicadores de vendas do trimestre.', material: 'Vendas (fictícias): julho R$ 1,3 mi; agosto R$ 1,4 mi; setembro R$ 1,5 mi; ticket médio R$ 820; clientes novos 64; churn 2,1%.' },
  { id: 'v-checklist', nome: 'Visual checklist', descricao: 'Crie um checklist visual de segurança para a abertura do galpão.', material: 'Itens (fictícios): conferir extintores; testar alarme; liberar saídas de emergência; checar EPIs; registrar temperatura da câmara fria; assinar o livro de abertura.' },
  { id: 'v-timeline', nome: 'Visual timeline', descricao: 'Crie uma timeline visual do projeto de implantação do ERP.', material: 'Projeto ERP (fictício): levantamento 01/10 a 15/10; configuração 16/10 a 30/11; testes 01/12 a 20/12; treinamento 05/01 a 16/01; entrada em produção 02/02/2027.' },
  { id: 'v-poster', nome: 'Visual poster', descricao: 'Crie um cartaz para divulgar a Semana de Segurança da empresa.', material: 'Semana Interna de Prevenção de Acidentes (fictícia): 13 a 17 de outubro de 2026, às 9h, no refeitório. Atividades: palestras diárias, gincana de segurança, campanha de vacinação.' },
];
const MAGICA = { pdf: b => b.subarray(0, 5).toString() === '%PDF-', png: b => b.readUInt32BE(0) === 0x89504e47, jpg: b => b[0] === 0xff && b[1] === 0xd8, svg: b => /^<svg|^<\?xml/.test(b.subarray(0, 60).toString()), zip: b => b.readUInt32BE(0) === 0x504b0304 };
export default async function (c, ids = '') {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  c.destino ||= c.eu.quickWins?.areas?.length ? { areas: [c.eu.quickWins.areas[0].id] } : { toda_empresa: true };
  const alvo = ids ? new Set(ids.split(',')) : null;
  const pasta = c.pasta('visual'), out = c.estado.visual ||= {};
  for (const caso of CASOS.filter(x => !alvo || alvo.has(x.id))) {
    const cr = await criarQw(c, caso);
    const reg = { entregaveis: cr.reg.interpretar?.entregaveis };
    if (cr.qw) {
      const t = await executar(c, cr.qw.id, caso.material, { teste: true });
      reg.exec = { q: t.exec.qualidade?.status, ms: t.exec.ms, etapas: t.exec.etapas, erro: t.exec.erro, pergunta: t.exec.pergunta };
      reg.artefatos = [];
      for (const a of t.exec.artefatos || []) {
        const A = { id: a.id, tipo: a.tipo, paginas: a.paginas, status: a.status, avisos: a.avisos, previas: [], exports: {} };
        for (let n = 1; n <= Math.min(a.paginas || 1, 8); n++) {
          const p = await c.binario(`/api/artefatos/${a.id}/paginas/${n}`);
          A.previas.push([n, p.status, p.tipo, Math.round(p.dados.length / 1024), p.ms]);
          if (p.status === 200) c.arquivo(`visual/${caso.id}-p${n}.${/jpeg/.test(p.tipo) ? 'jpg' : 'png'}`, p.dados);
        }
        for (const f of ['pdf', 'png', 'jpg', 'svg']) {
          const b = await c.binario(`/api/artefatos/${a.id}/baixar?formato=${f}`);
          const zip = (a.paginas || 1) > 1 && f !== 'pdf';
          A.exports[f] = { status: b.status, ok: b.status === 200 && (zip ? MAGICA.zip(b.dados) : MAGICA[f](b.dados)), kb: Math.round(b.dados.length / 1024), ms: b.ms,
            ...(f === 'pdf' ? { paginas: (b.dados.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length } : {}) };
          if (f === 'pdf' && b.status === 200) c.arquivo(`visual/${caso.id}.pdf`, b.dados);
        }
        reg.artefatos.push(A);
      }
    }
    out[caso.id] = reg;
    c.log(`${caso.id}: q=${reg.exec?.q} ${reg.exec?.ms}ms art=${(reg.artefatos || []).map(a => `${a.tipo}/${a.paginas}p/${a.status} prev=${a.previas.map(p => p[1]).join('')} ${Object.entries(a.exports).map(([k, v]) => `${k}:${v.ok ? 'ok' : v.status}${v.paginas !== undefined ? `(${v.paginas}p)` : ''}`).join(' ')}`).join('; ') || 'nenhum'} ent=${JSON.stringify(reg.entregaveis)}`);
  }
  const ev = (await c.api('GET', '/api/admin/eventos?tipo=visual.produced')).dados?.eventos || [];
  out.eventos = ev.slice(0, 20).map(x => { const d = typeof x.detalhes === 'string' ? JSON.parse(x.detalhes) : x.detalhes; return { artefato: d?.artefato, tipo: d?.tipo, motor: d?.motor, motivo: d?.motivo_classico, imagem: d?.imagem, status: d?.status, ms: d?.ms }; });
  c.salvar('09-visual', out);
  c.log(JSON.stringify(out.eventos));
}
