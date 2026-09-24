// Leitura determinística do XML de NF-e (modelo 55, layout 4.00), por parser.
// Os campos estruturados nunca passam pelo modelo. Aceita o XML autorizado
// (nfeProc) ou só a NFe. Números viram number; códigos continuam texto (para
// não perder zeros à esquerda).
import { XMLParser } from 'fast-xml-parser';

export interface NFeItem {
  n: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  pedido: string;          // xPed do item (número do pedido de compra)
  itemPedido: string;      // nItemPed
  ean: string;
}

export interface NFe {
  chave: string;
  numero: string;
  serie: string;
  modelo: string;
  dataEmissao: string;     // ISO (como no XML)
  naturezaOperacao: string;
  emitente: { cnpj: string; nome: string; ie: string; uf: string };
  destinatario: { cnpj: string; cpf: string; nome: string; uf: string };
  pedido: string;          // compra/xPed (cabeçalho)
  itens: NFeItem[];
  totais: { produtos: number | null; nota: number | null; icms: number | null; ipi: number | null; frete: number | null; desconto: number | null };
  protocolo: string;       // nProt, se autorizada
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: name => name === 'det',
  trimValues: true,
});

const num = (v: unknown) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function isNFeXml(text: string) {
  return /<(\w+:)?(nfeProc|NFe)[\s>]/.test(text) && /<(\w+:)?infNFe[\s>]/.test(text);
}

export function parseNFe(xml: string): NFe {
  let doc: any;
  try { doc = parser.parse(xml); } catch (e) { throw new Error('XML inválido: ' + (e as Error).message); }
  const nfe = doc.nfeProc?.NFe ?? doc.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error('XML não é uma NF-e (infNFe não encontrado)');
  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const tot = inf.total?.ICMSTot ?? {};
  const itens: NFeItem[] = (inf.det ?? []).map((d: any) => {
    const p = d.prod ?? {};
    return {
      n: Number(d['@nItem']) || 0,
      codigo: str(p.cProd), descricao: str(p.xProd), ncm: str(p.NCM), cfop: str(p.CFOP), unidade: str(p.uCom),
      quantidade: num(p.qCom), valorUnitario: num(p.vUnCom), valorTotal: num(p.vProd),
      pedido: str(p.xPed), itemPedido: str(p.nItemPed), ean: str(p.cEAN) === 'SEM GTIN' ? '' : str(p.cEAN),
    };
  });
  return {
    chave: str(inf['@Id']).replace(/^NFe/, ''),
    numero: str(ide.nNF), serie: str(ide.serie), modelo: str(ide.mod),
    dataEmissao: str(ide.dhEmi || ide.dEmi), naturezaOperacao: str(ide.natOp),
    emitente: { cnpj: str(emit.CNPJ), nome: str(emit.xNome), ie: str(emit.IE), uf: str(emit.enderEmit?.UF) },
    destinatario: { cnpj: str(dest.CNPJ), cpf: str(dest.CPF), nome: str(dest.xNome), uf: str(dest.enderDest?.UF) },
    pedido: str(inf.compra?.xPed),
    itens,
    totais: { produtos: num(tot.vProd), nota: num(tot.vNF), icms: num(tot.vICMS), ipi: num(tot.vIPI), frete: num(tot.vFrete), desconto: num(tot.vDesc) },
    protocolo: str(doc.nfeProc?.protNFe?.infProt?.nProt),
  };
}

// Texto legível da nota (para busca, resumo e revisão). Sem o XML bruto.
export function nfeToText(n: NFe): string {
  const lines = [
    `NF-e ${n.numero} série ${n.serie}, emitida em ${n.dataEmissao.slice(0, 10)}`,
    `Emitente: ${n.emitente.nome} (CNPJ ${n.emitente.cnpj})`,
    `Destinatário: ${n.destinatario.nome}`,
    n.pedido ? `Pedido: ${n.pedido}` : '',
    ...n.itens.map(i => `Item ${i.n}: ${i.codigo} ${i.descricao}, ${i.quantidade} ${i.unidade} x ${i.valorUnitario} = ${i.valorTotal}`),
    `Total dos produtos: ${n.totais.produtos}; total da nota: ${n.totais.nota}`,
  ];
  return lines.filter(Boolean).join('\n');
}
