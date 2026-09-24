// Amostras fictícias para os quatro assistentes de referência (tenant de
// demonstração). Geradas na hora: NF-e e pedido para o fiscal, pasta de
// admissão para o RH, documentos do mês para o financeiro e evidências para
// LGPD. Nomes, CNPJs e valores são inventados.
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import { accessKeyDv } from '../blocks/danfe.ts';

export interface SampleFile { name: string; bytes: Uint8Array; mime: string }

export function pdfText(pages: string[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    pages.forEach((t, i) => { if (i) doc.addPage(); doc.fontSize(12).text(t); });
    doc.end();
  });
}

export async function docxText(paragraphs: string[]): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: paragraphs.map(p => new Paragraph(p)) }] })));
}

export async function xlsxSheets(sheets: Record<string, (string | number | Date | null)[][]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) wb.addWorksheet(name).addRows(rows);
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// PNG 1x1: representa uma foto de documento (o conteúdo vem da visão do modelo).
export const pngPlaceholder = () => new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'));

export interface NFeItemSpec { codigo: string; descricao: string; qtd: number; unit: number; pedido?: string; itemPedido?: string }

// Chave de acesso da NF-e fictícia, com dígito verificador válido.
export function nfeKey(numero: string, cnpj = '12345678000199', aamm = '2609'): string {
  const k = `35${aamm}${cnpj}55001${numero.padStart(9, '0')}100000000`;
  return k + accessKeyDv(k);
}

// NF-e autorizada (nfeProc), layout 4.00.
export function nfeXml(o: { numero: string; emissao: string; emitente?: string; cnpj?: string; pedido?: string; itens: NFeItemSpec[] }): string {
  const det = o.itens.map((it, i) => `
      <det nItem="${i + 1}"><prod>
        <cProd>${it.codigo}</cProd><cEAN>SEM GTIN</cEAN><xProd>${it.descricao}</xProd><NCM>39239000</NCM><CFOP>1102</CFOP>
        <uCom>UN</uCom><qCom>${it.qtd.toFixed(4)}</qCom><vUnCom>${it.unit.toFixed(10)}</vUnCom><vProd>${(it.qtd * it.unit).toFixed(2)}</vProd>
        ${it.pedido ? `<xPed>${it.pedido}</xPed>` : ''}${it.itemPedido ? `<nItemPed>${it.itemPedido}</nItemPed>` : ''}
      </prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS></imposto></det>`).join('');
  const total = o.itens.reduce((s, it) => s + Math.round(it.qtd * it.unit * 100) / 100, 0).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${nfeKey(o.numero, o.cnpj ?? '12345678000199', o.emissao.slice(2, 4) + o.emissao.slice(5, 7))}" versao="4.00">
      <ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${o.numero}</nNF><dhEmi>${o.emissao}T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>${o.cnpj ?? '12345678000199'}</CNPJ><xNome>${o.emitente ?? 'Plásticos Exemplo Ltda'}</xNome><enderEmit><UF>SP</UF></enderEmit><IE>111222333444</IE></emit>
      <dest><CNPJ>98765432000155</CNPJ><xNome>Empresa Demonstração S.A.</xNome><enderDest><UF>SP</UF></enderDest></dest>${det}
      <total><ICMSTot><vProd>${total}</vProd><vNF>${total}</vNF><vICMS>0.00</vICMS><vIPI>0.00</vIPI><vFrete>0.00</vFrete><vDesc>0.00</vDesc></ICMSTot></total>
      ${o.pedido ? `<compra><xPed>${o.pedido}</xPed></compra>` : ''}
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><nProt>135260000000123</nProt></infProt></protNFe>
</nfeProc>`;
}

const enc = (s: string) => new TextEncoder().encode(s);

// DANFE impresso (PDF com texto): a chave aparece em grupos de 4, como no documento real.
export function danfePdf(o: { numero: string; emissao: string; cnpj?: string; emitente?: string; total: string }): Promise<Uint8Array> {
  const chave = nfeKey(o.numero, o.cnpj ?? '12345678000199', o.emissao.slice(2, 4) + o.emissao.slice(5, 7));
  return pdfText([[
    'DANFE - Documento Auxiliar da Nota Fiscal Eletrônica',
    `${o.emitente ?? 'Plásticos Exemplo Ltda'}`,
    `NF-e Nº ${o.numero.padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')} Série 1`,
    'CHAVE DE ACESSO',
    chave.replace(/(\d{4})(?=\d)/g, '$1 '),
    `Data de emissão: ${o.emissao.split('-').reverse().join('/')}`,
    `VALOR TOTAL DA NOTA: ${o.total}`,
  ].join('\n')]);
}

// Fiscal: nota com 5 itens × pedido com 5 itens. Esperado: quantidade do P-002,
// preço do P-003 (4% acima), P-009 sem pedido, P-005 sem nota, valor total do
// cabeçalho. O P-004 fica dentro da tolerância de 1% e a emissão, dentro do prazo.
export async function fiscalSamples(): Promise<SampleFile[]> {
  const xml = nfeXml({ numero: '123', emissao: '2026-09-15', pedido: '4500123', itens: [
    { codigo: 'P-001', descricao: 'Caixa plástica 20L', qtd: 100, unit: 12.5, pedido: '4500123', itemPedido: '10' },
    { codigo: 'P-002', descricao: 'Tampa para caixa 20L', qtd: 48, unit: 3.2, pedido: '4500123', itemPedido: '20' },
    { codigo: 'P-003', descricao: 'Etiqueta adesiva', qtd: 1000, unit: 0.052, pedido: '4500123', itemPedido: '30' },
    { codigo: 'P-004', descricao: 'Fita de arquear', qtd: 10, unit: 9.93, pedido: '4500123', itemPedido: '40' },
    { codigo: 'P-009', descricao: 'Palete PBR', qtd: 2, unit: 45 },
  ] });
  const pedido = await xlsxSheets({
    Itens: [
      ['Código', 'Descrição', 'Quantidade', 'Preço unitário'],
      ['P-001', 'Caixa plástica 20L', 100, 12.5],
      ['P-002', 'Tampa para caixa 20L', 50, 3.2],
      ['P-003', 'Etiqueta adesiva', 1000, 0.05],
      ['P-004', 'Fita de arquear', 10, 9.9],
      ['P-005', 'Cantoneira de papelão', 20, 1.1],
    ],
    'Cabeçalho': [['Número do pedido', '4500123'], ['CNPJ do fornecedor', '12345678000199'], ['Data do pedido', '2026-09-01'], ['Valor total', 1581]],
  });
  return [
    { name: 'nfe-000123.xml', bytes: enc(xml), mime: 'application/xml' },
    { name: 'pedido-4500123.xlsx', bytes: pedido, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ];
}

// RH: pasta de admissão de uma candidata fictícia. Esperado: RG, CPF,
// comprovante de residência (foto, lida pela visão) e CTPS presentes; ASO
// ausente; título de eleitor e dados bancários duvidosos (só citados na ficha).
export async function rhSamples(): Promise<SampleFile[]> {
  return [
    { name: 'RG-maria.pdf', bytes: await pdfText(['REPÚBLICA FEDERATIVA DO BRASIL\nCARTEIRA DE IDENTIDADE\nNome: Maria Fictícia Souza\nNaturalidade: Campinas-SP']), mime: 'application/pdf' },
    { name: 'cpf-maria.pdf', bytes: await pdfText(['Comprovante de Situação Cadastral no CPF\nNome: Maria Fictícia Souza\nSituação cadastral: regular']), mime: 'application/pdf' },
    { name: 'foto-comprovante.png', bytes: pngPlaceholder(), mime: 'image/png' },
    { name: 'ctps-digital.pdf', bytes: await pdfText(['Carteira de Trabalho Digital\nQualificação civil: Maria Fictícia Souza\nContratos de trabalho: 2']), mime: 'application/pdf' },
    { name: 'ficha-cadastral.docx', bytes: await docxText([
      'Ficha cadastral de admissão',
      'Cargo: Analista administrativo. Início previsto: 01/10/2026. Jornada: 44 horas semanais. Local: matriz, Campinas.',
      'Dependentes: nenhum. Escolaridade: superior completo. Idiomas: inglês intermediário. Experiência anterior: 4 anos em rotinas administrativas e financeiras.',
      'Pendências informadas pela candidata: título de eleitor será entregue na próxima semana; dados bancários dependem da abertura da conta salário.',
    ]), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ];
}

// Transcrição simulada da foto do comprovante (provedor simulado nos testes).
export const RH_PHOTO_TRANSCRIPTION = '=== Página 1 ===\nCOMPANHIA DE ENERGIA EXEMPLO\nCONTA DE LUZ\nReferência: 08/2026\nTitular: Maria Fictícia Souza';

// Financeiro: documentos do mês.
export async function financeiroSamples(): Promise<SampleFile[]> {
  return [
    { name: 'dre-agosto-2026.pdf', bytes: await pdfText([
      'Demonstração do Resultado - agosto de 2026\nReceita operacional líquida: R$ 1.240.000,00\nCustos e despesas totais: R$ 1.105.500,00\nResultado do mês: R$ 134.500,00',
    ]), mime: 'application/pdf' },
    { name: 'fluxo-caixa-agosto.xlsx', bytes: await xlsxSheets({ Caixa: [
      ['Semana', 'Entradas', 'Saídas', 'Saldo final'], ['1', 310000, 280000, 530000], ['2', 295000, 310000, 515000], ['3', 330000, 290000, 555000], ['4', 305000, 325500, 534500],
    ] }), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { name: 'inadimplencia-agosto.csv', bytes: enc('Cliente;Vencimento;Valor;Dias em atraso\r\nComercial Alfa Ltda;05/08/2026;18.500,00;50\r\nDistribuidora Beta;20/08/2026;7.200,00;35\r\n'), mime: 'text/csv' },
  ];
}

// LGPD: evidências variadas; a planilha diversa não tem categoria nem período.
export async function lgpdSamples(): Promise<SampleFile[]> {
  return [
    { name: 'politica-de-privacidade-v3.pdf', bytes: await pdfText(['POLÍTICA DE PRIVACIDADE\nVersão 3, publicada em março de 2026.\nEsta política descreve como a Empresa Demonstração trata dados pessoais.']), mime: 'application/pdf' },
    { name: 'lista-presenca-treinamento.pdf', bytes: await pdfText(['LISTA DE PRESENÇA\nTreinamento de LGPD para lideranças\nData: 12/05/2026\nParticipantes: 18']), mime: 'application/pdf' },
    { name: 'acordo-fornecedor-nuvem.docx', bytes: await docxText(['ACORDO DE PROCESSAMENTO DE DADOS', 'Entre a Empresa Demonstração e o fornecedor de nuvem, assinado em 01/02/2026.']), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { name: 'relatorio-incidente-julho.pdf', bytes: await pdfText(['RELATÓRIO DE INCIDENTE\nOcorrência em 18/07/2026: envio de planilha a destinatário errado, contido no mesmo dia.']), mime: 'application/pdf' },
    { name: 'controle-chaves.xlsx', bytes: await xlsxSheets({ Chaves: [['Sala', 'Responsável'], ['Arquivo', 'Portaria']] }), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ];
}

export const SAMPLES: Record<string, () => Promise<SampleFile[]>> = {
  'conferencia-nfe': fiscalSamples,
  'checklist-admissao': rhSamples,
  'resumo-financeiro': financeiroSamples,
  'evidencias-lgpd': lgpdSamples,
};
