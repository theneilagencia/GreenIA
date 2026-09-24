// Pacotes do mês fictícios para o assistente de resumo financeiro mensal
// (frente Financeiro). Cada pacote é de uma empresa inventada: DRE, balancete e
// razão em PDF longo (30 a 300 páginas no total, com páginas de lançamentos de
// enchimento), fluxo de caixa em XLSX no layout de um ERP e inadimplência em
// CSV. O gabarito traz cada campo que o modelo extrai de cada PDF (periodo,
// receita_total, despesa_total, resultado), com o valor e a página onde ele
// está, os tópicos obrigatórios do resumo e os fatos de caixa e inadimplência.
// Armadilhas: a DRE traz a coluna do mês anterior; em parte dos pacotes o
// quadro-resumo fica depois das notas explicativas; o resumo do balancete fica
// na última página (às vezes além das 50 páginas que o bloco ler lê por padrão);
// em parte dos pacotes a inadimplência enviada é do mês anterior.
//   node --experimental-strip-types eval/fase4/gerar-financeiro.ts --saida eval/fase4/saida --pacotes 10 --semente 4302
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCA, args, brl, gravar, gravarJson, pdf, rng, xlsx, type PdfBlock, type Rng } from './lib.ts';
import { cnpj, cnpjFormatado, fmtNum, latin1, mesPorExtenso, r2, ultimoDia, utf8 } from './lib-extra.ts';

// Campos e tópicos do modelo resumo-financeiro-mensal (versão 1 do catálogo).
export const CAMPOS = ['periodo', 'receita_total', 'despesa_total', 'resultado'] as const;
export const TOPICOS = ['Visão geral do mês', 'Receitas e despesas', 'Caixa', 'Inadimplência', 'Pontos de atenção', 'Informações que faltam'];
export const PAGINAS_LIDAS = 50;            // paginasMax padrão do bloco ler

const EMPRESAS = ['Indústria Exemplo de Embalagens Ltda.', 'Comercial Modelo de Alimentos S.A.', 'Logística Fictícia Transportes Ltda.', 'Metalúrgica Teste Ltda.', 'Distribuidora Exemplo de Bebidas Ltda.', 'Serviços Modelo de Manutenção Ltda.'];
const CLIENTES = ['Mercado Alfa Fictício Ltda.', 'Comercial Beta Exemplo ME', 'Atacado Gama Modelo Ltda.', 'Supermercados Delta Teste S.A.', 'Padaria Épsilon Fictícia', 'Construtora Zeta Exemplo Ltda.', 'Farmácia Eta Modelo', 'Hotel Teta Fictício Ltda.', 'Restaurante Iota Exemplo', 'Oficina Kapa Teste ME', 'Escola Lambda Modelo', 'Clínica Mi Fictícia Ltda.'];
const CONTAS = ['Caixa geral', 'Banco conta movimento', 'Clientes a receber', 'Estoque de mercadorias', 'Fornecedores a pagar', 'Salários a pagar', 'INSS a recolher', 'FGTS a recolher', 'ICMS a recolher', 'Aluguel', 'Energia elétrica', 'Telefonia e internet', 'Material de expediente', 'Manutenção de máquinas', 'Fretes sobre vendas', 'Comissões sobre vendas', 'Tarifas bancárias', 'Juros ativos', 'Juros passivos', 'Depreciação acumulada'];
const HISTORICOS = ['Pagamento a fornecedor', 'Recebimento de cliente', 'Folha de pagamento', 'Tarifa bancária', 'Transferência entre contas', 'Venda à vista', 'Compra de mercadorias', 'Provisão de férias', 'Recolhimento de tributos', 'Aluguel do galpão', 'Conta de energia', 'Frete de entrega'];

const pad = (n: number) => String(n).padStart(2, '0');
const mesAnterior = (aaaamm: string) => { const [a, m] = aaaamm.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`; };
const rs = (n: number) => `R$ ${brl(n)}`;
const col = (n: number) => (n < 0 ? `(${brl(-n)})` : brl(n)).padStart(16);
const LINHAS_POR_PAGINA = 34;

interface Dre { bruta: number; deducoes: number; liquida: number; cmv: number; vendas: number; adm: number; recFin: number; despFin: number; ir: number; receita: number; despesa: number; resultado: number }
function dre(r: Rng, escala = 1): Dre {
  const bruta = r2(r.int(80_000_000, 900_000_000) / 100 * escala);
  const deducoes = r2(bruta * (0.12 + r.next() * 0.08));
  const liquida = r2(bruta - deducoes);
  const cmv = r2(liquida * (0.45 + r.next() * 0.25));
  const vendas = r2(liquida * (0.05 + r.next() * 0.05)), adm = r2(liquida * (0.08 + r.next() * 0.06));
  const recFin = r2(liquida * (0.002 + r.next() * 0.008)), despFin = r2(liquida * (0.005 + r.next() * 0.015));
  const lair = r2(liquida - cmv - vendas - adm + recFin - despFin);
  const ir = lair > 0 ? r2(lair * 0.34) : 0;
  const receita = r2(liquida + recFin), despesa = r2(cmv + vendas + adm + despFin + ir);
  return { bruta, deducoes, liquida, cmv, vendas, adm, recFin, despFin, ir, receita, despesa, resultado: r2(receita - despesa) };
}

// Páginas de lançamentos (enchimento realista, rápido de gerar).
function paginaRazao(r: Rng, mes: string, folha: number, empresa: string): PdfBlock[] {
  const conta = r.pick(CONTAS);
  const linhas = [`Empresa: ${empresa} · Período: ${mesPorExtenso(mes)} · Folha ${folha}`, `Conta: ${conta}`, 'Data        Lançamento   Histórico                          D/C          Valor'];
  for (let j = 0; j < LINHAS_POR_PAGINA - 6; j++) {
    const d = `${pad(r.int(1, ultimoDia(mes)))}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
    linhas.push(`${d}  ${String(r.int(1000, 99999)).padStart(6, '0')}       ${r.pick(HISTORICOS).padEnd(34)} ${r.pick(['D', 'C'])} ${brl(r.int(1000, 9_000_000) / 100).padStart(14)}`);
  }
  return [{ titulo: 'LIVRO RAZÃO ANALÍTICO', linhas }];
}
function paginaBalancete(r: Rng, mes: string, folha: number): PdfBlock[] {
  const linhas = [`Período: ${mesPorExtenso(mes)} · Folha ${folha}`, 'Conta                          Saldo anterior        Débitos       Créditos    Saldo atual'];
  for (let j = 0; j < LINHAS_POR_PAGINA - 5; j++) {
    const codigo = `${r.int(1, 5)}.${r.int(1, 3)}.${pad(r.int(1, 40))}.${String(r.int(1, 999)).padStart(3, '0')}`;
    linhas.push(`${codigo} ${r.pick(CONTAS).slice(0, 18).padEnd(18)} ${brl(r.int(0, 50_000_000) / 100).padStart(14)} ${brl(r.int(0, 9_000_000) / 100).padStart(13)} ${brl(r.int(0, 9_000_000) / 100).padStart(13)} ${brl(r.int(0, 50_000_000) / 100).padStart(14)}`);
  }
  return [{ titulo: 'BALANCETE DE VERIFICAÇÃO (continuação)', linhas }];
}
const NOTAS = [
  'As demonstrações foram preparadas de acordo com as práticas contábeis adotadas no Brasil, aplicáveis às pequenas e médias empresas.',
  'A receita é reconhecida quando o controle dos produtos é transferido ao cliente, em geral na entrega.',
  'Os estoques são avaliados pelo custo médio de aquisição, que não excede o valor realizável líquido.',
  'O imobilizado é registrado pelo custo de aquisição, deduzido da depreciação calculada pelo método linear.',
  'As provisões para férias e décimo terceiro são constituídas mensalmente, com os encargos correspondentes.',
  'Os valores deste documento são fictícios e servem apenas para a avaliação da plataforma.',
];

export interface CampoEsperado { arquivo: string; campo: typeof CAMPOS[number]; valor: string | number | null; pagina: number | null; trecho: string | null }

export async function gerarFinanceiro(saida: string, pacotes: number, semente: number) {
  const casos: string[] = [];
  for (let i = 1; i <= pacotes; i++) {
    const r = rng(semente * 1000 + i);
    const empresa = EMPRESAS[(i - 1) % EMPRESAS.length];
    const cnpjEmp = cnpj(r);
    const mes = (() => { let m = '2026-08'; for (let k = 1; k < i; k++) m = mesAnterior(m); return m; })();
    const ant = mesAnterior(mes);
    const ext = mesPorExtenso(mes);
    const periodoTxt = `01/${mes.slice(5, 7)}/${mes.slice(0, 4)} a ${ultimoDia(mes)}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
    const v = dre(r);
    const va = dre(r, 0.85 + r.next() * 0.25);
    const total = r.int(30, 300);
    const paginasNotas = r.int(1, 4);
    const quadroNoFim = i % 2 === 0;
    const nDre = 1 + paginasNotas;
    const nBal = Math.max(3, Math.min(Math.round((total - nDre) * (0.3 + r.next() * 0.2)), r.int(12, 95)));
    const nRaz = Math.max(3, total - nDre - nBal);
    const campos: CampoEsperado[] = [];
    const nomes = { dre: `dre-${mes}.pdf`, bal: `balancete-${mes}.pdf`, raz: `razao-${mes}.pdf`, caixa: `fluxo-de-caixa-${mes}.xlsx`, inad: `inadimplencia-${mes}.csv` };

    // DRE: tabela com o mês e o anterior; quadro-resumo na página 1 ou depois das notas.
    const cab = [`Empresa: ${empresa} · CNPJ ${cnpjFormatado(cnpjEmp)}`, `Período: ${periodoTxt} (${ext})`, `Valores em reais · colunas: ${ext} | ${mesPorExtenso(ant)}`];
    const tabela = ([['Receita operacional bruta', v.bruta, va.bruta], ['(-) Deduções e impostos sobre vendas', -v.deducoes, -va.deducoes], ['Receita operacional líquida', v.liquida, va.liquida],
      ['(-) Custo das mercadorias vendidas', -v.cmv, -va.cmv], ['Lucro bruto', r2(v.liquida - v.cmv), r2(va.liquida - va.cmv)], ['(-) Despesas com vendas', -v.vendas, -va.vendas],
      ['(-) Despesas administrativas', -v.adm, -va.adm], ['(+) Receitas financeiras', v.recFin, va.recFin], ['(-) Despesas financeiras', -v.despFin, -va.despFin],
      ['(-) IRPJ e CSLL', -v.ir, -va.ir], ['Resultado líquido do mês', v.resultado, va.resultado]] as [string, number, number][])
      .map(([n, a, b]) => `${n.padEnd(40)}${col(a)}${col(b)}`);
    const quadro: PdfBlock = { titulo: `QUADRO-RESUMO DE ${ext.toUpperCase()}`, linhas: [`Receita total do mês: ${rs(v.receita)}`, `Despesa total do mês: ${rs(v.despesa)}`, `Resultado do mês: ${rs(v.resultado)}${v.resultado < 0 ? ' (prejuízo)' : ''}`, 'Receita total = receita líquida + receitas financeiras. Despesa total = custos, despesas e tributos sobre o lucro.'] };
    const pagDre: PdfBlock[][] = [[{ titulo: 'DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO', linhas: cab }, { linhas: tabela }, ...(quadroNoFim ? [] : [quadro])]];
    for (let n = 0; n < paginasNotas; n++) pagDre.push([{ titulo: `NOTAS EXPLICATIVAS${n ? ' (continuação)' : ''}`, linhas: r.shuffle(NOTAS).slice(0, 4).map((t, j) => `Nota ${n * 4 + j + 1}. ${t}`) }, ...(quadroNoFim && n === paginasNotas - 1 ? [quadro] : [])]);
    const pQuadro = quadroNoFim ? nDre : 1;
    campos.push({ arquivo: nomes.dre, campo: 'periodo', valor: mes, pagina: 1, trecho: ext },
      { arquivo: nomes.dre, campo: 'receita_total', valor: v.receita, pagina: pQuadro, trecho: rs(v.receita) },
      { arquivo: nomes.dre, campo: 'despesa_total', valor: v.despesa, pagina: pQuadro, trecho: rs(v.despesa) },
      { arquivo: nomes.dre, campo: 'resultado', valor: v.resultado, pagina: pQuadro, trecho: rs(v.resultado) });

    // Balancete: contas nas páginas do meio, resumo na última.
    const pagBal: PdfBlock[][] = [[{ titulo: 'BALANCETE DE VERIFICAÇÃO', linhas: [...cab.slice(0, 2), 'Contas analíticas com saldo anterior, débitos, créditos e saldo atual. Resumo na última folha.'] }]];
    for (let f = 2; f < nBal; f++) pagBal.push(paginaBalancete(r, mes, f));
    const mov = r2(r.int(500_000_000, 3_000_000_000) / 100);
    pagBal.push([{ titulo: 'RESUMO DO BALANCETE', linhas: [`Período: ${ext}`, `Total dos débitos: ${rs(mov)}`, `Total dos créditos: ${rs(mov)}`, `Total das receitas do período: ${rs(v.receita)}`, `Total das despesas do período: ${rs(v.despesa)}`, `Resultado do período: ${rs(v.resultado)}`] }]);
    campos.push({ arquivo: nomes.bal, campo: 'periodo', valor: mes, pagina: 1, trecho: ext },
      { arquivo: nomes.bal, campo: 'receita_total', valor: v.receita, pagina: nBal, trecho: rs(v.receita) },
      { arquivo: nomes.bal, campo: 'despesa_total', valor: v.despesa, pagina: nBal, trecho: rs(v.despesa) },
      { arquivo: nomes.bal, campo: 'resultado', valor: v.resultado, pagina: nBal, trecho: rs(v.resultado) });

    // Razão: só lançamentos; não tem totais de receita e despesa (esperado: nulo).
    const pagRaz: PdfBlock[][] = [];
    for (let f = 1; f <= nRaz; f++) pagRaz.push(paginaRazao(r, mes, f, empresa));
    campos.push({ arquivo: nomes.raz, campo: 'periodo', valor: mes, pagina: 1, trecho: ext },
      ...(['receita_total', 'despesa_total', 'resultado'] as const).map(campo => ({ arquivo: nomes.raz, campo, valor: null, pagina: null, trecho: null })));

    // Fluxo de caixa (XLSX): diário com saldo corrido ou semanal por categoria.
    const saldoIni = r2(r.int(5_000_000, 90_000_000) / 100);
    let entradas = 0, saidas = 0;
    let caixa: Record<string, (string | number | null)[][]>;
    const layoutCaixa = i % 2 ? 'diario' : 'semanal';
    if (layoutCaixa === 'diario') {
      const linhas: (string | number | null)[][] = [];
      let saldo = saldoIni;
      for (let d = 1; d <= ultimoDia(mes); d += r.int(1, 2)) {
        const ent = r.next() < 0.6 ? r2(r.int(100_000, 9_000_000) / 100) : null;
        const sai = r.next() < 0.7 ? r2(r.int(100_000, 8_000_000) / 100) : null;
        if (!ent && !sai) continue;
        entradas = r2(entradas + (ent ?? 0)); saidas = r2(saidas + (sai ?? 0)); saldo = r2(saldo + (ent ?? 0) - (sai ?? 0));
        linhas.push([`${pad(d)}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`, `DOC-${r.digits(5)}`, r.pick(HISTORICOS), ent ? 'Recebimentos' : 'Pagamentos', ent, sai, saldo]);
      }
      caixa = { 'Fluxo de Caixa': [[empresa], [`Fluxo de caixa realizado · ${ext}`], [MARCA], ['Data', 'Documento', 'Histórico', 'Categoria', 'Entradas', 'Saídas', 'Saldo'],
        [`01/${mes.slice(5, 7)}/${mes.slice(0, 4)}`, null, 'Saldo inicial', null, null, null, saldoIni], ...linhas, [null, null, 'Totais do período', null, entradas, saidas, r2(saldoIni + entradas - saidas)]] };
    } else {
      const cats = [['Recebimento de clientes', 1], ['Outras entradas', 1], ['Fornecedores', -1], ['Folha e encargos', -1], ['Tributos', -1], ['Despesas gerais', -1]] as const;
      const rows = cats.map(([nome, s]) => { const sem = Array.from({ length: 5 }, () => r2(r.int(50_000, s > 0 ? 12_000_000 : 9_000_000) / 100)); const t = r2(sem.reduce((a, b) => a + b, 0)); if (s > 0) entradas = r2(entradas + t); else saidas = r2(saidas + t); return [nome, ...sem.map(x => s * x), s * t]; });
      caixa = { Caixa: [[`${empresa} · Demonstrativo de caixa por semana · ${ext}`], [MARCA], ['Categoria', 'Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5', 'Total'], ...rows,
        ['Saldo inicial', null, null, null, null, null, saldoIni], ['Variação do mês', null, null, null, null, null, r2(entradas - saidas)], ['Saldo final', null, null, null, null, null, r2(saldoIni + entradas - saidas)]] };
    }
    const saldoFim = r2(saldoIni + entradas - saidas);

    // Inadimplência (CSV com ;): Latin-1 ou UTF-8 com BOM; em parte dos pacotes, do mês anterior.
    const inadMes = i % 3 === 0 ? ant : mes;
    const titulos = Array.from({ length: r.int(6, 24) }, () => ({ cliente: r.pick(CLIENTES), doc: `NF ${r.int(1000, 99999)}/${r.int(1, 9)}`, valor: r2(r.int(50_000, 6_000_000) / 100), dias: r.int(1, 180) }));
    const fim = `${ultimoDia(inadMes)}/${inadMes.slice(5, 7)}/${inadMes.slice(0, 4)}`;
    const venc = (dias: number) => { const d = new Date(Date.UTC(Number(inadMes.slice(0, 4)), Number(inadMes.slice(5, 7)) - 1, ultimoDia(inadMes)) - dias * 86400000); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
    const faixa = (d: number) => d <= 30 ? '1 a 30' : d <= 60 ? '31 a 60' : d <= 90 ? '61 a 90' : 'acima de 90';
    const csv = [`Posição em ${fim};;;;;;`, 'Cliente;Documento;Vencimento;Valor;Dias em atraso;Faixa', ...titulos.map(t => [t.cliente, t.doc, venc(t.dias), fmtNum(t.valor, 2), String(t.dias), faixa(t.dias)].join(';'))].join('\r\n') + '\r\n';
    const totalInad = r2(titulos.reduce((s, t) => s + t.valor, 0));
    const acima90 = r2(titulos.filter(t => t.dias > 90).reduce((s, t) => s + t.valor, 0));
    const csvBytes = i % 2 ? latin1(csv) : utf8('\uFEFF' + csv);

    const files = [
      { nome: nomes.dre, bytes: await pdf(pagDre), tipo: 'digital' as const },
      { nome: nomes.bal, bytes: await pdf(pagBal), tipo: 'digital' as const },
      { nome: nomes.raz, bytes: await pdf(pagRaz), tipo: 'digital' as const },
      { nome: nomes.caixa, bytes: await xlsx(caixa), tipo: 'planilha' as const },
      { nome: nomes.inad, bytes: csvBytes, tipo: 'planilha' as const },
    ];
    const caso = `financeiro-pacote-${String(i).padStart(2, '0')}`;
    const dir = join(saida, 'financeiro', caso);
    const arquivos = gravar(dir, files);
    const paginas = nDre + nBal + nRaz;
    const fatos = [
      { topico: 'Caixa', descricao: 'Saldo inicial', valor: saldoIni, arquivo: nomes.caixa },
      { topico: 'Caixa', descricao: 'Total de entradas', valor: entradas, arquivo: nomes.caixa },
      { topico: 'Caixa', descricao: 'Total de saídas', valor: saidas, arquivo: nomes.caixa },
      { topico: 'Caixa', descricao: 'Saldo final', valor: saldoFim, arquivo: nomes.caixa },
      { topico: 'Inadimplência', descricao: `Total em atraso (posição em ${fim})`, valor: totalInad, arquivo: nomes.inad },
      { topico: 'Inadimplência', descricao: 'Quantidade de títulos em atraso', valor: titulos.length, arquivo: nomes.inad },
      { topico: 'Inadimplência', descricao: 'Em atraso há mais de 90 dias', valor: acima90, arquivo: nomes.inad },
      ...(inadMes !== mes ? [{ topico: 'Informações que faltam', descricao: `A inadimplência enviada é de ${mesPorExtenso(inadMes)}, não de ${ext}`, valor: null, arquivo: nomes.inad }] : []),
      ...(nBal > PAGINAS_LIDAS ? [{ topico: 'Informações que faltam', descricao: `O resumo do balancete está na página ${nBal}, além das ${PAGINAS_LIDAS} lidas por padrão`, valor: null, arquivo: nomes.bal }] : []),
    ];
    gravarJson(join(dir, 'gabarito.json'), {
      versao: 1, caso, frente: 'financeiro', tenant: 'demonstracao', modelo: 'resumo-financeiro-mensal', variacao: `pdf, ${paginas} páginas, caixa ${layoutCaixa}`,
      arquivos,
      esperado: { campos, topicos: TOPICOS, fatos, erroGrave: 'valor errado com origem aparentemente válida' },
      notas: [
        `Empresa fictícia (${empresa}), ${ext}. DRE com ${nDre} página(s), balancete com ${nBal}, razão com ${nRaz}: ${paginas} páginas em PDF.`,
        `A DRE traz também a coluna de ${mesPorExtenso(ant)} (armadilha: valor do mês errado); o quadro-resumo está na página ${pQuadro}.`,
        `O resumo do balancete está na última página (${nBal}).${nBal > PAGINAS_LIDAS ? ` Ela fica além das ${PAGINAS_LIDAS} páginas que o bloco ler lê por padrão (paginasMax): na versão 1 do modelo o valor não chega ao modelo, e o esperado continua sendo o valor certo.` : ''}${nRaz > PAGINAS_LIDAS ? ` O razão tem ${nRaz} páginas; só as ${PAGINAS_LIDAS} primeiras são lidas.` : ''}`,
        'O razão só tem lançamentos: receita, despesa e resultado esperados nulos.',
        'O modelo extrai só de PDF e DOCX; o fluxo de caixa (XLSX) e a inadimplência (CSV) entram só no resumo (fatos).',
        `Inadimplência em CSV com ponto e vírgula, ${i % 2 ? 'Latin-1' : 'UTF-8 com BOM'}${inadMes !== mes ? `, com posição de ${mesPorExtenso(inadMes)} (o resumo precisa apontar que falta a de ${ext})` : ''}.`,
        'Parte escaneada: pode vir depois, pela degradação sintética (degradar.ts).',
      ].join(' '),
      conferencia: { amostra: i % 5 === 0, por: null, em: null },
    });
    casos.push(caso);
  }
  return casos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', pacotes: '10', semente: '4302' });
  gerarFinanceiro(a.saida, Number(a.pacotes), Number(a.semente)).then(c => console.log(`${c.length} pacotes do Financeiro em ${join(a.saida, 'financeiro')}`));
}
