// §7. QF-04: conferência com revisão dos achados. Cada caso tem um "gabarito" determinístico sobre o TEXTO entregue;
// cruzando com a situação da conferência: correct_approval, correct_rejection, false_positive, false_negative.
// Uso: rodar qf04 [rodada] [repeticoes]
const textoDe = r => (r?.linhas || []).filter(l => l.t === 'texto').map(l => l.v).join('');
const ITENS = ['parafuso', 'porca', 'arruela', 'broca', 'serra', 'martelo', 'alicate', 'trena', 'nível', 'luva', 'óculos', 'capacete', 'bota', 'fita', 'lixa'];
const CASOS = [
  { id: 'correto', descricao: 'Liste os três fornecedores com o preço mensal de cada um, em uma tabela.', material: 'Fornecedores (fictícios): Alfa QA R$ 18.000; Beta QA R$ 16.500; Gama QA R$ 19.200.',
    certo: t => /18\.000/.test(t) && /16\.500/.test(t) && /19\.200/.test(t) },
  { id: 'incompleto', descricao: 'Liste todos os 15 itens do inventário com quantidade, sem omitir nenhum.', material: 'Inventário fictício QA: 1 parafuso 100; 2 porca 80; 3 arruela 120; 4 broca 15; 5 serra 4; 6 martelo 6; 7 alicate 9; 8 trena 12; 9 nível 3; 10 luva 40; 11 óculos 25; 12 capacete 18; 13 bota 10; 14 fita 30; 15 lixa 60.',
    certo: t => ITENS.every(i => new RegExp(i, 'i').test(t)) },
  { id: 'inventado', descricao: 'Liste os fornecedores com CNPJ, telefone e prazo de entrega de cada um, em uma tabela.', material: 'Fornecedores (fictícios): Alfa QA entrega em 15 dias; Beta QA entrega em 30 dias.',
    certo: t => !/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(t) && !/\(?\d{2}\)?\s?\d{4,5}-\d{4}/.test(t) },
  { id: 'numero', descricao: 'Some as vendas de cada região e informe o total geral.', material: 'Vendas fictícias QA: Norte 1.234; Sul 5.678; Leste 766; Oeste 2.322.',
    certo: t => /10\.000|10000/.test(t) },
  { id: 'ausente', descricao: 'Analise o relatório financeiro anexo e informe o lucro líquido do trimestre.', material: '', certo: t => !/lucro[^.\n]{0,40}R\$\s?\d/i.test(t), pergunta: true },
  { id: 'falso_positivo', descricao: 'Crie uma tabela do cronograma do projeto com etapa, início, fim e duração em dias.', material: 'Projeto fictício QA: levantamento 01/10 a 15/10; configuração 16/10 a 30/11; testes 01/12 a 20/12; treinamento 05/01 a 16/01; entrada em produção 02/02/2027.',
    certo: t => /levantamento/i.test(t) && /02\/02\/2027/.test(t) },
];
export function classificar({ certo, status, pergunta, esperaPergunta }) {
  if (esperaPergunta) return pergunta || status === 'pergunta' ? 'correct_rejection' : certo ? 'correct_approval' : 'false_negative';
  const aprovou = ['aprovado', 'corrigido'].includes(status);
  if (certo && aprovou) return 'correct_approval';
  if (certo && status === 'inconsistente') return 'false_positive';
  if (!certo && aprovou) return 'false_negative';
  if (!certo && status === 'inconsistente') return 'correct_rejection';
  return `outro(${status})`;
}
export default async function (c, rodada = 'qf04', repeticoes = '1') {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  c.destino ||= c.eu.quickWins?.areas?.length ? { areas: [c.eu.quickWins.areas[0].id] } : { toda_empresa: true };
  const out = [];
  for (const caso of CASOS) {
    const cr = await criarQw(c, { nome: `QF04 ${caso.id} ${rodada}`, descricao: caso.descricao });
    if (!cr.qw) { out.push({ caso: caso.id, erro: 'criacao' }); continue; }
    for (let i = 0; i < Number(repeticoes); i++) {
      const e = await executar(c, cr.qw.id, caso.material, { teste: true });
      const t = textoDe(e.bruto), q = e.exec?.qualidade || {};
      const status = q.status || (e.exec?.pergunta ? 'pergunta' : null);
      const revistos = (q.avisos || []).filter(a => /Ponto revisto e não confirmado/.test(a)).length;
      const reg = { caso: caso.id, rep: i + 1, status, certo_pelo_gabarito: caso.certo(t), classe: classificar({ certo: caso.certo(t), status, pergunta: !!e.exec?.pergunta, esperaPergunta: !!caso.pergunta }),
        revistos_pela_segunda_leitura: revistos, tentativas: q.tentativas ?? null, falhas: (q.problemas || []).map(p => p.slice(0, 160)), ms: e.exec?.ms ?? null };
      out.push(reg);
      c.arquivo(`qf04-${rodada}-${caso.id}-${i + 1}.md`, t);
      c.log(`${caso.id}#${i + 1}: ${status} gabarito=${reg.certo_pelo_gabarito} → ${reg.classe} revistos=${revistos}`);
    }
    c.salvar(`31-${rodada}`, out);
  }
  const resumo = out.reduce((m, x) => { m[x.classe] = (m[x.classe] || 0) + 1; return m; }, {});
  c.log('RESUMO', JSON.stringify(resumo));
}
