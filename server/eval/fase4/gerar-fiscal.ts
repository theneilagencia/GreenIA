// Notas fiscais de entrada fictícias e pedidos de compra para o assistente de
// conferência de nota × pedido (frente Fiscal). Cada caso tem uma NF-e (XML
// autorizado em homologação, com a DANFE em PDF) e o pedido exportado de um
// ERP, num de cinco layouts neutros (layout-a a layout-e): CSV em Latin-1 com
// títulos e rodapé de totais, XLSX com títulos e aba Campo | Valor, TXT de
// largura fixa, JSON em caixas (CX com 10 unidades) e XML. Nenhum layout é o
// principal. O mapeamento de importação de cada layout fica em
// mapeamentos/<layout>.json, no formato genérico do núcleo; o núcleo não
// conhece nenhum ERP.
// Divergências plantadas e registradas no gabarito, nos campos normalizados do
// pedido: quantidade, preço acima da tolerância (1%), item só na nota, item só
// no pedido, emissão fora do prazo (30 dias da data do pedido) e, por
// consequência, o valor total. Preço dentro da tolerância fica fora das
// divergências (em dentroDaTolerancia). O primeiro caso de cada cinco vem limpo;
// parte dos casos vem só com a DANFE, sem o XML (esperado: pedir o XML).
//   node --experimental-strip-types eval/fase4/gerar-fiscal.ts --saida eval/fase4/saida --casos 30 --semente 4301
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCA, args, brl, gravar, gravarJson, pdf, rng, xlsx, type PdfBlock, type Rng } from './lib.ts';
import { cnpj, cnpjFormatado, dataBr, diasEntre, fmtNum, latin1, r2, r4, semAcento, somaDias, utf8, type Mapeamento, type Registro } from './lib-extra.ts';
import { nfeKey } from '../../src/demo/samples.ts';

export const LAYOUTS = ['layout-a', 'layout-b', 'layout-c', 'layout-d', 'layout-e'] as const;
export type Layout = typeof LAYOUTS[number];
const EXT: Record<Layout, string> = { 'layout-a': 'csv', 'layout-b': 'xlsx', 'layout-c': 'txt', 'layout-d': 'json', 'layout-e': 'xml' };
export const PRAZO_DIAS = 30;             // regra do modelo: emissão até 30 dias depois da data do pedido
export const TOLERANCIA_PRECO = 0.01;     // valor unitário: 1% sobre o preço do pedido
export const TOLERANCIA_TOTAL = 1;        // valor total: R$ 1,00

export function mapeamento(layout: Layout): Mapeamento {
  return JSON.parse(readFileSync(new URL(`./mapeamentos/${layout}.json`, import.meta.url), 'utf8'));
}

// Produtos fictícios: código do fornecedor, descrição (até 40 caracteres), NCM, unidade e preço de referência.
const PRODUTOS = [
  ['4012', 'Parafuso sextavado M8x30 zincado', '73181500', 'UN', 0.38], ['4013', 'Porca sextavada M8 zincada', '73181600', 'UN', 0.12],
  ['5120', 'Arruela lisa 5/16 polegada', '73182200', 'UN', 0.06], ['7731', 'Luva de vaqueta tamanho G', '42032100', 'PR', 14.9],
  ['FT-ARQ-16', 'Fita de arquear 16 mm, rolo', '39201099', 'RL', 89.5], ['CX-PAP-40', 'Caixa de papelão 40x30x30 cm', '48191000', 'UN', 4.75],
  ['8801', 'Óleo lubrificante ISO 68, balde 20 L', '27101932', 'BD', 312], ['8802', 'Graxa de lítio EP2, pote 1 kg', '34031900', 'UN', 38.4],
  ['EPI-0450', 'Óculos de proteção incolor', '90049020', 'UN', 7.9], ['EPI-0451', 'Protetor auricular tipo plug', '39269090', 'PR', 1.35],
  ['3305', 'Disco de corte 7 polegadas para aço', '68042211', 'UN', 9.8], ['3306', 'Lixa para ferro grão 120', '68052000', 'FL', 2.1],
  ['6100', 'Eletrodo revestido E6013 2,5 mm', '83111000', 'KG', 27.9], ['6101', 'Arame de solda MIG 1,0 mm', '83112000', 'KG', 21.5],
  ['9020', 'Pallet de madeira PBR 1,20 x 1,00 m', '44152000', 'UN', 58], ['2210', 'Filme stretch 500 mm x 25 micras', '39201010', 'RL', 64.9],
  ['2215', 'Etiqueta adesiva 100x50 mm', '48211000', 'MIL', 42], ['1150', 'Cabo PP 3x2,5 mm', '85444900', 'M', 9.6],
  ['1151', 'Abraçadeira de nylon 200 mm', '39269090', 'PCT', 12.5], ['7000', 'Sabão desengraxante, galão 5 L', '34022000', 'GL', 45],
] as const;
const EMITENTES = ['Parafusos Exemplo Ltda.', 'Distribuidora Fictícia de EPI Ltda.', 'Embalagens Modelo S.A.', 'Lubrificantes Teste Ltda.', 'Ferragens Exemplo Comércio Ltda.', 'Soldas Fictícias Ltda.'];
const DESTINATARIO = 'Empresa Demonstração S.A.';
const CNPJ_DESTINATARIO = cnpj(rng(4300));

interface Linha { codigo: string; descricao: string; ncm: string; unidade: string; quantidade: number; valorUnitario: number }
export type CampoDivergencia = 'pedido' | 'cnpjFornecedor' | 'dataPedido' | 'totalPedido' | 'codigo' | 'descricao' | 'quantidade' | 'valorUnitario';
export interface Divergencia { chave: string; campo: CampoDivergencia; tipo: string; esperado: string | number | null; encontrado: string | number | null; regra?: string }

// Chave de junção dos itens (como no bloco de conferência): sem acento, sem
// maiúsculas, e código só com dígitos comparado como número ("000123" = "123").
export const chaveItem = (v: unknown) => { const s = semAcento(String(v ?? '')).toLowerCase().trim(); return /^\d+$/.test(s) ? String(Number(s)) : s; };
const chaveExibida = (c: unknown) => { const s = String(c ?? '').trim(); return /^\d+$/.test(s) ? String(Number(s)) : s; };
const normTexto = (s: string) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();

// Conferência de referência nos campos normalizados: nota (XML) × registros do pedido.
export function conferirReferencia(nota: { itens: Linha[]; dataEmissao: string; pedido: string; cnpjEmitente: string; valorTotal: number }, regs: Registro[]): { divergencias: Divergencia[]; dentro: Divergencia[] } {
  const divergencias: Divergencia[] = []; const dentro: Divergencia[] = [];
  const porChave = new Map(regs.map(r => [chaveItem(r.codigo), r]));
  const usados = new Set<Registro>();
  for (const it of nota.itens) {
    const k = chaveItem(it.codigo);
    const p = porChave.get(k);
    if (!p) { divergencias.push({ chave: chaveExibida(it.codigo), campo: 'codigo', tipo: 'so_na_nota', esperado: null, encontrado: it.codigo, regra: 'item da nota sem par no pedido' }); continue; }
    usados.add(p);
    const c = chaveExibida(it.codigo);
    if (Math.abs(it.quantidade - Number(p.quantidade)) > 1e-9) divergencias.push({ chave: c, campo: 'quantidade', tipo: 'quantidade', esperado: Number(p.quantidade), encontrado: it.quantidade });
    const dif = Math.abs(it.valorUnitario - Number(p.valorUnitario));
    if (dif > 1e-9) {
      const d: Divergencia = { chave: c, campo: 'valorUnitario', tipo: dif <= Number(p.valorUnitario) * TOLERANCIA_PRECO + 1e-9 ? 'preco_dentro_tolerancia' : 'preco_fora_tolerancia', esperado: Number(p.valorUnitario), encontrado: it.valorUnitario, regra: 'tolerância de 1% sobre o preço do pedido' };
      (d.tipo === 'preco_dentro_tolerancia' ? dentro : divergencias).push(d);
    }
    if (normTexto(it.descricao) !== normTexto(String(p.descricao ?? ''))) divergencias.push({ chave: c, campo: 'descricao', tipo: 'descricao', esperado: String(p.descricao), encontrado: it.descricao });
  }
  for (const p of regs) if (!usados.has(p)) divergencias.push({ chave: chaveExibida(p.codigo), campo: 'codigo', tipo: 'so_no_pedido', esperado: String(p.codigo), encontrado: null, regra: 'item do pedido sem par na nota' });
  const cab = regs[0];
  if (cab) {
    if (String(cab.pedido) !== nota.pedido) divergencias.push({ chave: 'cabecalho', campo: 'pedido', tipo: 'pedido', esperado: String(cab.pedido), encontrado: nota.pedido });
    if (String(cab.cnpjFornecedor) !== nota.cnpjEmitente) divergencias.push({ chave: 'cabecalho', campo: 'cnpjFornecedor', tipo: 'cnpj', esperado: String(cab.cnpjFornecedor), encontrado: nota.cnpjEmitente });
    const dias = diasEntre(String(cab.dataPedido), nota.dataEmissao);
    if (dias < 0 || dias > PRAZO_DIAS) divergencias.push({ chave: 'cabecalho', campo: 'dataPedido', tipo: 'prazo_emissao', esperado: String(cab.dataPedido), encontrado: nota.dataEmissao, regra: `emissão até ${PRAZO_DIAS} dias depois da data do pedido (${dias} dias)` });
    const total = Number(cab.totalPedido);
    if (Math.abs(total - nota.valorTotal) > TOLERANCIA_TOTAL + 1e-9) divergencias.push({ chave: 'cabecalho', campo: 'totalPedido', tipo: 'valor_total', esperado: total, encontrado: nota.valorTotal, regra: 'total do pedido × valor da nota, tolerância de R$ 1,00' });
  }
  return { divergencias, dentro };
}

// ---- NF-e e DANFE -----------------------------------------------------------------------------------
function nfeXml(o: { chave: string; numero: string; emissao: string; emitente: string; cnpjEmit: string; pedido: string; itens: Linha[]; nItemPed: (string | null)[]; total: number }): string {
  const det = o.itens.map((it, i) => `
      <det nItem="${i + 1}">
        <prod><cProd>${it.codigo}</cProd><cEAN>SEM GTIN</cEAN><xProd>${it.descricao}</xProd><NCM>${it.ncm}</NCM><CFOP>5102</CFOP><uCom>${it.unidade}</uCom><qCom>${it.quantidade.toFixed(4)}</qCom><vUnCom>${it.valorUnitario.toFixed(4)}</vUnCom><vProd>${r2(it.quantidade * it.valorUnitario).toFixed(2)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${it.unidade}</uTrib><qTrib>${it.quantidade.toFixed(4)}</qTrib><vUnTrib>${it.valorUnitario.toFixed(4)}</vUnTrib><indTot>1</indTot>${o.nItemPed[i] ? `<xPed>${o.pedido}</xPed><nItemPed>${o.nItemPed[i]}</nItemPed>` : ''}</prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>0.00</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS></imposto>
      </det>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${o.chave}" versao="4.00">
      <ide><cUF>35</cUF><cNF>${o.chave.slice(35, 43)}</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${o.numero}</nNF><dhEmi>${o.emissao}T10:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3509502</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${o.chave[43]}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>0</indFinal><indPres>9</indPres><procEmi>0</procEmi><verProc>corpus-fase4</verProc></ide>
      <emit><CNPJ>${o.cnpjEmit}</CNPJ><xNome>${o.emitente}</xNome><enderEmit><xLgr>Rua Fictícia</xLgr><nro>100</nro><xBairro>Distrito Industrial</xBairro><cMun>3509502</cMun><xMun>Campinas</xMun><UF>SP</UF><CEP>13000000</CEP></enderEmit><IE>111222333444</IE><CRT>3</CRT></emit>
      <dest><CNPJ>${CNPJ_DESTINATARIO}</CNPJ><xNome>${DESTINATARIO}</xNome><enderDest><xLgr>Avenida dos Ipês</xLgr><nro>2000</nro><xBairro>Centro</xBairro><cMun>3509502</cMun><xMun>Campinas</xMun><UF>SP</UF><CEP>13010000</CEP></enderDest><indIEDest>1</indIEDest><IE>555666777888</IE></dest>${det}
      <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>${o.total.toFixed(2)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vIPI>0.00</vIPI><vOutro>0.00</vOutro><vNF>${o.total.toFixed(2)}</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete></transp>
      <infAdic><infCpl>${MARCA}. Nota gerada para teste, em ambiente de homologação, sem valor fiscal.</infCpl></infAdic>
      <compra><xPed>${o.pedido}</xPed></compra>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${o.chave}</chNFe><dhRecbto>${o.emissao}T10:05:00-03:00</dhRecbto><nProt>1352${o.chave.slice(25, 36)}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>
`;
}

function danfe(o: { chave: string; numero: string; emissao: string; emitente: string; cnpjEmit: string; pedido: string; itens: Linha[]; total: number }): Promise<Uint8Array> {
  const blocos: PdfBlock[] = [
    { titulo: 'DANFE · DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA', linhas: ['0 - Entrada · 1 - Saída: 1', `NF-e Nº ${o.numero.padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')} · Série 001`, `Emitente: ${o.emitente} · CNPJ ${cnpjFormatado(o.cnpjEmit)}`, 'Ambiente de homologação: sem valor fiscal'] },
    { titulo: 'CHAVE DE ACESSO', linhas: [o.chave.replace(/(\d{4})(?=\d)/g, '$1 '), 'Consulta de autenticidade no portal nacional da NF-e'] },
    { titulo: 'DESTINATÁRIO', linhas: [`${DESTINATARIO} · CNPJ ${cnpjFormatado(CNPJ_DESTINATARIO)}`, `Data de emissão: ${dataBr(o.emissao)}`, `Pedido de compra: ${o.pedido}`] },
    { titulo: 'DADOS DOS PRODUTOS', linhas: ['Código · Descrição · NCM · CFOP · Un · Quantidade · Valor unitário · Valor total',
      ...o.itens.map(it => `${it.codigo} · ${it.descricao} · ${it.ncm} · 5102 · ${it.unidade} · ${fmtNum(it.quantidade, 4)} · ${fmtNum(it.valorUnitario, 4)} · ${brl(r2(it.quantidade * it.valorUnitario))}`)] },
    { titulo: 'CÁLCULO DO IMPOSTO', linhas: [`VALOR TOTAL DOS PRODUTOS: R$ ${brl(o.total)}`, `VALOR TOTAL DA NOTA: R$ ${brl(o.total)}`] },
  ];
  return pdf([blocos]);
}

// ---- Pedido em cada layout ---------------------------------------------------------------------------
interface Pedido { numero: string; data: string; fornecedor: string; cnpj: string; linhas: Linha[] }

const pad6 = (c: string) => /^\d+$/.test(c) ? c.padStart(6, '0') : c;
const maiusc = (s: string) => semAcento(s).toUpperCase();

// Registros normalizados que o mapeamento do layout precisa entregar.
function registros(layout: Layout, p: Pedido): Registro[] {
  const total = r2(p.linhas.reduce((s, l) => s + r2(l.quantidade * l.valorUnitario), 0));
  return p.linhas.map(l => ({
    pedido: p.numero, cnpjFornecedor: p.cnpj, dataPedido: p.data,
    totalPedido: total,
    codigo: layout === 'layout-b' ? pad6(l.codigo) : l.codigo,
    descricao: layout === 'layout-c' ? maiusc(l.descricao) : l.descricao,
    unidade: l.unidade, quantidade: l.quantidade, valorUnitario: l.valorUnitario, valorTotal: r2(l.quantidade * l.valorUnitario),
  }));
}

async function arquivoPedido(layout: Layout, p: Pedido): Promise<Uint8Array> {
  const total = r2(p.linhas.reduce((s, l) => s + r2(l.quantidade * l.valorUnitario), 0));
  const vt = (l: Linha) => r2(l.quantidade * l.valorUnitario);
  if (layout === 'layout-a') {
    const q = (n: number) => Number.isInteger(n) ? fmtNum(n, 0) : fmtNum(n, 3);
    const linhas = [
      `RELATÓRIO DE PEDIDO DE COMPRA · ${MARCA}`,
      `Pedido nº: ${p.numero};;Data do pedido: ${dataBr(p.data)}`,
      `Fornecedor: ${p.fornecedor};;CNPJ: ${cnpjFormatado(p.cnpj)}`,
      `Valor total do pedido: ${fmtNum(total, 2)};;Emitido em 01/09/2026 10:15 por compras`,
      'Item;Cód. Produto;Descrição;Un;Qtde;Vlr. Unit.;Vlr. Total',
      ...p.linhas.map((l, i) => [String(i + 1).padStart(4, '0'), l.codigo, l.descricao, l.unidade, q(l.quantidade), fmtNum(l.valorUnitario, 4), fmtNum(vt(l), 2)].join(';')),
      `Total geral;;;;;;${fmtNum(total, 2)}`,
      `Registros listados: ${p.linhas.length}`,
    ];
    return latin1(linhas.join('\r\n') + '\r\n');
  }
  if (layout === 'layout-b') {
    return xlsx({
      'Itens do pedido': [
        ['Pedido de compra', null, null, null, null, null],
        [MARCA, null, null, null, null, null],
        ['Exportado em 2026-09-01', null, null, null, null, null],
        ['Seq', 'Produto', 'Qtd', 'UM', 'Preço', 'Total'],
        ...p.linhas.map((l, i) => [i + 1, `${pad6(l.codigo)} - ${l.descricao}`, l.quantidade, l.unidade, l.valorUnitario, vt(l)]),
      ],
      'Dados do pedido': [['Campo', 'Valor'], ['Número', p.numero], ['Fornecedor', p.fornecedor], ['CNPJ', cnpjFormatado(p.cnpj)], ['Emissão', p.data], ['Total', total], ['Observação', MARCA]],
    });
  }
  if (layout === 'layout-c') {
    const n = (x: number, casas: number, w: number) => fmtNum(x, casas, ',', '').padStart(w);
    const cab = 'PEDIDO'.padEnd(10) + 'DATA'.padEnd(8) + 'CNPJ FORNEC'.padEnd(14) + 'CODIGO'.padEnd(15) + 'DESCRICAO'.padEnd(40) + 'UN'.padEnd(3) + 'QUANTIDADE'.padStart(12) + 'PRECO UNIT'.padStart(14) + 'VALOR TOTAL'.padStart(14);
    const linhas = [
      `PEDCOMPRA  EXPORTACAO DE ITENS DE PEDIDO    ${MARCA}`,
      `EMISSAO DO ARQUIVO: 20260901   VALOR TOTAL DO PEDIDO: ${fmtNum(total, 2, ',', '')}`,
      cab,
      '-'.repeat(cab.length),
      ...p.linhas.map(l => p.numero.padEnd(10) + p.data.replace(/-/g, '') + p.cnpj + l.codigo.padEnd(15) + maiusc(l.descricao).padEnd(40) + l.unidade.padEnd(3) + n(l.quantidade, 3, 12) + n(l.valorUnitario, 4, 14) + n(vt(l), 2, 14)),
      `TOTAL DE REGISTROS: ${String(p.linhas.length).padStart(6, '0')}`,
    ];
    return latin1(linhas.join('\r\n') + '\r\n');
  }
  if (layout === 'layout-d') {
    const obj = { aviso: MARCA, exportadoEm: '2026-09-01T10:00:00-03:00', dados: { linhas: p.linhas.map(l => ({
      pedido: { numero: p.numero, data: p.data, valorTotal: total }, fornecedor: { cnpj: p.cnpj, nome: p.fornecedor }, item: { codigo: l.codigo, descricao: l.descricao },
      embalagem: 'CX', fatorConversao: 10, quantidade: l.quantidade / 10, precoUnitario: r2(l.valorUnitario * 10), valorTotal: vt(l),
    })) } };
    return utf8(JSON.stringify(obj, null, 2) + '\n');
  }
  const n = (x: number, casas: number) => fmtNum(x, casas, '.', ',');
  const regs = p.linhas.map(l => `    <Registro>
      <NumPedido>${p.numero}</NumPedido>
      <DtPedido>${dataBr(p.data).replace(/\/(\d{2})(\d{2})$/, '/$2')}</DtPedido>
      <CnpjForn>${cnpjFormatado(p.cnpj)}</CnpjForn>
      <VlrTotalPedido>${n(total, 2)}</VlrTotalPedido>
      <CodProduto>${l.codigo}</CodProduto>
      <DescProduto>${l.descricao}</DescProduto>
      <Unid>${l.unidade}</Unid>
      <Qtd>${n(l.quantidade, 3)}</Qtd>
      <VlrUnit>${n(l.valorUnitario, 4)}</VlrUnit>
      <VlrTotal>${n(vt(l), 2)}</VlrTotal>
    </Registro>`).join('\n');
  return utf8(`<?xml version="1.0" encoding="UTF-8"?>
<!-- ${MARCA} -->
<ExportacaoPedidos versao="2.1">
  <Aviso>${MARCA}</Aviso>
  <Registros>
${regs}
  </Registros>
</ExportacaoPedidos>
`);
}

const NOTAS_LAYOUT: Record<Layout, string> = {
  'layout-a': 'CSV com ponto e vírgula em Latin-1; número do pedido, data e CNPJ nas linhas de título; rodapé com total geral e contagem de registros.',
  'layout-b': 'XLSX com três linhas de título acima da tabela; código e descrição na mesma coluna ("000123 - Descrição"), código numérico com zeros à esquerda; dados do pedido na aba Campo | Valor.',
  'layout-c': 'TXT de largura fixa em Latin-1, descrição em maiúsculas sem acento, data aaaammdd, decimal com vírgula, linha de trailer.',
  'layout-d': 'JSON de linhas de pedido em caixas (CX com 10 unidades): o mapeamento multiplica a quantidade por 10 e divide o preço por 10.',
  'layout-e': 'XML de registros, data dd/mm/aa, número com ponto decimal e vírgula de milhar, CNPJ formatado.',
};
const REAIS = ['quantidade', 'preco_fora_tolerancia', 'so_na_nota', 'so_no_pedido', 'prazo_emissao'] as const;

function quantidade(r: Rng, layout: Layout, unidade: string): number {
  if (layout === 'layout-d') return r.int(1, 30) * 10;
  if (unidade === 'KG') return r.int(4, 120) / 2;
  if (unidade === 'M') return r.int(10, 300);
  return r.int(2, 200);
}

export async function gerarFiscal(saida: string, casos: number, semente: number) {
  const out: string[] = [];
  let k = 0;                                                            // contador dos casos com divergência plantada
  for (let i = 1; i <= casos; i++) {
    const r = rng(semente * 1000 + i);
    const layout = LAYOUTS[(i - 1 + Math.floor((i - 1) / 5)) % LAYOUTS.length];   // desloca a cada bloco de 5: todo layout tem caso limpo, só DANFE e com divergência
    const limpo = i % 5 === 1;
    const soDanfe = !limpo && (i % 5 === 3 || i % 15 === 0);
    const emitente = r.pick(EMITENTES);
    const cnpjEmit = cnpj(r);
    const numero = String(r.int(1000, 99999));
    const numPedido = String(r.int(100000, 999999));
    const dataPedido = somaDias('2026-06-01', r.int(0, 75));
    let emissao = somaDias(dataPedido, r.int(1, 25));
    const pool = PRODUTOS.filter(p => layout !== 'layout-d' || p[3] === 'UN');
    const escolha = r.shuffle(pool);
    const base: Linha[] = escolha.slice(0, r.int(4, Math.min(7, pool.length - 2))).map(([codigo, descricao, ncm, unidade, preco]) => ({
      codigo, descricao, ncm, unidade, quantidade: quantidade(r, layout, unidade), valorUnitario: Math.max(0.01, r2(preco * (0.9 + r.next() * 0.2))),
    }));
    const extras = escolha.slice(base.length);
    const ped = base.map(l => ({ ...l }));
    const nf = base.map(l => ({ ...l }));
    const plantadas: string[] = [];
    let dentroPlantado = false;
    if (!limpo && !soDanfe) {
      const tipos = new Set<string>([REAIS[k % REAIS.length]]);
      if (r.next() < 0.4) tipos.add(r.pick(REAIS));
      dentroPlantado = k % 2 === 0 || r.next() < 0.5;
      k++;
      const alvos = r.shuffle(base.map((_, j) => j));
      let a = 0;
      for (const t of REAIS.filter(t => tipos.has(t))) {
        if (t === 'quantidade') {
          const j = alvos[a++]; const q = ped[j].quantidade;
          let d = layout === 'layout-d' ? r.int(1, 9) : ped[j].unidade === 'KG' ? r.int(1, 6) / 2 : r.int(1, Math.max(1, Math.round(q * 0.2)));
          if (q - d <= 0 || r.next() < 0.5) d = Math.abs(d); else d = -d;
          nf[j].quantidade = q + d;
        } else if (t === 'preco_fora_tolerancia') {
          const j = alvos[a++];
          nf[j].valorUnitario = r4(ped[j].valorUnitario * (1 + (r.next() < 0.75 ? 1 : -1) * r.int(25, 120) / 1000));
        } else if (t === 'so_na_nota') {
          const [codigo, descricao, ncm, unidade, preco] = extras.shift()!;
          nf.splice(r.int(0, nf.length), 0, { codigo, descricao, ncm, unidade, quantidade: quantidade(r, layout, unidade), valorUnitario: r2(preco) });
        } else if (t === 'so_no_pedido') {
          const [codigo, descricao, ncm, unidade, preco] = extras.shift()!;
          ped.splice(r.int(0, ped.length), 0, { codigo, descricao, ncm, unidade, quantidade: quantidade(r, layout, unidade), valorUnitario: r2(preco) });
        } else if (t === 'prazo_emissao') {
          emissao = somaDias(dataPedido, r.next() < 0.8 ? r.int(PRAZO_DIAS + 5, 70) : -r.int(2, 10));
        }
        plantadas.push(t);
      }
      if (dentroPlantado) {
        const j = alvos[a++];
        const p0 = ped[j].valorUnitario;
        let v = r4(p0 * (1 + (r.next() < 0.5 ? 1 : -1) * r.int(2, 8) / 1000));
        if (v === p0) v = r4(p0 + 0.0001);
        if (Math.abs(v - p0) <= p0 * TOLERANCIA_PRECO) nf[j].valorUnitario = v; else dentroPlantado = false;
      }
    }
    const totalNf = r2(nf.reduce((s, l) => s + r2(l.quantidade * l.valorUnitario), 0));
    const chave = nfeKey(numero, cnpjEmit, emissao.slice(2, 4) + emissao.slice(5, 7));
    const pedido: Pedido = { numero: numPedido, data: dataPedido, fornecedor: emitente, cnpj: cnpjEmit, linhas: ped };
    const regs = registros(layout, pedido);
    const nItemPed = nf.map(l => { const j = ped.findIndex(p => p.codigo === l.codigo); return j < 0 ? null : String((j + 1) * 10); });
    const nota = { chave, numero, emissao, emitente, cnpjEmit, pedido: numPedido, itens: nf, total: totalNf };

    const xmlNome = `nfe-${numero}.xml`, danfeNome = `danfe-${numero}.pdf`, pedNome = `pedido-${numPedido}.${EXT[layout]}`;
    const files = [
      ...(soDanfe ? [] : [{ nome: xmlNome, bytes: utf8(nfeXml({ ...nota, nItemPed })), tipo: 'xml' as const }]),
      { nome: danfeNome, bytes: await danfe(nota), tipo: 'digital' as const },
      { nome: pedNome, bytes: await arquivoPedido(layout, pedido), tipo: 'planilha' as const },
    ];
    const conf = soDanfe ? { divergencias: [], dentro: [] } : conferirReferencia({ itens: nf, dataEmissao: emissao, pedido: numPedido, cnpjEmitente: cnpjEmit, valorTotal: totalNf }, regs);
    const caso = `fiscal-nota-${String(i).padStart(2, '0')}`;
    const dir = join(saida, 'fiscal', caso);
    const arquivos = gravar(dir, files);
    const tipoCaso = limpo ? 'limpo' : soDanfe ? 'danfe_sem_xml' : 'divergencias';
    gravarJson(join(dir, 'gabarito.json'), {
      versao: 1, caso, frente: 'fiscal', tenant: 'demonstracao', modelo: 'conferencia-nota-pedido', variacao: `${layout} ${EXT[layout]}${soDanfe ? ', só DANFE' : ''}`,
      arquivos,
      esperado: {
        tipoCaso,
        nota: { chave, numero, dataEmissao: emissao, cnpjEmitente: cnpjEmit, valorTotal: totalNf, xml: soDanfe ? null : xmlNome, danfe: danfeNome },
        pedido: { arquivo: pedNome, layout, mapeamento: `mapeamentos/${layout}.json`, registros: regs },
        divergencias: conf.divergencias,
        dentroDaTolerancia: conf.dentro,
        pedirXml: soDanfe ? [chave] : [],
        erroGrave: 'divergência não apontada',
      },
      notas: [
        `Pedido no ${layout}: ${NOTAS_LAYOUT[layout]}`,
        `Importação pelo mapeamento mapeamentos/${layout}.json; o gabarito usa só os campos normalizados (pedido, cnpjFornecedor, dataPedido, totalPedido, codigo, descricao, quantidade, unidade, valorUnitario, valorTotal), nunca os nomes de coluna do sistema de origem.`,
        'O modelo conferencia-nota-pedido (versão 2) lê o pedido pelo conjunto de dados "pedido": o tenant de avaliação precisa ter este mapeamento cadastrado.',
        tipoCaso === 'limpo' ? 'Caso limpo (controle): nota e pedido iguais, emissão dentro do prazo.'
          : tipoCaso === 'danfe_sem_xml' ? `Só a DANFE, sem o XML: o esperado é pedir o XML ao fornecedor (chave ${chave}). Sem o XML não há conferência de itens; nota e pedido são iguais.`
            : `Plantado: ${plantadas.join(', ')}${dentroPlantado ? '; preço dentro da tolerância de 1% (não é divergência)' : ''}. O total do pedido entra quando difere do valor da nota em mais de R$ 1,00.`,
        'Regras do modelo: quantidade exata, valor unitário com tolerância de 1%, descrição sem diferenciar maiúsculas e acentos, emissão até 30 dias depois da data do pedido, total do pedido × valor da nota com tolerância de R$ 1,00. O valorTotal de cada item não é conferido. A chave de junção é o código (só dígitos: comparado como número).',
      ].join(' '),
      conferencia: { amostra: i % 5 === 0, por: null, em: null },
    });
    out.push(caso);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', casos: '30', semente: '4301' });
  gerarFiscal(a.saida, Number(a.casos), Number(a.semente)).then(c => console.log(`${c.length} casos do Fiscal em ${join(a.saida, 'fiscal')}`));
}
