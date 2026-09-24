// Leitor de XML de NF-e (modelo 55): campos por parser, sem modelo.
import type { Reader } from './registry.ts';
import { isNFeXml, nfeToText, parseNFe, type NFe } from './nfe-parser.ts';

export const nfeReader: Reader = {
  id: 'nfe',
  label: 'XML de NF-e',
  description: 'Lê o XML da nota fiscal eletrônica (modelo 55) por parser: emitente, destinatário, itens, totais, pedido e chave de acesso. Nada passa pelo modelo.',
  kind: { id: 'nfe_xml', label: 'XML de NF-e' },
  fields: [
    { caminho: 'chave', descricao: 'chave de acesso (44 dígitos)' },
    { caminho: 'numero', descricao: 'número da nota' },
    { caminho: 'dataEmissao', descricao: 'data de emissão' },
    { caminho: 'emitente', descricao: 'cnpj, nome, ie, uf' },
    { caminho: 'destinatario', descricao: 'cnpj, cpf, nome, uf' },
    { caminho: 'pedido', descricao: 'número do pedido de compra (cabeçalho)' },
    { caminho: 'itens', descricao: 'lista: n, codigo, descricao, ncm, cfop, unidade, quantidade, valorUnitario, valorTotal, pedido, itemPedido, ean' },
    { caminho: 'totais', descricao: 'produtos, nota, icms, ipi, frete, desconto' },
  ],
  instruction: 'Em XML de NF-e, use os campos do XML (emitente, destinatário, itens, totais), sem interpretar.',
  matches: text => isNFeXml(text),
  read: text => {
    const nfe = parseNFe(text);
    return { text: nfeToText(nfe), dados: nfe, periodo: nfe.dataEmissao ? nfe.dataEmissao.slice(0, 7) : null };
  },
  summary: dados => { const n = dados as NFe; return { numero: n.numero, chave: n.chave, itens: n.itens.length }; },
};
