// Quality Check: casos feitos para separar resultado correto, dado inventado, material ausente, critério impossível
// e resultado incompleto. Cada caso é um Quick Win "QA - " próprio, executado em modo teste.
const CASOS = [
  { id: 'c-correto', nome: 'Checker correto', descricao: 'Liste os três fornecedores com o preço mensal de cada um, em uma tabela.', material: 'Fornecedores (fictícios): Alfa QA R$ 18.000; Beta QA R$ 16.500; Gama QA R$ 19.200.', espera: 'aprovado/corrigido' },
  { id: 'c-inventado', nome: 'Checker inventado', descricao: 'Liste os fornecedores com CNPJ, telefone e prazo de entrega de cada um, em uma tabela.', material: 'Fornecedores (fictícios): Alfa QA entrega em 15 dias; Beta QA entrega em 30 dias.', espera: 'CNPJ/telefone como não informado, ou falha de invenção' },
  { id: 'c-ausente', nome: 'Checker sem material', descricao: 'Analise o relatório financeiro anexo e informe o lucro líquido do trimestre.', material: '', espera: 'pergunta pelo material, sem número inventado' },
  { id: 'c-impossivel', nome: 'Checker impossível', descricao: 'Liste exatamente 20 riscos diferentes deste contrato, numerados de 1 a 20.', material: 'Contrato fictício QA: prazo de 6 meses; multa de 5% por atraso.', espera: 'parcial/honesto, sem 20 riscos inventados' },
  { id: 'c-incompleto', nome: 'Checker incompleto', descricao: 'Liste todos os 15 itens do inventário com quantidade, sem omitir nenhum.', material: 'Inventário fictício QA: 1 parafuso 100; 2 porca 80; 3 arruela 120; 4 broca 15; 5 serra 4; 6 martelo 6; 7 alicate 9; 8 trena 12; 9 nível 3; 10 luva 40; 11 óculos 25; 12 capacete 18; 13 bota 10; 14 fita 30; 15 lixa 60.', espera: '15 itens; se faltar, correção' },
];
const textoDe = r => r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
export default async function (c) {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  c.destino ||= c.eu.quickWins?.areas?.length ? { areas: [c.eu.quickWins.areas[0].id] } : { toda_empresa: true };
  const out = {};
  for (const caso of CASOS) {
    const cr = await criarQw(c, caso);
    const reg = { ...cr.reg, espera: caso.espera };
    if (cr.qw) {
      const t = await executar(c, cr.qw.id, caso.material, { teste: true });
      reg.teste = t.exec;
      if (t.bruto) c.arquivo(`checker-${caso.id}.md`, textoDe(t.bruto));
      const txt = t.bruto ? textoDe(t.bruto) : '';
      reg.sinais = { cnpj_inventado: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(txt), telefone_inventado: /\(?\d{2}\)?\s?\d{4,5}-\d{4}/.test(txt), lucro_inventado: /lucro[^.\n]{0,40}R\$\s?\d/i.test(txt),
        riscos_numerados: (txt.match(/^\s*(\d{1,2})[.)]\s/gm) || []).length, itens_inventario: (txt.match(/\b(parafuso|porca|arruela|broca|serra|martelo|alicate|trena|nível|luva|óculos|capacete|bota|fita|lixa)\b/gi) || []).length };
    }
    out[caso.id] = reg;
    c.salvar('04-checker', out);
    c.log(`${caso.id}: teste=${reg.teste?.qualidade?.status || (reg.teste?.pergunta ? 'pergunta' : reg.teste?.erro)} tent=${reg.teste?.qualidade?.tentativas ?? '-'} falhas=${JSON.stringify(reg.teste?.qualidade?.falhas || [])} sinais=${JSON.stringify(reg.sinais || {})}`);
  }
}
