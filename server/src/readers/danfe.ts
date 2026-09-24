// Leitor de DANFE em PDF: só a chave de acesso. A GreenIA não extrai os campos
// da nota do texto impresso; ela procura, na mesma execução, o XML com a mesma
// chave. Sem o XML, a nota fica como "pedir o XML ao fornecedor".
import type { ReadDoc } from '../blocks/types.ts';
import type { Reader } from './registry.ts';
import { findAccessKey } from './danfe-key.ts';

export const DANFE_SEM_XML = 'pedir o XML ao fornecedor';

export const danfeReader: Reader = {
  id: 'danfe',
  label: 'Chave de acesso de DANFE',
  description: 'Acha a chave de acesso (44 dígitos, dígito verificador conferido) no PDF de uma DANFE e liga a nota ao XML de mesma chave. Os campos da nota nunca saem do texto impresso.',
  fields: [{ caminho: 'chave', descricao: 'chave de acesso da nota' }],
  instruction: 'Em DANFE (PDF da nota), não extraia os campos do texto impresso: use o XML com a mesma chave de acesso ou peça o XML ao fornecedor.',
  enrich: (doc: ReadDoc) => {
    if (doc.kind !== 'pdf') return null;
    const chave = findAccessKey(doc.text);
    return chave ? { dados: { chave }, semExtracao: `DANFE: campos não extraídos do PDF; use o XML da nota (chave ${chave})` } : null;
  },
  link: (read, all) => read.filter(d => d.dados?.danfe).map(d => {
    const { chave } = d.dados!.danfe as { chave: string };
    const xml = all.find(x => (x.dados?.nfe as { chave?: string } | undefined)?.chave === chave);
    return xml
      ? { fileId: d.fileId, situacao: `DANFE: XML ${xml.name}` }
      : { fileId: d.fileId, situacao: `DANFE: ${DANFE_SEM_XML}`, pendencia: `DANFE sem o XML da nota (chave ${chave}): ${DANFE_SEM_XML}` };
  }),
  summary: (dados, doc) => {
    const { chave } = dados as { chave: string };
    const xml = doc.situacao?.startsWith('DANFE: XML ') ? doc.situacao.slice('DANFE: XML '.length) : null;
    return { chave, xml, situacao: xml ? 'XML da nota enviado junto' : DANFE_SEM_XML };
  },
};
